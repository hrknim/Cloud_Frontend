import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function compile(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const textUrl = await compile("../lib/previews/text-preview.ts");
const { parseSpreadsheet, spreadsheetPage, readSpreadsheetResponse, SPREADSHEET_LIMIT } = await import(await compile("../lib/previews/spreadsheet-preview.ts", [["\"./text-preview\"", JSON.stringify(textUrl)], ["\"xlsx\"", JSON.stringify(import.meta.resolve("xlsx"))]]));
const encode = value => new TextEncoder().encode(value);
const book = sheet => ({ SheetNames: ["Data"], Sheets: { Data: sheet } });

test("CSV and TSV preserve literal fields, Unicode, leading zeros and formula-like text", () => {
  const workbook = parseSpreadsheet(encode('이름,번호,내용\n테스트,00123,"=SUM(A1:A2)"'), "data.csv");
  const page = spreadsheetPage(workbook, workbook.SheetNames[0]);
  assert.deepEqual(page.columns, ["A", "B", "C"]);
  assert.equal(page.rows[1].cells[1].text, "00123");
  assert.equal(page.rows[1].cells[2].text, "=SUM(A1:A2)");
  assert.equal(page.rows[1].cells[2].formula, "");
  const tsv = parseSpreadsheet(encode("한글\t값\n가\t0"), "data.tsv");
  assert.equal(spreadsheetPage(tsv, tsv.SheetNames[0]).rows[1].cells[1].text, "0");
});

test("Workbook parser opens SpreadsheetML with multiple sheets", () => {
  const xml = '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="첫 시트"><Table><Row><Cell><Data ss:Type="String">한글</Data></Cell></Row></Table></Worksheet><Worksheet ss:Name="Second"><Table><Row><Cell><Data ss:Type="Number">42</Data></Cell></Row></Table></Worksheet></Workbook>';
  const workbook = parseSpreadsheet(encode(xml), "data.xls");
  assert.deepEqual(workbook.SheetNames, ["첫 시트", "Second"]);
  assert.equal(spreadsheetPage(workbook, "Second").rows[0].cells[0].text, "42");
});

test("Cached formulas, number formats and unsafe markup remain read-only data", () => {
  const page = spreadsheetPage(book({ "!ref": "A1:E1", A1: { t: "n", v: 0, f: "1-1" }, B1: { t: "n", f: "SUM(A1:A2)" }, C1: { t: "n", v: .25, z: "0%" }, D1: { t: "s", v: "<script>alert(1)</script>", h: "<img onerror=alert(1)>" }, E1: { t: "n", v: 45292, z: "yyyy-mm-dd" } }), "Data");
  assert.equal(page.rows[0].cells[0].text, "0");
  assert.equal(page.rows[0].cells[0].formula, "=1-1");
  assert.equal(page.rows[0].cells[1].text, "저장된 계산 결과 없음");
  assert.equal(page.rows[0].cells[2].text, "25%");
  assert.equal(page.rows[0].cells[3].text, "<script>alert(1)</script>");
  assert.equal(page.rows[0].cells[4].text, "2024-01-01");
});

test("Paging preserves actual coordinates, bounds ranges and clips merged cells", () => {
  const workbook = book({ "!ref": "C6:EA6000", C105: { t: "s", v: "merged" }, "!merges": [{ s: { r: 104, c: 2 }, e: { r: 107, c: 3 } }] });
  const first = spreadsheetPage(workbook, "Data");
  assert.equal(first.rows[0].number, 6);
  assert.equal(first.columns[0], "C");
  assert.equal(first.columns.length, 100);
  assert.equal(first.pages, 50);
  assert.equal(first.truncated, true);
  assert.equal(first.rows[99].cells[0].rowSpan, 1);
  const second = spreadsheetPage(workbook, "Data", 1);
  assert.equal(second.rows[0].number, 106);
  assert.equal(second.rows[0].cells[0].text, "merged");
  assert.equal(second.rows[0].cells[0].rowSpan, 3);
  assert.equal(second.rows[0].cells[1], null);
  assert.equal(spreadsheetPage(workbook, "Data", 999).rows.at(-1).number, 5000);
  assert.equal(spreadsheetPage(book({}), "Data").empty, true);
  assert.throws(() => spreadsheetPage(workbook, "Other"), /시트/);
});

test("Authenticated download rejects failures and both declared and streamed oversize", async () => {
  assert.deepEqual(await readSpreadsheetResponse(new Response("abc")), encode("abc"));
  await assert.rejects(readSpreadsheetResponse(new Response("", { status: 401 })), /로그인/);
  await assert.rejects(readSpreadsheetResponse(new Response("", { status: 403 })), /권한/);
  await assert.rejects(readSpreadsheetResponse(new Response("", { headers: { "content-length": String(SPREADSHEET_LIMIT + 1) } })), /20 MB/);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(SPREADSHEET_LIMIT + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readSpreadsheetResponse(new Response(stream)), /20 MB/);
  assert.equal(cancelled, true);
  assert.throws(() => parseSpreadsheet(new Uint8Array(SPREADSHEET_LIMIT + 1), "data.xlsx"), /20 MB/);
});
