import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const helperUrl = dataUrl(compile(await readFile(new URL("../lib/drive/drive-home.ts", import.meta.url), "utf8")));
const { homeSections } = await import(helperUrl);
const file = (id, extras = {}) => ({ id, name: `${id}.txt`, modified: "2026-10-05T00:00:00.000Z", kind: "document", owned: true, deleted: false, ...extras });

test("Home is limited, newest-first, deduplicated and includes nested files", () => {
  const items = Array.from({ length: 12 }, (_, i) => file(`file-${i}`, { modified: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`, parent: "nested", starred: true }));
  const result = homeSections([...items, items[11], file("trashed", { deleted: true }), file("folder", { kind: "folder", starred: true, modified: "2026-10-20T00:00:00.000Z" })]);
  assert.equal(result.recent.length, 8);
  assert.equal(result.recent[0].id, "file-11");
  assert.equal(result.starred.length, 6);
  assert.equal(result.starred[0].id, "folder");
  assert.equal(result.recent.some(item => item.id === "folder" || item.id === "trashed"), false);
  assert.equal(new Set(result.recent.map(item => item.id)).size, result.recent.length);
  assert.equal(items[0].id, "file-0", "Does not reorder the source list");
});

test("Shared section only shows actual received roots, including folders", () => {
  const received = Array.from({ length: 8 }, (_, i) => file(`shared-${i}`, { owned: false, sharedRoot: true }));
  const result = homeSections([...received, file("my-share", { shared: true }), file("inherited", { owned: false }), file("shared-folder", { owned: false, sharedRoot: true, kind: "folder", modified: "2026-10-06T00:00:00.000Z" })]);
  assert.equal(result.shared.length, 5);
  assert.equal(result.shared[0].id, "shared-folder");
  assert.ok(result.shared.every(item => item.owned === false && item.sharedRoot));
  assert.deepEqual(homeSections([]), { recent: [], starred: [], shared: [] });
});

test("Home renders empty guidance, storage, shortcuts and distinct sections", async () => {
  let source = await readFile(new URL("../components/drive/drive-home.tsx", import.meta.url), "utf8");
  source = source.replace('import { useUserSession } from "@/components/auth/use-user-session";', 'const useUserSession = () => null;').replace('import styles from "./drive-home.module.css";', 'const styles = {};');
  let compiled = compile(source).replace('from "@/lib/drive/drive-home"', `from "${helperUrl}"`);
  for (const moduleName of ["react", "react/jsx-runtime", "lucide-react"]) compiled = compiled.replaceAll(`from "${moduleName}"`, `from "${import.meta.resolve(moduleName)}"`);
  const { default: Home } = await import(dataUrl(compiled));
  const props = { items: [], totalBytes: 1024 ** 3, disabled: true, onUpload() {}, onStorage() {}, onNavigate() {}, renderItem: item => createElement("span", null, item.name) };
  const empty = renderToStaticMarkup(createElement(Home, props));
  for (const text of ["최근 수정한 파일", "즐겨찾기", "공유받은 파일", "1.00 GB", "파일 업로드", "아직 파일이 없어요", "아직 공유받은 파일이 없습니다"]) assert.ok(empty.includes(text), text);
  assert.equal((empty.match(/전체 보기/g) || []).length, 3);
  assert.match(empty, /disabled=""/);
  const filled = renderToStaticMarkup(createElement(Home, { ...props, items: [file("safe<script>")] }));
  assert.ok(filled.includes("safe&lt;script&gt;.txt"));
});
