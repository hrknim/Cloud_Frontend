import type { WorkBook } from "xlsx";
import { parseSpreadsheet, readSpreadsheetResponse, spreadsheetPage } from "@/lib/previews/spreadsheet-preview";
let workbook: WorkBook | undefined;
self.onmessage = async (event: MessageEvent<{ type: "load" | "page"; contentUrl?: string; id: string; name: string; page: number; sequence: number }>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      const response = await fetch(request.contentUrl || `/api/files/${encodeURIComponent(request.id)}/content`, { credentials: "same-origin", cache: "no-store" });
      workbook = parseSpreadsheet(await readSpreadsheetResponse(response), request.name);
    }
    if (!workbook) throw new Error("스프레드시트를 읽지 못했습니다.");
    const name = request.type === "load" ? workbook.SheetNames[0] : request.name;
    self.postMessage({ sequence: request.sequence, names: workbook.SheetNames, sheet: spreadsheetPage(workbook, name, request.page) });
  } catch (error) { self.postMessage({ sequence: request.sequence, error: error instanceof Error ? error.message : "파일을 읽지 못했습니다." }); }
};
