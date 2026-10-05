import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../lib/files/http-range.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { parseByteRange } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
test("Single byte ranges support bounded, open-ended and suffix requests", () => {
  assert.deepEqual(parseByteRange("bytes=0-4", 10), { start: 0, end: 4 });
  assert.deepEqual(parseByteRange("bytes=5-", 10), { start: 5, end: 9 });
  assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange("bytes=2-99", 10), { start: 2, end: 9 });
  assert.deepEqual(parseByteRange("bytes=-99", 10), { start: 0, end: 9 });
  for (const value of ["bytes=10-", "bytes=4-2", "bytes=-0", "bytes=-", "bytes=9007199254740992-"]) assert.equal(parseByteRange(value, 10), false);
  assert.equal(parseByteRange("bytes=0-", 0), false);
  assert.equal(parseByteRange(null, 10), null);
  assert.equal(parseByteRange("bytes=0-1,3-4", 10), null);
});
