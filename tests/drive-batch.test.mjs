import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { runItemBatch } = await import(url(compile(await readFile(new URL("../lib/drive/drive-batch.ts", import.meta.url), "utf8"))));
const downloadNamesUrl = url(compile(await readFile(new URL("../lib/files/download-names.ts", import.meta.url), "utf8")));
const { downloadEntryNames } = await import(downloadNamesUrl);

test("Batch continues after failures and already-shared items retain their permissions", async () => {
  const items = ["a", "b", "c", "d"].map(id => ({ id, name: id }));
  const calls = [], reported = [];
  const results = await runItemBatch(items, async item => {
    calls.push(item.id);
    if (item.id === "b") throw Object.assign(new Error("already shared"), { code: "ALREADY_SHARED" });
    if (item.id === "c") throw new Error("forbidden");
  }, result => reported.push(result));
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  assert.deepEqual(results.map(result => result.status), ["success", "skipped", "error", "success"]);
  assert.deepEqual(reported, results);
  const retry = items.filter(item => results.some(result => result.id === item.id && result.status === "error"));
  assert.deepEqual(retry.map(item => item.id), ["c"]);
});

test("ZIP names retain every file without directories or filename collisions", () => {
  const names = downloadEntryNames(["note.txt", "note.txt", "NOTE.txt", "note (2).txt", "../secret", "..", ".env", ".env"]);
  assert.deepEqual(names.slice(0, 4), ["note.txt", "note (2).txt", "NOTE (3).txt", "note (2) (2).txt"]);
  assert.equal(new Set(names.map(name => name.toLowerCase())).size, names.length);
  assert.ok(names.every(name => !/[\\/]/.test(name) && name !== ".."));
});

test("Selection toolbar orders X, summary, actions and respects mixed permissions", async () => {
  let source = await readFile(new URL("../components/drive/selection-toolbar.tsx", import.meta.url), "utf8");
  source = source.replace('import styles from "./drive.module.css";', 'const styles = {};');
  let compiled = compile(source).replace('from "@/lib/files/download-names"', `from "${downloadNamesUrl}"`);
  for (const moduleName of ["react/jsx-runtime", "lucide-react"]) compiled = compiled.replaceAll(`from "${moduleName}"`, `from "${import.meta.resolve(moduleName)}"`);
  const { default: Toolbar } = await import(url(compiled));
  const props = { items: [{ id: "a", kind: "document", owned: true, starred: true, bytes: 100 }], busy: false, onClear() {}, onDownload() {}, onShare() {}, onStar() {}, onMove() {}, onTrash() {} };
  const html = renderToStaticMarkup(createElement(Toolbar, props));
  assert.ok(html.indexOf('aria-label="선택 해제"') < html.indexOf("1개 선택됨"));
  assert.ok(html.indexOf("1개 선택됨") < html.indexOf('aria-label="선택 항목 다운로드"'));
  assert.match(html, /선택 항목 즐겨찾기 해제/);
  assert.match(html, /aria-label="선택 항목 이동"/);
  assert.match(html, /aria-label="선택 항목 휴지통으로 이동"/);
  const mixed = renderToStaticMarkup(createElement(Toolbar, { ...props, items: [...props.items, { id: "folder", kind: "folder", owned: false, bytes: 0 }] }));
  assert.doesNotMatch(mixed, /disabled="" aria-label="선택 항목 다운로드"/);
  assert.match(mixed, /disabled="" aria-label="선택 항목 공유"/);
  assert.match(mixed, /disabled="" aria-label="선택 항목 이동"/);
  assert.match(mixed, /disabled="" aria-label="선택 항목 휴지통으로 이동"/);
  assert.match(mixed, /선택 항목 즐겨찾기 추가/);
  const oversized = renderToStaticMarkup(createElement(Toolbar, { ...props, items: [...props.items, { ...props.items[0], id: "huge", bytes: 1024 ** 3 }] }));
  assert.match(oversized, /disabled="" aria-label="선택 항목 다운로드"/);
  const trashed = renderToStaticMarkup(createElement(Toolbar, { ...props, items: [{ ...props.items[0], deleted: true }] }));
  assert.match(trashed, /disabled="" aria-label="선택 항목 이동"/);
  assert.match(trashed, /disabled="" aria-label="선택 항목 휴지통으로 이동"/);
  const drive = await readFile(new URL("../components/drive/drive.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(drive, /selectionSummary|selectionIdle/);
  assert.match(drive, /pickedIds.length \? <SelectionToolbar/);
});
