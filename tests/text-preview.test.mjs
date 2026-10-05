import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/previews/text-preview.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { decodePreviewText, readPreviewText, TEXT_PREVIEW_LIMIT } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("Text decoding supports UTF-8, UTF-16 BOM and Korean legacy encoding", () => {
  const text = "한글 <script>alert('not executed')</script>";
  assert.deepEqual(decodePreviewText(new TextEncoder().encode(text)), { text, encoding: "utf-8" });
  assert.equal(decodePreviewText(new Uint8Array(Buffer.concat([Buffer.from([255, 254]), Buffer.from(text, "utf16le")]))).text, text);
  assert.equal(decodePreviewText(new Uint8Array([254, 255, 0, 65])).text, "A");
  assert.deepEqual(decodePreviewText(new Uint8Array([0xb0, 0xa1])), { text: "가", encoding: "euc-kr" });
  assert.equal(decodePreviewText(new Uint8Array()).text, "");
  assert.throws(() => decodePreviewText(new Uint8Array([65, 0, 66])), /바이너리/);
  assert.throws(() => decodePreviewText(new Uint8Array([255])), /인코딩/);
});

test("Text reader rejects access failures and bounds both declared and streamed size", async () => {
  assert.equal((await readPreviewText(new Response("hello"))).text, "hello");
  await assert.rejects(readPreviewText(new Response("", { status: 401 })), /로그인/);
  await assert.rejects(readPreviewText(new Response("", { status: 403 })), /접근 권한/);
  await assert.rejects(readPreviewText(new Response("", { headers: { "content-length": String(TEXT_PREVIEW_LIMIT + 1) } })), /2 MB/);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(TEXT_PREVIEW_LIMIT + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readPreviewText(new Response(stream)), /2 MB/);
  assert.equal(cancelled, true);
});
