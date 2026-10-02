"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Folder, FolderInput, HardDrive } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { canMoveInto, folderPath, type Item } from "./drive-api";
import styles from "./drive.module.css";

export default function MoveDialog({ item, items, busy, onClose, onMove }: {
  item: Item; items: Item[]; busy: boolean; onClose: () => void; onMove: (destination?: string) => void;
}) {
  const [destination, setDestination] = useState(item.parent);
  const path = folderPath(items, destination);
  const current = path.at(-1);
  const candidates = items.filter(folder => folder.kind === "folder" && !folder.deleted && folder.parent === destination && canMoveInto(items, item, folder.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const valid = canMoveInto(items, item, destination) && destination !== item.parent;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className={styles.moveDialog}>
      <DialogTitle>이동할 위치 선택</DialogTitle>
      <DialogDescription><strong>{item.name}</strong>을 옮길 폴더를 선택하세요.</DialogDescription>
      <nav className={styles.movePath} aria-label="이동할 폴더 경로">
        <button disabled={busy} onClick={() => setDestination(undefined)}><HardDrive size={15} />내 드라이브</button>
        {path.map(folder => <span key={folder.id}><ChevronRight size={13} /><button disabled={busy} onClick={() => setDestination(folder.id)}>{folder.name}</button></span>)}
      </nav>
      <div className={styles.moveList}>
        {destination && <button className={styles.moveFolder} disabled={busy} onClick={() => setDestination(current?.parent)}><ArrowLeft size={17} />상위 폴더로 이동</button>}
        {candidates.map(folder => <button className={styles.moveFolder} key={folder.id} disabled={busy} onClick={() => setDestination(folder.id)}><Folder size={19} /><span>{folder.name}</span><ChevronRight size={16} /></button>)}
        {!candidates.length && <p className={styles.moveEmpty}>이 위치에 선택할 하위 폴더가 없습니다.<br />아래 버튼으로 현재 위치에 이동할 수 있습니다.</p>}
      </div>
      <div className={styles.moveFooter}><span>선택한 위치: <strong>{current?.name || "내 드라이브"}</strong></span><div><button disabled={busy} onClick={onClose}>취소</button><button className={styles.uploadButton} disabled={busy || !valid} onClick={() => onMove(destination)}><FolderInput size={15} />{busy ? "이동 중…" : "여기로 이동"}</button></div></div>
      {!valid && <p className={styles.moveHint}>{destination === item.parent ? "현재 위치입니다. 다른 폴더를 선택하세요." : "이 위치로 이동할 수 없습니다."}</p>}
    </DialogContent>
  </Dialog>;
}
