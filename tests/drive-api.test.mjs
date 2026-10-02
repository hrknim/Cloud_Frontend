import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/drive/drive-api.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const client = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("Drive sorting keeps folders first and sorts sizes by bytes", () => {
  const folder = { id: "folder", kind: "folder", name: "폴더", bytes: 0, modified: "2026-01-01" };
  const small = { id: "small", kind: "file", name: "모델2", bytes: 900, size: "900 B", modified: "2026-10-02" };
  const large = { ...small, id: "large", name: "모델10", bytes: 2048, size: "2 KB", modified: "2026-10-01" };
  const items = [large, small, folder];
  const sortedIds = order => [...items].sort((a, b) => client.compareDriveItems(a, b, order)).map(item => item.id);
  assert.deepEqual(sortedIds("modified"), ["folder", "small", "large"]);
  assert.deepEqual(sortedIds("name"), ["folder", "small", "large"]);
  assert.deepEqual(sortedIds("size"), ["folder", "large", "small"]);
  assert.equal(client.compareDriveItems(small, small, "size"), 0);
});

test("Folder navigation and move destinations exclude cycles and deleted folders", () => {
  const root = { id: "root", name: "프로젝트", kind: "folder", deleted: false };
  const child = { ...root, id: "child", name: "모델", parent: root.id };
  const grandchild = { ...root, id: "grandchild", parent: child.id };
  const other = { ...root, id: "other" };
  const deleted = { ...root, id: "deleted", deleted: true };
  const file = { id: "file", kind: "3d", parent: child.id, deleted: false };
  const items = [root, child, grandchild, other, deleted, file];
  assert.deepEqual(client.folderPath(items, grandchild.id).map(folder => folder.id), [root.id, child.id, grandchild.id]);
  assert.deepEqual(client.folderPath(items), []);
  assert.equal(client.canMoveInto(items, root, root.id), false);
  assert.equal(client.canMoveInto(items, root, grandchild.id), false);
  assert.equal(client.canMoveInto(items, child, other.id), true);
  assert.equal(client.canMoveInto(items, child), true);
  assert.equal(client.canMoveInto(items, file, grandchild.id), true);
  assert.equal(client.canMoveInto(items, file, deleted.id), false);
  assert.equal(client.canMoveInto(items, file, "missing"), false);
  assert.equal(client.canDropInto(items, file, child.id), false, "Dropping into the current parent is a no-op");
  assert.equal(client.canDropInto(items, file, root.id), true);
  assert.equal(client.canDropInto(items, file), true, "Dragging back to the drive root is allowed");
  assert.equal(client.canDropInto(items, root, grandchild.id), false);
  assert.equal(client.canDropInto(items, deleted, other.id), false);
  assert.equal(client.canMoveInto(items, { ...file, owned: false }, other.id), false);
  assert.equal(client.canMoveInto([...items, { ...other, id: "received", owned: false }], file, "received"), false);
  const cycle = [{ ...root, parent: child.id }, child];
  assert.equal(client.canMoveInto(cycle, file, child.id), false);
  assert.equal(client.folderPath(cycle, child.id).length, 2);
});

test("Drive client: server IDs, multipart upload, pagination, and session failures", async () => {
  const originalFetch = globalThis.fetch;
  const file = { id: "server-generated-id", name: "model.glb", kind: "file", parentId: "folder-id", mimeType: "model/gltf-binary", size: 1024, starred: false, deletedAt: null, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", downloadUrl: "/api/files/server-generated-id/content" };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      if (options.method === "POST") {
        assert.equal(url, "/api/files");
        assert.ok(options.body instanceof FormData);
        assert.equal(options.body.get("file").name, "model.glb");
        assert.equal(options.body.get("parentId"), "folder-id");
        assert.equal(options.headers, undefined, "Browser must supply the multipart boundary");
        return Response.json({ item: file }, { status: 201 });
      }
      const query = new URL(url, "http://localhost");
      if (query.pathname === "/api/shared") return Response.json({ items: [], total: 0 });
      assert.equal(query.searchParams.get("scope"), "all");
      if (query.pathname === "/api/folders" || query.searchParams.get("trash") === "true") return Response.json({ items: [], total: 0 });
      const offset = Number(query.searchParams.get("offset"));
      return Response.json({ items: offset === 0 ? Array.from({ length: 100 }, (_, n) => ({ ...file, id: `id-${n}` })) : [{ ...file, id: "id-100" }], total: 101 });
    };
    const form = new FormData(); form.set("file", new File(["test"], "model.glb")); form.set("parentId", "folder-id");
    const uploaded = await client.driveRequest("/api/files", { method: "POST", body: form });
    assert.equal(uploaded.item.id, "server-generated-id");
    assert.equal(client.toDriveItem(uploaded.item).kind, "3d");
    const received = client.toDriveItem({ ...file, permission: "VIEWER", shared: true, sharedRoot: true });
    assert.equal(received.owned, false); assert.equal(received.permission, "VIEWER"); assert.equal(received.sharedRoot, true);
    const items = await client.loadDriveItems();
    assert.equal(items.length, 101);
    assert.equal(items.at(-1).id, "id-100");
    assert.equal(items[0].parent, "folder-id");
    globalThis.fetch = async () => Response.json({ error: { message: "expired" } }, { status: 401 });
    await assert.rejects(() => client.loadDriveItems(), error => error.status === 401 && error.message.includes("로그인"));
  } finally { globalThis.fetch = originalFetch; }
});
