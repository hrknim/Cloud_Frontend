import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function compile(file, replacements = {}) {
  const { outputText } = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return url(outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(replacements[specifier] || specifier)}`));
}
const { uploadTree, readDroppedTree, readUploadDirectory } = await import(await compile("../lib/transfers/folder-upload.ts"));
const namesUrl = await compile("../lib/files/download-names.ts");
const { downloadName, downloadEntryNames, DOWNLOAD_NAME_BYTES } = await import(namesUrl);
const { saveDownloadTree } = await import(await compile("../lib/transfers/folder-download.ts", { "@/lib/files/download-names": namesUrl }));
const { buildDownloadTree } = await import(await compile("../lib/files/download-tree.ts", { "./download-names": namesUrl }));
const file = name => new File([name], name);

test("Download names handle Windows restrictions, Unicode and byte limits without collisions", () => {
  assert.equal(downloadName('보고서:최종?.txt'), '보고서_최종_.txt');
  for (const name of ['CON.txt', 'nul', 'AUX .txt', 'COM1.log', 'LPT².txt']) assert.ok(downloadName(name).startsWith('_'));
  assert.equal(downloadName('hello... '), 'hello');
  assert.equal(downloadName('..'), 'file');
  const names = downloadEntryNames(['a:b.txt', 'a?b.txt', 'A_B.txt', 'é.txt', 'e\u0301.txt', `${'한😀'.repeat(100)}.xlsx`, `${'한😀'.repeat(100)}.xlsx`]);
  assert.equal(new Set(names.map(name => name.normalize('NFC').toLowerCase())).size, names.length);
  for (const name of names) {
    assert.ok(Buffer.byteLength(name) <= DOWNLOAD_NAME_BYTES);
    assert.ok(!/[<>:"\\/|?*\u0000-\u001f\u007f]/.test(name));
    assert.ok(!/[. ]$/.test(name));
    assert.ok(!name.includes('\ufffd'));
  }
  assert.ok(names.at(-1).endsWith(' (2).xlsx'));
  assert.ok(Buffer.byteLength(downloadName(`${'한'.repeat(100)}.txt`, 12345)) <= DOWNLOAD_NAME_BYTES);
});

test("Upload plans infer parent paths, preserve empty folders, and reject traversal/collisions", () => {
  const plan = uploadTree([{ path: "root/nested/a", file: file("a") }], ["root/empty"]);
  assert.deepEqual(plan.directories, ["root", "root/empty", "root/nested"]);
  for (const path of ["../a", "/a", "root/../a", "root\\a", "root//a"]) assert.throws(() => uploadTree([{ path, file: file("a") }]));
  assert.throws(() => uploadTree([{ path: "root/a", file: file("a") }], ["root/a"]));
});

test("Dropped directories drain multiple readEntries batches and retain empty folders", async () => {
  const fileEntry = name => ({ name, isFile: true, isDirectory: false, file: resolve => resolve(file(name)) });
  const directory = (name, batches) => ({ name, isDirectory: true, isFile: false, createReader: () => {
    let index = 0; return { readEntries: resolve => resolve(batches[index++] || []) };
  } });
  const root = directory("root", [[fileEntry("a")], [directory("empty", [[]]), fileEntry("b")], []]);
  const plan = await readDroppedTree([root]);
  assert.deepEqual(plan.files.map(file => file.path), ["root/a", "root/b"]);
  assert.ok(plan.directories.includes("root/empty"));
});

test("Native directory selection includes empty folders and abort stops scanning", async () => {
  const root = { name: "root", kind: "directory", async *values() {
    yield { name: "empty", kind: "directory", async *values() {} };
    yield { name: "a", kind: "file", getFile: async () => file("a") };
  } };
  assert.deepEqual((await readUploadDirectory(root)).directories, ["root", "root/empty"]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readUploadDirectory(root, controller.signal), { name: "AbortError" });
});

function localDirectory(name) {
  const entries = new Map();
  return { name, entries,
    async getDirectoryHandle(name, options = {}) {
      let entry = entries.get(name);
      if (entry && entry.kind !== "folder") throw new DOMException("file", "TypeMismatchError");
      if (!entry && !options.create) throw new DOMException("missing", "NotFoundError");
      if (!entry) { entry = { kind: "folder", handle: localDirectory(name) }; entries.set(name, entry); }
      return entry.handle;
    },
    async getFileHandle(name, options = {}) {
      let entry = entries.get(name);
      if (entry && entry.kind !== "file") throw new DOMException("directory", "TypeMismatchError");
      if (!entry && !options.create) throw new DOMException("missing", "NotFoundError");
      if (!entry) { entry = { kind: "file", content: "" }; entries.set(name, entry); }
      return { createWritable: async () => new WritableStream({ write(chunk) { entry.content += new TextDecoder().decode(chunk); } }) };
    }
  };
}

test("Native download keeps hierarchy and empty folders without overwriting existing roots", async () => {
  const local = localDirectory("destination");
  const existing = await local.getDirectoryHandle("root", { create: true });
  existing.entries.set("precious.txt", { kind: "file", content: "do not overwrite" });
  const progress = [];
  await saveDownloadTree(local, [{ id: "root", path: "root", kind: "folder" }, { id: "empty", path: "root/empty", kind: "folder" }, { id: "a", path: "root/nested/a", kind: "file" }], async (url, init) => {
    assert.equal(url, "/api/files/a/content"); assert.equal(init.credentials, "same-origin"); return new Response("hello");
  }, (done, total) => progress.push([done, total]));
  const saved = local.entries.get("root (2)").handle;
  assert.ok(saved.entries.get("empty"));
  assert.equal(saved.entries.get("nested").handle.entries.get("a").content, "hello");
  assert.equal(existing.entries.get("precious.txt").content, "do not overwrite");
  assert.deepEqual(progress.at(-1), [3, 3]);
  await assert.rejects(saveDownloadTree(local, [{ id: "bad", path: "../escape", kind: "file" }]), /경로/);
});

test("Download tree rejects cycles and excludes trash and cross-owner descendants", async () => {
  const root = { id: "root", name: "root", kind: "FOLDER", ownerId: "owner", parentId: null, deletedAt: null };
  const file = { ...root, id: "file", name: "a", kind: "FILE", parentId: "root" };
  const entries = await buildDownloadTree([root], async () => [file, { ...file, id: "trash", deletedAt: new Date() }, { ...file, id: "foreign", ownerId: "other" }]);
  assert.deepEqual(entries.map(entry => entry.path), ["root", "root/a"]);
  await assert.rejects(buildDownloadTree([root], async () => [{ ...root, parentId: "root" }]), /순환/);
});

test("Native saves sanitize every level, retain both colliding names and protect existing files", async () => {
  const local = localDirectory('destination');
  const long = `${'한'.repeat(100)}.txt`, safeLong = downloadName(long);
  local.entries.set(safeLong, { kind: 'file', content: 'keep me' });
  const entries = [
    { id: 'root', path: '자료:최종', kind: 'folder' },
    { id: 'empty', path: '자료:최종/CON', kind: 'folder' },
    { id: 'a', path: '자료:최종/CON/a:b.txt', kind: 'file' },
    { id: 'b', path: '자료:최종/CON/a?b.txt', kind: 'file' },
    { id: 'long', path: long, kind: 'file' },
  ];
  await saveDownloadTree(local, entries, async url => new Response(url));
  const saved = local.entries.get('자료_최종').handle.entries.get('_CON').handle;
  assert.equal(saved.entries.get('a_b.txt').content, '/api/files/a/content');
  assert.equal(saved.entries.get('a_b (2).txt').content, '/api/files/b/content');
  assert.equal(local.entries.get(safeLong).content, 'keep me');
  assert.equal(local.entries.get(downloadName(safeLong, 2)).content, '/api/files/long/content');
  assert.equal(entries[0].path, '자료:최종', 'Original manifest remains unchanged');
  const verify = directory => {
    for (const [name, entry] of directory.entries) {
      assert.equal(downloadName(name), name);
      if (entry.kind === 'folder') verify(entry.handle);
    }
  };
  verify(local);
});

test("ZIP and manifest trees sanitize folder and file siblings identically", async () => {
  const root = { id: 'root', name: 'CON', kind: 'FOLDER', ownerId: 'owner', parentId: null, deletedAt: null };
  const entries = await buildDownloadTree([root], async () => ['report:final.txt', 'report?final.txt'].map((name, index) => ({ ...root, id: String(index), name, kind: 'FILE', parentId: 'root' })));
  assert.deepEqual(entries.map(entry => entry.path), ['_CON', '_CON/report_final.txt', '_CON/report_final (2).txt']);
  assert.equal(root.name, 'CON');
});
