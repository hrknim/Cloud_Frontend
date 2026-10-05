import * as THREE from "three";

export const modelPreviewFormats = ["glb", "gltf", "obj", "stl", "ply", "fbx"] as const;
export function modelExtension(name: string) { return name.toLowerCase().split(".").pop() || ""; }
export function allowModelResource(url: string): string {
  if (url.startsWith("blob:") || /^data:(application\/(octet-stream|gltf-buffer)|image\/(png|jpeg|webp|gif|avif))[;,]/i.test(url)) return url;
  throw new Error("외부 파일을 참조하는 모델은 지원하지 않습니다. 텍스처와 데이터를 포함한 GLB로 내보내 주세요.");
}

export async function loadPreviewModel(data: ArrayBuffer, extension: string): Promise<THREE.Object3D> {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(allowModelResource);
  if (extension === "glb" || extension === "gltf") {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    return (await new GLTFLoader(manager).parseAsync(data, "")).scene;
  }
  if (extension === "obj") {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    return new OBJLoader(manager).parse(new TextDecoder().decode(data));
  }
  if (extension === "fbx") {
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    return new FBXLoader(manager).parse(data, "");
  }
  let geometry: THREE.BufferGeometry;
  if (extension === "stl") {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    geometry = new STLLoader(manager).parse(data);
  } else if (extension === "ply") {
    const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
    geometry = new PLYLoader(manager).parse(data);
  } else throw new Error("이 3D 형식은 미리보기를 지원하지 않습니다.");
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb7c9e6, roughness: .7, metalness: .1, vertexColors: !!geometry.getAttribute("color"), side: THREE.DoubleSide }));
}

export function normalizePreviewModel(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (bounds.isEmpty() || !Number.isFinite(longest) || longest <= 0 || ![center.x, center.y, center.z].every(Number.isFinite)) throw new Error("표시할 수 있는 3D 형상이 없습니다.");
  const centered = new THREE.Group();
  centered.add(root);
  root.position.sub(center);
  centered.scale.setScalar(2 / longest);
  centered.updateMatrixWorld(true);
  return centered;
}

export function disposePreviewModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) { texture.dispose(); if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close(); }
}
