import { downloadEntryNames } from "./download-names";
export const DOWNLOAD_TREE_LIMIT = 5000;
export type DownloadNode = { id: string; name: string; kind: "FILE" | "FOLDER"; ownerId: string; parentId: string | null; deletedAt: Date | null };
export type DownloadTreeEntry<T extends DownloadNode = DownloadNode> = { path: string; item: T };
export async function buildDownloadTree<T extends DownloadNode>(roots: T[], children: (folder: T) => Promise<T[]>) {
  const entries: DownloadTreeEntry<T>[] = [];
  const visited = new Set<string>();
  const walk = async (siblings: T[], prefix: string, depth: number) => {
    if (depth > 64) throw new Error("폴더 깊이가 너무 깊습니다.");
    const names = downloadEntryNames(siblings.map(item => item.name));
    for (let i = 0; i < siblings.length; i++) {
      const item = siblings[i];
      if (visited.has(item.id)) throw new Error("폴더 구조에 순환 또는 중복 항목이 있습니다.");
      visited.add(item.id);
      if (visited.size > DOWNLOAD_TREE_LIMIT) throw new Error("한 번에 최대 5,000개 항목까지 다운로드할 수 있습니다.");
      const path = `${prefix}${names[i]}`;
      entries.push({ path, item });
      if (item.kind === "FOLDER") {
        const rows = await children(item);
        const nested = rows.filter(child => child.parentId === item.id && child.ownerId === item.ownerId && !child.deletedAt);
        await walk(nested, `${path}/`, depth + 1);
      }
    }
  };
  await walk(roots, "", 0); return entries;
}
