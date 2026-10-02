import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const apiUrl = moduleUrl(transpile(await readFile(new URL("../app/drive/drive-api.ts", import.meta.url), "utf8")));
// The event handlers only require a persistent ref and state setters, not a DOM renderer.
const reactUrl = moduleUrl("export const useRef = current => ({current}); export const useState = value => [value, () => {}];");
const source = transpile(await readFile(new URL("../app/drive/use-drive-drag.ts", import.meta.url), "utf8"))
  .replace('from "react"', `from "${reactUrl}"`).replace('from "./drive-api"', `from "${apiUrl}"`);
const { useDriveDrag } = await import(moduleUrl(source));

function event() {
  return { prevented: false, stopped: false, dataTransfer: { setData() {}, effectAllowed: "", dropEffect: "" },
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}

test("Internal drag moves once, rejects invalid targets, and leaves external uploads untouched", () => {
  const parent = { id: "parent", kind: "folder", deleted: false };
  const child = { id: "child", kind: "folder", parent: parent.id, deleted: false };
  const file = { id: "file", kind: "file", parent: parent.id, deleted: false };
  const deleted = { ...child, id: "deleted", deleted: true };
  const moves = [];
  const drag = useDriveDrag([parent, child, file, deleted], false, (...args) => moves.push(args));

  const external = event();
  drag.targetProps(child.id).onDragOver(external);
  drag.targetProps(child.id).onDrop(external);
  assert.equal(external.prevented, false, "External files must bubble to the upload handler");
  assert.equal(moves.length, 0);

  drag.sourceProps(file).onDragStart(event());
  const over = event();
  drag.targetProps(child.id).onDragOver(over);
  assert.equal(over.dataTransfer.dropEffect, "move");
  assert.equal(over.stopped, true);
  const drop = event();
  drag.targetProps(child.id).onDrop(drop);
  assert.deepEqual(moves, [[file, child.id]]);
  assert.equal(drop.stopped, true, "A stored-file move must not bubble to upload");
  drag.targetProps(child.id).onDrop(event());
  assert.equal(moves.length, 1, "One drag can only trigger one move");

  drag.sourceProps(file).onDragStart(event());
  drag.targetProps().onDrop(event());
  assert.deepEqual(moves.at(-1), [file, undefined], "Root drops clear parentId");

  for (const [item, destination] of [[file, parent.id], [parent, child.id], [parent, parent.id], [file, deleted.id]]) {
    drag.sourceProps(item).onDragStart(event());
    const over = event();
    drag.targetProps(destination).onDragOver(over);
    assert.equal(over.dataTransfer.dropEffect, "none");
    drag.targetProps(destination).onDrop(event());
  }
  assert.equal(moves.length, 2);
  drag.sourceProps(file).onDragStart(event());
  drag.sourceProps(file).onDragEnd();
  drag.targetProps(child.id).onDrop(event());
  assert.equal(moves.length, 2, "Cancelled drags cannot move items later");
  assert.equal(drag.sourceProps(deleted).draggable, false);
  const disabled = useDriveDrag([file, child], true, () => assert.fail("Busy drive must not move"));
  const start = event();
  disabled.sourceProps(file).onDragStart(start);
  assert.equal(start.prevented, true);
});
