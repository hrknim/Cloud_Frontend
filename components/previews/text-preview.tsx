"use client";

import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Download, FileText, Info, LoaderCircle, Minus, Plus, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { readPreviewText, TEXT_PREVIEW_LIMIT } from "@/lib/previews/text-preview";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import textStyles from "./text-preview.module.css";

type Result = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; text: string; encoding: string };

export default function TextPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [result, setResult] = useState<Result>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [wrap, setWrap] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (item.bytes > TEXT_PREVIEW_LIMIT) throw new Error("텍스트 미리보기는 2 MB 이하 파일만 지원합니다. 다운로드해서 확인해 주세요.");
        const response = await fetch(item.contentUrl || `/api/files/${item.id}/content`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = await readPreviewText(response);
        if (!controller.signal.aborted) setResult({ state: "ready", ...data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ state: "error", message: error instanceof Error ? error.message : "파일을 읽지 못했습니다." });
      }
    }
    void load();
    return () => controller.abort();
  }, [item.id, item.contentUrl, item.bytes, attempt]);
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
            <button className={styles.button} aria-label="파일 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button>
          </div>
        </header>
        <nav className={styles.menus} aria-label="텍스트 미리보기 메뉴">
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>자동 줄바꿈</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={fontSize >= 28} onSelect={() => setFontSize(size => Math.min(28, size + 2))}><Plus />글자 확대</DropdownMenuItem>
              <DropdownMenuItem disabled={fontSize <= 10} onSelect={() => setFontSize(size => Math.max(10, size - 2))}><Minus />글자 축소</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFontSize(14)}>기본 글자 크기</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger>
            <DropdownMenuContent align="start"><DropdownMenuLabel>텍스트 미리보기</DropdownMenuLabel><DropdownMenuSeparator />
              <p className={styles.help}>읽기 전용 뷰어입니다. 내용은 실행되지 않습니다.<br />보기 메뉴에서 줄바꿈과 글자 크기를 조절합니다.<br />UTF-8·UTF-16(BOM)·한국어(EUC-KR)를 지원합니다.<br />최대 2 MB까지 표시합니다. Esc로 닫습니다.</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <div className={textStyles.content}>
          {result.state === "loading" && <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>텍스트를 불러오는 중입니다.</p></div>}
          {result.state === "error" && <div className={styles.message} role="alert"><FileText size={36} /><p>{result.message}</p><button className={styles.menuButton} onClick={() => { setResult({ state: "loading" }); setAttempt(value => value + 1); }}>다시 시도</button></div>}
          {result.state === "ready" && (result.text.length ? <pre className={`${textStyles.text} ${wrap ? textStyles.wrap : ""}`} style={{ fontSize }} tabIndex={0} aria-label="파일 내용">{result.text}</pre> : <div className={styles.message}>빈 텍스트 파일입니다.</div>)}
        </div>
        <footer className={textStyles.status}>{result.state === "ready" ? `${result.encoding.toUpperCase()} · ${item.size}` : item.size} · 읽기 전용</footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
