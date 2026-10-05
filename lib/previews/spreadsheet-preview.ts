import * as XLSX from "xlsx";
import { decodePreviewText } from "./text-preview";

export const SPREADSHEET_LIMIT = 20 * 1024 * 1024;
export const SHEET_ROW_LIMIT = 5000;
export const SHEET_COLUMN_LIMIT = 100;
export const SHEET_PAGE_ROWS = 100;
export type SheetCell = { address: string; text: string; formula: string; numeric: boolean; colSpan: number; rowSpan: number };
export type SheetPage = { name: string; columns: string[]; rows: { number: number; cells: (SheetCell | null)[] }[]; page: number; pages: number; truncated: boolean; empty: boolean };
export function parseSpreadsheet(data: Uint8Array, name: string): XLSX.WorkBook {
  if (data.byteLength > SPREADSHEET_LIMIT) throw new Error("스프레드시트 미리보기는 20 MB 이하 파일만 지원합니다.");
  const text = /\.(csv|tsv)$/i.test(name);
  const input = text ? decodePreviewText(data).text : data;
  // Plaintext fields stay literal: leading zeros and =... text are not formulas.
  const workbook = XLSX.read(input, { type: text ? "string" : "array", raw: text, FS: /\.tsv$/i.test(name) ? "\t" : undefined, cellFormula: true, sheetStubs: true, cellHTML: false, cellStyles: false, bookVBA: false, sheetRows: SHEET_ROW_LIMIT, sheets: Array.from({ length: 50 }, (_, index) => index) });
  const visible = workbook.SheetNames.slice(0, 50).filter((_, index) => !workbook.Workbook?.Sheets?.[index]?.Hidden);
  if (!visible.length) throw new Error("표시할 수 있는 시트가 없습니다.");
  workbook.SheetNames = visible;
  return workbook;
}
export function spreadsheetPage(workbook: XLSX.WorkBook, name: string, requestedPage = 0): SheetPage {
  if (!workbook.SheetNames.includes(name)) throw new Error("시트를 찾을 수 없습니다.");
  const sheet = workbook.Sheets[name];
  const empty: SheetPage = { name, columns: [], rows: [], page: 0, pages: 1, truncated: false, empty: true };
  if (!sheet?.["!ref"]) return { ...empty, truncated: !!sheet?.["!fullref"] };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const full = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
  const endRow = Math.min(range.e.r, SHEET_ROW_LIMIT - 1);
  const endCol = Math.min(range.e.c, range.s.c + SHEET_COLUMN_LIMIT - 1);
  if (range.s.r > endRow) return { ...empty, truncated: true };
  const pages = Math.max(1, Math.ceil((endRow - range.s.r + 1) / SHEET_PAGE_ROWS));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(Number.isFinite(requestedPage) ? requestedPage : 0)));
  const start = range.s.r + page * SHEET_PAGE_ROWS;
  const end = Math.min(endRow, start + SHEET_PAGE_ROWS - 1);
  const merges = (sheet["!merges"] || []).filter(merge => merge.e.r >= start && merge.s.r <= end && merge.e.c >= range.s.c && merge.s.c <= endCol).slice(0, 2000);
  const covered = new Set<string>();
  const anchors = new Map<string, { source: string; colSpan: number; rowSpan: number }>();
  for (const merge of merges) {
    const r0 = Math.max(start, merge.s.r), r1 = Math.min(end, merge.e.r), c0 = Math.max(range.s.c, merge.s.c), c1 = Math.min(endCol, merge.e.c);
    const anchor = XLSX.utils.encode_cell({ r: r0, c: c0 });
    anchors.set(anchor, { source: XLSX.utils.encode_cell(merge.s), rowSpan: r1 - r0 + 1, colSpan: c1 - c0 + 1 });
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const address = XLSX.utils.encode_cell({ r, c }); if (address !== anchor) covered.add(address); }
  }
  const rows: SheetPage["rows"] = [];
  for (let r = start; r <= end; r++) {
    const cells: (SheetCell | null)[] = [];
    for (let c = range.s.c; c <= endCol; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      if (covered.has(address)) { cells.push(null); continue; }
      const merge = anchors.get(address), cell = sheet[merge?.source || address] as XLSX.CellObject | undefined;
      const formula = cell?.f ? `=${cell.f}` : "";
      const text = formula && (cell?.v === undefined || cell.t === "z") ? "저장된 계산 결과 없음" : cell ? XLSX.utils.format_cell(cell) : "";
      cells.push({ address: merge?.source || address, text, formula, numeric: cell?.t === "n" || cell?.t === "d", colSpan: merge?.colSpan || 1, rowSpan: merge?.rowSpan || 1 });
    }
    rows.push({ number: r + 1, cells });
  }
  return { name, columns: Array.from({ length: endCol - range.s.c + 1 }, (_, offset) => XLSX.utils.encode_col(range.s.c + offset)), rows, page, pages, truncated: full.e.r > endRow || full.e.c > endCol || (sheet["!merges"]?.length || 0) > 2000, empty: false };
}

export async function readSpreadsheetResponse(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "로그인 세션을 확인해 주세요." : "파일을 읽을 수 없습니다. 접근 권한을 확인해 주세요.");
  if (Number(response.headers.get("content-length")) > SPREADSHEET_LIMIT) { await response.body?.cancel(); throw new Error("스프레드시트 미리보기는 20 MB 이하 파일만 지원합니다."); }
  if (!response.body) throw new Error("파일 내용을 읽을 수 없습니다.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > SPREADSHEET_LIMIT) { await reader.cancel(); throw new Error("스프레드시트 미리보기는 20 MB 이하 파일만 지원합니다."); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data;
}
