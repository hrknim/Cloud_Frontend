import JSZip from "jszip";
import { DOMParser, type Element, type Document } from "@xmldom/xmldom";

export const PRESENTATION_LIMIT = 20 * 1024 * 1024;
export type SlidePart = { x: number; y: number; width: number; height: number; text?: string; image?: string; color: string; background: string; fontSize: number; bold: boolean; align: "left" | "center" | "right"; ellipse: boolean };
export type PreviewSlide = { title: string; background: string; parts: SlidePart[] };
export type Presentation = { width: number; height: number; slides: PreviewSlide[]; partial: boolean };
const all = (node: Element | Document, name: string) => Array.from(node.getElementsByTagNameNS("*", name));
const first = (node: Element | Document | undefined, name: string) => node ? all(node, name)[0] : undefined;
const children = (node: Element) => Array.from(node.childNodes).filter(node => node.nodeType === 1) as Element[];
const number = (node: Element | undefined, key: string, fallback = 0) => {
  const value = Number(node?.getAttribute(key));
  return node?.hasAttribute(key) && Number.isFinite(value) ? value : fallback;
};
const color = (node: Element | undefined, fallback: string) => {
  const value = first(node, "srgbClr")?.getAttribute("val");
  return value && /^[a-f0-9]{6}$/i.test(value) ? `#${value}` : fallback;
};
async function zipBytes(entry: JSZip.JSZipObject, limit: number): Promise<Uint8Array> {
  // JSZip exposes internalStream publicly, but its bundled typings omit it.
  type ZipStream = {
    on(event: "data", callback: (chunk: Uint8Array) => void): ZipStream;
    on(event: "error", callback: (error: Error) => void): ZipStream;
    on(event: "end", callback: () => void): ZipStream;
    pause(): ZipStream;
    resume(): ZipStream;
  };
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let size = 0, stopped = false;
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: "uint8array"): ZipStream }).internalStream("uint8array");
    stream.on("data", chunk => {
      if (stopped) return;
      size += chunk.length;
      if (size > limit) { stopped = true; stream.pause(); reject(new Error("압축 해제한 내용이 너무 큽니다. 다운로드해서 확인해 주세요.")); return; }
      chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (stopped) return;
      const result = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      resolve(result);
    });
    stream.resume();
  });
}
export function resolvePresentationPart(source: string, target: string) {
  if (!target || /[\\?#]|^[a-z]+:/i.test(target)) return null;
  const parts: string[] = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") { if (!parts.length) return null; parts.pop(); }
    else parts.push(segment);
  }
  const path = parts.join("/");
  return path.startsWith("ppt/") ? path : null;
}
export async function readPresentationResponse(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "로그인 세션을 확인해 주세요." : "파일을 읽을 수 없습니다. 접근 권한을 확인해 주세요.");
  const oversize = () => new Error("프레젠테이션 미리보기는 20 MB 이하 파일만 지원합니다.");
  if (Number(response.headers.get("content-length")) > PRESENTATION_LIMIT) { await response.body?.cancel(); throw oversize(); }
  if (!response.body) throw new Error("파일 내용을 읽을 수 없습니다.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > PRESENTATION_LIMIT) { await reader.cancel(); throw oversize(); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data.buffer;
}
export async function parsePresentation(data: ArrayBuffer): Promise<Presentation> {
  if (data.byteLength > PRESENTATION_LIMIT) throw new Error("프레젠테이션 미리보기는 20 MB 이하 파일만 지원합니다.");
  const zip = await JSZip.loadAsync(data);
  let expanded = 0, imageBytes = 0, partial = false;
  const xml = async (path: string, optional = false) => {
    const entry = zip.file(path);
    if (!entry) { if (optional) return undefined; throw new Error("유효한 PPTX 파일이 아니거나 파일이 손상되었습니다."); }
    const text = new TextDecoder().decode(await zipBytes(entry, 2 * 1024 * 1024)); expanded += text.length;
    if (text.length > 2 * 1024 * 1024 || expanded > 10 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("문서 XML이 지원 범위를 벗어났습니다. 다운로드해서 확인해 주세요.");
    return new DOMParser({ onError: () => { throw new Error("손상된 슬라이드 XML입니다."); } }).parseFromString(text, "application/xml");
  };
  const relationships = async (source: string) => {
    const pieces = source.split("/"), file = pieces.pop();
    const doc = await xml(`${pieces.join("/")}/_rels/${file}.rels`, true);
    const map = new Map<string, string>();
    if (doc) for (const rel of all(doc, "Relationship")) {
      if (rel.getAttribute("TargetMode") === "External") { partial = true; continue; }
      const path = resolvePresentationPart(source, rel.getAttribute("Target") || "");
      if (path) map.set(rel.getAttribute("Id") || "", path);
    }
    return map;
  };
  const doc = (await xml("ppt/presentation.xml"))!;
  const size = first(doc, "sldSz"), width = number(size, "cx", 12192000), height = number(size, "cy", 6858000);
  if (width <= 0 || height <= 0 || height / width < .2 || height / width > 5) throw new Error("지원하지 않는 슬라이드 크기입니다.");
  const scale = 1000 / width, rels = await relationships("ppt/presentation.xml");
  const ids = all(doc, "sldId");
  if (!ids.length) throw new Error("표시할 슬라이드가 없습니다.");
  if (ids.length > 100) partial = true;
  const slides: PreviewSlide[] = [], images = new Map<string, string>();
  for (const id of ids.slice(0, 100)) {
    const path = rels.get(id.getAttribute("r:id") || id.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "");
    if (!path) throw new Error("슬라이드 연결 정보를 읽지 못했습니다.");
    const slide = (await xml(path))!, links = await relationships(path), tree = first(slide, "spTree");
    const parts: SlidePart[] = [];
    if (tree) for (const node of children(tree).slice(0, 500)) {
      if (!["sp", "pic"].includes(node.localName || "")) { if (!["nvGrpSpPr", "grpSpPr"].includes(node.localName || "")) partial = true; continue; }
      const paragraphs = all(node, "p").map(p => all(p, "t").map(t => t.textContent || "").join(""));
      if (paragraphs.join("\n").length > 20000) partial = true;
      const text = paragraphs.join("\n").slice(0, 20000), prop = first(node, "spPr"), transform = first(prop, "xfrm"), off = first(transform, "off"), ext = first(transform, "ext");
      const run = first(node, "rPr"), para = first(node, "pPr"), align = para?.getAttribute("algn");
      const part: SlidePart = { x: number(off, "x", width * .05) * scale, y: number(off, "y", height * (.05 + parts.length * .16)) * scale, width: number(ext, "cx", width * .9) * scale, height: number(ext, "cy", height * .14) * scale, text: text || undefined, color: color(first(run, "solidFill"), "#202124"), background: color(prop ? children(prop).find(child => child.localName === "solidFill") : undefined, "transparent"), fontSize: Math.max(8, Math.min(120, number(run, "sz", 2400) / 100 * 12700 * scale)), bold: run?.getAttribute("b") === "1", align: align === "ctr" ? "center" : align === "r" ? "right" : "left", ellipse: first(prop, "prstGeom")?.getAttribute("prst") === "ellipse" };
      if (!transform && text) partial = true;
      if (number(transform, "rot") || first(node, "srcRect")) partial = true;
      if (node.localName === "pic") {
        const blip = first(node, "blip"), target = links.get(blip?.getAttribute("r:embed") || blip?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || "");
        const extension = target?.split(".").pop()?.toLowerCase(), mime = extension === "jpg" || extension === "jpeg" ? "jpeg" : extension;
        if (target && ["png", "jpeg", "gif", "webp", "avif"].includes(mime || "")) {
          if (!images.has(target) && images.size < 100 && imageBytes < 5 * 1024 * 1024) {
            const entry = zip.file(target);
            if (entry) {
              try {
                const bytes = await zipBytes(entry, 3 * 1024 * 1024);
                let binary = "";
                for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
                const base64 = btoa(binary); imageBytes += base64.length;
                if (imageBytes <= 5 * 1024 * 1024) images.set(target, `data:image/${mime};base64,${base64}`);
              } catch { partial = true; }
            }
          }
          part.image = images.get(target);
        }
        if (!part.image) partial = true;
      }
      if (part.width > 0 && part.height > 0 && [part.x, part.y, part.width, part.height].every(value => Math.abs(value) < 20000) && (part.text || part.image || part.background !== "transparent")) parts.push(part);
    }
    if (tree && children(tree).length > 500) partial = true;
    slides.push({ title: parts.find(part => part.text)?.text?.split("\n")[0].slice(0, 100) || `슬라이드 ${slides.length + 1}`, background: color(first(slide, "bgPr"), "#ffffff"), parts });
  }
  return { width: 1000, height: height * scale, slides, partial };
}
