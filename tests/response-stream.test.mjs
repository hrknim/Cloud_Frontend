import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { PassThrough, Readable, pipeline } from "node:stream";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/server/response-stream.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { responseStream } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const tick = () => new Promise(resolve => setImmediate(resolve));

test("Full and partial file responses preserve bytes and close the file source", async () => {
  const file = new URL("../package-lock.json", import.meta.url);
  const expected = await readFile(file);
  for (const range of [undefined, {start: 2, end: 35}]) {
    const node = createReadStream(file, range);
    const stream = responseStream(node, new AbortController().signal);
    const actual = Buffer.from(await new Response(stream).arrayBuffer());
    assert.deepEqual(actual, range ? expected.subarray(2, 36) : expected);
    assert.equal(node.destroyed, true);
  }
});

test("Cancellation during a pending file read never enqueues into a closed controller", async () => {
  for (let i = 0; i < 60; i++) {
    const node = createReadStream(new URL("../package-lock.json", import.meta.url));
    const reader = responseStream(node, new AbortController().signal).getReader();
    const pending = reader.read();
    await reader.cancel();
    await pending;
    await tick();
    assert.equal(node.destroyed, true);
  }
});

test("Slow consumers can abort during resume without uncaught exceptions", async () => {
  for (let i = 0; i < 80; i++) {
    let bytes = 0;
    const node = new Readable({read() {
      this.push(Buffer.alloc(16384)); bytes += 16384;
      if (bytes > 524288) this.push(null);
    }});
    const output = new PassThrough({highWaterMark: 16384});
    pipeline(node, output, () => {});
    const abort = new AbortController();
    const sink = new WritableStream({async write() { await new Promise(resolve => setTimeout(resolve, 1)); }}, {highWaterMark: 1});
    const transfer = responseStream(output, abort.signal).pipeTo(sink);
    const timer = setTimeout(() => abort.abort(), i % 12);
    await assert.rejects(transfer, {name: "AbortError"});
    clearTimeout(timer);
    await tick();
    assert.equal(output.destroyed, true);
    assert.equal(node.destroyed, true);
  }
});

test("Already-aborted requests and genuine source failures reject cleanly", async () => {
  const abort = new AbortController();
  abort.abort();
  const node = Readable.from([Buffer.from("unused")]);
  await assert.rejects(new Response(responseStream(node, abort.signal)).arrayBuffer(), {name: "AbortError"});
  assert.equal(node.destroyed, true);
  const failure = new Error("read failed");
  const broken = new Readable({read() {this.destroy(failure);}});
  await assert.rejects(new Response(responseStream(broken, new AbortController().signal)).arrayBuffer(), error => error === failure);
});
