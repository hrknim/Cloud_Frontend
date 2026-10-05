"use client";

import { Check, Download, FolderInput, Info, MoreHorizontal, Pencil, Star, Trash2, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem as MenuItem, DropdownMenuSeparator as MenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Item } from "@/lib/drive/drive-api";
import styles from "./drive.module.css";

export type ItemMenuProps = {
  publicView?: boolean;
  item: Item; busy: boolean; onInfo: () => void; onRename: () => void; onDownload: () => void;
  onMove: () => void; onStar: () => void; onDelete: () => void; onPermanentDelete: () => void; onShare: () => void;
};

export function ItemMenuActions({ item, onInfo, onRename, onDownload, onMove, onStar, onDelete, onPermanentDelete, onShare, publicView = false, context = false }: ItemMenuProps & { context?: boolean }) {
  const DropdownMenuItem = context ? ContextMenuItem : MenuItem;
  const DropdownMenuSeparator = context ? ContextMenuSeparator : MenuSeparator;
  if (publicView) return <><DropdownMenuItem onSelect={onInfo}><Info />정보 보기</DropdownMenuItem><DropdownMenuItem onSelect={onDownload}><Download />다운로드</DropdownMenuItem></>;
  return <>
      <DropdownMenuItem onSelect={onInfo}><Info />정보 보기</DropdownMenuItem>
      {item.deleted ? <>
        <DropdownMenuItem onSelect={onDelete}><Check />복원</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={styles.dangerMenuItem} onSelect={onPermanentDelete}><Trash2 />완전 삭제</DropdownMenuItem>
      </> : <>
        {item.permission !== "VIEWER" && <DropdownMenuItem onSelect={onRename}><Pencil />이름 바꾸기</DropdownMenuItem>}
        <DropdownMenuItem onSelect={onDownload}><Download />다운로드</DropdownMenuItem>
        <DropdownMenuItem onSelect={onStar}><Star />{item.starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}</DropdownMenuItem>
        {item.owned !== false && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onShare}><Users />공유</DropdownMenuItem>
          <DropdownMenuItem onSelect={onMove}><FolderInput />이동</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete}><Trash2 />휴지통으로 이동</DropdownMenuItem>
        </>}
      </>}
  </>;
}

export default function ItemMenu(props: ItemMenuProps) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={styles.iconButton} disabled={props.busy} aria-label={`${props.item.name} 옵션`} draggable={false} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}><MoreHorizontal size={19} /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className={styles.itemMenu}>
      <ItemMenuActions {...props} />
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function ItemContextMenu({ children, ...props }: ItemMenuProps & { children: ReactNode }) {
  return <ContextMenu>
    <ContextMenuTrigger asChild disabled={props.busy} data-drive-item="" onContextMenu={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>{children}</ContextMenuTrigger>
    <ContextMenuContent className={styles.itemMenu}>
      <ItemMenuActions {...props} context />
    </ContextMenuContent>
  </ContextMenu>;
}
