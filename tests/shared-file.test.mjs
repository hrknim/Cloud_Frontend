import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Link-view menus offer only information and download, never account mutations", async () => {
  const url = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
  const menus = url(`import {createElement} from ${JSON.stringify(import.meta.resolve("react"))};
    const Item = ({children}) => createElement('span',null,children);
    export const ContextMenu=Item, ContextMenuContent=Item, ContextMenuItem=Item, ContextMenuSeparator=Item, ContextMenuTrigger=Item;
    export const DropdownMenu=Item, DropdownMenuContent=Item, DropdownMenuItem=Item, DropdownMenuSeparator=Item, DropdownMenuTrigger=Item;
  `);
  const source = (await readFile(new URL("../components/drive/item-menu.tsx", import.meta.url), "utf8")).replace('import styles from "./drive.module.css";', 'const styles={};');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}});
  const rewritten = outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(name.startsWith("@/components/ui/") ? menus : import.meta.resolve(name))}`);
  const {ItemMenuActions} = await import(url(rewritten));
  const html = renderToStaticMarkup(createElement(ItemMenuActions, {publicView:true, item:{name:"public.txt",permission:"VIEWER",owned:false},busy:false}));
  assert.match(html,/정보 보기/); assert.match(html,/다운로드/);
  for (const label of ["즐겨찾기","이름 바꾸기","공유","휴지통","이동","복원","완전 삭제"]) assert.ok(!html.includes(label));
});

test("All fetch-based viewers and workers accept the token-scoped content URL", async () => {
  for (const name of ["text","pdf","model"]) {
    const source = await readFile(new URL(`../components/previews/${name}-preview.tsx`, import.meta.url),"utf8");
    assert.match(source,/fetch\(item\.contentUrl \|\|/);
  }
  for (const name of ["word","archive","presentation","spreadsheet","epub"]) {
    const viewer = await readFile(new URL(`../components/previews/${name}-preview.tsx`, import.meta.url),"utf8");
    const worker = await readFile(new URL(`../components/previews/${name}-worker.ts`, import.meta.url),"utf8");
    assert.match(viewer,/postMessage\([^\n]*contentUrl: item\.contentUrl/);
    assert.match(worker,/fetch\((event\.data|request)\.contentUrl \|\|/);
  }
});

test("Share settings expose exactly the two requested access scopes and a revoke option", async () => {
  const source = await readFile(new URL("../components/drive/share-dialog.tsx",import.meta.url),"utf8");
  assert.match(source,/<option value="RESTRICTED">내가 공유한 사용자만<\/option>/);
  assert.match(source,/<option value="PUBLIC">링크가 있는 누구나<\/option>/);
  assert.match(source,/<option value="DISABLED">링크 공유 끄기<\/option>/);
  assert.ok(!source.includes("AUTHENTICATED"));
  const wrapper = await readFile(new URL("../components/previews/shared-file.tsx",import.meta.url),"utf8");
  assert.match(wrapper,/<Viewer[^\n]*publicView/);
  assert.ok(!wrapper.includes("PreviewNavigationProvider"),"A link cannot navigate to unshared siblings");
});
