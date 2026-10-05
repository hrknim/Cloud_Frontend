import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, truncate, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import JSZip from "jszip";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function compile(relative, replacements = {}) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return url(outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(replacements[specifier] || replacements[specifier.replace("@/lib/", "../")] || import.meta.resolve(specifier))}`));
}
// Exercise the real handler/authorization logic with an in-memory DB, no live DB writes.
const mockUrl = url(`
export const rows = new Map(), grants = new Map();
export const prismaSetting = { cloud_item: {
  findFirst: async ({where}) => [...rows.values()].find(row => Object.entries(where).every(([key,value]) => row[key] === value)) || null,
  findMany: async ({where,take}) => [...rows.values()].filter(row => Object.entries(where).every(([key,value]) => row[key] === value)).slice(0,take || 5001),
  findUnique: async ({where}) => rows.get(where.id) || null
}, cloud_share: { findUnique: async ({where}) => grants.get(where.itemId_userId.itemId) || null } };
export const proxyAuthRequest = async request => request.headers.get('Cookie') === 'session_id=test' ? Response.json({result:{id:'owner'}}) : Response.json({error:{message:'Unauthorized'}},{status:401});
`);
const errorUrl = await compile("../lib/server/cloud-error.ts");
const recipientUrl = await compile("../lib/server/share-recipient.ts", { "./cloud-error": errorUrl });
const profileUrl = await compile("../lib/server/user-profile.ts", { "./cloud-error": errorUrl });
const downloadNamesUrl = await compile("../lib/files/download-names.ts");
const cloudUrl = await compile("../lib/server/cloud.ts", {
  "./storage-quota": await compile("../lib/server/storage-quota.ts", { "./cloud-error": errorUrl }),
  "./response-stream": await compile("../lib/server/response-stream.ts"),
  "./prisma": mockUrl, "./auth-proxy": mockUrl, "./cloud-error": errorUrl,
  "./share-recipient": recipientUrl, "./user-profile": profileUrl,
  "./request-origin": await compile("../lib/server/request-origin.ts"),
  "../files/file-types": await compile("../lib/files/file-types.ts"),
  "../files/http-range": await compile("../lib/files/http-range.ts"),
  "../files/download-names": downloadNamesUrl,
  "../files/download-tree": await compile("../lib/files/download-tree.ts", { "./download-names": downloadNamesUrl }),
});
const { cloudResponse, downloadCloudFile, downloadCloudFiles } = await import(cloudUrl);
const { rows, grants } = await import(mockUrl);
const files = [];
const ids = {};
test.before(async () => {
  await mkdir(path.resolve(".cloud-storage"), { recursive: true });
  for (const key of ["a", "b", "private", "shared", "trash", "folder"]) {
    const id = randomUUID(), storageKey = randomUUID();
    ids[key] = id;
    const target = path.resolve(".cloud-storage", storageKey);
    files.push(target); await writeFile(target, `contents-${key}`);
    rows.set(id, { id, name: key === "a" || key === "b" ? "same.txt" : `${key}.txt`, kind: key === "folder" ? "FOLDER" : "FILE", ownerId: key === "private" || key === "shared" ? "other" : "owner", parentId: null, deletedAt: key === "trash" ? new Date() : null, storageKey, updatedAt: new Date() });
  }
  grants.set(ids.shared, { role: "VIEWER" });
});
test.after(async () => { await Promise.all(files.map(target => unlink(target))); });

test("Audio and video previews keep ranges and safely cancel pending responses", async () => {
  const item = rows.get(ids.a);
  const original = {name: item.name, mimeType: item.mimeType};
  try {
    for (const [extension, mime] of [["mp3", "audio/mpeg"], ["mp4", "video/mp4"]]) {
      Object.assign(item, {name: `preview.${extension}`, mimeType: mime});
      const previewRequest = signal => new Request("http://localhost/api/files/content?preview=true", {
        headers: {Cookie: "session_id=test", Range: "bytes=0-4"}, signal,
      });
      const response = await downloadCloudFile(previewRequest(), ids.a);
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("content-type"), mime);
      assert.equal(await response.text(), "conte");
      for (let i = 0; i < 20; i++) {
        const abort = new AbortController();
        const response = await downloadCloudFile(previewRequest(abort.signal), ids.a);
        const reader = response.body.getReader();
        const pending = reader.read();
        if (i % 2) {
          abort.abort();
          await assert.rejects(pending, {name: "AbortError"});
        } else {
          await reader.cancel();
          await pending;
        }
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  } finally {Object.assign(item, original);}
});
const request = (itemIds, cookie = "session_id=test", origin = "http://localhost") => cloudResponse(() => downloadCloudFiles(new Request("http://localhost/api/files/download", {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin }, body: JSON.stringify({ itemIds }),
})));

test("Streamed ZIP includes owned and view-only shared files without duplicate loss", async () => {
  const response = await request([ids.a, ids.b, ids.shared, ids.a]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/zip");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files), ["same.txt", "same (2).txt", "shared.txt"]);
  assert.equal(await zip.file("same.txt").async("string"), "contents-a");
  assert.equal(await zip.file("shared.txt").async("string"), "contents-shared");
});

test("ZIP consumers can cancel while the legacy output is generating", async () => {
  for (let i = 0; i < 15; i++) {
    const response = await request([ids.a, ids.b, ids.shared]);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const pending = reader.read();
    await reader.cancel();
    await pending;
    await new Promise(resolve => setImmediate(resolve));
  }
});

test("Unauthorized member rejects the whole bundle before any file contents are returned", async () => {
  const response = await request([ids.a, ids.private]);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
  assert.equal((await request([ids.a], "")).status, 401);
  assert.equal((await request([ids.a], "session_id=test", "https://external.example")).status, 403);
});

test("Trashed, missing, malformed and over-limit selections are rejected", async () => {
  for (const selection of [[ids.trash], [randomUUID()]]) assert.equal((await request(selection)).status, 404);
  for (const selection of [[], ["invalid"], Array(101).fill(ids.a)]) assert.equal((await request(selection)).status, 400);
});

test("Folders include empty directories and nested files, skip trash and deduplicate selected descendants", async () => {
  const root = rows.get(ids.folder);
  const nestedId = randomUUID(), emptyId = randomUUID(), foreignId = randomUUID();
  rows.set(nestedId, { ...root, id: nestedId, kind: "FOLDER", name: "nested", parentId: root.id });
  rows.set(emptyId, { ...root, id: emptyId, kind: "FOLDER", name: "empty", parentId: root.id });
  rows.get(ids.a).parentId = nestedId;
  rows.get(ids.trash).parentId = root.id;
  rows.set(foreignId, { ...rows.get(ids.private), id: foreignId, parentId: root.id });
  try {
    const response = await request([ids.a, root.id]);
    assert.equal(response.status, 200);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    assert.ok(zip.file(`${root.name}/nested/same.txt`));
    assert.ok(zip.files[`${root.name}/empty/`].dir);
    assert.equal(Object.values(zip.files).filter(entry => !entry.dir).length, 1);
    const manifestResponse = await cloudResponse(() => downloadCloudFiles(new Request("http://localhost/api/files/download", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "session_id=test", Origin: "http://localhost" }, body: JSON.stringify({ itemIds: [root.id], mode: "manifest" }) })));
    const manifest = await manifestResponse.json();
    assert.ok(manifest.entries.some(entry => entry.id === ids.a && entry.kind === "file"));
    assert.ok(manifest.entries.some(entry => entry.id === emptyId && entry.kind === "folder"));
    assert.equal(manifest.entries.some(entry => entry.id === foreignId || entry.id === ids.trash), false);
  } finally { rows.get(ids.a).parentId = null; rows.get(ids.trash).parentId = null; rows.delete(nestedId); rows.delete(emptyId); rows.delete(foreignId); }
});

test("Large bundles are rejected using actual stored file sizes, before streaming", async () => {
  const target = path.resolve(".cloud-storage", rows.get(ids.b).storageKey);
  try {
    await truncate(target, 1024 ** 3 + 1);
    const response = await request([ids.a, ids.b]);
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "DOWNLOAD_TOO_LARGE");
  } finally { await writeFile(target, "contents-b"); }
});
