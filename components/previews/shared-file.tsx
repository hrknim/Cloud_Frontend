"use client";

import { useState } from "react";
import { Download, File, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toDriveItem, type StoredItem } from "@/lib/drive/drive-api";
import { supportsFilePreview } from "@/lib/previews/preview-navigation";
import ImagePreview from "./image-preview";
import TextPreview from "./text-preview";
import PdfPreview from "./pdf-preview";
import MediaPreview from "./media-preview";
import ModelPreview from "./model-preview";
import SpreadsheetPreview from "./spreadsheet-preview";
import WordPreview from "./word-preview";
import PresentationPreview from "./presentation-preview";
import ArchivePreview from "./archive-preview";
import EpubPreview from "./epub-preview";

export default function SharedFile({ file }: { file: StoredItem }) {
  const item = toDriveItem(file);
  const [open, setOpen] = useState(true);
  const [info, setInfo] = useState(false);
  const supported = supportsFilePreview(item);
  const Viewer = item.epubPreview ? EpubPreview : item.archivePreview ? ArchivePreview : item.presentationPreview ? PresentationPreview : item.wordPreview ? WordPreview : item.spreadsheetPreview ? SpreadsheetPreview : item.kind === "3d" ? ModelPreview : item.kind === "video" || item.kind === "audio" ? MediaPreview : item.pdfPreview ? PdfPreview : item.textPreview ? TextPreview : ImagePreview;
  const download = () => { if (file.downloadUrl) window.location.assign(file.downloadUrl); };
  const noop = () => {};
  return <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
    <File size={48} aria-hidden="true" /><h1 className="max-w-xl break-all text-xl font-semibold">{file.name}</h1>
    <p className="text-sm text-muted-foreground">공유된 파일 · {item.size}</p>
    {!supported && <p>이 형식은 미리보기를 지원하지 않습니다. 다운로드해서 확인해 주세요.</p>}
    <div className="flex flex-wrap justify-center gap-4">
      {supported && <button className="rounded-md border px-4 py-2" onClick={() => setOpen(true)}>미리보기 열기</button>}
      <button className="flex items-center gap-2 rounded-md border px-4 py-2" onClick={download}><Download size={18} />다운로드</button>
      <button className="flex items-center gap-2 rounded-md border px-4 py-2" onClick={() => setInfo(true)}><Info size={18} />정보</button>
    </div>
    {supported && open && <Viewer item={item} busy={false} publicView onClose={() => setOpen(false)} onInfo={() => {setOpen(false); setInfo(true);}} onDownload={download}
      onRename={noop} onMove={noop} onStar={noop} onDelete={noop} onPermanentDelete={noop} onShare={noop} />}
    <Dialog open={info} onOpenChange={setInfo}><DialogContent><DialogTitle className="break-all">{file.name}</DialogTitle><DialogDescription>공유된 파일 정보</DialogDescription><dl className="space-y-3 text-sm"><div><dt>크기</dt><dd>{item.size}</dd></div><div><dt>형식</dt><dd>{file.mimeType || "알 수 없음"}</dd></div><div><dt>수정 날짜</dt><dd>{item.date}</dd></div></dl></DialogContent></Dialog>
  </main>;
}
