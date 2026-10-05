import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const fileTypesUrl = url(compile(await readFile(new URL("../lib/files/file-types.ts", import.meta.url), "utf8")));
const apiUrl = url(compile(await readFile(new URL("../lib/drive/drive-api.ts", import.meta.url), "utf8")).replace('from "@/lib/files/file-types"', `from "${fileTypesUrl}"`));
const selectionUrl = url(compile(await readFile(new URL("../lib/drive/drive-selection.ts", import.meta.url), "utf8")));
const reactShimUrl = url("export const state={override:false,destination:undefined}; export const useState=value=>[state.override?state.destination:value,()=>{}]; export const useEffect=()=>{}; export const useReducer=(_,value)=>[value,()=>{}];");
const { state } = await import(reactShimUrl);
const dialogShimUrl = url(`import {createElement} from ${JSON.stringify(import.meta.resolve("react"))};
export const Dialog=({children})=>createElement('div',null,children);
export const DialogContent=({children})=>createElement('div',null,children);
export const DialogTitle=({children})=>createElement('h2',null,children);
export const DialogDescription=({children})=>createElement('p',null,children);`);
let source = compile((await readFile(new URL("../components/drive/move-dialog.tsx", import.meta.url), "utf8")).replace('import styles from "./drive.module.css";', 'const styles={};'));
for (const [name, target] of Object.entries({ react: reactShimUrl, "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"), "lucide-react": import.meta.resolve("lucide-react"), "@/components/ui/dialog": dialogShimUrl, "@/lib/drive/drive-api": apiUrl, "@/lib/drive/drive-selection": selectionUrl })) source = source.replaceAll(`from "${name}"`, `from "${target}"`);
const { default: MoveDialog } = await import(url(source));
const folder = (id, parent) => ({ id, name: id, kind: "folder", parent, owned: true, deleted: false });
const file = (id, parent) => ({ id, name: id, kind: "document", parent, owned: true, deleted: false });
function render(items, selection, destination) {
  state.override = true; state.destination = destination;
  return renderToStaticMarkup(createElement(MoveDialog, { items, item: selection[0], selection, busy: false, onClose() {}, onMove() {} }));
}
const submitDisabled = html => {
  const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[2].includes("여기로 이동"));
  assert.ok(button, "Move submit button is present");
  return /\bdisabled=/.test(button[1]);
};

test("Multi-move allows partial same-location groups but blocks all-current groups", () => {
  const target = folder("target"), a = file("a"), b = file("b", "target");
  const valid = render([target, a, b], [a, b], "target");
  assert.match(valid, /선택한 2개 항목/);
  assert.match(valid, /이미 목적지에 있는 항목은 그대로 둡니다/);
  assert.equal(submitDisabled(valid), false);
  const unchanged = render([target, a, b], [b], "target");
  assert.equal(submitDisabled(unchanged), true);
  assert.match(unchanged, /현재 위치입니다/);
});

test("Parent and child move together without flattening; cycles and shared groups are blocked", () => {
  const parent = folder("parent"), child = file("child", "parent"), target = folder("target"), descendant = folder("descendant", "parent");
  const items = [parent, child, target, descendant];
  const valid = render(items, [parent, child], "target");
  assert.match(valid, /폴더만 이동하여 구조를 유지/);
  assert.equal(submitDisabled(valid), false);
  assert.match(render(items, [parent, child], "descendant"), /선택 항목 중 이 위치로 이동할 수 없는/);
  const shared = { ...child, id: "shared", owned: false };
  assert.match(render([...items, shared], [child, shared], "target"), /선택 항목 중 이 위치로 이동할 수 없는/);
});
