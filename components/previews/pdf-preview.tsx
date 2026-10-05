"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, Download, FileText, Info, LoaderCircle, Maximize, Minus, Plus, X } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import pdfStyles from "./pdf-preview.module.css";

type Zoom = "page" | "width" | number;

export default function PdfPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState<Zoom>("page");
  const [renderedScale, setRenderedScale] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (controller.signal.aborted) return;
        const assets = `/pdfjs/${pdfjs.version}/`;
        pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
        const response = await fetch(item.contentUrl || `/api/files/${item.id}/content`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "로그인 세션을 확인해 주세요." : "PDF를 읽을 수 없습니다. 접근 권한 또는 원본 파일을 확인해 주세요.");
        const data = new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        loadingTask = pdfjs.getDocument({ data, cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, enableXfa: false });
        const pdf = await loadingTask.promise;
        if (!controller.signal.aborted) setDocument(pdf);
      } catch (cause) {
        if (controller.signal.aborted) return;
        const name = cause instanceof Error ? cause.name : "";
        const accessError = cause instanceof Error && (cause.message.startsWith("PDF를") || cause.message.startsWith("로그인"));
        setError(name === "PasswordException" ? "암호로 보호된 PDF는 현재 미리보기를 지원하지 않습니다. 다운로드해서 확인해 주세요." : name === "InvalidPDFException" ? "유효한 PDF 파일이 아니거나 파일이 손상되었습니다." : accessError ? cause.message : "PDF를 불러오지 못했습니다. 다운로드해서 확인해 주세요.");
      }
    }
    void load();
    return () => { controller.abort(); void loadingTask?.destroy(); };
  }, [item.id, item.contentUrl]);
  useLayoutEffect(() => {
    if (!area) return;
    const measure = () => setViewport({ width: area.clientWidth, height: area.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [area]);
  useEffect(() => {
    if (!document || !host.current || viewport.width <= 48 || viewport.height <= 48) return;
    const target = host.current;
    let disposed = false;
    let task: RenderTask | undefined;
    async function render() {
      try {
        const pdfPage = await document!.getPage(page);
        if (disposed) return;
        setRendering(true);
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = typeof zoom === "number" ? zoom : zoom === "width" ? (viewport.width - 48) / base.width : Math.min((viewport.width - 48) / base.width, (viewport.height - 48) / base.height);
        const view = pdfPage.getViewport({ scale: Math.max(.01, scale) });
        const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (view.width * view.height)));
        // Each render gets its own canvas; cancelled renders never race a new page.
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(view.width * ratio));
        canvas.height = Math.max(1, Math.floor(view.height * ratio));
        canvas.style.width = `${view.width}px`;
        canvas.style.height = `${view.height}px`;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${item.name} · ${page}페이지`);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        task = pdfPage.render({ canvas, canvasContext: context, viewport: view, transform: [ratio, 0, 0, ratio, 0, 0] });
        await task.promise;
        if (disposed) return;
        target.replaceChildren(canvas);
        area?.scrollTo({ top: 0, left: 0, behavior: "instant" });
        setRenderedScale(scale);
        setRendering(false);
      } catch (cause) {
        if (!disposed && !(cause instanceof Error && cause.name === "RenderingCancelledException")) setError("PDF 페이지를 표시하지 못했습니다. 다운로드해서 확인해 주세요.");
      }
    }
    void render();
    return () => { disposed = true; task?.cancel(); };
  }, [document, page, zoom, viewport.width, viewport.height, area, item.name]);
  const goTo = (next: number) => {
    if (!document || !Number.isInteger(next)) return;
    const clamped = Math.max(1, Math.min(document.numPages, next));
    setPage(clamped); setPageInput(String(clamped));
  };
  const zoomBy = (factor: number) => setZoom(previous => Math.max(.1, Math.min(4, (typeof previous === "number" ? previous : renderedScale) * factor)));
  const ready = !!document && !error;
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
        <header className={styles.toolbar}>
          <DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close>
          <FileText size={20} className={styles.fileIcon} aria-hidden="true" />
          <DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title>
          <div className={styles.actions}><PreviewFileNavigation />
            <button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button>
            <button className={styles.button} aria-label="PDF 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button>
          </div>
        </header>
        <nav className={styles.menus} aria-label="PDF 미리보기 메뉴">
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger><DropdownMenuContent align="start">
            <DropdownMenuItem disabled={!ready || renderedScale >= 4} onSelect={() => zoomBy(1.25)}><Plus />확대</DropdownMenuItem>
            <DropdownMenuItem disabled={!ready || renderedScale <= .1} onSelect={() => zoomBy(.8)}><Minus />축소</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!ready} onSelect={() => setZoom("page")}><Maximize />페이지 맞춤</DropdownMenuItem>
            <DropdownMenuItem disabled={!ready} onSelect={() => setZoom("width")}>너비 맞춤</DropdownMenuItem>
            <DropdownMenuItem disabled={!ready} onSelect={() => setZoom(1)}>원본 크기 (100%)</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>PDF 미리보기</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>하단 화살표 또는 페이지 번호로 이동합니다.<br />보기 메뉴에서 확대·축소와 화면 맞춤을 선택합니다.<br />확대된 페이지는 스크롤로 탐색합니다.<br />Esc로 닫습니다. 암호 문서는 지원하지 않습니다.<br />현재 텍스트 선택·검색·주석 편집은 지원하지 않습니다.</p></DropdownMenuContent></DropdownMenu>
        </nav>
        <div ref={setArea} className={pdfStyles.area}>
          {!error && (!document || rendering) && <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>PDF를 불러오는 중입니다.</p></div>}
          {error && <div className={styles.message} role="alert"><FileText size={36} /><p>{error}</p></div>}
          <div ref={host} className={pdfStyles.page} style={{ visibility: error || rendering ? "hidden" : "visible" }} />
        </div>
        <footer className={`${styles.zoomBar} ${pdfStyles.controls}`}>
          <button className={styles.button} aria-label="이전 페이지" disabled={!ready || page <= 1} onClick={() => goTo(page - 1)}><ChevronLeft size={20} /></button>
          <form onSubmit={event => { event.preventDefault(); goTo(Number(pageInput)); }} className={pdfStyles.pageForm}>
            <input type="number" aria-label="페이지 번호" min={1} max={document?.numPages || 1} disabled={!ready} value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => goTo(Number(pageInput))} /><span>/ {document?.numPages || "—"}</span>
          </form>
          <button className={styles.button} aria-label="다음 페이지" disabled={!ready || page >= (document?.numPages || 1)} onClick={() => goTo(page + 1)}><ChevronRight size={20} /></button>
          <button className={styles.button} aria-label="축소" disabled={!ready || renderedScale <= .1} onClick={() => zoomBy(.8)}><Minus size={20} /></button>
          <span>{ready ? `${Math.round(renderedScale * 100)}%` : "—"}</span>
          <button className={styles.button} aria-label="확대" disabled={!ready || renderedScale >= 4} onClick={() => zoomBy(1.25)}><Plus size={20} /></button>
          <button className={styles.button} aria-label="페이지 맞춤" disabled={!ready} onClick={() => setZoom("page")}><Maximize size={20} /></button>
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
