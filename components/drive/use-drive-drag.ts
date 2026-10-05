"use client";

import { useRef, useState, type DragEvent } from "react";
import { canDropInto, type Item } from "@/lib/drive/drive-api";
import { dragSelection } from "@/lib/drive/drive-selection";

const ITEM_TYPE = "application/x-cloud-drive-item";

export function useDriveDrag(items: Item[], disabled: boolean, onMove: (items: Item[], destination?: string) => void, selectedIds: string[] = [], onSelectDragged?: (id: string) => void) {
  const sourceIds = useRef<string[]>([]);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const clear = () => { sourceIds.current = []; setDraggingIds([]); setDropTarget(null); };
  const movingItems = () => sourceIds.current.map(id => items.find(item => item.id === id)).filter((item): item is Item => !!item);
  const validTarget = (group: Item[], destination?: string) => !disabled && group.length > 0 && group.length === sourceIds.current.length && group.every(item => canDropInto(items, item, destination));

  const sourceProps = (item: Item) => ({
    draggable: !disabled && !item.deleted && item.owned !== false,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (disabled || item.deleted || item.owned === false) { event.preventDefault(); return; }
      const group = dragSelection(items, selectedIds, item);
      if (!group.length) { event.preventDefault(); return; }
      if (!selectedIds.includes(item.id)) onSelectDragged?.(item.id);
      sourceIds.current = group.map(item => item.id);
      event.dataTransfer.setData(ITEM_TYPE, JSON.stringify(sourceIds.current));
      event.dataTransfer.effectAllowed = "move";
      setDraggingIds(selectedIds.includes(item.id) ? selectedIds : [item.id]);
    },
    onDragEnd: clear,
  });

  const targetProps = (destination?: string, targetKey = destination || "root") => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      // Only a drag started in this drive may move a stored item.
      if (!sourceIds.current.length) return;
      event.preventDefault(); event.stopPropagation();
      const valid = validTarget(movingItems(), destination);
      event.dataTransfer.dropEffect = valid ? "move" : "none";
      setDropTarget(valid ? targetKey : null);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setDropTarget(previous => previous === targetKey ? null : previous);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!sourceIds.current.length) return;
      event.preventDefault(); event.stopPropagation();
      const group = movingItems();
      const valid = validTarget(group, destination);
      clear();
      if (valid) onMove(group, destination);
    },
  });

  return { draggingIds, dropTarget, sourceProps, targetProps, isInternalDrag: () => sourceIds.current.length > 0 };
}
