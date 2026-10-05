"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Download, Info, LoaderCircle, Music, Video, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import mediaStyles from "./media-preview.module.css";

export default function MediaPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onDownload, onInfo } = actions;
  const audio = item.kind === "audio";
  const Icon = audio ? Music : Video;
  const media = useRef<HTMLMediaElement | null>(null);
  const [element, setElement] = useState<HTMLMediaElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [rate, setRate] = useState("1");
  const bindPlayer = useCallback((node: HTMLMediaElement | null) => { media.current = node; setElement(node); }, []);
  useEffect(() => {
    const player = media.current;
    if (player) player.playbackRate = Number(rate);
  }, [rate, element]);
  useEffect(() => () => {
    // Stop playback and pending streaming requests when the viewer closes.
    element?.pause();
    element?.removeAttribute("src");
    element?.load();
  }, [element]);
  const failed = !item.mediaUrl || status === "error";
  const playerProps = {
    ref: bindPlayer,
    src: item.mediaUrl, controls: true, preload: "metadata" as const,
    onLoadedMetadata: () => setStatus("ready"),
    onCanPlay: () => setStatus("ready"), onError: () => setStatus("error"),
    "aria-label": `${item.name} ${audio ? "음원" : "영상"} 재생`,
  };
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
        <header className={styles.toolbar}>
          <DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close>
          <Icon size={20} className={styles.fileIcon} aria-hidden="true" />
          <DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title>
          <div className={styles.actions}><PreviewFileNavigation /><button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button><button className={styles.button} aria-label="파일 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button></div>
        </header>
        <nav className={styles.menus} aria-label="미디어 미리보기 메뉴">
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>재생 속도</DropdownMenuLabel><DropdownMenuRadioGroup value={rate} onValueChange={setRate}>{[.5, .75, 1, 1.25, 1.5, 2].map(value => <DropdownMenuRadioItem key={value} value={String(value)} disabled={failed}>{value}배{value === 1 ? " (기본)" : ""}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>영상·음원 미리보기</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>재생 버튼으로 시작하고 재생 막대로 이동합니다.<br />기본 컨트롤에서 음량을 조절할 수 있습니다.<br />보기 메뉴에서 재생 속도를 선택합니다.<br />영상은 기본 컨트롤로 전체 화면 전환이 가능합니다.<br />브라우저 미지원 코덱은 다운로드해서 확인해 주세요.<br />Esc로 닫으면 재생도 중지됩니다.</p></DropdownMenuContent></DropdownMenu>
        </nav>
        <div className={mediaStyles.content}>
          {failed ? <div className={styles.message} role="alert"><Icon size={40} /><p>재생할 수 없는 형식이거나 파일을 불러오지 못했습니다.</p><p className={styles.hint}>브라우저 지원 여부와 접근 권한을 확인하거나 다운로드해서 재생해 주세요.</p></div> : audio ? <div className={mediaStyles.audioCard}><Music size={64} aria-hidden="true" /><h2>{item.name}</h2><p>{item.size}</p><audio {...playerProps} className={mediaStyles.audio} /></div> : <video {...playerProps} playsInline className={mediaStyles.video} />}
          {!failed && status === "loading" && <div className={mediaStyles.loading} role="status"><LoaderCircle size={22} className={styles.spinner} /><span>미디어를 불러오는 중입니다.</span></div>}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
