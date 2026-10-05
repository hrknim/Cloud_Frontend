import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { loadAuthProxy, loadCloud } from "./load-cloud.mjs";

test("File links enforce PUBLIC versus shared-users-only access and support revoke/trash/ranges", async () => {
  const owners = [randomUUID(), randomUUID(), randomUUID()];
  const previousAuth = process.env.AUTH_URL;
  let authCalls = 0;
  const auth = createServer((request, response) => {
    authCalls++;
    response.setHeader("Content-Type", "application/json");
    const index = Number(request.headers.cookie?.replace("session_id=", ""));
    response.end(JSON.stringify({result: {id: owners[index]}}));
  });
  await new Promise(resolve => auth.listen(0, "127.0.0.1", resolve));
  process.env.AUTH_URL = `http://127.0.0.1:${auth.address().port}`;
  const db = new pg.Pool({connectionString: process.env.DATABASE_URL});
  const originals = new Set();
  let modules;
  try {
    modules = await loadCloud();
    const req = (url, user = null, method = "GET", body, headers = {}) => new Request(`http://localhost${url}`, {
      method, headers: {...(user === null ? {} : {Cookie: `session_id=${user}`}), ...(method === "GET" || method === "HEAD" ? {} : {Origin: "http://localhost"}), ...headers},
      ...(body === undefined ? {} : {body}),
    });
    const manage = async (user, itemId, access, method = "POST", origin = "http://localhost") => {
      const request = req(`/api/links?itemId=${itemId}`, user, method, method === "GET" ? undefined : JSON.stringify({itemId, access}), {"Content-Type": "application/json", Origin: origin});
      const response = await modules.cloud.cloudResponse(() => modules.links.manageFileLink(request));
      return {status: response.status, data: await response.json()};
    };
    const read = (token, user = null) => modules.links.publicLinkResponse(async () => Response.json({item: await modules.links.publicFileData(req(`/api/public/files/${token}`, user), token)}));
    const folderRes = await modules.cloud.createCloudFolder(req("/api/folders", 0, "POST", JSON.stringify({name:"folder"}), {"Content-Type":"application/json"}));
    const folder = (await folderRes.json()).item;
    const upload = new FormData(); upload.set("file", new File(["0123456789"], "linked.txt", {type:"text/plain"})); upload.set("parentId", folder.id);
    const fileRes = await modules.cloud.uploadCloudFile(req("/api/files", 0, "POST", upload));
    const file = (await fileRes.json()).item;
    originals.add((await db.query('SELECT "storageKey" FROM "cloud_item" WHERE "id"=$1', [file.id])).rows[0].storageKey);
    assert.equal((await manage(0, file.id, undefined, "GET")).data.enabled, false);
    assert.equal((await manage(null, file.id, "PUBLIC")).status, 401);
    assert.equal((await manage(1, file.id, "PUBLIC")).status, 404);
    assert.equal((await manage(0, folder.id, "PUBLIC")).status, 404);
    assert.equal((await manage(0, file.id, "OTHER")).status, 400);
    assert.equal((await manage(0, file.id, "PUBLIC", "POST", "https://foreign.example")).status, 403);
    const restricted = await manage(0, file.id, "RESTRICTED");
    assert.equal(restricted.status, 200);
    const token = restricted.data.path.split("/").pop();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await read(token)).status, 401);
    assert.equal((await read(token, 0)).status, 200);
    assert.equal((await read(token, 1)).status, 404, "Login alone does not grant access");
    await db.query('INSERT INTO "cloud_share" ("id","itemId","userId","role","updatedAt") VALUES ($1,$2,$3,\'VIEWER\',NOW())', [randomUUID(), folder.id, owners[1]]);
    assert.equal((await read(token, 1)).status, 200, "Inherited folder shares are honored");
    assert.equal((await read(token, 2)).status, 404);
    assert.equal((await manage(1, file.id, "PUBLIC")).status, 404);
    assert.equal((await manage(0, file.id, "PUBLIC")).data.path, restricted.data.path);
    const before = authCalls;
    const publicData = await read(token);
    assert.equal(publicData.status, 200); assert.equal(authCalls, before, "Public reads do not call auth");
    const metadata = (await publicData.json()).item;
    assert.deepEqual(Object.keys(metadata).sort(), ["id","name","kind","parentId","mimeType","size","starred","deletedAt","createdAt","updatedAt","permission","downloadUrl"].sort());
    assert.equal(metadata.id, token);
    for (const key of ["ownerId", "storageOwnerId", "storageKey", "owner", "shares", "trashBatchId"]) assert.equal(key in metadata, false);
    assert.equal(metadata.parentId, null);
    const serialized = JSON.stringify(metadata);
    for (const privateValue of [...owners, file.id, folder.id, ...originals]) assert.ok(!serialized.includes(privateValue), "Public metadata must not contain private identifiers");
    // Possession of a PUBLIC token cannot unlock unrelated account/file APIs.
    const anonymous = req(`/api/files?itemId=${file.id}&token=${token}`);
    const checks = [
      () => modules.cloud.listCloudItems(anonymous, "FILE"),
      () => modules.cloud.getCloudItem(anonymous, file.id, "FILE"),
      () => modules.cloud.downloadCloudFile(anonymous, file.id),
      () => modules.cloud.getCloudOwnerProfile(anonymous, file.id),
      () => modules.cloud.listItemShares(anonymous),
      () => modules.cloud.listSharedItems(anonymous),
      () => modules.links.manageFileLink(anonymous),
      () => modules.drive.listDrivePage(anonymous),
      () => modules.drive.driveStorage(anonymous),
      () => modules.drive.drivePreviewNeighbors(anonymous),
      () => modules.cloud.updateCloudItem(req(`/api/files/${file.id}?token=${token}`, null, "PATCH", JSON.stringify({name:"stolen.txt"}), {"Content-Type":"application/json"}), file.id, "FILE"),
      () => modules.cloud.deleteCloudItem(req(`/api/files/${file.id}?token=${token}`, null, "DELETE"), file.id, "FILE"),
    ];
    for (const action of checks) {
      const response = await modules.cloud.cloudResponse(action);
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.deepEqual(Object.keys(data), ["error"]);
      assert.equal(data.error.code, "NO_SESSION");
    }
    const {proxyAuthRequest} = await loadAuthProxy();
    const userResponse = await proxyAuthRequest(req("/api/user"), "/api/user");
    assert.equal(userResponse.status,401);
    assert.equal((await userResponse.json()).result,null);
    assert.match(publicData.headers.get("cache-control"), /no-store/);
    assert.equal(publicData.headers.get("referrer-policy"), "no-referrer");
    if (process.env.CLOUD_PUBLIC_TEST_URL) {
      const base = new URL(process.env.CLOUD_PUBLIC_TEST_URL);
      assert.ok(["localhost","127.0.0.1"].includes(base.hostname), "HTML audit must target a local test server");
      const pageResponse = await fetch(new URL(`/s/${token}`,base), {redirect:"manual",signal:AbortSignal.timeout(15000)});
      assert.equal(pageResponse.status,200);
      const html = await pageResponse.text();
      assert.ok(html.includes("linked.txt"));
      for (const privateValue of [...owners, file.id, folder.id, ...originals]) assert.ok(!html.includes(privateValue), "Server-rendered HTML must not contain private identifiers");
      assert.match(html, /name="referrer" content="no-referrer"/);
      const privateRoutes = ["/api/user", "/api/drive", "/api/drive/storage", `/api/files/${file.id}`, `/api/items/${file.id}/owner`, `/api/shares?itemId=${file.id}`, `/api/links?itemId=${file.id}`];
      for (const route of privateRoutes) {
        const response = await fetch(new URL(route,base), {redirect:"manual",signal:AbortSignal.timeout(15000)});
        assert.equal(response.status,401, "Anonymous private API requests must fail at the running server");
        const text = await response.text();
        for (const privateValue of [...owners, file.id, folder.id, ...originals]) assert.ok(!text.includes(privateValue));
      }
    }
    const contents = await modules.links.publicLinkResponse(() => modules.links.downloadFileLink(req(`/api/public/files/${token}/content`, null, "GET", undefined, {Range:"bytes=2-5"}), token));
    assert.equal(contents.status, 206); assert.equal(contents.headers.get("content-range"), "bytes 2-5/10"); assert.equal(await contents.text(), "2345");
    const head = await modules.links.downloadFileLink(req(`/api/public/files/${token}/content`, null, "HEAD"), token);
    assert.equal(head.body, null); assert.equal(head.headers.get("content-length"), "10");
    await db.query('UPDATE "cloud_item" SET "name"=\'linked.html\',"mimeType"=\'text/html\' WHERE "id"=$1', [file.id]);
    const unsafe = await modules.links.downloadFileLink(req(`/api/public/files/${token}/content?preview=true`), token);
    assert.equal(unsafe.headers.get("content-type"), "application/octet-stream");
    assert.match(unsafe.headers.get("content-disposition"), /^attachment;/);
    assert.equal(unsafe.headers.get("x-content-type-options"), "nosniff");
    await unsafe.arrayBuffer();
    await db.query('UPDATE "cloud_item" SET "name"=\'linked.txt\',"mimeType"=\'text/plain\' WHERE "id"=$1', [file.id]);
    assert.equal((await read(file.id)).status, 404, "A private UUID is never a link credential");
    assert.equal((await read("x".repeat(43))).status, 404);
    await manage(0, file.id, undefined, "DELETE");
    assert.equal((await read(token)).status, 404);
    const replacement = await manage(0, file.id, "PUBLIC");
    const nextToken = replacement.data.path.split("/").pop();
    assert.notEqual(nextToken, token);
    // Changing public to restricted must protect existing URLs immediately.
    await manage(0, file.id, "RESTRICTED");
    assert.equal((await read(nextToken)).status, 401); assert.equal((await read(nextToken, 1)).status, 200);
    await db.query('DELETE FROM "cloud_share" WHERE "itemId"=$1 AND "userId"=$2', [folder.id, owners[1]]);
    assert.equal((await read(nextToken, 1)).status, 404);
    await manage(0, file.id, "PUBLIC");
    // A trashed ancestor blocks access even if the descendant's flag is stale.
    await db.query('UPDATE "cloud_item" SET "deletedAt"=NOW() WHERE "id"=$1', [folder.id]);
    assert.equal((await read(nextToken)).status, 404);
    await db.query('UPDATE "cloud_item" SET "deletedAt"=NULL WHERE "id"=$1', [folder.id]);
    await modules.cloud.deleteCloudItem(req(`/api/folders/${folder.id}`, 0, "DELETE"), folder.id, "FOLDER");
    assert.equal((await read(nextToken)).status, 404);
    assert.equal((await db.query('SELECT * FROM "cloud_link" WHERE "itemId"=$1', [file.id])).rowCount, 0);
    await modules.cloud.updateCloudItem(req(`/api/folders/${folder.id}`, 0, "PATCH", JSON.stringify({restore:true}), {"Content-Type":"application/json"}), folder.id, "FOLDER");
    assert.equal((await read(nextToken)).status, 404, "Restore must not reactivate revoked public links");
    const account = (await db.query('SELECT "usedBytes" FROM "cloud_storage" WHERE "userId"=$1', [owners[0]])).rows[0];
    assert.equal(Number(account.usedBytes), 10, "Link sharing never duplicates storage");
  } finally {
    const rows = await db.query('SELECT "storageKey" FROM "cloud_item" WHERE "ownerId"=ANY($1::text[])', [owners]);
    rows.rows.forEach(row => {if(row.storageKey) originals.add(row.storageKey);});
    await db.query('UPDATE "cloud_item" SET "parentId"=NULL WHERE "ownerId"=ANY($1::text[])', [owners]);
    await db.query('DELETE FROM "cloud_item" WHERE "ownerId"=ANY($1::text[])', [owners]);
    await db.query('DELETE FROM "cloud_storage" WHERE "userId"=ANY($1::text[])', [owners]);
    for (const key of originals) await unlink(path.resolve(".cloud-storage",key)).catch(error => {if(error.code!=="ENOENT") throw error;});
    await db.end(); if(modules){await modules.db.prismaSetting.$disconnect(); await modules.db.pool.end();}
    await new Promise(resolve=>auth.close(resolve));
    if(previousAuth===undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL=previousAuth;
  }
});
