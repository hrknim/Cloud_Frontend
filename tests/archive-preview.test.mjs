import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import JSZip from "jszip";
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { parseArchive, archiveFolder, archiveBytes, readArchiveResponse, ARCHIVE_PREVIEW_LIMIT } = await load("../lib/previews/archive-preview.ts");
const { isArchivePreview } = await load("../lib/files/file-types.ts");
async function fixture() {
  const zip = new JSZip();
  zip.file("문서/보고서.txt", "한글 내용", { createFolders: false });
  zip.file("문서/하위/data.csv", "a,b\n1,2", { createFolders: false });
  zip.folder("empty");
  zip.file("plain.txt", "z".repeat(10000));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", comment: "test" });
}
function metadataOnly(name, flags = 0, size = 12) {
  const bytes = typeof name === "string" ? Buffer.from(name) : name;
  const record = Buffer.alloc(46 + bytes.length + 22);
  record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(flags, 8);
  record.writeUInt32LE(5, 20); record.writeUInt32LE(size, 24); record.writeUInt16LE(bytes.length, 28); bytes.copy(record, 46);
  const end = 46 + bytes.length;
  record.writeUInt32LE(0x06054b50, end); record.writeUInt16LE(1, end + 8); record.writeUInt16LE(1, end + 10); record.writeUInt32LE(end, end + 12);
  return record.buffer.slice(record.byteOffset, record.byteOffset + record.length);
}
test("ZIP metadata lists UTF-8 paths, sizes, implicit folders and empty directories", async () => {
  const archive = parseArchive(await fixture());
  assert.equal(archive.files, 3); assert.equal(archive.folders, 3);
  assert.equal(archive.entries.find(entry => entry.name === "보고서.txt").size, Buffer.byteLength("한글 내용"));
  assert.ok(archive.compressedSize < archive.size);
  assert.deepEqual(archiveFolder(archive.entries).map(row => row.name), ["문서", "empty", "plain.txt"]);
  assert.deepEqual(archiveFolder(archive.entries, "문서/").map(row => row.name), ["하위", "보고서.txt"]);
  assert.equal(archiveFolder(archive.entries, "empty/").length, 0);
  assert.equal(archiveBytes(1024), "1.0 KB");
  const empty = parseArchive(await new JSZip().generateAsync({ type: "arraybuffer" }));
  assert.equal(empty.files, 0);
});
test("Listing never inflates or validates payloads, even when contents are corrupted", async () => {
  const data = await fixture(), bytes = new Uint8Array(data), view = new DataView(data);
  const end = data.byteLength - 22 - 4, central = view.getUint32(end + 16, true);
  bytes.fill(0, 0, central);
  assert.equal(parseArchive(data).files, 3);
  const large = parseArchive(metadataOnly("huge.txt", 0, 0xfffffffe));
  assert.equal(large.size, 0xfffffffe, "uncompressed size is metadata, never an allocation");
});
test("Encrypted and unsafe entries remain literal and cannot become browsable folders", () => {
  const encrypted = parseArchive(metadataOnly("secret.txt", 1));
  assert.equal(encrypted.entries[0].encrypted, true);
  assert.equal(encrypted.warnings, true);
  for (const name of ["../escape.txt", "/absolute/", "C:\\escape.txt", "bad\0name", "<script>alert(1)</script>"]) {
    const archive = parseArchive(metadataOnly(name, 0x800));
    if (!name.startsWith("<script>")) assert.equal(archive.entries[0].unsafe, true, name);
    assert.equal(archiveFolder(archive.entries).length, 1);
  }
  const cp949 = parseArchive(metadataOnly(Buffer.from([0xb0, 0xa1, 0x2e, 0x74, 0x78, 0x74])));
  assert.equal(cp949.entries[0].name, "가.txt");
  assert.equal(parseArchive(metadataOnly(`${"deep/".repeat(101)}file.txt`)).entries[0].unsafe, true);
});
test("Malformed, multi-volume, ZIP64 and oversized lists fail with useful errors", () => {
  assert.throws(() => parseArchive(new ArrayBuffer(0)), /ZIP/);
  const malformed = metadataOnly("a.txt"), view = new DataView(malformed), end = malformed.byteLength - 22;
  view.setUint32(end + 16, malformed.byteLength, true);
  assert.throws(() => parseArchive(malformed), /손상/);
  const split = metadataOnly("a.txt"); new DataView(split).setUint16(split.byteLength - 18, 1, true);
  assert.throws(() => parseArchive(split), /분할/);
  const zip64 = metadataOnly("a.txt"); new DataView(zip64).setUint32(24, 0xffffffff, true);
  assert.throws(() => parseArchive(zip64), /ZIP64/);
  assert.throws(() => parseArchive(new ArrayBuffer(ARCHIVE_PREVIEW_LIMIT + 1)), /20 MB/);
});
test("ZIP detection and downloads respect formats, session and streamed size", async () => {
  assert.equal(isArchivePreview("file.ZIP", null), true);
  assert.equal(isArchivePreview("archive", "application/zip"), true);
  for (const name of ["file.rar", "file.7z", "file.docx"]) assert.equal(isArchivePreview(name, "application/zip"), false);
  assert.equal(Buffer.from(await readArchiveResponse(new Response("zip"))).toString(), "zip");
  await assert.rejects(readArchiveResponse(new Response("", { status: 401 })), /로그인/);
  await assert.rejects(readArchiveResponse(new Response("", { status: 403 })), /권한/);
  await assert.rejects(readArchiveResponse(new Response("", { headers: { "content-length": ARCHIVE_PREVIEW_LIMIT + 1 } })), /20 MB/);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(ARCHIVE_PREVIEW_LIMIT + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readArchiveResponse(new Response(stream)), /20 MB/); assert.equal(cancelled, true);
});
