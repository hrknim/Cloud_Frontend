import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

async function compile(path, packages) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const name of packages) source = source.replace(JSON.stringify(name), JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve(name)).href));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { convertWord, readWordResponse, WORD_PREVIEW_LIMIT } = await compile("../lib/previews/word-preview.ts", ["mammoth/mammoth.browser"]);
const { sanitizeWordHtml, wordPreviewDocument } = await compile("../lib/previews/word-html.ts", ["dompurify"]);
const { isWordPreview } = await compile("../lib/files/file-types.ts", []);

async function fixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/styles.xml", '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>');
  zip.file("word/_rels/document.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="img1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/test.png"/><Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>');
  zip.file("word/media/test.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXuoAAAAASUVORK5CYII=", "base64"));
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>한글 제목</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>강조 문단</w:t></w:r><w:hyperlink r:id="external"><w:r><w:t>위험한 링크</w:t></w:r></w:hyperlink></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>표 셀</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="img1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

test("DOCX conversion preserves headings, bold paragraphs, tables and embedded images", async () => {
  const converted = await convertWord(await fixture());
  const dom = new JSDOM();
  const clean = sanitizeWordHtml(converted.html, dom.window);
  const document = new JSDOM(clean).window.document;
  assert.equal(document.querySelector("h1").textContent, "한글 제목");
  assert.equal(document.querySelector("strong").textContent, "강조 문단");
  assert.equal(document.querySelector("td").textContent, "표 셀");
  assert.match(document.querySelector("img").src, /^data:image\/png;base64,/);
  assert.equal(document.querySelector("a"), null);
  assert.match(document.body.textContent, /위험한 링크/);
  dom.window.close();
  await assert.rejects(convertWord(new ArrayBuffer(0)));
});

test("Document sanitization removes active content and external or SVG resources", () => {
  const dom = new JSDOM();
  const html = '<script>alert(1)</script><style>body{display:none}</style><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">text</a><img src="https://evil.test/a.png" onerror="alert(1)"><img src="data:image/svg+xml;base64,AAAA"><img src="data:image/png;base64,AAAA"><p style="background:url(https://evil.test)" id="__proto__" data-x="1">safe</p><table><tr><td colspan="99999">cell</td></tr></table>';
  const clean = sanitizeWordHtml(html, dom.window);
  assert.doesNotMatch(clean, /script|iframe|javascript|evil\.test|onerror|svg\+xml|style=|id=|data-x|99999/);
  assert.match(clean, /data:image\/png;base64,AAAA/);
  assert.match(clean, /safe/);
  const document = wordPreviewDocument(clean, Infinity);
  assert.match(document, /default-src 'none'/);
  assert.match(document, /img-src data:/);
  assert.match(document, /font: 16px/);
  dom.window.close();
});

test("DOCX detection excludes legacy, macro and unrelated extensions", () => {
  const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  assert.equal(isWordPreview("report.DOCX", null), true);
  assert.equal(isWordPreview("document", mime), true);
  for (const name of ["report.doc", "report.docm", "report.pdf", "report.hwp"]) assert.equal(isWordPreview(name, mime), false);
});

test("Download reader enforces session, permission and size bounds", async () => {
  assert.equal(Buffer.from(await readWordResponse(new Response("hello"))).toString(), "hello");
  await assert.rejects(readWordResponse(new Response("", { status: 401 })), /로그인/);
  await assert.rejects(readWordResponse(new Response("", { status: 403 })), /권한/);
  await assert.rejects(readWordResponse(new Response("", { headers: { "content-length": WORD_PREVIEW_LIMIT + 1 } })), /20 MB/);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(WORD_PREVIEW_LIMIT + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readWordResponse(new Response(stream)), /20 MB/);
  assert.equal(cancelled, true);
});
