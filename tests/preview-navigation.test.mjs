import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/previews/preview-navigation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { previewNeighbors, supportsFilePreview } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const file = (id, extras = {}) => ({ id, name: `${id}.txt`, kind: "document", bytes: 100, parent: "folder", owned: true, deleted: false, textPreview: true, ...extras });

test("Navigation follows provided order, stays in the folder and skips unsupported entries", () => {
  const previous = file("before"), current = file("current"), next = file("next", { textPreview: false, wordPreview: true });
  const ordered = [previous, file("folder", { kind: "folder" }), file("wrong-folder", { parent: "other" }), current, file("unknown", { textPreview: false }), file("deleted", { deleted: true }), file("heic", { kind: "image", textPreview: false }), file("blend", { kind: "3d", name: "model.blend", textPreview: false }), next];
  assert.deepEqual(previewNeighbors(ordered, current), { previous, next });
  assert.deepEqual(previewNeighbors([...ordered].reverse(), current), { previous: next, next: previous });
  assert.equal(previewNeighbors(ordered, previous).previous, null);
  assert.equal(previewNeighbors(ordered, next).next, null);
  assert.deepEqual(previewNeighbors(ordered, file("missing")), { previous: null, next: null });
});

test("Different owners' root folders are isolated, including unknown shared profiles", () => {
  const mine = file("mine", { parent: undefined }), mine2 = file("mine2", { parent: undefined });
  const shared = file("shared", { parent: undefined, owned: false, owner: { handle: "alice" } });
  const shared2 = file("shared2", { parent: undefined, owned: false, owner: { handle: "alice" } });
  const other = file("other", { parent: undefined, owned: false, owner: { handle: "bob" } });
  const unknown = file("unknown", { parent: undefined, owned: false });
  const items = [mine, shared, other, unknown, shared2, mine2];
  assert.deepEqual(previewNeighbors(items, mine), { previous: null, next: mine2 });
  assert.deepEqual(previewNeighbors(items, shared), { previous: null, next: shared2 });
  assert.deepEqual(previewNeighbors(items, unknown), { previous: null, next: null });
});

test("Actual renderer formats, media URLs and size limits determine eligible files", () => {
  assert.equal(supportsFilePreview(file("svg", { kind: "image" })), true, "SVG can use its plaintext viewer");
  assert.equal(supportsFilePreview(file("png", { kind: "image", textPreview: false, url: "/image" })), true);
  for (const extension of ["glb", "gltf", "obj", "stl", "ply", "fbx"]) assert.equal(supportsFilePreview(file("model", { kind: "3d", name: `model.${extension}`, textPreview: false })), true);
  for (const extension of ["blend", "dwg", "step"]) assert.equal(supportsFilePreview(file("model", { kind: "3d", name: `model.${extension}`, textPreview: false })), false);
  assert.equal(supportsFilePreview(file("video", { kind: "video", mediaUrl: "/video" })), true);
  assert.equal(supportsFilePreview(file("video", { kind: "video" })), false);
  assert.equal(supportsFilePreview(file("text", { bytes: 2 * 1024 * 1024 + 1 })), false);
  for (const flag of ["spreadsheetPreview", "wordPreview", "presentationPreview", "archivePreview", "epubPreview"]) {
    assert.equal(supportsFilePreview(file("office", { [flag]: true, bytes: 20 * 1024 * 1024 })), true);
    assert.equal(supportsFilePreview(file("office", { [flag]: true, bytes: 20 * 1024 * 1024 + 1 })), false);
  }
  assert.equal(supportsFilePreview(file("pdf", { textPreview: false, pdfPreview: true })), true);
});

test("Every viewer mounts the shared navigation inside its dialog header", async () => {
  for (const name of ["image", "text", "pdf", "media", "model", "spreadsheet", "word", "presentation", "archive", "epub"]) {
    const viewer = await readFile(new URL(`../components/previews/${name}-preview.tsx`, import.meta.url), "utf8");
    assert.match(viewer, /import PreviewFileNavigation from "\.\/preview-file-navigation"/);
    assert.match(viewer, /<div className=\{styles\.actions\}><PreviewFileNavigation \/>/);
    assert.ok(viewer.indexOf("<PreviewFileNavigation />") > viewer.indexOf("<DialogPrimitive.Content"));
  }
});
