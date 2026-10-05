import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

function samplePdf() {
  const content = "BT /F1 20 Tf 30 100 Td (Hello PDF) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  ];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(data.length); data += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = data.length;
  data += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(data);
}

test("PDF.js parses and renders a multi-page PDF; matching local worker and fonts exist", async () => {
  for (const asset of ["pdf.worker.min.mjs", "cmaps", "standard_fonts", "wasm"]) assert.ok(await stat(new URL(`../public/pdfjs/${pdfjs.version}/${asset}`, import.meta.url)));
  const task = pdfjs.getDocument({ data: samplePdf(), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 2);
    const first = await pdf.getPage(1);
    assert.equal((await first.getTextContent()).items[0].str, "Hello PDF");
    const view = first.getViewport({ scale: 1 });
    assert.equal(view.width, 300);
    const canvas = createCanvas(view.width, view.height);
    await first.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: view }).promise;
    assert.ok(canvas.toBuffer("image/png").length > 100);
    assert.equal((await pdf.getPage(2)).getViewport({ scale: 2 }).height, 600);
  } finally { await task.destroy(); }
});

test("Corrupt PDF fails cleanly", async () => {
  const task = pdfjs.getDocument({ data: new TextEncoder().encode("not a PDF") });
  try { await assert.rejects(task.promise, error => error.name === "InvalidPDFException"); }
  finally { await task.destroy(); }
});
