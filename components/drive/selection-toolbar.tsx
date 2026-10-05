"use client";

import { Download, FolderInput, Star, Trash2, Users, X } from "lucide-react";
import type { Item } from "@/lib/drive/drive-api";
import styles from "./drive.module.css";
import { DOWNLOAD_BUNDLE_LIMIT } from "@/lib/files/download-names";

export default function SelectionToolbar({ items, busy, onClear, onDownload, onShare, onStar, onMove, onTrash }: {
  items: Item[]; busy: boolean; onClear: () => void; onDownload: () => void; onShare: () => void; onStar: () => void; onMove: () => void; onTrash: () => void;
}) {
  const folderDownload = items.some(item => item.kind === "folder");
  const download = items.length <= 100 && items.every(item => !item.deleted) && (folderDownload || items.length === 1 || items.reduce((sum, item) => sum + item.bytes, 0) <= DOWNLOAD_BUNDLE_LIMIT);
  const share = items.every(item => !item.deleted && item.owned !== false);
  const star = items.every(item => !item.deleted);
  const allStarred = items.every(item => item.starred);
  return <div className={styles.selectionBar} role="toolbar" aria-label="선택한 항목 작업">
    <button className={styles.selectionClear} type="button" disabled={busy} aria-label="선택 해제" title="선택 해제" onClick={onClear}><X size={18} /></button>
    <span className={styles.selectionCount} role="status">{items.length}개 선택됨</span>
    <button className={styles.selectionAction} type="button" disabled={busy || !download} aria-label="선택 항목 다운로드" title={download ? folderDownload ? "폴더 그대로 저장 · 미지원 브라우저에서는 ZIP" : items.length > 1 ? "선택 파일을 ZIP으로 다운로드" : "다운로드" : "휴지통을 제외한 최대 100개 항목을 선택하세요. ZIP 다운로드는 총 1 GB까지입니다."} onClick={onDownload}><Download size={17} /><span>다운로드</span></button>
    <button className={styles.selectionAction} type="button" disabled={busy || !share} aria-label="선택 항목 공유" title={share ? "선택 항목 공유" : "소유한 파일·폴더만 공유할 수 있습니다."} onClick={onShare}><Users size={17} /><span>공유</span></button>
    <button className={styles.selectionAction} type="button" disabled={busy || !star} aria-label={allStarred ? "선택 항목 즐겨찾기 해제" : "선택 항목 즐겨찾기 추가"} title={allStarred ? "즐겨찾기 해제" : "즐겨찾기 추가"} onClick={onStar}><Star size={17} fill={allStarred ? "currentColor" : "none"} /><span>{allStarred ? "별표 해제" : "즐겨찾기"}</span></button>
    <button className={styles.selectionAction} type="button" disabled={busy || !share} aria-label="선택 항목 이동" title={share ? "선택 항목을 폴더로 이동" : "소유한 파일·폴더만 이동할 수 있습니다."} onClick={onMove}><FolderInput size={17} /><span>이동</span></button>
    <button className={`${styles.selectionAction} ${styles.selectionDanger}`} type="button" disabled={busy || !share} aria-label="선택 항목 휴지통으로 이동" title={share ? "선택 항목을 휴지통으로 이동" : "소유한 파일·폴더만 휴지통으로 이동할 수 있습니다."} onClick={onTrash}><Trash2 size={17} /><span>휴지통</span></button>
  </div>;
}
