import { cp, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "node_modules/pdfjs-dist");
const { version } = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
const target = path.join(root, "public/pdfjs", version);
await mkdir(target, { recursive: true });
await cp(path.join(source, "build/pdf.worker.min.mjs"), path.join(target, "pdf.worker.min.mjs"));
for (const folder of ["cmaps", "standard_fonts", "wasm"]) await cp(path.join(source, folder), path.join(target, folder), { recursive: true });
