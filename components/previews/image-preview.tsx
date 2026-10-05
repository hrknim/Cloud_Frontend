"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Download, ImageIcon, Info, LoaderCircle, Maximize, Minus, Plus, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";

export default function ImagePreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onDownload, onInfo } = actions;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [scale, setScale] = useState<number | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  useLayoutEffect(() => {
    if (!canvas) return;
    // Radix mounts the portal after the parent's initial effects. Observe the
    // actual mounted element, not a ref checked once before it exists.
    const measure = () => setViewport({ width: canvas.clientWidth, height: canvas.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvas]);
  const measured = viewport.width > 48 && viewport.height > 48;
  const fit = measured ? Math.max(.001, Math.min((viewport.width - 48) / natural.width, (viewport.height - 48) / natural.height, 1)) : 1;
  const currentScale = scale ?? fit;
  const ready = status === "ready" && !!item.url && measured;
  useLayoutEffect(() => {
    if (!canvas || !ready) return;
    canvas.scrollTo({
      left: Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2),
      top: Math.max(0, (canvas.scrollHeight - canvas.clientHeight) / 2),
      behavior: "instant",
    });
  }, [canvas, ready, currentScale, viewport.width, viewport.height]);
  const zoom = (factor: number) => setScale(previous => Math.min(8, Math.max(.01, (previous ?? fit) * factor)));
  const canPan = ready && (natural.width * currentScale + 48 > viewport.width || natural.height * currentScale + 48 > viewport.height);
  useEffect(() => {
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      // A non-passive listener prevents the wheel from scrolling the image or
      // zooming the browser instead. Trackpad delta magnitudes are bounded.
      event.preventDefault();
      event.stopPropagation();
      if (!ready || pan.current || event.deltaY === 0) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      const factor = Math.exp(-Math.max(-100, Math.min(100, delta)) * .002);
      setScale(previous => Math.min(8, Math.max(.01, (previous ?? fit) * factor)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvas, ready, fit]);
  const endPan = () => { pan.current = null; setDragging(false); };
  const unsupported = !item.url;
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
        <header className={styles.toolbar}>
          <DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close>
          <ImageIcon size={20} className={styles.fileIcon} aria-hidden="true" />
          <DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title>
          <div className={styles.actions}><PreviewFileNavigation />
            <button type="button" className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button>
            <button type="button" className={styles.button} aria-label="이미지 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button>
          </div>
        </header>
        <nav className={styles.menus} aria-label="미리보기 메뉴">
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={!ready || currentScale >= 8} onSelect={() => zoom(1.25)}><Plus />확대</DropdownMenuItem>
              <DropdownMenuItem disabled={!ready || currentScale <= .01} onSelect={() => zoom(.8)}><Minus />축소</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!ready} onSelect={() => setScale(null)}><Maximize />화면에 맞추기</DropdownMenuItem>
              <DropdownMenuItem disabled={!ready} onSelect={() => setScale(1)}>원본 크기 (100%)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>이미지 미리보기 사용 방법</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <p className={styles.help}>휠을 위로 돌리면 확대, 아래로 돌리면 축소합니다.<br />하단의 − / + 버튼으로도 축소·확대합니다.<br />확대된 이미지는 좌클릭 드래그로 이동합니다.<br />보기 메뉴에서 화면 맞춤·원본 크기를 선택합니다.<br />Esc 또는 닫기 버튼으로 돌아갑니다.</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <div ref={setCanvas} className={`${styles.canvas} ${canPan ? styles.pannable : ""} ${dragging ? styles.dragging : ""}`}
          onPointerDown={event => {
            if (!canPan || event.button !== 0 || pan.current) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
            setDragging(true);
          }}
          onPointerMove={event => {
            const start = pan.current;
            if (!start || start.pointerId !== event.pointerId) return;
            event.currentTarget.scrollTo({ left: start.left + start.x - event.clientX, top: start.top + start.y - event.clientY, behavior: "instant" });
          }}
          onPointerUp={event => {
            if (pan.current?.pointerId !== event.pointerId) return;
            endPan();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={endPan} onLostPointerCapture={endPan}
        >
          {!unsupported && status === "loading" && <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>이미지를 불러오는 중입니다.</p></div>}
          {(unsupported || status === "error") && <div className={styles.message} role="status">
            <ImageIcon size={40} aria-hidden="true" />
            <p>{unsupported ? "이 이미지 형식은 미리보기를 지원하지 않습니다." : "이미지를 불러오지 못했습니다."}</p>
            <p className={styles.hint}>파일을 다운로드해서 확인해 주세요.</p>
          </div>}
          {!unsupported && status !== "error" && <div className={styles.imageStage} style={{ width: Math.max(viewport.width, natural.width * currentScale + 48), minHeight: Math.max(viewport.height, natural.height * currentScale + 48) }}>
            {(
            // The authenticated content endpoint serves only allowlisted raster image MIME types inline.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} draggable={false} className={styles.image} style={{ visibility: ready ? "visible" : "hidden", width: natural.width * currentScale, height: natural.height * currentScale }} onLoad={event => { setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setStatus("ready"); }} onError={() => setStatus("error")} />
            )}
          </div>}
        </div>
        <footer className={styles.zoomBar} aria-label="이미지 확대 및 축소">
          <button className={styles.button} disabled={!ready || currentScale <= .01} aria-label="축소" onClick={() => zoom(.8)}><Minus size={20} /></button>
          <span aria-live="polite">{ready ? `${Number((currentScale * 100).toFixed(1))}%` : "—"}</span>
          <button className={styles.button} disabled={!ready || currentScale >= 8} aria-label="확대" onClick={() => zoom(1.25)}><Plus size={20} /></button>
          <button className={styles.button} disabled={!ready} aria-label="화면에 맞추기" onClick={() => setScale(null)}><Maximize size={20} /></button>
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
