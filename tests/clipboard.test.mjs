import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";

const {outputText} = ts.transpileModule(await readFile(new URL("../lib/utils.ts", import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
const compiled = outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const {copyText} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Copy works with modern API, missing API, denied permissions and manual fallback", async () => {
  const dom = new JSDOM('<div role="dialog"><input readonly><button>Copy</button></div>', {url:"http://cloud.example.test"});
  const keys = ["navigator","HTMLElement"];
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis,key));
  for (const key of keys) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
  const field = dom.window.document.querySelector("input"), button = dom.window.document.querySelector("button");
  const text = "http://cloud.example.test/s/test-token";
  field.value = text;
  try {
    let modern = 0, legacy = 0;
    Object.defineProperty(dom.window.navigator,"clipboard", {configurable:true,value:{writeText:async value => {assert.equal(value,text); modern++;}}});
    dom.window.document.execCommand = () => {legacy++; return true;};
    assert.equal(await copyText(text,field),true);
    assert.equal(modern,1); assert.equal(legacy,0);
    Object.defineProperty(dom.window.navigator,"clipboard", {configurable:true,value:undefined});
    button.focus();
    dom.window.document.execCommand = command => {
      legacy++; assert.equal(command,"copy");
      assert.equal(dom.window.document.activeElement,field);
      assert.equal(field.selectionStart,0); assert.equal(field.selectionEnd,text.length);
      return true;
    };
    assert.equal(await copyText(text,field),true);
    assert.equal(dom.window.document.activeElement,button);
    Object.defineProperty(dom.window.navigator,"clipboard", {configurable:true,value:{writeText:async () => {throw new Error("NotAllowedError");}}});
    assert.equal(await copyText(text,field),true);
    assert.equal(legacy,2);
    dom.window.document.execCommand = () => false;
    assert.equal(await copyText(text,field),false);
    assert.equal(dom.window.document.activeElement,field);
    assert.equal(field.selectionEnd,text.length);
    dom.window.document.execCommand = () => {throw Error("blocked");};
    assert.equal(await copyText(text,field),false);
    delete dom.window.document.execCommand;
    assert.equal(await copyText(text,field),false);
    field.remove();
    assert.equal(await copyText(text,field),false);
    assert.equal(await copyText(text,null),false);
  } finally {
    keys.forEach((key,index) => {if(descriptors[index]) Object.defineProperty(globalThis,key,descriptors[index]); else delete globalThis[key];});
    dom.window.close();
  }
});
