"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { driveRequest, type Item } from "@/lib/drive/drive-api";
import { runItemBatch, type BatchResult } from "@/lib/drive/drive-batch";
import styles from "./drive.module.css";

export default function BulkShareDialog({ items, onClose, onChanged }: { items: Item[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [results, setResults] = useState<BatchResult[]>([]);
  const targets = results.length ? items.filter(item => results.some(result => result.id === item.id && result.status === "error")) : items;
  const add = async () => {
    if (pending.current || !handle.trim() || !targets.length || items.some(item => item.deleted || item.owned === false)) return;
    pending.current = true; setBusy(true);
    try {
      const next = await runItemBatch(targets, item => driveRequest("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, handle: handle.trim(), role }) }), result => {
        setResults(previous => [...previous.filter(entry => entry.id !== result.id), result]);
      });
      const succeeded = next.filter(result => result.status === "success").length;
      const failed = next.filter(result => result.status === "error").length;
      if (succeeded) toast.success(`${succeeded}개 항목을 공유했습니다.`);
      if (failed) toast.error(`${failed}개 항목 공유 실패`, { description: "아래 결과를 확인하고 실패한 항목만 재시도할 수 있습니다." });
      await onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "공유 목록을 갱신하지 못했습니다."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><DialogContent className={styles.shareDialog}>
    <DialogTitle>선택한 {items.length}개 항목 공유</DialogTitle>
    <DialogDescription>선택한 파일·폴더를 같은 사용자에게 공유합니다. 이미 직접 공유된 항목은 기존 권한을 유지합니다. 폴더 공유는 하위 항목에도 적용됩니다.</DialogDescription>
    <form className={styles.shareForm} onSubmit={event => { event.preventDefault(); void add(); }}>
      <label className={styles.srOnly} htmlFor="bulk-share-handle">공유할 사용자 핸들</label>
      <input id="bulk-share-handle" autoFocus required maxLength={255} placeholder="@사용자 핸들" disabled={busy} value={handle} onChange={event => { setHandle(event.target.value); setResults([]); }} />
      <select aria-label="공유할 권한" disabled={busy} value={role} onChange={event => { setRole(event.target.value as typeof role); setResults([]); }}><option value="VIEWER">보기</option><option value="EDITOR">편집</option></select>
      <button className={styles.uploadButton} disabled={busy || !handle.trim() || !targets.length}>{busy ? "공유 중…" : results.length ? "실패 항목 재시도" : "모두 공유"}</button>
    </form>
    <div className={styles.shareList} aria-label="항목별 공유 결과">{items.map(item => {
      const result = results.find(result => result.id === item.id);
      return <div key={item.id} className={styles.bulkResult}><span title={item.name}>{item.name}</span><small>{result?.status === "success" ? "공유 완료" : result?.status === "skipped" ? "이미 공유됨 · 기존 권한 유지" : result?.status === "error" ? result.message : busy ? "처리 대기" : "공유 대상"}</small></div>;
    })}</div>
    <p role="status" className={styles.moveHint}>{results.length > 0 && `${results.filter(result => result.status === "success").length}개 완료 · ${results.filter(result => result.status === "skipped").length}개 이미 공유됨 · ${results.filter(result => result.status === "error").length}개 실패`}</p>
    <div className={styles.renameActions}><button className={styles.uploadButton} disabled={busy} onClick={onClose}>완료</button></div>
  </DialogContent></Dialog>;
}
