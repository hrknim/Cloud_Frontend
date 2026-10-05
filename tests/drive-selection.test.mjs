import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../lib/drive/drive-selection.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { selectDriveItem, dragSelection } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const order = ["a", "b", "c", "d", "e"];

test("Click replaces selection, Ctrl/Meta toggles and Shift follows display order", () => {
  let state = selectDriveItem({ ids: [], anchor: null }, order, "b", false, false);
  assert.deepEqual(state, { ids: ["b"], anchor: "b" });
  state = selectDriveItem(state, order, "d", true, false);
  assert.deepEqual(state.ids, ["b", "d"]);
  state = selectDriveItem(state, order, "b", true, false);
  assert.deepEqual(state.ids, ["d"]);
  state = selectDriveItem(state, order, "e", false, true);
  assert.deepEqual(state.ids, ["b", "c", "d", "e"]);
  assert.equal(state.anchor, "b");
  state = selectDriveItem(state, order, "a", false, true);
  assert.deepEqual(state.ids, ["a", "b"]);
  assert.deepEqual(selectDriveItem({ ids: ["e"], anchor: "a" }, order, "c", true, true).ids, ["e", "a", "b", "c"]);
});

test("Missing anchor and removed items cannot create unintended ranges", () => {
  assert.deepEqual(selectDriveItem({ ids: ["missing"], anchor: "missing" }, order, "c", false, true), { ids: ["c"], anchor: "c" });
});

test("Selected descendants remain inside their selected parent; shared/trash groups are blocked", () => {
  const parent = { id: "parent", kind: "folder" }, child = { id: "child", parent: "parent", kind: "folder" }, file = { id: "file", parent: "child", kind: "file" }, other = { id: "other", kind: "file" };
  const items = [parent, child, file, other];
  assert.deepEqual(dragSelection(items, ["parent", "file", "other"], file), [parent, other]);
  assert.deepEqual(dragSelection(items, ["parent", "child", "file"], parent), [parent]);
  assert.deepEqual(dragSelection(items, ["other"], file), [file]);
  assert.deepEqual(dragSelection([...items, { id: "shared", owned: false }], ["other", "shared"], other), []);
  assert.deepEqual(dragSelection([...items, { id: "trash", deleted: true }], ["other", "trash"], other), []);
});
