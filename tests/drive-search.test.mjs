import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/drive/drive-search.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { defaultSearchFilters: defaults, matchesDriveSearch: matches, matchesDriveLocation: location } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const item = { name: "Final 모델.GLB", kind: "3d", starred: true, modified: "2026-10-03T14:59:59.999Z", deleted: false, owned: true };

test("Cloud search combines filename, kind, favorites and inclusive Korean dates", () => {
  const filters = { ...defaults, kind: "3d", starredOnly: true, modifiedFrom: "2026-10-03", modifiedTo: "2026-10-03" };
  assert.equal(matches(item, " final ", filters), true);
  assert.equal(matches({ ...item, modified: "2026-10-02T15:00:00Z" }, "모델", filters), true);
  assert.equal(matches({ ...item, modified: "2026-10-03T15:00:00Z" }, "", filters), false);
  assert.equal(matches({ ...item, modified: "2026-10-02T14:59:59Z" }, "", filters), false);
  assert.equal(matches({ ...item, starred: false }, "", filters), false);
  assert.equal(matches({ ...item, kind: "image" }, "", filters), false);
  assert.equal(matches(item, "없는 이름", filters), false);
  assert.equal(matches(item, "", defaults), true);
});

test("Search scope respects the selected area and includes accessible shared descendants", () => {
  const received = { ...item, owned: false, sharedRoot: false, parent: "shared-folder" };
  assert.equal(location(received, "drive", undefined, "current"), false);
  assert.equal(location(received, "drive", undefined, "all"), true);
  assert.equal(location(received, "drive", "shared-folder", "current"), true);
  assert.equal(location(received, "shared", undefined, "current"), false);
  assert.equal(location(received, "shared", undefined, "all"), true);
  assert.equal(location(item, "shared", undefined, "all"), false);
  assert.equal(location({ ...item, deleted: true }, "drive", undefined, "all"), false);
  assert.equal(location({ ...item, deleted: true }, "trash", undefined, "all"), true);
  assert.equal(location({ ...received, starred: false }, "starred", undefined, "all"), false);
  assert.equal(location({ ...item, kind: "folder" }, "recent", undefined, "all"), false);
});
