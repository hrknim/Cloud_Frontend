"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Download, FileText, Info, LoaderCircle, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { sanitizeWordHtml, wordPreviewDocument } from "@/lib/previews/word-html";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import wordStyles from "./word-preview.module.css";

type Result = { html?: string; partial?: boolean; error?: string };
export default function WordPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [fontSize, setFontSize] = useState(16);
  const [wide, setWide] = useState(false);
  const tooLarge = item.bytes > 20 * 1024 * 1024;
  useEffect(() => {
    if (tooLarge) return;
    let disposed = false;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function launch() {
      await Promise.resolve();
      if (disposed) return;
      try {
        worker = new Worker(new URL("./word-worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<Result>) => {
          if (disposed) return;
          clearTimeout(timer); worker?.terminate();
          try {
            if (event.data.error) setResult({ error: event.data.error });
            else setResult({ ...event.data, html: sanitizeWordHtml(event.data.html || "", window) });
          } catch { setResult({ error: "문서를 안전하게 표시하지 못했습니다. 다운로드해서 확인해 주세요." }); }
        };
        worker.onerror = () => {
          if (disposed) return;
          clearTimeout(timer); worker?.terminate();
          setResult({ error: "워드 문서를 읽지 못했습니다. 암호·손상 여부를 확인하거나 다운로드해 주세요." });
        };
        timer = setTimeout(() => {
          worker?.terminate();
          if (!disposed) setResult({ error: "파일 처리 시간이 초과되었습니다. 다운로드해서 확인해 주세요." });
        }, 20_000);
        worker.postMessage({ id: item.id, contentUrl: item.contentUrl });
      } catch { clearTimeout(timer); worker?.terminate(); if (!disposed) setResult({ error: "미리보기 작업을 시작하지 못했습니다." }); }
    }
    void launch();
    return () => { disposed = true; worker?.terminate(); clearTimeout(timer); };
  }, [item.id, item.contentUrl, tooLarge, attempt]);
  const document = useMemo(() => result?.html ? wordPreviewDocument(result.html, fontSize, wide) : "", [result, fontSize, wide]);
  const error = tooLarge ? "워드 미리보기는 20 MB 이하 파일만 지원합니다. 다운로드해서 확인해 주세요." : result?.error;
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={styles.overlay} /><DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
      <header className={styles.toolbar}><DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close><FileText className={styles.fileIcon} size={20} /><DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title><div className={styles.actions}><PreviewFileNavigation /><button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button><button className={styles.button} aria-label="파일 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button></div></header>
      <nav className={styles.menus} aria-label="워드 미리보기 메뉴">
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuCheckboxItem checked={wide} onCheckedChange={setWide}>넓게 보기</DropdownMenuCheckboxItem><DropdownMenuSeparator /><DropdownMenuItem disabled={fontSize >= 24} onSelect={() => setFontSize(size => Math.min(24, size + 2))}>글자 확대</DropdownMenuItem><DropdownMenuItem disabled={fontSize <= 12} onSelect={() => setFontSize(size => Math.max(12, size - 2))}>글자 축소</DropdownMenuItem><DropdownMenuItem onSelect={() => { setFontSize(16); setWide(false); }}>기본 보기</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>읽기 전용 워드 문서</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>DOCX의 문단·제목·목록·표·포함된 이미지를 표시합니다.<br />페이지 배치·폰트·머리말·꼬리말 등 원본 서식은 다를 수 있습니다.<br />링크 실행·외부 리소스·매크로·편집은 지원하지 않습니다.<br />최대 20 MB, 이미지 100개·총 Base64 3 MB까지 표시합니다.<br />구형 DOC·암호 문서는 다운로드해서 확인해 주세요.<br />Esc로 닫습니다. 문서에 초점이 있으면 상단 닫기 버튼을 사용하세요.</p></DropdownMenuContent></DropdownMenu>
      </nav>
      <div className={wordStyles.area}>
        {error ? <div className={styles.message} role="alert"><FileText size={36} /><p>{error}</p>{!tooLarge && <button className={styles.menuButton} onClick={() => { setResult(null); setAttempt(value => value + 1); }}>다시 시도</button>}</div> : !result ? <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>워드 문서를 불러오는 중입니다.</p></div> : document ? <iframe className={wordStyles.frame} title={`${item.name} 읽기 전용 미리보기`} sandbox="" referrerPolicy="no-referrer" srcDoc={document} /> : <div className={styles.message}>표시할 내용이 없는 문서입니다.</div>}
      </div>
      <footer className={wordStyles.footer}><span>읽기 전용 · 원본 페이지 배치와 다를 수 있습니다.</span>{result?.partial && <span className={wordStyles.notice}>일부 이미지·서식은 생략될 수 있습니다.</span>}</footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
