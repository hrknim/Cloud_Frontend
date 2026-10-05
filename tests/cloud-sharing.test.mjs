import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { createServer } from "node:http";
import { loadCloud } from "./load-cloud.mjs";

test("Sharing: multiple recipients, inherited access, editor limits, and immediate revocation", async () => {
  const originalAuthUrl = process.env.AUTH_URL;
  const users = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), handle: `share-test-${randomUUID()}`, displayName: `User ${i}` }));
  const ids = [];
  const profileLookups = [];
  let profileUnavailable = false;
  let handleMismatch = false;
  const auth = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    const index = Number(req.headers.cookie?.match(/^session_id=sharing-(\d)$/)?.[1]);
    const caller = users[index];
    if (!caller) { res.statusCode = 401; res.end(JSON.stringify({ result: null })); return; }
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/user/handle" || url.pathname === "/api/user/uuid") {
      assert.equal(req.method, "POST");
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        const input = JSON.parse(body);
        const byUuid = url.pathname === "/api/user/uuid";
        if (byUuid) profileLookups.push(input.uuid);
        if (byUuid && profileUnavailable) { res.statusCode = 503; res.end(JSON.stringify({ error: "unavailable" })); return; }
        const found = users.find(user => byUuid ? user.id === input.uuid : user.handle === input.handle);
        const result = found && byUuid ? { handle: found.handle, displayName: found.displayName, bio: "public bio", role: "ADMIN" } : found ? { ...found, ...(handleMismatch ? { id: users[4].id } : {}), bio: "소개\n두 번째 줄", avatarUrl: "/avatars/owner.png", role: "ADMIN", email: "hidden@example.test" } : null;
        res.statusCode = found ? 200 : 404; res.end(JSON.stringify({ result: result || null }));
      });
    } else res.end(JSON.stringify({ result: caller }));
  });
  await new Promise(resolve => auth.listen(0, "127.0.0.1", resolve));
  process.env.AUTH_URL = `http://127.0.0.1:${auth.address().port}`;
  const modules = await loadCloud(); const cloud = modules.cloud;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  async function dispatch(url, method = "GET", body, user = 0, headers = {}) {
    const req = new Request(`http://localhost:3001${url}`, { method, headers: { Cookie: `session_id=sharing-${user}`, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...headers }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    const parts = new URL(req.url).pathname.split("/").filter(Boolean); const kind = parts[1] === "folders" ? "FOLDER" : "FILE";
    return cloud.cloudResponse(() => {
      if (parts[1] === "shared") return cloud.listSharedItems(req);
      if (parts[1] === "items" && parts[3] === "owner") return cloud.getCloudOwnerProfile(req, parts[2]);
      if (parts[1] === "shares") return method === "GET" ? cloud.listItemShares(req) : method === "POST" ? cloud.addItemShare(req) : cloud.changeItemShare(req);
      if (parts[3] === "content") return cloud.downloadCloudFile(req, parts[2]);
      if (parts[2]) return method === "GET" ? cloud.getCloudItem(req, parts[2], kind) : method === "PATCH" ? cloud.updateCloudItem(req, parts[2], kind) : cloud.deleteCloudItem(req, parts[2], kind);
      return method === "GET" ? cloud.listCloudItems(req, kind) : kind === "FOLDER" ? cloud.createCloudFolder(req) : cloud.uploadCloudFile(req);
    });
  }
  async function request(url, method, body, user) {
    const response = await dispatch(url, method, body, user); return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  async function createFolder(name, parentId, user = 0) {
    const result = await request("/api/folders", "POST", { name, parentId }, user); assert.equal(result.status, 201, JSON.stringify(result.body)); ids.push(result.body.item.id); return result.body.item;
  }
  async function upload(parentId, user = 0) {
    const form = new FormData(); form.set("file", new File(["shared content"], `${randomUUID()}.txt`, { type: "text/plain" })); form.set("parentId", parentId);
    const result = await request("/api/files", "POST", form, user); assert.equal(result.status, 201, JSON.stringify(result.body)); ids.push(result.body.item.id); return result.body.item;
  }
  try {
    const root = await createFolder("shared root"); const nested = await createFolder("nested", root.id); const file = await upload(nested.id);
    const outside = await createFolder("private outside");
    for (const [user, role] of [[1, "VIEWER"], [2, "EDITOR"], [3, "VIEWER"]]) {
      const shared = await request("/api/shares", "POST", { itemId: root.id, handle: `@${users[user].handle}`, role });
      assert.equal(shared.status, 201, JSON.stringify(shared.body)); assert.equal(shared.body.share.userId, users[user].id);
    }
    assert.equal((await request(`/api/shares?itemId=${root.id}`)).body.shares.length, 3);
    const inheritedShares = await request(`/api/shares?itemId=${nested.id}`);
    assert.equal(inheritedShares.body.shares.length, 0);
    assert.equal(inheritedShares.body.inherited.length, 3);
    assert.ok(inheritedShares.body.inherited.every(share => share.sourceId === root.id));
    const ownFiles = await request("/api/files?scope=all");
    assert.equal(ownFiles.body.items.find(item => item.id === file.id).shared, true, "Owners can see inherited sharing on child files");
    assert.equal((await request("/api/shares", "POST", { itemId: root.id, handle: users[1].handle })).status, 409);
    assert.equal((await request("/api/shares", "POST", { itemId: root.id, handle: users[0].handle })).status, 400);
    assert.equal((await request("/api/shares", "POST", { itemId: root.id, handle: "nonexistent" })).status, 404);
    assert.equal((await request("/api/shares", "POST", { itemId: root.id, handle: users[4].handle, role: "OWNER" })).status, 400);
    assert.equal((await dispatch("/api/shares", "POST", { itemId: root.id, handle: users[4].handle }, 0, { Origin: "https://foreign.example" })).status, 403);

    profileLookups.length = 0;
    const shared = await request("/api/shared?limit=100", "GET", undefined, 1);
    assert.deepEqual(profileLookups, [users[0].id], "Look up each accessible owner once per request");
    assert.equal(shared.body.total, 3); assert.ok(!shared.body.items.some(item => item.id === outside.id));
    assert.equal(shared.body.items.find(item => item.id === root.id).sharedRoot, true);
    assert.equal(shared.body.items.find(item => item.id === file.id).sharedRoot, false);
    for (const item of shared.body.items) assert.deepEqual(item.owner, { handle: users[0].handle, displayName: users[0].displayName }, "Inherited items show the owner, not the recipient");
    const ownerCard = await request(`/api/items/${file.id}/owner`, "GET", undefined, 1);
    assert.equal(ownerCard.status, 200);
    assert.deepEqual(ownerCard.body.profile, { handle: users[0].handle, displayName: users[0].displayName, bio: "소개\n두 번째 줄", avatarUrl: new URL("/avatars/owner.png", process.env.AUTH_URL).href });
    assert.equal((await request(`/api/items/${root.id}/owner`)).status, 200, "Owners can open their own profile");
    profileLookups.length = 0;
    assert.equal((await request(`/api/items/${file.id}/owner`, "GET", undefined, 4)).status, 404);
    assert.equal((await request(`/api/items/${file.id}/owner`, "GET", undefined, 9)).status, 401);
    assert.deepEqual(profileLookups, [], "No profile lookup before file permission checks");
    handleMismatch = true;
    assert.equal((await request(`/api/items/${file.id}/owner`, "GET", undefined, 1)).status, 502, "A reassigned handle cannot show another owner");
    handleMismatch = false;
    users[0].displayName = "Updated owner";
    users[0].handle = "updated-owner-handle";
    const refreshed = await request("/api/shared", "GET", undefined, 1);
    assert.equal(refreshed.body.items[0].owner.displayName, "Updated owner");
    assert.equal(refreshed.body.items[0].owner.handle, "updated-owner-handle", "Central changes apply without the owner visiting Cloud");
    users[1].displayName = "Updated recipient";
    users[1].handle = "updated-recipient-handle";
    const updatedShares = await request(`/api/shares?itemId=${root.id}`);
    const updatedRecipient = updatedShares.body.shares.find(share => share.userId === users[1].id);
    assert.equal(updatedRecipient.displayName, "Updated recipient");
    assert.equal(updatedRecipient.handle, "updated-recipient-handle");
    assert.equal(updatedRecipient.role, "VIEWER", "Central account role never replaces Cloud sharing role");
    const renamed = await request(`/api/files/${file.id}`, "PATCH", { name: "owner-display-test.txt", owner: users[1] }, 1);
    assert.equal(renamed.status, 400, "Clients cannot provide owner metadata");
    const edited = await request(`/api/files/${file.id}`, "PATCH", { name: "owner-display-test.txt" }, 2);
    assert.equal(edited.status, 200);
    assert.deepEqual(edited.body.item.owner, { handle: users[0].handle, displayName: users[0].displayName });
    profileUnavailable = true;
    const legacy = await request("/api/shared", "GET", undefined, 1);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.items[0].owner, null, "Profile outage never substitutes the recipient or hides files");
    profileUnavailable = false;
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 1)).body.item.permission, "VIEWER");
    assert.equal(await (await dispatch(`/api/files/${file.id}/content`, "GET", undefined, 1)).text(), "shared content");
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 4)).status, 404);
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { starred: true }, 4)).status, 404);
    const ownerStar = await request(`/api/files/${file.id}`, "PATCH", { starred: true });
    assert.equal(ownerStar.body.item.starred, true);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 1)).body.item.starred, false, "Owner stars are private");
    const viewerStar = await request(`/api/files/${file.id}`, "PATCH", { starred: true }, 1);
    assert.equal(viewerStar.status, 200);
    assert.equal(viewerStar.body.item.starred, true);
    assert.equal(viewerStar.body.item.permission, "VIEWER");
    assert.equal(viewerStar.body.item.updatedAt, ownerStar.body.item.updatedAt, "Personal stars do not modify the shared item");
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { starred: false, name: "unauthorized rename" }, 1)).status, 403);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 1)).body.item.starred, true, "Denied mixed updates are atomic");
    const preference = (await db.query('SELECT "role","starred" FROM "cloud_share" WHERE "itemId"=$1 AND "userId"=$2', [file.id, users[1].id])).rows[0];
    assert.deepEqual(preference, { role: null, starred: true }, "Inherited stars do not create a direct grant");
    const starredList = await request("/api/shared", "GET", undefined, 1);
    assert.equal(starredList.body.items.find(item => item.id === file.id).starred, true);
    assert.equal(starredList.body.items.find(item => item.id === file.id).sharedRoot, false);
    assert.equal((await request(`/api/shares?itemId=${file.id}`)).body.shares.length, 0, "Preferences never appear as grants");
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 2)).body.item.starred, false, "Recipient stars are independent");
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { starred: false }, 1)).body.item.starred, false);
    assert.equal((await request(`/api/files/${file.id}`, "GET")).body.item.starred, true, "Recipient changes do not modify owner stars");
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { starred: true }, 1)).status, 200);
    assert.equal((await request(`/api/folders/${root.id}`, "PATCH", { starred: true }, 3)).status, 200, "Direct shared folders can be starred");
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { name: "denied" }, 1)).status, 403);
    assert.equal((await request("/api/folders", "POST", { name: "denied", parentId: root.id }, 1)).status, 403);
    const deniedUpload = new FormData(); deniedUpload.set("file", new File(["denied"], "denied.txt")); deniedUpload.set("parentId", root.id);
    assert.equal((await request("/api/files", "POST", deniedUpload, 1)).status, 403);
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { name: "edited.txt" }, 2)).status, 200);
    const editorFolder = await createFolder("editor added", nested.id, 2); const editorFile = await upload(editorFolder.id, 2);
    assert.equal((await db.query('SELECT "ownerId" FROM "cloud_item" WHERE "id"=$1', [editorFile.id])).rows[0].ownerId, users[0].id);
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { parentId: outside.id }, 2)).status, 403);
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { starred: true }, 2)).status, 200);
    assert.equal((await request(`/api/files/${file.id}`, "DELETE", undefined, 2)).status, 404);
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      assert.equal((await request(`/api/shares?itemId=${root.id}`, method, method === "GET" ? undefined : { itemId: root.id, userId: users[1].id, handle: users[4].handle, role: "EDITOR" }, 2)).status, 404);
    }
    assert.equal((await request("/api/files?scope=all", "GET", undefined, 1)).body.total, 0, "Shared items do not become owned items");
    assert.equal((await request("/api/shared", "GET", undefined, 4)).body.total, 0);
    const paged = await request("/api/shared?limit=2&offset=2", "GET", undefined, 1);
    assert.equal(paged.body.total, 5); assert.equal(paged.body.items.length, 2);
    assert.equal((await request("/api/shares", "POST", { itemId: file.id, handle: users[2].handle, role: "VIEWER" })).status, 201);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 2)).body.item.permission, "EDITOR", "An inherited editor grant is stronger than a direct viewer grant");
    assert.equal((await request("/api/shares", "PATCH", { itemId: root.id, userId: users[2].id, role: "VIEWER" })).status, 204);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 2)).body.item.permission, "VIEWER");
    assert.equal((await request("/api/shares", "DELETE", { itemId: file.id, userId: users[2].id })).status, 204);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 2)).status, 200, "Removing a direct grant does not remove inherited access");
    assert.equal((await db.query('SELECT "id" FROM "cloud_share" WHERE "itemId"=$1 AND "userId"=$2', [file.id, users[2].id])).rowCount, 0, "Revoked direct rows are deleted even when starred");
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 2)).body.item.starred, false);
    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { name: "denied again" }, 2)).status, 403);
    assert.equal((await request("/api/shares", "DELETE", { itemId: root.id, userId: users[3].id })).status, 204);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 3)).status, 404);
    assert.equal((await request("/api/shared", "GET", undefined, 3)).body.total, 0);
    assert.equal((await db.query('SELECT "id" FROM "cloud_share" WHERE "itemId"=$1 AND "userId"=$2', [root.id, users[3].id])).rowCount, 0);
    assert.equal((await request(`/api/folders/${root.id}`, "PATCH", { starred: false }, 3)).status, 404, "Starred records never retain revoked access");

    assert.equal((await request(`/api/files/${file.id}`, "PATCH", { parentId: outside.id })).status, 200);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 1)).status, 404, "Moving outside a shared folder removes inherited access");
    assert.equal((await request(`/api/files/${file.id}`)).body.item.shared, false, "Preference-only rows do not mark an item as shared");
    assert.equal((await request("/api/shared", "GET", undefined, 1)).body.items.some(item => item.id === file.id), false, "A bookmark alone cannot expose a moved file");
    assert.equal((await request("/api/shares", "POST", { itemId: file.id, handle: users[1].handle, role: "VIEWER" })).status, 201);
    const reshared = await request(`/api/files/${file.id}`, "GET", undefined, 1);
    assert.equal(reshared.status, 200);
    assert.equal(reshared.body.item.starred, true, "Granting access to a preference row preserves the personal star");
    assert.equal((await request(`/api/files/${file.id}`, "DELETE")).status, 204);
    assert.equal((await request(`/api/files/${file.id}`, "GET", undefined, 1)).status, 404);
    assert.equal((await request(`/api/files/${file.id}?permanent=true`, "DELETE")).status, 204);
    assert.equal((await db.query('SELECT "id" FROM "cloud_share" WHERE "itemId"=$1', [file.id])).rowCount, 0);
    assert.equal((await request(`/api/folders/${nested.id}`, "PATCH", { starred: true }, 1)).status, 200);
    assert.equal((await request(`/api/files/${editorFile.id}`, "PATCH", { starred: true }, 1)).status, 200);
    assert.equal((await request("/api/shares", "POST", { itemId: editorFolder.id, handle: users[1].handle, role: "VIEWER" })).status, 201);
    assert.equal((await request("/api/shares", "DELETE", { itemId: root.id, userId: users[1].id })).status, 204);
    assert.equal((await db.query('SELECT "id" FROM "cloud_share" WHERE "itemId"=$1 AND "userId"=$2', [nested.id, users[1].id])).rowCount, 0, "Inaccessible inherited stars are deleted");
    assert.equal((await request(`/api/folders/${nested.id}`, "GET", undefined, 1)).status, 404);
    assert.equal((await request(`/api/files/${editorFile.id}`, "GET", undefined, 1)).body.item.starred, true, "Another sharing path preserves accessible favorites");
    assert.equal((await request("/api/shares", "DELETE", { itemId: editorFolder.id, userId: users[1].id })).status, 204);
    assert.equal((await db.query('SELECT "id" FROM "cloud_share" WHERE "itemId"=$1 AND "userId"=$2', [editorFile.id, users[1].id])).rowCount, 0);
  } finally {
    const rows = await db.query('SELECT "storageKey" FROM "cloud_item" WHERE "id"=ANY($1::text[]) AND "ownerId"=ANY($2::text[])', [ids, users.map(user => user.id)]);
    await db.query('UPDATE "cloud_item" SET "parentId"=NULL WHERE "id"=ANY($1::text[]) AND "ownerId"=ANY($2::text[])', [ids, users.map(user => user.id)]);
    await db.query('DELETE FROM "cloud_item" WHERE "id"=ANY($1::text[]) AND "ownerId"=ANY($2::text[])', [ids, users.map(user => user.id)]);
    await db.query('DELETE FROM "cloud_storage" WHERE "userId"=ANY($1::text[])', [users.map(user => user.id)]);
    for (const row of rows.rows) if (row.storageKey) await unlink(path.join(process.cwd(), ".cloud-storage", row.storageKey)).catch(error => { if (error.code !== "ENOENT") throw error; });
    await db.end(); await modules.db.prismaSetting.$disconnect(); await modules.db.pool.end(); await new Promise(resolve => auth.close(resolve));
    if (originalAuthUrl === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = originalAuthUrl;
  }
});
