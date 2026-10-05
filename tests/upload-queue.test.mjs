import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/transfers/upload-queue.ts", import.meta.url), "utf8");
const folderSource = await readFile(new URL("../lib/transfers/folder-upload.ts", import.meta.url), "utf8");
const folderOutput = ts.transpileModule(folderSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const folderUrl = `data:text/javascript;base64,${Buffer.from(folderOutput).toString("base64")}`;
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { UploadQueue, uploadFile, MAX_UPLOAD_SIZE } = await import(`data:text/javascript;base64,${Buffer.from(outputText.replace('from "./folder-upload"', `from "${folderUrl}"`)).toString("base64")}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
const file = name => new File(["hello"], name);
function harness() {
  const requests = [];
  const queue = new UploadQueue((file, parent, signal, progress) => new Promise((resolve, reject) => {
    requests.push({ file, parent, signal, progress, resolve, reject });
    signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
  }));
  return { queue, requests };
}

test("Sequential uploads retain destination and wait for server confirmation", async () => {
  const { queue, requests } = harness();
  let idle = 0;
  queue.setIdleHandler(() => idle++);
  queue.add([file("a"), file("b")], "folder-a", "A");
  queue.add([file("c")], "folder-b", "B");
  assert.equal(requests.length, 1);
  requests[0].progress(50);
  assert.equal(queue.getSnapshot()[0].percent, 50);
  requests[0].progress(100);
  assert.equal(queue.getSnapshot()[0].status, "saving");
  requests[0].resolve(); await tick();
  assert.equal(queue.getSnapshot()[0].status, "success");
  assert.equal(queue.getSnapshot()[0].file, undefined);
  assert.equal(requests[1].parent, "folder-a");
  requests[1].resolve(); await tick();
  assert.equal(requests[2].parent, "folder-b");
  requests[2].resolve(); await tick();
  assert.equal(idle, 1);
  queue.clear(); assert.equal(queue.getSnapshot().length, 0);
});

test("Cancel all stops transfer and queued files; retry uses original target", async () => {
  const { queue, requests } = harness();
  queue.add([file("a"), file("b")], "original", "Original");
  queue.cancelAll(); await tick();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests.length, 1);
  assert.deepEqual(queue.getSnapshot().map(entry => entry.status), ["cancelled", "cancelled"]);
  queue.retry(2);
  assert.equal(requests[1].parent, "original");
  requests[1].resolve(); await tick();
  assert.equal(queue.getSnapshot()[1].status, "success");
});

test("Errors remain retryable, oversized files never start a request", async () => {
  const { queue, requests } = harness();
  queue.add([{ name: "huge", size: MAX_UPLOAD_SIZE + 1 }, file("valid")], null, "Root");
  assert.equal(queue.getSnapshot()[0].status, "error");
  queue.retry(1); assert.equal(requests.length, 1);
  requests[0].reject(new Error("name exists")); await tick();
  assert.equal(queue.getSnapshot()[1].error, "name exists");
  queue.retry(2);
  assert.equal(queue.getSnapshot()[1].error, undefined);
  requests[1].resolve(); await tick();
});

test("Cancelling one file continues the queue and ignores late progress", async () => {
  const { queue, requests } = harness();
  queue.add([file("a"), file("b"), file("c")], null, "Root");
  queue.cancel(2); queue.cancel(1);
  requests[0].progress(99);
  assert.equal(queue.getSnapshot()[0].status, "cancelled");
  await tick();
  assert.equal(requests[1].file.name, "c");
  queue.clear(); assert.equal(queue.getSnapshot().length, 3, "Cannot discard active transfers");
  requests[1].resolve(); await tick();
});

test("Folder jobs create parents and empty directories before uploading nested files", async () => {
  const calls = [];
  const queue = new UploadQueue(async (file, parent) => { calls.push(["file", file.name, parent]); }, async (name, parent) => {
    calls.push(["folder", name, parent]); return `${parent}/${name}`;
  });
  queue.addTree({ directories: ["bundle", "bundle/empty"], files: [{ path: "bundle/nested/a.txt", file: file("a.txt") }] }, "target", "Original target");
  await tick();
  assert.deepEqual(calls, [["folder", "bundle", "target"], ["folder", "empty", "target/bundle"], ["folder", "nested", "target/bundle"], ["file", "a.txt", "target/bundle/nested"]]);
  assert.ok(queue.getSnapshot().every(entry => entry.status === "success"));
});

test("Folder failures never upload children to the wrong parent and can be retried", async () => {
  let attempts = 0, transferred = 0;
  const queue = new UploadQueue(async (file, parent) => { transferred++; assert.equal(parent, "new-folder"); }, async () => {
    if (++attempts === 1) throw new Error("folder exists"); return "new-folder";
  });
  queue.addTree({ directories: ["bundle"], files: [{ path: "bundle/a", file: file("a") }] }, "target", "Target");
  await tick(); assert.equal(transferred, 0);
  assert.deepEqual(queue.getSnapshot().map(entry => entry.status), ["error", "error"]);
  queue.retry(1); await tick(); queue.retry(2); await tick();
  assert.equal(transferred, 1);
});

test("Upload panel renders progress, destination and oversize error safely", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const source = await readFile(new URL("../components/transfers/upload-progress.tsx", import.meta.url), "utf8");
  let { outputText } = ts.transpileModule(source.replace('import styles from "./upload-progress.module.css";', 'const styles = {};'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  });
  for (const moduleName of ["react", "react/jsx-runtime", "lucide-react"]) outputText = outputText.replaceAll(`from "${moduleName}"`, `from "${import.meta.resolve(moduleName)}"`);
  const { default: Panel } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const { queue, requests } = harness();
  assert.equal(renderToStaticMarkup(createElement(Panel, { queue })), "");
  queue.add([file("<script>.txt"), { name: "huge", size: MAX_UPLOAD_SIZE + 1 }], "target", "Destination");
  requests[0].progress(42);
  const html = renderToStaticMarkup(createElement(Panel, { queue }));
  assert.match(html, /value="42"/);
  assert.match(html, /Destination/);
  assert.match(html, /최대 100 MB/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /전체 취소/);
  queue.cancelAll(); await tick();
});

test("Folder multipart uploads explicitly send the basename, not the relative path", async () => {
  const originalXHR = globalThis.XMLHttpRequest, originalForm = globalThis.FormData;
  let xhr;
  const captureXHR = instance => { xhr = instance; };
  globalThis.FormData = class extends originalForm {
    set(key, value, filename) {
      if (key === "file") super.set(key, value, filename ?? value.webkitRelativePath ?? value.name);
      else super.set(key, value);
    }
  };
  globalThis.XMLHttpRequest = class {
    upload = {};
    constructor() { captureXHR(this); }
    open() {}
    send(form) { this.form = form; }
  };
  try {
    const nested = file("한글.txt");
    Object.defineProperty(nested, "webkitRelativePath", { value: "자료/하위 폴더/한글.txt" });
    const transfer = uploadFile(nested, "nested-folder-id", new AbortController().signal, () => {});
    assert.equal(xhr.form.get("file").name, "한글.txt");
    assert.equal(xhr.form.get("name"), "한글.txt");
    assert.equal(xhr.form.get("parentId"), "nested-folder-id");
    assert.equal(await xhr.form.get("file").text(), "hello");
    xhr.status = 201; xhr.responseText = '{"item":{"id":"saved"}}'; xhr.onload(); await transfer;
  } finally { globalThis.XMLHttpRequest = originalXHR; globalThis.FormData = originalForm; }
});

test("XHR reports bytes, preserves multipart target and handles HTTP/abort failures", async () => {
  const original = globalThis.XMLHttpRequest;
  let xhr;
  const captureXHR = instance => { xhr = instance; };
  globalThis.XMLHttpRequest = class {
    upload = {};
    constructor() { captureXHR(this); }
    open(method, url) { this.method = method; this.url = url; }
    send(form) { this.form = form; }
    abort() { this.onabort?.(); }
  };
  try {
    const progress = [];
    const transfer = uploadFile(file("a"), "folder", new AbortController().signal, value => progress.push(value));
    assert.equal(xhr.url, "/api/files"); assert.equal(xhr.form.get("parentId"), "folder");
    xhr.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onload(); assert.deepEqual(progress, [25, 100]);
    xhr.status = 201; xhr.responseText = '{"item":{"id":"saved"}}'; xhr.onload(); await transfer;
    const rejected = uploadFile(file("b"), null, new AbortController().signal, () => {});
    xhr.status = 409; xhr.responseText = '{"error":{"message":"중복 이름"}}'; xhr.onload();
    await assert.rejects(rejected, /중복 이름/);
    const controller = new AbortController();
    const cancelled = uploadFile(file("c"), null, controller.signal, () => {});
    controller.abort(); await assert.rejects(cancelled, { name: "AbortError" });
    const unauthorized = uploadFile(file("d"), null, new AbortController().signal, () => {});
    xhr.status = 401; xhr.responseText = '{}'; xhr.onload();
    await assert.rejects(unauthorized, /로그인 세션/);
  } finally { globalThis.XMLHttpRequest = original; }
});
