"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, Download, Info, LoaderCircle, Sheet, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SheetCell, SheetPage } from "@/lib/previews/spreadsheet-preview";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import sheetStyles from "./spreadsheet-preview.module.css";

type Result = { sequence?: number; names: string[]; sheet: SheetPage | null; error?: string; loading: boolean };
export default function SpreadsheetPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [result, setResult] = useState<Result>({ names: [], sheet: null, loading: true });
  const [selected, setSelected] = useState<SheetCell | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [wrap, setWrap] = useState(false);
  const [formulas, setFormulas] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const tooLarge = item.bytes > 20 * 1024 * 1024;
  const startTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      worker.current?.terminate(); worker.current = null;
      setResult({ names: [], sheet: null, loading: false, error: "파일 처리 시간이 초과되었습니다. 다운로드해서 확인해 주세요." });
    }, 20_000);
  };
  useEffect(() => {
    if (tooLarge) return;
    let disposed = false;
    let instance: Worker | undefined;
    async function launch() {
      await Promise.resolve();
      if (disposed) return;
      try {
        instance = new Worker(new URL("./spreadsheet-worker.ts", import.meta.url), { type: "module" });
        worker.current = instance;
        instance.onmessage = (event: MessageEvent<Result>) => {
          if (disposed || event.data.sequence !== sequence.current) return;
          if (timer.current) clearTimeout(timer.current);
          setResult({ ...event.data, loading: false });
          area.current?.scrollTo({ left: 0, top: 0 });
        };
        instance.onerror = () => {
          if (disposed) return;
          if (timer.current) clearTimeout(timer.current);
          instance?.terminate(); worker.current = null;
          setResult({ names: [], sheet: null, loading: false, error: "스프레드시트를 읽지 못했습니다. 암호·손상 여부를 확인하거나 다운로드해 주세요." });
        };
        sequence.current++;
        instance.postMessage({ type: "load", id: item.id, contentUrl: item.contentUrl, name: item.name, page: 0, sequence: sequence.current });
        startTimer();
      } catch {
        setResult({ names: [], sheet: null, loading: false, error: "미리보기 작업을 시작하지 못했습니다." });
      }
    }
    void launch();
    return () => { disposed = true; instance?.terminate(); worker.current = null; if (timer.current) clearTimeout(timer.current); };
  }, [item.id, item.contentUrl, item.name, tooLarge, attempt]);
  const requestPage = (name: string, page: number) => {
    if (!worker.current) return;
    sequence.current++;
    setSelected(null); setResult(previous => ({ ...previous, loading: true }));
    worker.current.postMessage({ type: "page", name, page, sequence: sequence.current }); startTimer();
  };
  const sheet = result.sheet;
  const error = tooLarge ? "스프레드시트 미리보기는 20 MB 이하 파일만 지원합니다. 다운로드해서 확인해 주세요." : result.error;
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={styles.overlay} /><DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
      <header className={styles.toolbar}><DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close><Sheet className={styles.fileIcon} size={20} /><DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title><div className={styles.actions}><PreviewFileNavigation /><button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button><button className={styles.button} aria-label="파일 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button></div></header>
      <nav className={styles.menus} aria-label="스프레드시트 미리보기 메뉴">
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>자동 줄바꿈</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={formulas} onCheckedChange={setFormulas}>수식 표시</DropdownMenuCheckboxItem><DropdownMenuSeparator /><DropdownMenuItem disabled={fontSize >= 21} onSelect={() => setFontSize(size => Math.min(21, size + 2))}>글자 확대</DropdownMenuItem><DropdownMenuItem disabled={fontSize <= 11} onSelect={() => setFontSize(size => Math.max(11, size - 2))}>글자 축소</DropdownMenuItem><DropdownMenuItem onSelect={() => setFontSize(13)}>기본 글자 크기</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>읽기 전용 스프레드시트</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>아래 탭으로 시트를 바꾸고 셀을 눌러 전체 값·수식을 확인합니다.<br />수식은 재계산하지 않고 저장된 결과를 표시합니다.<br />차트·이미지·원본 서식·매크로 실행은 지원하지 않습니다.<br />최대 20 MB, 처음 50개 시트 중 공개 시트,<br />시트당 처음 5,000행 범위와 사용 영역의 100열을 표시합니다.<br />100행씩 페이지를 이동합니다. Esc로 닫습니다.</p></DropdownMenuContent></DropdownMenu>
      </nav>
      {!error && <div className={sheetStyles.inspector}><strong>{selected?.address || "셀 선택"}</strong><span>{selected ? `${selected.formula ? `${selected.formula} · 저장된 값: ` : ""}${selected.text}` : "셀을 선택하면 전체 내용과 수식이 표시됩니다."}</span></div>}
      <div ref={area} className={sheetStyles.area}>
        {error ? <div className={styles.message} role="alert"><Sheet size={36} /><p>{error}</p>{!tooLarge && <button className={styles.menuButton} onClick={() => { setResult({ names: [], sheet: null, loading: true }); setSelected(null); setAttempt(value => value + 1); }}>다시 시도</button>}</div> : result.loading ? <div className={styles.message} role="status"><LoaderCircle className={styles.spinner} size={28} /><p>스프레드시트를 불러오는 중입니다.</p></div> : sheet?.empty ? <div className={styles.message}>빈 시트입니다.{sheet.truncated && " 미리보기 범위 밖의 데이터는 다운로드해서 확인해 주세요."}</div> : sheet && <table className={`${sheetStyles.grid} ${wrap ? sheetStyles.wrap : ""}`} style={{ fontSize }} aria-label={`${sheet.name} 셀 목록`}>
          <thead><tr><th className={sheetStyles.corner} aria-label="행 번호" />{sheet.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{sheet.rows.map(row => <tr key={row.number}><th scope="row">{row.number}</th>{row.cells.map((cell, index) => cell && <td key={index} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={cell.numeric ? sheetStyles.numeric : undefined}><button className={selected?.address === cell.address ? sheetStyles.selected : ""} aria-label={`${cell.address}: ${cell.text}`} title={cell.formula ? `${cell.formula}\n${cell.text}` : cell.text} onClick={() => setSelected(cell)}>{formulas && cell.formula ? cell.formula : cell.text || "\u00a0"}</button></td>)}</tr>)}</tbody>
        </table>}
      </div>
      {!error && <div className={sheetStyles.tabs} role="group" aria-label="시트 선택">{result.names.map(name => <button key={name} aria-pressed={sheet?.name === name} disabled={result.loading} onClick={() => requestPage(name, 0)}>{name}</button>)}</div>}
      <footer className={sheetStyles.footer}><span>읽기 전용 · 저장된 결과 표시{sheet?.truncated && " · 일부 범위만 표시"}</span>{sheet && !error && <div><button className={styles.button} aria-label="이전 행 페이지" disabled={result.loading || sheet.page === 0} onClick={() => requestPage(sheet.name, sheet.page - 1)}><ChevronLeft size={20} /></button><span>{sheet.page + 1} / {sheet.pages}</span><button className={styles.button} aria-label="다음 행 페이지" disabled={result.loading || sheet.page + 1 >= sheet.pages} onClick={() => requestPage(sheet.name, sheet.page + 1)}><ChevronRight size={20} /></button></div>}</footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
