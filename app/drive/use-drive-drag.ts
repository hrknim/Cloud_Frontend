"use client";

import { useRef, useState, type DragEvent } from "react";
import { canDropInto, type Item } from "./drive-api";

const ITEM_TYPE = "application/x-cloud-drive-item";

export function useDriveDrag(items: Item[], disabled: boolean, onMove: (item: Item, destination?: string) => void) {
  const sourceId = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const clear = () => { sourceId.current = null; setDraggingId(null); setDropTarget(null); };

  const sourceProps = (item: Item) => ({
    draggable: !disabled && !item.deleted && item.owned !== false,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (disabled || item.deleted || item.owned === false) { event.preventDefault(); return; }
      sourceId.current = item.id;
      event.dataTransfer.setData(ITEM_TYPE, item.id);
      event.dataTransfer.effectAllowed = "move";
      setDraggingId(item.id);
    },
    onDragEnd: clear,
  });

  const targetProps = (destination?: string, targetKey = destination || "root") => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      // Only a drag started in this drive may move a stored item.
      if (!sourceId.current) return;
      event.preventDefault(); event.stopPropagation();
      const item = items.find(item => item.id === sourceId.current);
      const valid = !disabled && !!item && canDropInto(items, item, destination);
      event.dataTransfer.dropEffect = valid ? "move" : "none";
      setDropTarget(valid ? targetKey : null);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setDropTarget(previous => previous === targetKey ? null : previous);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!sourceId.current) return;
      event.preventDefault(); event.stopPropagation();
      const item = items.find(item => item.id === sourceId.current);
      clear();
      if (!disabled && item && canDropInto(items, item, destination)) onMove(item, destination);
    },
  });

  return { draggingId, dropTarget, sourceProps, targetProps, isInternalDrag: () => sourceId.current !== null };
}
