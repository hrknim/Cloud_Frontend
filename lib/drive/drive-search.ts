import type { Item } from "./drive-api";

export type SearchFilters = {
  kind: "all" | Item["kind"];
  scope: "current" | "all";
  starredOnly: boolean;
  modifiedFrom: string;
  modifiedTo: string;
};

export const defaultSearchFilters: SearchFilters = {
  kind: "all", scope: "current", starredOnly: false, modifiedFrom: "", modifiedTo: "",
};

export function hasSearchFilters(filters: SearchFilters) {
  return filters.kind !== "all" || filters.scope !== "current" || filters.starredOnly || !!filters.modifiedFrom || !!filters.modifiedTo;
}

export function matchesDriveSearch(item: Item, query: string, filters: SearchFilters) {
  if (!item.name.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))) return false;
  if (filters.kind !== "all" && item.kind !== filters.kind) return false;
  if (filters.starredOnly && !item.starred) return false;
  const modified = Date.parse(item.modified);
  if (filters.modifiedFrom && !(modified >= Date.parse(`${filters.modifiedFrom}T00:00:00+09:00`))) return false;
  if (filters.modifiedTo && !(modified < Date.parse(`${filters.modifiedTo}T00:00:00+09:00`) + 86400000)) return false;
  return true;
}

export function matchesDriveLocation(item: Item, area: "home" | "drive" | "shared" | "recent" | "starred" | "trash", folderId: string | undefined, scope: SearchFilters["scope"]) {
  if (area === "trash" ? !item.deleted : item.deleted) return false;
  if (area === "shared" && !(item.owned === false && (scope === "all" || item.sharedRoot))) return false;
  if (area === "starred" && !item.starred) return false;
  if (area === "recent" && item.kind === "folder") return false;
  if ((area === "drive" || area === "home") && scope === "current") {
    if (item.parent !== folderId) return false;
    if (!folderId && item.owned === false) return false;
  }
  return true;
}
