import { downloadEntryNames, downloadName } from "@/lib/files/download-names";
export type DownloadManifestEntry = { id: string; path: string; kind: "file" | "folder" };
export interface SaveDirectoryHandle {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<SaveDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
}
export async function saveDownloadTree(destination: SaveDirectoryHandle, entries: DownloadManifestEntry[], request: typeof fetch = (...args) => fetch(...args), onProgress?: (done: number, total: number) => void) {
  const roots = new Map<string, string>();
  const directories = new Map<string, SaveDirectoryHandle>();
  const seen = new Set<string>();
  const siblings = new Map<string, string[]>();
  const localNames = new Map<string, string>();
  // Validate every path before creating any local item.
  for (const entry of entries) {
    const parts = entry.path.split("/");
    if (parts.length > 65 || parts.some(part => !part || part === "." || part === ".." || /[\\\u0000-\u001f\u007f]/.test(part)) || seen.has(entry.path)) throw new Error("다운로드 폴더 경로가 올바르지 않습니다.");
    seen.add(entry.path);
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(0, i + 1).join("/"), parent = parts.slice(0, i).join("/");
      if (localNames.has(key)) continue;
      localNames.set(key, parts[i]);
      const group = siblings.get(parent) || []; group.push(key); siblings.set(parent, group);
    }
  }
  for (const group of siblings.values()) downloadEntryNames(group.map(key => localNames.get(key)!)).forEach((name, index) => localNames.set(group[index], name));
  const exists = async (name: string) => {
    try { await destination.getDirectoryHandle(name); return true; }
    catch (error) { if (!(error instanceof DOMException) || !["NotFoundError", "TypeMismatchError"].includes(error.name)) throw error; }
    try { await destination.getFileHandle(name); return true; }
    catch (error) { if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error; }
    return false;
  };
  for (const entry of entries) {
    const root = entry.path.split("/")[0];
    if (roots.has(root)) continue;
    const safeRoot = localNames.get(root)!;
    let candidate = safeRoot, suffix = 2;
    while (await exists(candidate)) candidate = downloadName(safeRoot, suffix++);
    // Reserve roots against filesystem changes and case-insensitive name collisions.
    if (entries.some(item => item.path === root && item.kind === "folder")) directories.set(root, await destination.getDirectoryHandle(candidate, { create: true }));
    else await destination.getFileHandle(candidate, { create: true });
    roots.set(root, candidate);
  }
  let done = 0;
  for (const entry of entries) {
    const parts = entry.path.split("/");
    let directory = destination;
    for (let i = 0; i < parts.length - (entry.kind === "file" ? 1 : 0); i++) {
      const key = parts.slice(0, i + 1).join("/");
      let next = directories.get(key);
      if (!next) { next = await directory.getDirectoryHandle(i === 0 ? roots.get(parts[0])! : localNames.get(key)!, { create: true }); directories.set(key, next); }
      directory = next;
    }
    if (entry.kind === "file") {
      const name = parts.length === 1 ? roots.get(parts[0])! : localNames.get(entry.path)!;
      const file = await directory.getFileHandle(name, { create: true });
      const response = await request(`/api/files/${encodeURIComponent(entry.id)}/content`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok || !response.body) throw new Error(`${entry.path}: 다운로드하지 못했습니다. 저장된 일부 항목은 유지됩니다.`);
      await response.body.pipeTo(await file.createWritable());
    }
    onProgress?.(++done, entries.length);
  }
}
