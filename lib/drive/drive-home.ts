import type { Item } from "./drive-api";

export function homeSections(items: Item[]) {
  const active = [...new Map(items.filter(item => !item.deleted).map(item => [item.id, item])).values()];
  const recentFirst = (a: Item, b: Item) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name, "ko", { numeric: true });
  active.sort(recentFirst);
  return {
    recent: active.filter(item => item.kind !== "folder").slice(0, 8),
    starred: active.filter(item => item.starred).slice(0, 6),
    shared: active.filter(item => item.owned === false && item.sharedRoot).slice(0, 5),
  };
}
