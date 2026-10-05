"use client";

import { useState, useEffect, useReducer } from "react";
import { ArrowLeft, ChevronRight, Folder, FolderInput, HardDrive } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { canMoveInto, folderPath, loadDriveItems, type Item } from "@/lib/drive/drive-api";
import styles from "./drive.module.css";
import { dragSelection } from "@/lib/drive/drive-selection";

export default function MoveDialog({ item, selection = [item], items, busy, onClose, onMove }: {
  item: Item; selection?: Item[]; items: Item[]; busy: boolean; onClose: () => void; onMove: (destination?: string, context?: Item[]) => void;
}) {
  const [destination, setDestination] = useState(selection.every(selected => selected.parent === item.parent) ? item.parent : undefined);
  const [remote, updateRemote] = useReducer((state: { key: string | null; folders: Item[]; context: Item[]; total: number; loading: boolean; error: string }, changes: Partial<typeof state>) => ({ ...state, ...changes }), { key: null, folders: [], context: [], total: 0, loading: false, error: "" });
  const key = destination || "root";
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      updateRemote({ loading: true, error: "" });
      void loadDriveItems({ parentId: destination, kind: "folder", sort: "name" }, controller.signal).then(data => {
        if (!controller.signal.aborted) updateRemote({ key, folders: data.items, context: data.context, total: data.total, loading: false });
      }).catch(error => { if (!controller.signal.aborted) updateRemote({ key, folders: [], context: [], total: 0, loading: false, error: error instanceof Error ? error.message : "폴더를 조회하지 못했습니다." }); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [destination, key]);
  const more = async () => {
    updateRemote({ loading: true });
    try {
      const data = await loadDriveItems({ parentId: destination, kind: "folder", sort: "name", offset: remote.folders.length });
      updateRemote({ key, folders: [...remote.folders, ...data.items], context: data.context, total: data.total, loading: false });
    } catch (error) { updateRemote({ loading: false, error: error instanceof Error ? error.message : "폴더를 조회하지 못했습니다." }); }
  };
  const knownItems = [...new Map([...items, ...remote.context, ...remote.folders].map(item => [item.id, item])).values()];
  const group = selection.length ? dragSelection(knownItems, selection.map(item => item.id), selection[0]) : [];
  const path = folderPath(knownItems, destination);
  const current = path.at(-1);
  const candidates = (remote.key === key ? remote.folders : items).filter(folder => folder.kind === "folder" && !folder.deleted && folder.parent === destination && group.length > 0 && group.every(selected => canMoveInto(knownItems, selected, folder.id)))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const currentLocation = group.length > 0 && group.every(selected => selected.parent === destination);
  const valid = group.length > 0 && group.every(selected => canMoveInto(knownItems, selected, destination)) && !currentLocation;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className={styles.moveDialog}>
      <DialogTitle>이동할 위치 선택</DialogTitle>
      <DialogDescription>{selection.length > 1 ? <><strong>선택한 {selection.length}개 항목</strong>을 옮길 폴더를 선택하세요. 폴더와 하위 항목을 함께 선택하면 폴더만 이동하여 구조를 유지합니다. 이미 목적지에 있는 항목은 그대로 둡니다.</> : <><strong>{item.name}</strong>을 옮길 폴더를 선택하세요.</>}</DialogDescription>
      <nav className={styles.movePath} aria-label="이동할 폴더 경로">
        <button disabled={busy || remote.loading} onClick={() => setDestination(undefined)}><HardDrive size={15} />내 드라이브</button>
        {path.map(folder => <span key={folder.id}><ChevronRight size={13} /><button disabled={busy || remote.loading} onClick={() => setDestination(folder.id)}>{folder.name}</button></span>)}
      </nav>
      <div className={styles.moveList}>
        {destination && <button className={styles.moveFolder} disabled={busy || remote.loading} onClick={() => setDestination(current?.parent)}><ArrowLeft size={17} />상위 폴더로 이동</button>}
        {candidates.map(folder => <button className={styles.moveFolder} key={folder.id} disabled={busy || remote.loading} onClick={() => setDestination(folder.id)}><Folder size={19} /><span>{folder.name}</span><ChevronRight size={16} /></button>)}
        {remote.loading && <p role="status">폴더를 불러오는 중입니다.</p>}
        {remote.error && <p role="alert">{remote.error}</p>}
        {remote.key === key && remote.folders.length < remote.total && <button disabled={busy || remote.loading} onClick={() => void more()}>더 보기</button>}
        {!candidates.length && !remote.loading && !remote.error && <p className={styles.moveEmpty}>이 위치에 선택할 하위 폴더가 없습니다.<br />아래 버튼으로 현재 위치에 이동할 수 있습니다.</p>}
      </div>
      <div className={styles.moveFooter}><span>선택한 위치: <strong>{current?.name || "내 드라이브"}</strong></span><div><button disabled={busy} onClick={onClose}>취소</button><button className={styles.uploadButton} disabled={busy || remote.loading || !!remote.error || !valid} onClick={() => onMove(destination, knownItems)}><FolderInput size={15} />{busy ? "이동 중…" : "여기로 이동"}</button></div></div>
      {!valid && <p className={styles.moveHint}>{currentLocation ? "현재 위치입니다. 다른 폴더를 선택하세요." : "선택 항목 중 이 위치로 이동할 수 없는 항목이 있습니다."}</p>}
    </DialogContent>
  </Dialog>;
}
