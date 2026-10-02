import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rmdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { createServer } from "node:http";
import { loadCloud } from "./load-cloud.mjs";

const base = process.env.CLOUD_API_TEST_URL || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Run against a local test server only");
const owner = randomUUID();
const secondOwner = randomUUID();
const sessionCookie = "session_id=cloud-test-session";
const prefix = `api-test-${randomUUID()}`;
const ids = [];
const failedDeletePaths = [];
let cloud;

// Dispatch actual business handlers with Requests; auth still uses a real HTTP request.
async function dispatch(url, options = {}, cookie = sessionCookie) {
  const req = new Request(`${base}${url}`, { ...options, headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) } });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const kind = parts[1] === "folders" ? "FOLDER" : "FILE";
  return cloud.cloudResponse(() => {
    if (parts[3] === "content") return cloud.downloadCloudFile(req, parts[2]);
    if (parts[2]) {
      if (req.method === "GET") return cloud.getCloudItem(req, parts[2], kind);
      if (req.method === "PATCH") return cloud.updateCloudItem(req, parts[2], kind);
      return cloud.deleteCloudItem(req, parts[2], kind);
    }
    if (req.method === "GET") return cloud.listCloudItems(req, kind);
    return kind === "FOLDER" ? cloud.createCloudFolder(req) : cloud.uploadCloudFile(req);
  });
}

async function request(url, options = {}) {
  const response = await dispatch(url, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

function json(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function folder(name, parentId = null) {
  const result = await request("/api/folders", json("POST", { name, parentId }));
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  ids.push(result.body.item.id);
  return result.body.item;
}

test("Cloud API: files, tree operations, validation, and owner isolation", async () => {
  const originalAuthUrl = process.env.AUTH_URL;
  let revoked = false;
  const auth = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.cookie === "session_id=empty-result") {
      res.end(JSON.stringify({ result: null }));
      return;
    }
    if (req.headers.cookie === "session_id=malformed-user") {
      res.end(JSON.stringify({ result: { email: "test@example.test" } }));
      return;
    }
    const id = req.headers.cookie === sessionCookie && !revoked ? owner : req.headers.cookie === "session_id=second-user" ? secondOwner : null;
    res.end(JSON.stringify(id ? { result: { id, email: "test@example.test", handle: "test", displayName: "Test", role: "USER" } } : null));
  });
  await new Promise(resolve => auth.listen(0, "127.0.0.1", resolve));
  process.env.AUTH_URL = `http://127.0.0.1:${auth.address().port}`;
  const modules = await loadCloud();
  cloud = modules.cloud;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    // Missing/invalid sessions are rejected even before parsing IDs or upload bodies.
    for (const [url, method] of [["/api/files", "GET"], ["/api/folders", "GET"], ["/api/files", "POST"], ["/api/folders", "POST"], ["/api/files/not-an-id", "GET"], ["/api/files/not-an-id", "PATCH"], ["/api/files/not-an-id", "DELETE"], ["/api/files/not-an-id?permanent=true", "DELETE"], ["/api/files/not-an-id/content", "GET"], ["/api/folders/not-an-id", "GET"], ["/api/folders/not-an-id", "PATCH"], ["/api/folders/not-an-id", "DELETE"], ["/api/folders/not-an-id?permanent=true", "DELETE"]]) {
      assert.equal((await dispatch(url, { method }, null)).status, 401);
      assert.equal((await dispatch(url, { method }, "session_id=expired")).status, 401);
    }
    assert.equal((await dispatch("/api/files", {}, "session_id=empty-result")).status, 401);
    assert.equal((await dispatch("/api/files", {}, "session_id=malformed-user")).status, 502);
    assert.equal((await dispatch("/api/folders", { ...json("POST", { name: prefix }), headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" } })).status, 403);
    const root = await folder(`${prefix}-root`);
    const storedRoot = await db.query('SELECT "ownerId" FROM "cloud_item" WHERE "id"=$1', [root.id]);
    assert.equal(storedRoot.rows[0].ownerId, owner);
    const secondList = await dispatch(`/api/folders?q=${prefix}`, {}, "session_id=second-user");
    assert.equal((await secondList.json()).total, 0);
    for (const method of ["GET", "PATCH", "DELETE"]) {
      assert.equal((await dispatch(`/api/folders/${root.id}`, method === "PATCH" ? json(method, { name: "stolen" }) : { method }, "session_id=second-user")).status, 404);
    }
    const nested = await folder(`${prefix}-nested`, root.id);
    const cycle = await request(`/api/folders/${root.id}`, json("PATCH", { parentId: nested.id }));
    assert.equal(cycle.response.status, 400);
    assert.equal(cycle.body.error.code, "INVALID_PARENT");
    assert.equal((await request(`/api/folders/${root.id}`, { method: "DELETE" })).response.status, 409);

    const list = await request(`/api/folders?parentId=${root.id}`);
    assert.equal(list.body.items[0].id, nested.id);
    const allFolders = await request(`/api/folders?scope=all&q=${prefix}`);
    assert.ok(allFolders.body.items.some(item => item.id === nested.id));
    const payload = "cloud round-trip\n한국어 파일\n";
    const form = new FormData();
    form.set("file", new File([payload], `${prefix}.txt`, { type: "text/plain" }));
    form.set("parentId", nested.id);
    const upload = await request("/api/files", { method: "POST", body: form });
    assert.equal(upload.response.status, 201, JSON.stringify(upload.body));
    const file = upload.body.item;
    ids.push(file.id);
    assert.equal(file.size, Buffer.byteLength(payload));
    assert.equal(file.parentId, nested.id);
    const activeDelete = await request(`/api/files/${file.id}?permanent=true`, { method: "DELETE" });
    assert.equal(activeDelete.response.status, 409);
    assert.equal(activeDelete.body.error.code, "NOT_IN_TRASH");
    assert.equal((await request(`/api/files/${file.id}?permanent=invalid`, { method: "DELETE" })).response.status, 400);
    assert.equal("storageKey" in file, false);
    const content = await dispatch(file.downloadUrl);
    assert.equal(content.status, 200);
    assert.equal(await content.text(), payload);
    assert.match(content.headers.get("content-disposition"), /^attachment;/);
    const unsafePreview = await dispatch(`${file.downloadUrl}?preview=true`);
    assert.equal(unsafePreview.headers.get("content-type"), "application/octet-stream");
    assert.match(unsafePreview.headers.get("content-disposition"), /^attachment;/);
    assert.equal((await dispatch(file.downloadUrl, {}, "session_id=second-user")).status, 404);
    assert.equal((await dispatch(`/api/files/${file.id}`, json("PATCH", { name: "stolen" }), "session_id=second-user")).status, 404);
    assert.equal((await dispatch(`/api/files/${file.id}`, { method: "DELETE" }, "session_id=second-user")).status, 404);
    const foreignParent = await dispatch("/api/folders", json("POST", { name: `${prefix}-stolen`, parentId: root.id }), "session_id=second-user");
    assert.equal(foreignParent.status, 404);

    const movedFolder = await request(`/api/folders/${nested.id}`, json("PATCH", { parentId: null }));
    assert.equal(movedFolder.response.status, 200);
    assert.equal(movedFolder.body.item.parentId, null);
    const retainedChild = await request(`/api/files/${file.id}`);
    assert.equal(retainedChild.body.item.parentId, nested.id, "Folder moves retain their children");
    assert.equal(await (await dispatch(file.downloadUrl)).text(), payload);
    assert.equal((await request(`/api/folders/${nested.id}`, json("PATCH", { parentId: root.id }))).response.status, 200);

    const renamed = await request(`/api/files/${file.id}`, json("PATCH", { name: `${prefix}-이름변경.txt`, starred: true, parentId: root.id }));
    assert.equal(renamed.response.status, 200);
    assert.equal(renamed.body.item.starred, true);
    assert.equal(renamed.body.item.parentId, root.id);
    const filtered = await request(`/api/files?parentId=${root.id}&starred=true&q=${encodeURIComponent("이름변경")}`);
    assert.ok(filtered.body.items.some(item => item.id === file.id));
    assert.equal((await request(`/api/files/${file.id}`, json("PATCH", { name: "../escape" }))).response.status, 400);
    assert.equal((await request(`/api/files/${file.id}`, json("PATCH", { starred: "true" }))).response.status, 400);
    assert.equal((await request(`/api/files/${file.id}`, json("PATCH", { ownerId: "someone-else" }))).response.status, 400);
    assert.equal((await request("/api/files?limit=101")).response.status, 400);
    assert.equal((await request("/api/files/not-an-id")).response.status, 400);
    assert.equal((await request("/api/files", json("POST", {}))).response.status, 415);
    assert.equal((await request("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).response.status, 400);

    const sameName = `${prefix}-duplicate`;
    const races = await Promise.all([request("/api/folders", json("POST", { name: sameName })), request("/api/folders", json("POST", { name: sameName }))]);
    for (const result of races) if (result.body.item) ids.push(result.body.item.id);
    assert.deepEqual(races.map(result => result.response.status).sort(), [201, 409]);

    const foreignId = randomUUID();
    ids.push(foreignId);
    await db.query('INSERT INTO "cloud_item" ("id","ownerId","kind","name","updatedAt") VALUES ($1,$2,\'FILE\',$3,NOW())', [foreignId, `${prefix}-other-owner`, prefix]);
    assert.equal((await request(`/api/files/${foreignId}`)).response.status, 404);
    assert.equal((await request(`/api/files/${foreignId}`, json("PATCH", { name: "changed" }))).response.status, 404);
    assert.equal((await request(`/api/files/${foreignId}`, { method: "DELETE" })).response.status, 404);
    assert.equal((await request(`/api/files/${foreignId}/content`)).response.status, 404);
    const ownList = await request(`/api/files?q=${prefix}`);
    assert.ok(!ownList.body.items.some(item => item.id === foreignId));

    assert.equal((await request(`/api/files/${file.id}`, { method: "DELETE" })).response.status, 204);
    assert.equal((await request(`/api/files/${file.id}`, { method: "DELETE" })).response.status, 204);
    assert.equal((await dispatch(file.downloadUrl)).status, 404);
    const trash = await request(`/api/files?trash=true&q=${prefix}`);
    assert.ok(trash.body.items.some(item => item.id === file.id));
    const restored = await request(`/api/files/${file.id}`, json("PATCH", { restore: true }));
    assert.equal(restored.response.status, 200);
    assert.equal(restored.body.item.deletedAt, null);
    assert.equal((await dispatch(file.downloadUrl)).status, 200);
    assert.equal((await request(`/api/folders/${nested.id}`, { method: "DELETE" })).response.status, 204);
    assert.equal((await request(`/api/folders/${nested.id}`, json("PATCH", { restore: true }))).response.status, 200);

    const storedFile = await db.query('SELECT "storageKey" FROM "cloud_item" WHERE "id"=$1', [file.id]);
    const originalPath = path.join(process.cwd(), ".cloud-storage", storedFile.rows[0].storageKey);
    assert.equal((await stat(originalPath)).isFile(), true);
    assert.equal((await request(`/api/files/${file.id}`, { method: "DELETE" })).response.status, 204);
    assert.equal((await dispatch(`/api/files/${file.id}?permanent=true`, { method: "DELETE" }, "session_id=second-user")).status, 404);
    assert.equal((await request(`/api/files/${file.id}?permanent=true`, { method: "DELETE", headers: { Origin: "https://untrusted.example" } })).response.status, 403);
    assert.equal((await request(`/api/files/${file.id}?permanent=true`, { method: "DELETE" })).response.status, 204);
    await assert.rejects(() => stat(originalPath), error => error.code === "ENOENT");
    assert.equal((await db.query('SELECT "id" FROM "cloud_item" WHERE "id"=$1', [file.id])).rowCount, 0);
    assert.equal((await request(`/api/files/${file.id}`, json("PATCH", { restore: true }))).response.status, 404);
    assert.equal((await request(`/api/files/${file.id}?permanent=true`, { method: "DELETE" })).response.status, 404);

    // Verify a trash folder containing children cannot be purged, including legacy data.
    await db.query('UPDATE "cloud_item" SET "deletedAt"=NOW() WHERE "id"=$1', [root.id]);
    const nonemptyPurge = await request(`/api/folders/${root.id}?permanent=true`, { method: "DELETE" });
    assert.equal(nonemptyPurge.response.status, 409);
    assert.equal(nonemptyPurge.body.error.code, "FOLDER_NOT_EMPTY");
    assert.equal((await request(`/api/folders/${nested.id}`, { method: "DELETE" })).response.status, 204);
    assert.equal((await request(`/api/folders/${nested.id}?permanent=true`, { method: "DELETE" })).response.status, 204);
    assert.equal((await request(`/api/folders/${root.id}?permanent=true`, { method: "DELETE" })).response.status, 204);

    // A missing original is still removable from trash (a retry after interrupted deletion).
    const missingId = randomUUID(); ids.push(missingId);
    await db.query('INSERT INTO "cloud_item" ("id","ownerId","kind","name","storageKey","deletedAt","updatedAt") VALUES ($1,$2,\'FILE\',$3,$4,NOW(),NOW())', [missingId, owner, `${prefix}-missing`, randomUUID()]);
    assert.equal((await request(`/api/files/${missingId}?permanent=true`, { method: "DELETE" })).response.status, 204);

    const blockedId = randomUUID(); const blockedKey = randomUUID(); ids.push(blockedId);
    const blockedPath = path.join(process.cwd(), ".cloud-storage", blockedKey);
    await mkdir(blockedPath); failedDeletePaths.push(blockedPath);
    await db.query('INSERT INTO "cloud_item" ("id","ownerId","kind","name","storageKey","deletedAt","updatedAt") VALUES ($1,$2,\'FILE\',$3,$4,NOW(),NOW())', [blockedId, owner, `${prefix}-blocked`, blockedKey]);
    const blockedDelete = await request(`/api/files/${blockedId}?permanent=true`, { method: "DELETE" });
    assert.equal(blockedDelete.response.status, 503);
    assert.equal(blockedDelete.body.error.code, "FILE_DELETE_FAILED");
    assert.equal((await db.query('SELECT "id" FROM "cloud_item" WHERE "id"=$1', [blockedId])).rowCount, 1);
    await rmdir(blockedPath);
    assert.equal((await request(`/api/files/${blockedId}?permanent=true`, { method: "DELETE" })).response.status, 204);
    revoked = true;
    assert.equal((await request("/api/files")).response.status, 401);
  } finally {
    // Clean up only UUIDs created by this test, including the private test blob.
    for (const blockedPath of failedDeletePaths) await rmdir(blockedPath).catch(() => {});
    const rows = await db.query('SELECT "storageKey" FROM "cloud_item" WHERE "id" = ANY($1::text[]) AND "ownerId" = ANY($2::text[])', [ids, [owner, `${prefix}-other-owner`]]);
    await db.query('UPDATE "cloud_item" SET "parentId"=NULL WHERE "id" = ANY($1::text[]) AND "ownerId" = ANY($2::text[])', [ids, [owner, `${prefix}-other-owner`]]);
    await db.query('DELETE FROM "cloud_item" WHERE "id" = ANY($1::text[]) AND "ownerId" = ANY($2::text[])', [ids, [owner, `${prefix}-other-owner`]]);
    for (const { storageKey } of rows.rows) {
      if (storageKey && /^[0-9a-f-]{36}$/.test(storageKey)) await unlink(path.join(process.cwd(), ".cloud-storage", storageKey)).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
    await db.end();
    await modules.db.prismaSetting.$disconnect();
    await modules.db.pool.end();
    await new Promise(resolve => auth.close(resolve));
    if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = originalAuthUrl;
  }
});
