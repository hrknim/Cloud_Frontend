"use client";

import { Check, Download, FolderInput, Info, MoreHorizontal, Pencil, Star, Trash2, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Item } from "./drive-api";
import styles from "./drive.module.css";

export default function ItemMenu({ item, busy, onInfo, onRename, onDownload, onMove, onStar, onDelete, onPermanentDelete, onShare }: {
  item: Item; busy: boolean; onInfo: () => void; onRename: () => void; onDownload: () => void;
  onMove: () => void; onStar: () => void; onDelete: () => void; onPermanentDelete: () => void; onShare: () => void;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={styles.iconButton} disabled={busy} aria-label={`${item.name} 옵션`} draggable={false} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}><MoreHorizontal size={19} /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className={styles.itemMenu}>
      <DropdownMenuItem onSelect={onInfo}><Info />정보 보기</DropdownMenuItem>
      {item.deleted ? <>
        <DropdownMenuItem onSelect={onDelete}><Check />복원</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={styles.dangerMenuItem} onSelect={onPermanentDelete}><Trash2 />완전 삭제</DropdownMenuItem>
      </> : <>
        {item.permission !== "VIEWER" && <DropdownMenuItem onSelect={onRename}><Pencil />이름 바꾸기</DropdownMenuItem>}
        {item.kind !== "folder" && <DropdownMenuItem onSelect={onDownload}><Download />다운로드</DropdownMenuItem>}
        {item.owned !== false && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onShare}><Users />공유</DropdownMenuItem>
          <DropdownMenuItem onSelect={onMove}><FolderInput />이동</DropdownMenuItem>
          <DropdownMenuItem onSelect={onStar}><Star />{item.starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete}><Trash2 />휴지통으로 이동</DropdownMenuItem>
        </>}
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
