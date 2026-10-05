import type { Item } from "@/lib/drive/drive-api";

export function supportsFilePreview(item: Item): boolean {
  if (item.deleted || item.kind === "folder") return false;
  if (item.archivePreview || item.presentationPreview || item.wordPreview || item.spreadsheetPreview || item.epubPreview) return item.bytes <= 20 * 1024 * 1024;
  if (item.kind === "3d") return ["glb", "gltf", "obj", "stl", "ply", "fbx"].includes(item.name.toLowerCase().split(".").pop() || "");
  if (item.kind === "video" || item.kind === "audio") return !!item.mediaUrl;
  if (item.pdfPreview) return true;
  if (item.textPreview) return item.bytes <= 2 * 1024 * 1024;
  return item.kind === "image" && !!item.url;
}
export function previewNeighbors(ordered: Item[], current: Item) {
  const siblings = ordered.filter(item => {
    if ((item.parent || null) !== (current.parent || null)) return false;
    if (!current.parent) {
      if ((item.owned !== false) !== (current.owned !== false)) return false;
      // Shared root files from different accounts are not the same physical folder.
      if (current.owned === false && item.id !== current.id && (!current.owner?.handle || item.owner?.handle !== current.owner.handle)) return false;
    }
    return true;
  });
  const index = siblings.findIndex(item => item.id === current.id);
  if (index < 0) return { previous: null, next: null };
  const previous = siblings.slice(0, index).reverse().find(supportsFilePreview) || null;
  const next = siblings.slice(index + 1).find(supportsFilePreview) || null;
  return { previous, next };
}
