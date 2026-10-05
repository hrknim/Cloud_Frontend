"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { BookOpen, ChevronLeft, ChevronRight, Download, Info, LoaderCircle, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { sanitizeWordHtml, wordPreviewDocument } from "@/lib/previews/word-html";
import type { EpubMetadata } from "@/lib/previews/epub-preview";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import epubStyles from "./epub-preview.module.css";

type Result = { metadata?: EpubMetadata; html?: string; partial?: boolean; error?: string; loading: boolean; stopped?: boolean; sequence?: number };
export default function EpubPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [result, setResult] = useState<Result>({ loading: true }), [attempt, setAttempt] = useState(0);
  const [chapter, setChapter] = useState(0), [fontSize, setFontSize] = useState(16), [wide, setWide] = useState(false), [toc, setToc] = useState(true);
  const worker = useRef<Worker | null>(null), sequence = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooLarge = item.bytes > 20 * 1024 * 1024;
  const startTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { worker.current?.terminate(); worker.current = null; setResult(previous => ({ ...previous, loading: false, stopped: true, error: "파일 처리 시간이 초과되었습니다. 다운로드해서 확인해 주세요." })); }, 20_000);
  };
  useEffect(() => {
    if (tooLarge) return;
    let disposed = false, instance: Worker | undefined;
    async function launch() {
      await Promise.resolve(); if (disposed) return;
      try {
        instance = new Worker(new URL("./epub-worker.ts", import.meta.url), { type: "module" }); worker.current = instance;
        instance.onmessage = (event: MessageEvent<Result>) => {
          if (disposed || event.data.sequence !== sequence.current) return;
          if (timer.current) clearTimeout(timer.current);
          try {
            if (event.data.error) setResult(previous => ({ ...previous, metadata: event.data.metadata || previous.metadata, error: event.data.error, loading: false }));
            else setResult({ ...event.data, html: sanitizeWordHtml(event.data.html || "", window), loading: false });
          } catch { setResult(previous => ({ ...previous, loading: false, error: "본문을 안전하게 표시하지 못했습니다. 다운로드해서 확인해 주세요." })); }
        };
        instance.onerror = () => {
          if (disposed) return;
          if (timer.current) clearTimeout(timer.current);
          instance?.terminate(); worker.current = null;
          setResult(previous => ({ ...previous, loading: false, stopped: true, error: "EPUB를 읽지 못했습니다. 원본 파일을 확인하거나 다운로드해 주세요." }));
        };
        instance.postMessage({ type: "load", id: item.id, contentUrl: item.contentUrl, index: 0, sequence: ++sequence.current }); startTimer();
      } catch { instance?.terminate(); worker.current = null; if (!disposed) setResult({ loading: false, error: "미리보기 작업을 시작하지 못했습니다." }); }
    }
    void launch(); return () => { disposed = true; instance?.terminate(); worker.current = null; if (timer.current) clearTimeout(timer.current); };
  }, [item.id, item.contentUrl, tooLarge, attempt]);
  const changeChapter = (index: number) => {
    if (!worker.current || result.loading || !result.metadata || index < 0 || index >= result.metadata.chapters.length) return;
    setChapter(index); setResult(previous => ({ ...previous, loading: true, error: undefined }));
    worker.current.postMessage({ type: "chapter", index, sequence: ++sequence.current }); startTimer();
  };
  const document = useMemo(() => result.html ? wordPreviewDocument(result.html, fontSize, wide).replace("<title>워드 문서 미리보기</title>", "<title>EPUB 미리보기</title>") : "", [result, fontSize, wide]);
  const error = tooLarge ? "EPUB 미리보기는 20 MB 이하 파일만 지원합니다. 다운로드해서 확인해 주세요." : result.error;
  const metadata = result.metadata;
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={styles.overlay} /><DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
      <header className={styles.toolbar}><DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close><BookOpen className={styles.fileIcon} size={20} /><DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title><div className={styles.actions}><PreviewFileNavigation /><button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button><button className={styles.button} aria-label="파일 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button></div></header>
      <nav className={styles.menus} aria-label="EPUB 미리보기 메뉴">
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuCheckboxItem checked={toc} onCheckedChange={setToc}>목차</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={wide} onCheckedChange={setWide}>넓게 보기</DropdownMenuCheckboxItem><DropdownMenuSeparator /><DropdownMenuItem disabled={fontSize >= 24} onSelect={() => setFontSize(size => Math.min(24, size + 2))}>글자 확대</DropdownMenuItem><DropdownMenuItem disabled={fontSize <= 12} onSelect={() => setFontSize(size => Math.max(12, size - 2))}>글자 축소</DropdownMenuItem><DropdownMenuItem onSelect={() => { setFontSize(16); setWide(false); }}>기본 보기</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>읽기 전용 EPUB</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>목차 또는 아래 버튼으로 챕터를 이동합니다.<br />본문·표·내장 이미지를 읽기 편한 형태로 표시합니다.<br />DRM·스크립트·외부 리소스·본문 링크·원본 CSS는 지원하지 않습니다.<br />고정 레이아웃·SVG·수식·음원·영상은 재현하지 않습니다.<br />최대 20 MB, 처음 500개 챕터를 표시합니다.<br />챕터당 본문 2 MB, 이미지 100개·Base64 총 3 MB까지 지원합니다.<br />문서에 초점이 있으면 상단 닫기 버튼을 사용하세요.</p></DropdownMenuContent></DropdownMenu>
      </nav>
      <div className={epubStyles.body}>
        {metadata && toc && <aside className={epubStyles.toc} aria-label="EPUB 목차"><h2>{metadata.title}</h2>{metadata.chapters.map((entry, index) => <button key={`${entry.path}-${index}`} aria-current={index === chapter ? "page" : undefined} disabled={result.loading || result.stopped} onClick={() => changeChapter(index)}>{index + 1}. {entry.title}</button>)}</aside>}
        <div className={epubStyles.area}>{error ? <div className={styles.message} role="alert"><BookOpen size={36} /><p>{error}</p>{!tooLarge && <button className={styles.menuButton} onClick={() => { setResult({ loading: true }); setChapter(0); setAttempt(value => value + 1); }}>다시 시도</button>}</div> : result.loading ? <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>EPUB 본문을 불러오는 중입니다.</p></div> : document ? <iframe key={chapter} className={epubStyles.frame} title={`${metadata?.chapters[chapter]?.title || item.name} 읽기 전용 미리보기`} sandbox="" referrerPolicy="no-referrer" srcDoc={document} /> : <div className={styles.message}>표시할 본문이 없습니다.</div>}</div>
      </div>
      {metadata && <footer className={epubStyles.footer}><span title={metadata.author}>{metadata.title}{metadata.author && ` · ${metadata.author}`}</span><div><button className={styles.button} aria-label="이전 챕터" disabled={result.loading || result.stopped || chapter === 0} onClick={() => changeChapter(chapter - 1)}><ChevronLeft size={20} /></button><span>{chapter + 1} / {metadata.chapters.length}</span><button className={styles.button} aria-label="다음 챕터" disabled={result.loading || result.stopped || chapter + 1 >= metadata.chapters.length} onClick={() => changeChapter(chapter + 1)}><ChevronRight size={20} /></button></div></footer>}
      <div className={epubStyles.notice}>읽기 전용 · 원본 레이아웃과 다를 수 있습니다.{result.partial && " · 일부 이미지·내용은 생략되었습니다."}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
