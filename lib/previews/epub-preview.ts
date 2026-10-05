import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";

export const EPUB_PREVIEW_LIMIT = 20 * 1024 * 1024;
export type EpubChapter = { path: string; title: string };
export type EpubMetadata = { title: string; author: string; chapters: EpubChapter[]; partial: boolean };
export type EpubBook = { zip: JSZip; metadata: EpubMetadata };
const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS("*", name));
const first = (node: Document | Element, name: string) => all(node, name)[0];
export function resolveEpubPath(source: string, reference: string) {
  let target: string;
  try { target = decodeURIComponent(reference.split("#")[0]); } catch { return null; }
  if (!target || /^[a-z][a-z\d+.-]*:|^[\/\\]|[\\?\u0000-\u001f]/i.test(target)) return null;
  const parts = source.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/") || null;
}
async function entryBytes(entry: JSZip.JSZipObject, limit: number) {
  type Stream = { on(event: "data", callback: (chunk: Uint8Array) => void): Stream; on(event: "error", callback: (error: Error) => void): Stream; on(event: "end", callback: () => void): Stream; pause(): Stream; resume(): Stream };
  return new Promise<Uint8Array>((resolve, reject) => {
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: "uint8array"): Stream }).internalStream("uint8array");
    const chunks: Uint8Array[] = []; let size = 0, stopped = false;
    stream.on("data", chunk => { if (stopped) return; size += chunk.length; if (size > limit) { stopped = true; stream.pause(); reject(new Error("EPUB 내부 내용이 너무 큽니다. 다운로드해서 확인해 주세요.")); return; } chunks.push(chunk); });
    stream.on("error", reject);
    stream.on("end", () => { if (stopped) return; const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } resolve(result); });
    stream.resume();
  });
}
async function readXml(zip: JSZip, path: string, html = false) {
  const entry = zip.file(path);
  if (!entry) throw new Error("EPUB 내부 문서를 찾을 수 없습니다.");
  let text = new TextDecoder("utf-8", { fatal: true }).decode(await entryBytes(entry, 2 * 1024 * 1024));
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw new Error("지원하지 않는 EPUB XML 선언입니다.");
  // XHTML 1.x external DOCTYPEs are common in EPUB 2. Never resolve their DTDs.
  text = text.replace(/<!DOCTYPE[^>]*>/gi, "");
  return new DOMParser({ onError: level => { if (level !== "warning") throw new Error("EPUB 내부 문서가 손상되었습니다."); } }).parseFromString(text, html ? "text/html" : "application/xml");
}
export async function openEpub(data: ArrayBuffer): Promise<EpubBook> {
  if (data.byteLength > EPUB_PREVIEW_LIMIT) throw new Error("EPUB 미리보기는 20 MB 이하 파일만 지원합니다.");
  const zip = await JSZip.loadAsync(data);
  if (Object.keys(zip.files).length > 10000) throw new Error("EPUB 내부 항목이 너무 많습니다.");
  if (zip.file("META-INF/encryption.xml")) {
    const encryption = await readXml(zip, "META-INF/encryption.xml");
    if (all(encryption, "EncryptionMethod").some(method => !["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"].includes(method.getAttribute("Algorithm") || ""))) throw new Error("DRM 또는 암호로 보호된 EPUB는 미리보기를 지원하지 않습니다.");
  }
  const container = await readXml(zip, "META-INF/container.xml"), root = first(container, "rootfile")?.getAttribute("full-path");
  const packagePath = root ? resolveEpubPath("", root) : null;
  if (!packagePath) throw new Error("유효한 EPUB 패키지 정보가 없습니다.");
  const packageDoc = await readXml(zip, packagePath), manifest = new Map<string, { path: string; type: string; properties: string }>();
  let partial = false;
  for (const item of all(packageDoc, "item")) {
    const path = resolveEpubPath(packagePath, item.getAttribute("href") || "");
    if (path) manifest.set(item.getAttribute("id") || "", { path, type: item.getAttribute("media-type") || "", properties: item.getAttribute("properties") || "" });
    else partial = true;
  }
  const chapters: EpubChapter[] = [];
  const spine = first(packageDoc, "spine");
  if (!spine) throw new Error("EPUB 읽기 순서가 없습니다.");
  const refs = all(spine, "itemref");
  if (refs.length > 500) partial = true;
  for (const ref of refs.slice(0, 500)) {
    const resource = manifest.get(ref.getAttribute("idref") || "");
    if (!resource || !["application/xhtml+xml", "text/html"].includes(resource.type) || !zip.file(resource.path)) { partial = true; continue; }
    chapters.push({ path: resource.path, title: resource.path.split("/").pop() || `챕터 ${chapters.length + 1}` });
  }
  if (!chapters.length) throw new Error("표시할 수 있는 EPUB 본문이 없습니다.");
  const labels = new Map<string, string>();
  const navigation = Array.from(manifest.values()).find(item => item.properties.split(/\s+/).includes("nav"));
  const ncx = manifest.get(spine.getAttribute("toc") || "");
  try {
    if (navigation) {
      const navDoc = await readXml(zip, navigation.path, true);
      const toc = all(navDoc, "nav").find(node => (node.getAttribute("epub:type") || node.getAttributeNS("http://www.idpf.org/2007/ops", "type") || "").split(/\s+/).includes("toc"));
      if (toc) for (const anchor of all(toc, "a")) {
        const path = resolveEpubPath(navigation.path, anchor.getAttribute("href") || ""), text = (anchor.textContent || "").trim().slice(0, 200);
        if (path && text && !labels.has(path)) labels.set(path, text);
      }
    } else if (ncx) {
      const ncxDoc = await readXml(zip, ncx.path);
      for (const point of all(ncxDoc, "navPoint")) {
        const path = resolveEpubPath(ncx.path, first(point, "content")?.getAttribute("src") || ""), text = first(point, "navLabel")?.textContent?.trim().slice(0, 200);
        if (path && text && !labels.has(path)) labels.set(path, text);
      }
    }
  } catch { partial = true; }
  for (const chapter of chapters) chapter.title = labels.get(chapter.path) || chapter.title;
  return { zip, metadata: { title: first(packageDoc, "title")?.textContent?.trim().slice(0, 200) || "EPUB", author: all(packageDoc, "creator").map(node => node.textContent?.trim()).filter(Boolean).join(", ").slice(0, 300), chapters, partial } };
}
export async function readEpubChapter(book: EpubBook, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= book.metadata.chapters.length) throw new Error("챕터를 찾을 수 없습니다.");
  const chapter = book.metadata.chapters[index], doc = await readXml(book.zip, chapter.path, true);
  const body = first(doc, "body") || doc.documentElement;
  let partial = book.metadata.partial, imageBytes = 0;
  const images = all(body, "img");
  for (let i = 0; i < images.length; i++) {
    const image = images[i], path = resolveEpubPath(chapter.path, image.getAttribute("src") || "");
    image.removeAttribute("src"); image.removeAttribute("srcset");
    const extension = path?.split(".").pop()?.toLowerCase(), mime = extension === "jpg" ? "jpeg" : extension;
    const entry = path && ["png", "jpeg", "gif", "webp", "avif"].includes(mime || "") ? book.zip.file(path) : null;
    if (i >= 100 || !entry || imageBytes >= 3 * 1024 * 1024) { partial = true; continue; }
    try {
      const bytes = await entryBytes(entry, 2 * 1024 * 1024);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      const base64 = btoa(binary); imageBytes += base64.length;
      if (imageBytes > 3 * 1024 * 1024) { partial = true; continue; }
      image.setAttribute("src", `data:image/${mime};base64,${base64}`);
    } catch { partial = true; }
  }
  const html = new XMLSerializer().serializeToString(body);
  if (html.length > 5 * 1024 * 1024) throw new Error("EPUB 챕터가 너무 큽니다. 다운로드해서 확인해 주세요.");
  return { html, index, partial };
}
export async function readEpubResponse(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "로그인 세션을 확인해 주세요." : "EPUB를 읽을 수 없습니다. 접근 권한을 확인해 주세요.");
  const oversize = () => new Error("EPUB 미리보기는 20 MB 이하 파일만 지원합니다.");
  if (Number(response.headers.get("content-length")) > EPUB_PREVIEW_LIMIT) { await response.body?.cancel(); throw oversize(); }
  if (!response.body) throw new Error("파일 내용을 읽을 수 없습니다.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > EPUB_PREVIEW_LIMIT) { await reader.cancel(); throw oversize(); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes.buffer;
}
