"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Archive, ChevronLeft, ChevronRight, Download, File, Folder, Info, LoaderCircle, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { archiveBytes, archiveFolder, type ArchiveListing } from "@/lib/previews/archive-preview";
import { ItemMenuActions, type ItemMenuProps } from "../drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import archiveStyles from "./archive-preview.module.css";

type Result = { archive?: ArchiveListing; error?: string };
export default function ArchivePreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [result, setResult] = useState<Result | null>(null), [attempt, setAttempt] = useState(0);
  const [path, setPath] = useState(""), [page, setPage] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const tooLarge = item.bytes > 20 * 1024 * 1024;
  useEffect(() => {
    if (tooLarge) return;
    let disposed = false, worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    async function launch() {
      await Promise.resolve(); if (disposed) return;
      try {
        worker = new Worker(new URL("./archive-worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<Result>) => { if (!disposed) { clearTimeout(timer); worker?.terminate(); setResult(event.data); } };
        worker.onerror = () => { if (!disposed) { clearTimeout(timer); worker?.terminate(); setResult({ error: "ZIP 목록을 읽지 못했습니다. 원본 파일을 확인하거나 다운로드해 주세요." }); } };
        timer = setTimeout(() => { worker?.terminate(); if (!disposed) setResult({ error: "파일 처리 시간이 초과되었습니다. 다운로드해서 확인해 주세요." }); }, 20_000);
        worker.postMessage({ id: item.id, contentUrl: item.contentUrl });
      } catch { clearTimeout(timer); worker?.terminate(); if (!disposed) setResult({ error: "미리보기 작업을 시작하지 못했습니다." }); }
    }
    void launch(); return () => { disposed = true; worker?.terminate(); clearTimeout(timer); };
  }, [item.id, item.contentUrl, tooLarge, attempt]);
  const archive = result?.archive;
  const rows = useMemo(() => archive ? archiveFolder(archive.entries, path) : [], [archive, path]);
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  const move = (next: string) => { setPath(next); setPage(0); area.current?.scrollTo({ top: 0, left: 0 }); };
  const changePage = (next: number) => { setPage(next); area.current?.scrollTo({ top: 0, left: 0 }); };
  const error = tooLarge ? "ZIP 목록 미리보기는 20 MB 이하 파일만 지원합니다. 다운로드해서 확인해 주세요." : result?.error;
  const segments = path.split("/").filter(Boolean);
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={styles.overlay} /><DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
      <header className={styles.toolbar}><DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close><Archive className={styles.fileIcon} size={20} /><DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title><div className={styles.actions}><PreviewFileNavigation /><button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button><button className={styles.button} aria-label="ZIP 원본 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button></div></header>
      <nav className={styles.menus} aria-label="ZIP 목록 메뉴">
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>압축 해제 없는 ZIP 목록</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>파일·폴더 이름과 압축 전·후 크기만 표시합니다.<br />폴더 이름을 누르면 내부 목록으로 이동합니다.<br />내부 파일은 열거나 다운로드하지 않습니다.<br />크기는 ZIP 목록에 기록된 값으로 내용 검증은 하지 않습니다.<br />최대 20 MB·10,000개 항목, 100개씩 표시합니다.<br />RAR·7Z·분할 ZIP·ZIP64는 지원하지 않습니다.<br />목록까지 암호화된 ZIP은 열 수 없습니다.<br />Esc로 닫습니다.</p></DropdownMenuContent></DropdownMenu>
      </nav>
      {archive && !error && <><div className={archiveStyles.summary}><span>파일 {archive.files.toLocaleString()}개</span><span>폴더 {archive.folders.toLocaleString()}개</span><span>압축 전 합계 {archiveBytes(archive.size)}</span><span>압축된 내용 합계 {archiveBytes(archive.compressedSize)}</span>{archive.warnings && <span>암호화 또는 주의할 경로가 포함되어 있습니다.</span>}</div><nav className={archiveStyles.path} aria-label="압축 내부 위치"><button onClick={() => move("")}>ZIP 루트</button>{segments.map((segment, index) => <span key={index}><ChevronRight size={12} aria-hidden="true" /><button onClick={() => move(`${segments.slice(0, index + 1).join("/")}/`)}>{segment}</button></span>)}</nav></>}
      <div ref={area} className={archiveStyles.area}>{error ? <div className={styles.message} role="alert"><Archive size={36} /><p>{error}</p>{!tooLarge && <button className={styles.menuButton} onClick={() => { setResult(null); move(""); setAttempt(value => value + 1); }}>다시 시도</button>}</div> : !archive ? <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>ZIP 내부 목록을 불러오는 중입니다.</p></div> : !rows.length ? <div className={styles.message}>{path ? "빈 폴더입니다." : "빈 ZIP 파일입니다."}</div> : <table className={archiveStyles.table} aria-label="압축 내부 파일 목록"><thead><tr><th scope="col">이름</th><th scope="col">형식</th><th scope="col">압축 전 크기</th><th scope="col">압축된 크기</th><th scope="col">상태</th></tr></thead><tbody>{rows.slice(page * 100, (page + 1) * 100).map(row => <tr key={row.directory && !row.unsafe ? row.path : row.id}><td><div className={archiveStyles.name}>{row.directory ? <Folder size={20} /> : <File size={20} />}{row.directory && !row.unsafe ? <button onClick={() => move(row.path)}>{row.name}</button> : <span>{row.name}</span>}</div></td><td>{row.directory ? "폴더" : row.name.includes(".") ? row.name.split(".").pop()?.toUpperCase() || "파일" : "파일"}</td><td className={archiveStyles.numeric}>{row.directory ? "—" : archiveBytes(row.size)}</td><td className={archiveStyles.numeric}>{row.directory ? "—" : archiveBytes(row.compressedSize)}</td><td className={archiveStyles.status}>{[row.encrypted && "암호화", row.unsafe && "주의할 경로"].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table>}</div>
      <footer className={archiveStyles.footer}><span>목록만 표시 · 압축 해제와 저장소 변경 없음</span>{archive && !error && <div><button className={styles.button} aria-label="이전 목록 페이지" disabled={page === 0} onClick={() => changePage(page - 1)}><ChevronLeft size={20} /></button><span>{page + 1} / {pages}</span><button className={styles.button} aria-label="다음 목록 페이지" disabled={page + 1 >= pages} onClick={() => changePage(page + 1)}><ChevronRight size={20} /></button></div>}</footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
