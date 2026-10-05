import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const themeUrl = dataUrl('export const state = {theme:"system",resolvedTheme:"dark",changes:[]}; export const useTheme = () => ({...state,setTheme:value=>state.changes.push(value)});');
const source = await readFile(new URL("../components/light-dark.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText
  .replace(/from (["'])([^"']+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(name === "next-themes" ? themeUrl : import.meta.resolve(name))}`);
const {default: ModeToggle} = await import(dataUrl(compiled));
const {state} = await import(themeUrl);

test("Theme toggle hydrates without mismatch and preserves system/manual switching", async () => {
  const html = renderToString(createElement(ModeToggle));
  assert.ok(!html.includes("<svg"));
  const dom = new JSDOM(`<div id="root">${html}</div>`, {url:"http://localhost"});
  const keys = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"];
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  keys.forEach(key => Object.defineProperty(globalThis, key, {configurable:true, value:key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key]}));
  const errors = [];
  let root;
  try {
    const container = dom.window.document.getElementById("root");
    await act(async () => { root = hydrateRoot(container, createElement(ModeToggle), {onRecoverableError:error=>errors.push(error)}); });
    assert.deepEqual(errors, []);
    assert.ok(container.querySelector("svg"));
    const click = () => container.querySelector("button").dispatchEvent(new dom.window.MouseEvent("click", {bubbles:true}));
    await act(async () => click());
    assert.deepEqual(state.changes, ["light"]);
    state.resolvedTheme = "light";
    await act(async () => root.render(createElement(ModeToggle)));
    await act(async () => click());
    state.theme = "dark";
    await act(async () => root.render(createElement(ModeToggle)));
    await act(async () => click());
    assert.deepEqual(state.changes, ["light", "dark", "system"]);
  } finally {
    if (root) await act(async () => root.unmount());
    keys.forEach((key,index) => {if (descriptors[index]) Object.defineProperty(globalThis,key,descriptors[index]); else delete globalThis[key];});
    dom.window.close();
  }
});
