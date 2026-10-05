import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { unlink, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { loadCloud } from "./load-cloud.mjs";

test("Uploader quotas are atomic, independent of folder access, and released only on purge", async () => {
  const a = randomUUID(), b = randomUUID();
  const previousAuth = process.env.AUTH_URL;
  const auth = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/user/uuid") response.end(JSON.stringify({result: {handle: "test", displayName: "Test"}}));
    else response.end(JSON.stringify({result: {id: request.headers.cookie === "session_id=b" ? b : a}}));
  });
  await new Promise(resolve => auth.listen(0, "127.0.0.1", resolve));
  process.env.AUTH_URL = `http://127.0.0.1:${auth.address().port}`;
  const db = new pg.Pool({connectionString: process.env.DATABASE_URL});
  let modules;
  const originals = new Set();
  try {
    modules = await loadCloud();
    const request = (user, method = "GET", body) => new Request("http://localhost/api/files", {
      method, headers: {Cookie: `session_id=${user}`, ...(method === "GET" ? {} : {Origin: "http://localhost"})},
      ...(body === undefined ? {} : {body}),
    });
    const storage = async user => {
      const response = await modules.drive.driveStorage(request(user));
      return response.json();
    };
    assert.deepEqual(await storage("b"), {bytes: 0, limitBytes: 10737418240});
    await storage("a");
    await db.query('UPDATE "cloud_storage" SET "limitBytes"=5 WHERE "userId"=$1', [b]);
    const folderResponse = await modules.cloud.createCloudFolder(new Request("http://localhost/api/folders", {
      method: "POST", headers: {Cookie: "session_id=a", Origin: "http://localhost", "Content-Type": "application/json"}, body: JSON.stringify({name: "shared"}),
    }));
    const folder = (await folderResponse.json()).item;
    await db.query('INSERT INTO "cloud_share" ("id","itemId","userId","role","updatedAt") VALUES ($1,$2,$3,\'EDITOR\',NOW())', [randomUUID(), folder.id, b]);
    const upload = async (user, name, bytes, parentId = folder.id) => {
      const form = new FormData();
      form.set("file", new File(["x".repeat(bytes)], name));
      if (parentId) form.set("parentId", parentId);
      form.set("storageOwnerId", a); // Forged billing UUID must be ignored.
      const response = await modules.cloud.cloudResponse(() => modules.cloud.uploadCloudFile(request(user, "POST", form)));
      const data = await response.json();
      if (response.ok) {
        const row = await db.query('SELECT "storageKey" FROM "cloud_item" WHERE "id"=$1', [data.item.id]);
        originals.add(row.rows[0].storageKey);
      }
      return {response, data};
    };
    const mutate = (user, item, method, body, permanent = false) => modules.cloud.cloudResponse(() => {
      const req = new Request(`http://localhost/api/files/${item.id}`, {
        method, headers: {Cookie: `session_id=${user}`, Origin: "http://localhost", "Content-Type": "application/json"},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      if (method === "PATCH") return modules.cloud.updateCloudItem(req, item.id, item.kind.toUpperCase());
      const deleteRequest = new Request(req.url + (permanent ? "?permanent=true" : ""), req);
      return modules.cloud.deleteCloudItem(deleteRequest, item.id, item.kind.toUpperCase());
    });
    const first = await upload("b", "b.txt", 4);
    assert.equal(first.response.status, 201);
    const row = (await db.query('SELECT "ownerId","storageOwnerId" FROM "cloud_item" WHERE "id"=$1', [first.data.item.id])).rows[0];
    assert.deepEqual(row, {ownerId: a, storageOwnerId: b});
    assert.equal((await storage("a")).bytes, 0);
    assert.equal((await storage("b")).bytes, 4);
    const denied = await upload("b", "over.txt", 2);
    assert.equal(denied.response.status, 413); assert.equal(denied.data.error.code, "STORAGE_QUOTA_EXCEEDED");
    assert.equal((await upload("b", "b.txt", 1)).response.status, 409);
    assert.equal((await storage("b")).bytes, 4);
    assert.equal((await mutate("a", first.data.item, "DELETE")).status, 204);
    assert.equal((await storage("b")).bytes, 4);
    assert.equal((await mutate("a", first.data.item, "PATCH", {restore: true})).status, 200);
    assert.equal((await storage("b")).bytes, 4);
    await mutate("a", first.data.item, "DELETE");
    assert.equal((await mutate("a", first.data.item, "DELETE", undefined, true)).status, 204);
    assert.equal((await storage("b")).bytes, 0);
    const concurrent = await Promise.all([upload("b", "one.txt", 3), upload("b", "two.txt", 3, null)]);
    assert.deepEqual(concurrent.map(result => result.response.status).sort(), [201, 413]);
    assert.equal((await storage("b")).bytes, 3);
    const winner = concurrent.find(result => result.response.ok).data.item;
    await mutate(winner.parentId ? "a" : "b", winner, "DELETE");
    await mutate(winner.parentId ? "a" : "b", winner, "DELETE", undefined, true);
    assert.equal((await storage("b")).bytes, 0);
    const owned = await upload("b", "owned.txt", 5, null);
    await db.query('INSERT INTO "cloud_share" ("id","itemId","userId","role","updatedAt") VALUES ($1,$2,$3,\'VIEWER\',NOW())', [randomUUID(), owned.data.item.id, a]);
    assert.equal((await storage("a")).bytes, 0); assert.equal((await storage("b")).bytes, 5);
    await mutate("b", owned.data.item, "DELETE"); await mutate("b", owned.data.item, "DELETE", undefined, true);
    await upload("a", "from-a.txt", 2); await upload("b", "from-b.txt", 3);
    await mutate("a", folder, "DELETE");
    assert.equal((await storage("a")).bytes, 2); assert.equal((await storage("b")).bytes, 3);
    await mutate("a", folder, "PATCH", {restore: true});
    assert.equal((await storage("b")).bytes, 3);
    await mutate("a", folder, "DELETE");
    // If accounting is inconsistent, neither deletion nor other users' counters
    // may commit, and staged originals must be restored.
    await db.query('UPDATE "cloud_storage" SET "usedBytes"=0 WHERE "userId"=$1', [b]);
    const failedPurge = await mutate("a", folder, "DELETE", undefined, true);
    assert.equal(failedPurge.status, 503);
    assert.equal((await failedPurge.json()).error.code, "STORAGE_ACCOUNTING_ERROR");
    assert.equal((await storage("a")).bytes, 2);
    const retained = await db.query('SELECT "storageKey","size" FROM "cloud_item" WHERE "parentId"=$1 AND "kind"=\'FILE\'', [folder.id]);
    assert.equal(retained.rowCount, 2);
    for (const row of retained.rows) assert.equal((await readFile(path.resolve(".cloud-storage", row.storageKey))).length, Number(row.size));
    await db.query('UPDATE "cloud_storage" SET "usedBytes"=3 WHERE "userId"=$1', [b]);
    assert.equal((await mutate("a", folder, "DELETE", undefined, true)).status, 204);
    assert.equal((await storage("a")).bytes, 0); assert.equal((await storage("b")).bytes, 0);
    // Includes sources removed after a lost concurrent quota race.
    const prefixes = [...originals];
    const remaining = await readdir(path.resolve(".cloud-storage"));
    assert.ok(prefixes.every(key => !remaining.includes(key)));
  } finally {
    const rows = await db.query('SELECT "storageKey" FROM "cloud_item" WHERE "ownerId"=ANY($1::text[])', [[a,b]]);
    rows.rows.forEach(row => { if (row.storageKey) originals.add(row.storageKey); });
    await db.query('UPDATE "cloud_item" SET "parentId"=NULL WHERE "ownerId"=ANY($1::text[])', [[a,b]]);
    await db.query('DELETE FROM "cloud_item" WHERE "ownerId"=ANY($1::text[])', [[a,b]]);
    await db.query('DELETE FROM "cloud_storage" WHERE "userId"=ANY($1::text[])', [[a,b]]);
    for (const key of originals) await unlink(path.resolve(".cloud-storage", key)).catch(error => {if(error.code !== "ENOENT") throw error;});
    await db.end();
    if (modules) {await modules.db.prismaSetting.$disconnect(); await modules.db.pool.end();}
    await new Promise(resolve => auth.close(resolve));
    if (previousAuth === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = previousAuth;
  }
});
