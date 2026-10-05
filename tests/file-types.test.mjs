import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/files/file-types.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { classifyFile, fileCategories, isTextFile, isSpreadsheetPreview } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("Spreadsheet preview uses supported extensions and safe MIME fallback", () => {
  for (const extension of ["xlsx", "xls", "xlsm", "xlsb", "xlt", "xltx", "xltm", "ods", "ots", "csv", "tsv"]) assert.equal(isSpreadsheetPreview(`sheet.${extension.toUpperCase()}`, null), true);
  assert.equal(isSpreadsheetPreview("sheet", "text/csv"), true);
  assert.equal(isSpreadsheetPreview("sheet", "application/vnd.ms-excel"), true);
  for (const name of ["sheet.numbers", "file.pdf", "file.docx"]) assert.equal(isSpreadsheetPreview(name, "text/csv"), false);
});

test("Text preview covers plain text formats and rejects known binary formats", () => {
  for (const name of ["notes.TXT", "source.ts", "code.py", "readme.md", "data.csv", "settings.yaml", "captions.srt", "icon.svg", "scene.gltf", ".env.local", "Dockerfile", "LICENSE", ".npmrc"]) assert.equal(isTextFile(name, null), true, name);
  for (const name of ["report.pdf", "report.docx", "sheet.xlsx", "file.zip", "photo.png", "model.glb", "model.blend", "video.mp4"]) assert.equal(isTextFile(name, "text/plain"), false, name);
  assert.equal(isTextFile("recording.ts", "video/mp2t"), false);
  assert.equal(isTextFile("unknown", "text/plain; charset=utf-8"), true);
  assert.equal(isTextFile("unknown", "application/problem+json"), true);
  assert.equal(isTextFile("unknown", "application/octet-stream"), false);
});

test("Common formats classify without relying on browser MIME metadata", () => {
  const formats = {
    "3d": ["blend", "gltf", "fbx", "usd", "usdz", "step", "dwg", "sldprt", "3dm"],
    image: ["jpeg", "tiff", "heic", "svg", "raw", "cr3", "exr", "dds"],
    document: ["pdf", "docx", "hwp", "hwpx", "txt", "md", "epub"],
    spreadsheet: ["xlsx", "xlsm", "ods", "csv", "tsv", "numbers"],
    presentation: ["pptx", "pptm", "odp", "key"],
    video: ["mp4", "mov", "mkv", "webm", "avi", "mxf"],
    audio: ["mp3", "wav", "flac", "m4a", "opus", "aiff", "midi"],
    archive: ["zip", "rar", "7z", "tar.gz", "tar.xz", "zst"],
    code: ["tsx", "py", "go", "rs", "json", "yaml", "sql", "ps1", "prisma"],
    design: ["psd", "ai", "fig", "sketch", "indd", "afdesign", "procreate", "aep"],
    font: ["ttf", "otf", "woff2"],
  };
  for (const [kind, extensions] of Object.entries(formats)) {
    assert.ok(fileCategories.some(category => category.id === kind));
    for (const ext of extensions) assert.equal(classifyFile(`파일.${ext.toUpperCase()}`, "application/octet-stream"), kind, ext);
  }
  assert.equal(classifyFile("Dockerfile", null), "code");
  assert.equal(classifyFile(".env.production", null), "code");
  assert.equal(classifyFile("source.ts", null), "code");
  assert.equal(classifyFile("recording.ts", "video/mp2t"), "video");
  assert.equal(classifyFile("unknown.xyz", null), "file");
});

test("MIME fallback covers extensionless files and specific formats", () => {
  assert.equal(classifyFile("image", "IMAGE/PNG; charset=binary"), "image");
  assert.equal(classifyFile("sheet", "text/csv"), "spreadsheet");
  assert.equal(classifyFile("slides", "application/vnd.openxmlformats-officedocument.presentationml.presentation"), "presentation");
  assert.equal(classifyFile("source", "text/javascript"), "code");
  assert.equal(classifyFile("source", "text/plain"), "document");
  assert.equal(classifyFile("project", "image/vnd.adobe.photoshop"), "design");
  assert.equal(classifyFile("model", "model/gltf-binary"), "3d");
  assert.equal(classifyFile("font", "font/woff2"), "font");
});
