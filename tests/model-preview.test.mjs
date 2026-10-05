import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as THREE from "three";

if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class extends Event { constructor(type, options = {}) { super(type); Object.assign(this, options); } };
const source = await readFile(new URL("../lib/previews/model-preview.ts", import.meta.url), "utf8");
let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
for (const specifier of ["three", ...["GLTF", "OBJ", "STL", "PLY", "FBX"].map(name => `three/addons/loaders/${name}Loader.js`)]) outputText = outputText.replaceAll(JSON.stringify(specifier), JSON.stringify(import.meta.resolve(specifier)));
const { loadPreviewModel, normalizePreviewModel, disposePreviewModel, allowModelResource, modelExtension } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const encoder = new TextEncoder();
const buffer = text => encoder.encode(text).buffer;

test("Standalone OBJ, STL and PLY models parse and normalize around the origin", async () => {
  const samples = {
    obj: "v 10 0 0\nv 12 0 0\nv 10 2 0\nf 1 2 3\n",
    stl: "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 10 0 0\nvertex 12 0 0\nvertex 10 2 0\nendloop\nendfacet\nendsolid triangle\n",
    ply: "ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n10 0 0\n12 0 0\n10 2 0\n3 0 1 2\n",
  };
  for (const [extension, source] of Object.entries(samples)) {
    const root = normalizePreviewModel(await loadPreviewModel(buffer(source), extension));
    const bounds = new THREE.Box3().setFromObject(root);
    assert.ok(bounds.getCenter(new THREE.Vector3()).length() < .00001, extension);
    const size = bounds.getSize(new THREE.Vector3());
    assert.equal(Math.max(size.x, size.y, size.z), 2);
    disposePreviewModel(root);
  }
});

test("Embedded glTF and GLB parse while external resources are denied", async () => {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const base = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }] };
  const embedded = structuredClone(base); embedded.buffers[0].uri = `data:application/octet-stream;base64,${positions.toString("base64")}`;
  const gltf = await loadPreviewModel(buffer(JSON.stringify(embedded)), "gltf");
  assert.equal(gltf.children.length, 1); disposePreviewModel(gltf);
  let json = JSON.stringify(base); json = json.padEnd(Math.ceil(json.length / 4) * 4, " ");
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length + 8 + positions.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(positions.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  const glbBytes = new Uint8Array(Buffer.concat([header, Buffer.from(json), binHeader, positions]));
  const glb = await loadPreviewModel(glbBytes.buffer, "glb"); assert.equal(glb.children.length, 1); disposePreviewModel(glb);
  const external = structuredClone(base); external.buffers[0].uri = "https://example.com/private.bin";
  await assert.rejects(loadPreviewModel(buffer(JSON.stringify(external)), "gltf"), /외부 파일/);
  for (const url of ["https://example.com/image.png", "../texture.png", "/api/files/other/content", "data:image/svg+xml;base64,AA=="]) assert.throws(() => allowModelResource(url), /외부 파일/);
  assert.equal(allowModelResource("blob:local-generated"), "blob:local-generated");
});

test("Unsupported and empty models fail; shared resources dispose once", async () => {
  assert.equal(modelExtension("MODEL.GLB"), "glb");
  await assert.rejects(loadPreviewModel(new ArrayBuffer(0), "blend"), /지원하지/);
  assert.throws(() => normalizePreviewModel(new THREE.Group()), /형상이 없/);
  const geometry = new THREE.BoxGeometry(); const material = new THREE.MeshStandardMaterial();
  let geometryDisposed = 0, materialDisposed = 0;
  geometry.addEventListener("dispose", () => geometryDisposed++); material.addEventListener("dispose", () => materialDisposed++);
  const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  disposePreviewModel(group); assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1);
});
