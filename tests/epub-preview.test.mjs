import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
async function load(path, packages = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const name of packages) source = source.replace(JSON.stringify(name), JSON.stringify(import.meta.resolve(name)));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { openEpub, readEpubChapter, resolveEpubPath, readEpubResponse, EPUB_PREVIEW_LIMIT } = await load("../lib/previews/epub-preview.ts", ["jszip", "@xmldom/xmldom"]);
const { sanitizeWordHtml } = await load("../lib/previews/word-html.ts", ["dompurify"]);
const { isEpubPreview } = await load("../lib/files/file-types.ts");
async function fixture({ version = 3, drm = false, chapter = null } = {}) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="Book/package.opf"/></rootfiles></container>');
  zip.file("Book/package.opf", `<package xmlns="http://www.idpf.org/2007/opf" version="${version}.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>한글 책</dc:title><dc:creator>작가</dc:creator></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="${version === 3 ? "nav" : ""}"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="b"/><itemref idref="a"/></spine></package>`);
  zip.file("Book/nav.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="b.xhtml#start">두 번째</a></li><li><a href="a.xhtml">첫 번째</a></li></ol></nav></body></html>');
  zip.file("Book/toc.ncx", '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>NCX 두 번째</text></navLabel><content src="b.xhtml"/></navPoint><navPoint><navLabel><text>NCX 첫 번째</text></navLabel><content src="a.xhtml"/></navPoint></navMap></ncx>');
  zip.file("Book/b.xhtml", chapter || '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>둘째 장</h1><p>한글 &nbsp;본문</p><img src="images/cover.png"/><img src="https://evil.test/image.png"/><a href="javascript:alert(1)">링크</a><script>alert(1)</script><iframe src="https://evil.test"></iframe><p style="background:url(https://evil.test)">안전한 본문</p></body></html>');
  zip.file("Book/a.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>첫 장</p></body></html>');
  zip.file("Book/images/cover.png", Buffer.from("iVBORw0KGgo=", "base64"));
  if (drm) zip.file("META-INF/encryption.xml", '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/></enc:EncryptedData></encryption>');
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
test("EPUB 3 preserves metadata and spine order, reads TOC and embeds local images", async () => {
  const book = await openEpub(await fixture());
  assert.equal(book.metadata.title, "한글 책"); assert.equal(book.metadata.author, "작가");
  assert.deepEqual(book.metadata.chapters.map(chapter => chapter.title), ["두 번째", "첫 번째"]);
  const chapter = await readEpubChapter(book, 0), dom = new JSDOM();
  const clean = sanitizeWordHtml(chapter.html, dom.window);
  assert.match(clean, /둘째 장/); assert.match(clean, /data:image\/png;base64,/);
  assert.doesNotMatch(clean, /<script|<iframe|evil\.test|javascript:|style=/);
  assert.equal(chapter.partial, true, "external image omission is disclosed");
  assert.match((await readEpubChapter(book, 1)).html, /첫 장/);
  await assert.rejects(readEpubChapter(book, -1), /챕터/);
  dom.window.close();
});
test("EPUB 2 uses NCX labels", async () => {
  const book = await openEpub(await fixture({ version: 2 }));
  assert.deepEqual(book.metadata.chapters.map(chapter => chapter.title), ["NCX 두 번째", "NCX 첫 번째"]);
});
test("External/traversing paths, DRM, unsafe XML and oversized chapters are rejected", async () => {
  for (const path of ["https://evil.test/a", "../../../escape", "%2fsecret", "..%5csecret", "data:image/png;base64,AAAA"]) assert.equal(resolveEpubPath("Book/a.xhtml", path), null);
  assert.equal(resolveEpubPath("Book/a.xhtml", "images/my%20cover.png#x"), "Book/images/my cover.png");
  await assert.rejects(openEpub(await fixture({ drm: true })), /DRM/);
  const unsafe = await openEpub(await fixture({ chapter: '<!DOCTYPE html [<!ENTITY x SYSTEM "file:///secret">]><html><body>&x;</body></html>' }));
  await assert.rejects(readEpubChapter(unsafe, 0), /XML/);
  const large = await openEpub(await fixture({ chapter: `<html><body>${"x".repeat(2 * 1024 * 1024)}</body></html>` }));
  await assert.rejects(readEpubChapter(large, 0), /너무 큽니다/);
  await assert.rejects(openEpub(new ArrayBuffer(0)));
});
test("EPUB detection and download bounds retain authentication checks", async () => {
  assert.equal(isEpubPreview("book.EPUB", null), true);
  assert.equal(isEpubPreview("book", "application/epub+zip"), true);
  assert.equal(isEpubPreview("book.zip", "application/epub+zip"), false);
  assert.equal(Buffer.from(await readEpubResponse(new Response("epub"))).toString(), "epub");
  await assert.rejects(readEpubResponse(new Response("", { status: 401 })), /로그인/);
  await assert.rejects(readEpubResponse(new Response("", { status: 403 })), /권한/);
  await assert.rejects(readEpubResponse(new Response("", { headers: { "content-length": EPUB_PREVIEW_LIMIT + 1 } })), /20 MB/);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(EPUB_PREVIEW_LIMIT + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readEpubResponse(new Response(stream)), /20 MB/); assert.equal(cancelled, true);
});
