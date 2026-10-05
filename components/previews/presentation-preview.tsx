"use client";

/* eslint-disable @next/next/no-img-element -- Local embedded data images do not use the image optimization server. */

import { useEffect, useLayoutEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, Download, Info, LoaderCircle, Maximize, Minus, Plus, Presentation as PresentationIcon, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Presentation, PreviewSlide } from "@/lib/previews/presentation-preview";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import pptStyles from "./presentation-preview.module.css";

function SlideCanvas({ slide, document, scale, thumbnail = false }: { slide: PreviewSlide; document: Presentation; scale: number; thumbnail?: boolean }) {
  return <div className={pptStyles.canvasHost} style={{ width: document.width * scale, height: document.height * scale }} aria-hidden={thumbnail || undefined}>
    <div className={pptStyles.canvas} style={{ width: document.width, height: document.height, background: slide.background, transform: `scale(${scale})` }}>
      {slide.parts.map((part, index) => <div key={index} className={pptStyles.part} style={{ left: part.x, top: part.y, width: part.width, height: part.height, color: part.color, background: part.background, fontSize: part.fontSize, fontWeight: part.bold ? 700 : 400, textAlign: part.align, borderRadius: part.ellipse ? "50%" : undefined }}>{part.image ? <img src={part.image} alt={thumbnail ? "" : "슬라이드 내장 이미지"} draggable={false} /> : part.text}</div>)}
      {!slide.parts.length && !thumbnail && <p style={{ padding: 40, color: "#596273", fontSize: 24 }}>표시할 텍스트·이미지가 없습니다.</p>}
    </div>
  </div>;
}
type Result = { document?: Presentation; error?: string };
export default function PresentationPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [result, setResult] = useState<Result | null>(null), [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0), [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState<number | "fit">("fit"), [thumbnails, setThumbnails] = useState(true);
  const [area, setArea] = useState<HTMLDivElement | null>(null), [viewport, setViewport] = useState({ width: 0, height: 0 });
  const tooLarge = item.bytes > 20 * 1024 * 1024;
  useEffect(() => {
    if (tooLarge) return;
    let disposed = false, worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    async function launch() {
      await Promise.resolve(); if (disposed) return;
      try {
        worker = new Worker(new URL("./presentation-worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<Result>) => { if (!disposed) { clearTimeout(timer); worker?.terminate(); setResult(event.data); } };
        worker.onerror = () => { if (!disposed) { clearTimeout(timer); worker?.terminate(); setResult({ error: "프레젠테이션을 읽지 못했습니다. 암호·손상 여부를 확인하거나 다운로드해 주세요." }); } };
        timer = setTimeout(() => { worker?.terminate(); if (!disposed) setResult({ error: "파일 처리 시간이 초과되었습니다. 다운로드해서 확인해 주세요." }); }, 20_000);
        worker.postMessage({ id: item.id, contentUrl: item.contentUrl });
      } catch { clearTimeout(timer); worker?.terminate(); if (!disposed) setResult({ error: "미리보기 작업을 시작하지 못했습니다." }); }
    }
    void launch();
    return () => { disposed = true; worker?.terminate(); clearTimeout(timer); };
  }, [item.id, item.contentUrl, tooLarge, attempt]);
  useLayoutEffect(() => {
    if (!area) return;
    const measure = () => setViewport({ width: area.clientWidth, height: area.clientHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(area);
    return () => observer.disconnect();
  }, [area]);
  const document = result?.document, slide = document?.slides[page];
  const error = tooLarge ? "프레젠테이션 미리보기는 20 MB 이하 파일만 지원합니다. 다운로드해서 확인해 주세요." : result?.error;
  const scale = zoom === "fit" ? document ? Math.max(.05, Math.min((viewport.width - 48) / document.width, (viewport.height - 48) / document.height)) : 1 : zoom;
  const changePage = (next: number) => { if (!document) return; const value = Math.max(0, Math.min(document.slides.length - 1, next)); setPage(value); setPageInput(String(value + 1)); area?.scrollTo({ left: 0, top: 0 }); };
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={styles.overlay} /><DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
      <header className={styles.toolbar}><DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close><PresentationIcon className={styles.fileIcon} size={20} /><DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title><div className={styles.actions}><PreviewFileNavigation /><button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button><button className={styles.button} aria-label="파일 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button></div></header>
      <nav className={styles.menus} aria-label="프레젠테이션 미리보기 메뉴">
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuCheckboxItem checked={thumbnails} onCheckedChange={setThumbnails}>슬라이드 목록</DropdownMenuCheckboxItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setZoom("fit")}>화면에 맞춤</DropdownMenuItem><DropdownMenuItem onSelect={() => setZoom(1)}>100%</DropdownMenuItem><DropdownMenuItem onSelect={() => setZoom(Math.min(3, scale + .1))}>확대</DropdownMenuItem><DropdownMenuItem onSelect={() => setZoom(Math.max(.1, scale - .1))}>축소</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>간단한 PPTX 미리보기</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>텍스트·내장 이미지·일부 기본 도형을 표시합니다.<br />원본 폰트·테마·마스터·차트·표·그룹 도형·애니메이션은 재현하지 않습니다.<br />최대 20 MB, 처음 100개 슬라이드를 표시합니다.<br />외부 리소스·링크·매크로·편집은 지원하지 않습니다.<br />구형 PPT·암호 문서는 다운로드해서 확인해 주세요.<br />Esc로 닫습니다.</p></DropdownMenuContent></DropdownMenu>
      </nav>
      <div className={pptStyles.body}>
        {document && !error && thumbnails && <aside className={pptStyles.thumbnails} aria-label="슬라이드 목록">{document.slides.map((slide, index) => <button key={index} className={pptStyles.thumbnail} aria-label={`${index + 1}번 슬라이드: ${slide.title}`} aria-pressed={index === page} onClick={() => changePage(index)}><span>{index + 1}. {slide.title}</span><SlideCanvas slide={slide} document={document} scale={viewport.width < 500 ? .075 : .14} thumbnail /></button>)}</aside>}
        <div ref={setArea} className={pptStyles.area}>{error ? <div className={styles.message} role="alert"><PresentationIcon size={36} /><p>{error}</p>{!tooLarge && <button className={styles.menuButton} onClick={() => { setResult(null); setPage(0); setPageInput("1"); setAttempt(value => value + 1); }}>다시 시도</button>}</div> : !document ? <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>프레젠테이션을 불러오는 중입니다.</p></div> : slide && <div className={pptStyles.stage} aria-label={`${page + 1}번 슬라이드`}><SlideCanvas slide={slide} document={document} scale={scale} /></div>}</div>
      </div>
      {document && !error && <footer className={pptStyles.footer}><button className={styles.button} aria-label="이전 슬라이드" disabled={page === 0} onClick={() => changePage(page - 1)}><ChevronLeft size={20} /></button><input aria-label="슬라이드 번호" type="number" min={1} max={document.slides.length} value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => { const value = Number(pageInput); if (Number.isInteger(value) && value > 0) changePage(value - 1); else setPageInput(String(page + 1)); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span>/ {document.slides.length}</span><button className={styles.button} aria-label="다음 슬라이드" disabled={page + 1 === document.slides.length} onClick={() => changePage(page + 1)}><ChevronRight size={20} /></button><button className={styles.button} aria-label="축소" disabled={scale <= .1} onClick={() => setZoom(Math.max(.1, scale - .1))}><Minus size={18} /></button><span>{Math.round(scale * 100)}%</span><button className={styles.button} aria-label="확대" disabled={scale >= 3} onClick={() => setZoom(Math.min(3, scale + .1))}><Plus size={18} /></button><button className={styles.button} aria-label="화면에 맞춤" onClick={() => setZoom("fit")}><Maximize size={18} /></button></footer>}
      <div className={pptStyles.notice}>읽기 전용 · 간단한 미리보기로 원본 배치와 다를 수 있습니다.{document?.partial && " · 일부 내용은 생략되거나 단순하게 표시됩니다."}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
