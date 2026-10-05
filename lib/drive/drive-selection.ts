import type { Item } from "./drive-api";

export type Selection = { ids: string[]; anchor: string | null };
export function selectDriveItem(selection: Selection, ordered: string[], id: string, toggle: boolean, range: boolean): Selection {
  const current = selection.ids.filter(id => ordered.includes(id));
  const anchor = selection.anchor && ordered.includes(selection.anchor) ? selection.anchor : id;
  if (range) {
    const start = ordered.indexOf(anchor), end = ordered.indexOf(id);
    const ids = ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
    return { ids: toggle ? [...new Set([...current, ...ids])] : ids, anchor };
  }
  return { ids: toggle ? current.includes(id) ? current.filter(value => value !== id) : [...current, id] : [id], anchor: id };
}

/** Move only top-level selected entries so a selected folder keeps its selected children. */
export function dragSelection(items: Item[], selectedIds: string[], source: Item) {
  const selected = selectedIds.includes(source.id) ? items.filter(item => selectedIds.includes(item.id)) : [source];
  if (selected.some(item => item.deleted || item.owned === false)) return [];
  const ids = new Set(selected.map(item => item.id));
  const byId = new Map(items.map(item => [item.id, item]));
  return selected.filter(item => {
    const visited = new Set<string>();
    let parent = item.parent;
    while (parent && !visited.has(parent)) {
      if (ids.has(parent)) return false;
      visited.add(parent); parent = byId.get(parent)?.parent;
    }
    return true;
  });
}
