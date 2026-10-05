import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/drive/drive-api.ts", import.meta.url), "utf8");
const fileTypesSource = await readFile(new URL("../lib/files/file-types.ts", import.meta.url), "utf8");
const compiledTypes = ts.transpileModule(fileTypesSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const fileTypesUrl = `data:text/javascript;base64,${Buffer.from(compiledTypes).toString("base64")}`;
const outputText = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('from "@/lib/files/file-types"', `from "${fileTypesUrl}"`);
const client = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("Image preview URLs only enable supported raster formats, including shared files", () => {
  const file = { id: "photo", name: "photo.png", kind: "file", parentId: null, size: 1024, starred: false, deletedAt: null, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", downloadUrl: "/api/files/photo/content", permission: "VIEWER" };
  for (const format of ["png", "jpeg", "gif", "webp", "avif"]) {
    const item = client.toDriveItem({ ...file, name: `photo.${format}`, mimeType: `image/${format}` });
    assert.equal(item.kind, "image");
    assert.equal(item.url, "/api/files/photo/content?preview=true");
    assert.equal(item.owned, false);
  }
  for (const format of ["svg+xml", "heic", "tiff"]) {
    assert.equal(client.toDriveItem({ ...file, mimeType: `image/${format}` }).url, undefined);
  }
  assert.equal(client.toDriveItem({ ...file, mimeType: "image/png", downloadUrl: null }).url, undefined);
});

test("Spreadsheet preview is enabled for owned and shared files, not folders", () => {
  const file = { id: "sheet", name: "sheet.xlsx", kind: "file", parentId: null, size: 1024, starred: false, deletedAt: null, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", downloadUrl: "/api/files/sheet/content", permission: "VIEWER" };
  assert.equal(client.toDriveItem(file).spreadsheetPreview, true);
  assert.equal(client.toDriveItem(file).owned, false);
  assert.equal(client.toDriveItem({ ...file, name: "data.csv" }).spreadsheetPreview, true);
  assert.equal(client.toDriveItem({ ...file, name: "data.numbers" }).spreadsheetPreview, false);
  assert.equal(client.toDriveItem({ ...file, kind: "folder" }).spreadsheetPreview, false);
  assert.equal(client.toDriveItem({ ...file, name: "report.docx" }).wordPreview, true);
  assert.equal(client.toDriveItem({ ...file, name: "report.docx", kind: "folder" }).wordPreview, false);
  assert.equal(client.toDriveItem({ ...file, name: "report.doc" }).wordPreview, false);
  assert.equal(client.toDriveItem({ ...file, name: "slides.pptx" }).presentationPreview, true);
  assert.equal(client.toDriveItem({ ...file, name: "slides.pptx", kind: "folder" }).presentationPreview, false);
  assert.equal(client.toDriveItem({ ...file, name: "slides.ppt" }).presentationPreview, false);
  assert.equal(client.toDriveItem({ ...file, name: "archive.zip" }).archivePreview, true);
  assert.equal(client.toDriveItem({ ...file, name: "archive.zip", kind: "folder" }).archivePreview, false);
  assert.equal(client.toDriveItem({ ...file, name: "archive.rar" }).archivePreview, false);
  assert.equal(client.toDriveItem({ ...file, name: "book.epub" }).epubPreview, true);
  assert.equal(client.toDriveItem({ ...file, name: "book.epub", kind: "folder" }).epubPreview, false);
});

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
      assert.equal(query.pathname, "/api/drive");
      assert.equal(query.searchParams.get("area"), "drive");
      assert.equal(query.searchParams.get("limit"), "50");
      const offset = Number(query.searchParams.get("offset"));
      return Response.json({ items: offset === 0 ? Array.from({ length: 50 }, (_, n) => ({ ...file, id: `id-${n}` })) : [{ ...file, id: "id-50" }], context: [], path: [], total: 51, limit: 50, offset });
    };
    const form = new FormData(); form.set("file", new File(["test"], "model.glb")); form.set("parentId", "folder-id");
    const uploaded = await client.driveRequest("/api/files", { method: "POST", body: form });
    assert.equal(uploaded.item.id, "server-generated-id");
    assert.equal(client.toDriveItem(uploaded.item).kind, "3d");
    assert.equal(client.toDriveItem({ ...file, name: "보고서.PDF", mimeType: null }).kind, "document");
    assert.equal(client.toDriveItem({ ...file, name: "메모.TXT", mimeType: null }).textPreview, true);
    assert.equal(client.toDriveItem({ ...file, name: "source.ts", mimeType: null }).textPreview, true);
    assert.equal(client.toDriveItem({ ...file, name: "보고서.PDF", mimeType: null }).textPreview, false);
    assert.equal(client.toDriveItem({ ...file, name: "보고서.PDF", mimeType: null }).pdfPreview, true);
    assert.equal(client.toDriveItem({ ...file, name: "document", mimeType: "application/pdf; charset=binary", permission: "VIEWER" }).pdfPreview, true);
    assert.equal(client.toDriveItem({ ...file, name: "메모.txt", mimeType: "text/plain" }).pdfPreview, false);
    assert.equal(client.toDriveItem({ ...file, name: "movie.mp4", mimeType: null }).mediaUrl, `${file.downloadUrl}?preview=true`);
    assert.equal(client.toDriveItem({ ...file, name: "music.mp3", mimeType: "audio/mpeg", permission: "VIEWER" }).mediaUrl, `${file.downloadUrl}?preview=true`);
    assert.equal(client.toDriveItem({ ...file, name: "music.mid", mimeType: null }).mediaUrl, undefined);
    assert.equal(client.toDriveItem({ ...file, name: "사진.HEIC", mimeType: "image/heic" }).kind, "image");
    assert.equal(client.toDriveItem({ ...file, name: "사진.HEIC", mimeType: "image/heic" }).url, undefined, "Classification does not enable an unsupported preview");
    assert.equal(client.toDriveItem({ ...file, name: "벡터.svg", mimeType: "image/svg+xml" }).url, undefined);
    const owner = { handle: "shared-owner", displayName: "공유한 사람" };
    const received = client.toDriveItem({ ...file, permission: "VIEWER", shared: true, sharedRoot: true, owner });
    assert.deepEqual(received.owner, owner);
    assert.equal(received.owned, false); assert.equal(received.permission, "VIEWER"); assert.equal(received.sharedRoot, true);
    const page = await client.loadDriveItems();
    assert.equal(page.items.length, 50, "Only one page is fetched, never the complete listing");
    assert.equal(page.total, 51);
    assert.equal(page.items[0].parent, "folder-id");
    const more = await client.loadDriveItems({ offset: 50 });
    assert.equal(more.items[0].id, "id-50");
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.method, "PATCH");
      assert.deepEqual(JSON.parse(options.body), { starred: true });
      return Response.json({ item: { ...file, permission: "VIEWER", shared: true, starred: true, owner } });
    };
    const starredShare = await client.patchDriveItem(received, { starred: true });
    assert.equal(starredShare.starred, true);
    assert.equal(starredShare.sharedRoot, true, "Updating a personal star must keep the shared root visible");
    assert.equal(starredShare.owned, false);
    globalThis.fetch = async () => Response.json({ error: { message: "expired" } }, { status: 401 });
    await assert.rejects(() => client.loadDriveItems(), error => error.status === 401 && error.message.includes("로그인"));
  } finally { globalThis.fetch = originalFetch; }
});
