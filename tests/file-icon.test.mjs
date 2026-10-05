import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = await readFile(new URL("../components/drive/file-icon.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../components/drive/file-icon.module.css", import.meta.url), "utf8");
let { outputText } = ts.transpileModule(source.replace('import styles from "./file-icon.module.css";', 'const styles = new Proxy({}, { get: (_, key) => String(key) });'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
});
for (const moduleName of ["react/jsx-runtime", "lucide-react"]) outputText = outputText.replaceAll(`from "${moduleName}"`, `from "${import.meta.resolve(moduleName)}"`);
const { default: ItemIcon, fileIcons, fileToneClasses } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("All file categories have coordinated light and dark palettes", () => {
  assert.equal(Object.keys(fileIcons).length, 13);
  for (const kind of Object.keys(fileIcons)) {
    const tone = kind === "3d" ? "model" : kind;
    assert.equal(fileToneClasses[kind], `tone ${tone}`);
    const rule = css.match(new RegExp(`\\.${tone} \\{([^}]+)\\}`))?.[1];
    assert.ok(rule, kind);
    for (const variable of ["file-ink", "file-wash", "file-dark-ink", "file-dark-wash"]) assert.match(rule, new RegExp(`--${variable}: #[a-f0-9]{6}`));
  }
  assert.match(css, /:global\(\.dark\) \.surface\.surface/);
});

test("Every icon retains its shape, tone, fixed sizing and decorative semantics", () => {
  for (const kind of Object.keys(fileIcons)) {
    const html = renderToStaticMarkup(createElement(ItemIcon, { kind }));
    assert.match(html, new RegExp(`data-file-kind="${kind}"`));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /width="19"/);
    assert.ok(html.includes(`icon ${fileToneClasses[kind]}`));
  }
  assert.match(renderToStaticMarkup(createElement(ItemIcon, { kind: "document", size: 16 })), /width="16"/);
});
