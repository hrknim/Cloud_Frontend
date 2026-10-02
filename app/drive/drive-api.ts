export type StoredItem = {
  id: string; name: string; kind: "folder" | "file"; parentId: string | null;
  mimeType: string | null; size: number; starred: boolean; deletedAt: string | null;
  createdAt: string; updatedAt: string; downloadUrl: string | null;
  permission?: "OWNER" | "VIEWER" | "EDITOR"; shared?: boolean; sharedRoot?: boolean;
};
export type Item = {
  id: string; name: string; kind: "folder" | "3d" | "image" | "file";
  size: string; bytes: number; date: string; modified: string;
  starred: boolean; deleted: boolean; parent?: string; url?: string; shared?: boolean;
  owned?: boolean; permission?: "OWNER" | "VIEWER" | "EDITOR"; sharedRoot?: boolean;
};

export class DriveApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function driveRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, credentials: "same-origin", cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new DriveApiError(response.status, response.status === 401 ? "로그인 세션을 확인해 주세요." : data?.error?.message || "요청을 처리하지 못했습니다.");
  if (data === null) throw new DriveApiError(502, "서버 응답을 읽을 수 없습니다.");
  return data as T;
}

export function toDriveItem(item: StoredItem): Item {
  const ext = item.name.split(".").pop()?.toLowerCase() || "";
  const kind = item.kind === "folder" ? "folder" : item.mimeType?.startsWith("image/") ? "image" : ["blend", "glb", "gltf", "obj", "fbx", "stl"].includes(ext) ? "3d" : "file";
  const size = item.size < 1024 ? `${item.size} B` : item.size < 1024 ** 2 ? `${(item.size / 1024).toFixed(1)} KB` : item.size < 1024 ** 3 ? `${(item.size / 1024 ** 2).toFixed(1)} MB` : `${(item.size / 1024 ** 3).toFixed(2)} GB`;
  const safePreview = /^image\/(png|jpeg|gif|webp|avif)$/.test(item.mimeType || "");
  return { id: item.id, name: item.name, kind, bytes: item.size, size: kind === "folder" ? "—" : size,
    date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(item.updatedAt)).replaceAll("-", ". "),
    modified: item.updatedAt, parent: item.parentId || undefined, starred: item.starred, deleted: !!item.deletedAt,
    owned: !item.permission || item.permission === "OWNER", permission: item.permission || "OWNER", shared: !!item.shared, sharedRoot: !!item.sharedRoot,
    url: safePreview && item.downloadUrl ? `${item.downloadUrl}?preview=true` : undefined };
}

export async function loadDriveItems(signal?: AbortSignal) {
  async function pages(kind: "files" | "folders", trash: boolean) {
    const items: Item[] = [];
    let offset = 0;
    while (true) {
      const data = await driveRequest<{ items: StoredItem[]; total: number }>(`/api/${kind}?scope=all&trash=${trash}&limit=100&offset=${offset}`, { signal });
      items.push(...data.items.map(toDriveItem));
      offset += data.items.length;
      if (!data.items.length || offset >= data.total) return items;
    }
  }
  async function sharedPages() {
    const items: Item[] = [];
    let offset = 0;
    while (true) {
      const data = await driveRequest<{ items: StoredItem[]; total: number }>(`/api/shared?limit=100&offset=${offset}`, { signal });
      items.push(...data.items.map(toDriveItem)); offset += data.items.length;
      if (!data.items.length || offset >= data.total) return items;
    }
  }
  return (await Promise.all([pages("files", false), pages("folders", false), pages("files", true), pages("folders", true), sharedPages()])).flat();
}

export function itemEndpoint(item: Item) { return `/api/${item.kind === "folder" ? "folders" : "files"}/${item.id}`; }

export type SortOrder = "modified" | "name" | "size";

export function compareDriveItems(a: Item, b: Item, order: SortOrder) {
  if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
  const byName = () => a.name.localeCompare(b.name, "ko", { numeric: true });
  if (order === "name") return byName();
  if (order === "size") return b.bytes - a.bytes || byName();
  return b.modified.localeCompare(a.modified) || byName();
}

export async function patchDriveItem(item: Item, change: Record<string, unknown>) {
  const data = await driveRequest<{ item: StoredItem }>(itemEndpoint(item), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
  return toDriveItem(data.item);
}

export function folderPath(items: Item[], folderId?: string): Item[] {
  const folders = new Map(items.filter(item => item.kind === "folder" && !item.deleted).map(item => [item.id, item]));
  const path: Item[] = [];
  const visited = new Set<string>();
  let current = folderId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const folder = folders.get(current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.parent;
  }
  return path;
}

export function canMoveInto(items: Item[], item: Item, destination?: string) {
  if (item.deleted || item.owned === false) return false;
  const folders = new Map(items.filter(folder => folder.kind === "folder" && !folder.deleted).map(folder => [folder.id, folder]));
  const visited = new Set<string>();
  let current = destination;
  while (current) {
    if (current === item.id || visited.has(current)) return false;
    visited.add(current);
    const folder = folders.get(current);
    if (!folder || folder.owned === false) return false;
    current = folder.parent;
  }
  return true;
}

export function canDropInto(items: Item[], item: Item, destination?: string) {
  return item.parent !== destination && canMoveInto(items, item, destination);
}
