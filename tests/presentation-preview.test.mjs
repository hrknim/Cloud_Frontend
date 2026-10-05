import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import JSZip from "jszip";
const source = await readFile(new URL("../lib/previews/presentation-preview.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace('"jszip"', JSON.stringify(import.meta.resolve("jszip"))).replace('"@xmldom/xmldom"', JSON.stringify(import.meta.resolve("@xmldom/xmldom"))), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parsePresentation, resolvePresentationPart, readPresentationResponse, PRESENTATION_LIMIT } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const p = "http://schemas.openxmlformats.org/presentationml/2006/main", a = "http://schemas.openxmlformats.org/drawingml/2006/main", r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relationships = body => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
async function fixture(options = {}) {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", options.badXml || `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", relationships('<Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/>'));
  for (let i = 1; i <= 2; i++) {
    zip.file(`ppt/slides/slide${i}.xml`, `<p:sld xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="1219200" y="685800"/><a:ext cx="6096000" cy="1371600"/></a:xfrm><a:solidFill><a:srgbClr val="ffeeaa"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="2400" b="1"/><a:t>한글 ${i} &lt;script&gt;</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm></p:spPr><p:blipFill><a:blip r:embed="image"/></p:blipFill></p:pic><p:graphicFrame/></p:spTree></p:cSld></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${i}.xml.rels`, relationships(`<Relationship Id="image" Target="${options.external ? "https://evil.test/image.png" : "../media/image.png"}"${options.external ? ' TargetMode="External"' : ""}/>`));
  }
  zip.file("ppt/media/image.png", Buffer.from("iVBORw0KGgo=", "base64"));
  return zip.generateAsync({ type: "arraybuffer" });
}
test("PPTX keeps presentation order, dimensions, literal text, basic positions and images", async () => {
  const doc = await parsePresentation(await fixture());
  assert.equal(doc.width, 1000); assert.equal(doc.height, 562.5);
  assert.equal(doc.slides.length, 2);
  assert.equal(doc.slides[0].parts[0].text, "한글 2 <script>");
  assert.equal(doc.slides[1].parts[0].text, "한글 1 <script>");
  assert.equal(doc.slides[0].parts[0].x, 100);
  assert.equal(doc.slides[0].parts[0].background, "#ffeeaa");
  assert.match(doc.slides[0].parts[1].image, /^data:image\/png;base64,/);
  assert.equal(doc.partial, true, "unsupported graphic frame is disclosed");
});
test("External relationships, unsafe archive paths, DTD and malformed XML are rejected", async () => {
  const doc = await parsePresentation(await fixture({ external: true }));
  assert.equal(doc.slides[0].parts.some(part => part.image), false);
  for (const target of ["https://evil.test/x.png", "../../../outside", "..\\media\\x.png", "/secret", "../media/x.svg#script"]) assert.equal(resolvePresentationPart("ppt/slides/slide1.xml", target), null);
  assert.equal(resolvePresentationPart("ppt/slides/slide1.xml", "../media/test.png"), "ppt/media/test.png");
  await assert.rejects(parsePresentation(await fixture({ badXml: '<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///secret">]><x/>' })), /XML/);
  await assert.rejects(parsePresentation(await fixture({ badXml: "<broken>" })));
  await assert.rejects(parsePresentation(new ArrayBuffer(0)));
  await assert.rejects(parsePresentation(await fixture({ badXml: `<root>${"x".repeat(2 * 1024 * 1024)}</root>` })), /너무 큽니다/);
});
test("PPTX reader bounds network downloads and checks permissions", async () => {
  assert.equal(Buffer.from(await readPresentationResponse(new Response("ok"))).toString(), "ok");
  await assert.rejects(readPresentationResponse(new Response("", { status: 401 })), /로그인/);
  await assert.rejects(readPresentationResponse(new Response("", { status: 403 })), /권한/);
  await assert.rejects(readPresentationResponse(new Response("", { headers: { "content-length": PRESENTATION_LIMIT + 1 } })), /20 MB/);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(PRESENTATION_LIMIT + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readPresentationResponse(new Response(stream)), /20 MB/);
  assert.equal(cancelled, true);
});
