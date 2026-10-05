"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";
import { type UploadQueue } from "@/lib/transfers/upload-queue";
import styles from "./upload-progress.module.css";

const labels = { queued: "대기 중", uploading: "전송 중", saving: "서버에 저장 중", success: "완료", error: "실패", cancelled: "취소됨" };
export default function UploadProgress({ queue }: { queue: UploadQueue }) {
  const entries = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [collapsed, setCollapsed] = useState(false);
  const [limit, setLimit] = useState(100);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!queue.getSnapshot().some(entry => ["queued", "uploading", "saving"].includes(entry.status))) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queue]);
  if (!entries.length) return null;
  const pending = entries.filter(entry => ["queued", "uploading", "saving"].includes(entry.status)).length;
  const succeeded = entries.filter(entry => entry.status === "success").length;
  const failed = entries.filter(entry => entry.status === "error").length;
  const shown = [...entries.filter(entry => ["uploading", "saving"].includes(entry.status)), ...entries.filter(entry => entry.status === "error"), ...entries.filter(entry => entry.status === "queued"), ...entries.filter(entry => ["success", "cancelled"].includes(entry.status))].slice(0, limit);
  return <section className={styles.panel} aria-label="파일 업로드 진행 상황">
    <header className={styles.header}>
      <span role="status">{pending ? `업로드 중 · ${pending}개 남음` : `업로드 종료 · ${succeeded}/${entries.length}개 완료`}{failed > 0 && ` · ${failed}개 실패`}</span>
      <button type="button" aria-label={collapsed ? "업로드 창 펼치기" : "업로드 창 접기"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
      {!pending && <button type="button" aria-label="업로드 창 닫기" onClick={() => queue.clear()}><X size={18} /></button>}
    </header>
    {!collapsed && <>
      <ul className={styles.list}>{shown.map(entry => <li key={entry.id}>
        <div className={styles.row}><span className={styles.name} title={entry.name}>{entry.name}</span>
          {entry.status === "success" ? <Check size={18} className={styles.complete} aria-label="완료" /> : ["queued", "uploading", "saving"].includes(entry.status) ?
            <button type="button" aria-label={`${entry.name} 업로드 취소`} onClick={() => queue.cancel(entry.id)}><X size={17} /></button> : (entry.file || entry.kind === "folder") &&
            <button type="button" aria-label={`${entry.name} 재시도`} onClick={() => queue.retry(entry.id)}><RotateCcw size={17} /></button>}
        </div>
        <div className={styles.detail} title={entry.destination}>{entry.destination} · {entry.kind === "folder" && entry.status === "saving" ? "폴더 생성 중" : labels[entry.status]}{entry.status === "uploading" && entry.kind !== "folder" && ` ${entry.percent}%`}</div>
        {entry.kind !== "folder" && ["uploading", "saving"].includes(entry.status) && <progress aria-label={`${entry.name} 전송률`} max={100} value={entry.percent} />}
        {entry.error && <p className={styles.error}>{entry.error}</p>}
      </li>)}</ul>
      <footer className={styles.footer}><span>파일당 최대 100 MB · 이미 저장된 항목은 취소해도 유지됩니다.</span>{entries.length > limit && <button type="button" onClick={() => setLimit(previous => previous + 100)}>더 보기</button>}{pending > 0 && <button type="button" onClick={() => queue.cancelAll()}>전체 취소</button>}</footer>
    </>}
  </section>;
}
