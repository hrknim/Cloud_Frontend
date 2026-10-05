export const ARCHIVE_PREVIEW_LIMIT = 20 * 1024 * 1024;
export const ARCHIVE_ENTRY_LIMIT = 10000;
export type ArchiveEntry = { id: number; path: string; name: string; directory: boolean; size: number; compressedSize: number; encrypted: boolean; unsafe: boolean };
export type ArchiveListing = { entries: ArchiveEntry[]; files: number; folders: number; size: number; compressedSize: number; warnings: boolean };
export type ArchiveRow = ArchiveEntry & { virtual?: boolean };
const cp437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
}
function filename(bytes: Uint8Array, utf8: boolean, extra: Uint8Array) {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  for (let offset = 0; offset + 4 <= extra.length;) {
    const type = view.getUint16(offset, true), size = view.getUint16(offset + 2, true); offset += 4;
    if (offset + size > extra.length) throw new Error("ZIP 파일 이름 정보가 손상되었습니다.");
    if (type === 0x7075 && size >= 5 && extra[offset] === 1 && view.getUint32(offset + 1, true) === crc32(bytes)) return new TextDecoder("utf-8").decode(extra.subarray(offset + 5, offset + size));
    offset += size;
  }
  if (utf8) return new TextDecoder("utf-8").decode(bytes);
  // Some older Korean tools omit the UTF-8 flag and use CP949 filenames.
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch {}
  try { return new TextDecoder("euc-kr", { fatal: true }).decode(bytes); } catch {}
  return Array.from(bytes, byte => byte < 128 ? String.fromCharCode(byte) : cp437[byte - 128]).join("");
}
export function parseArchive(data: ArrayBuffer): ArchiveListing {
  if (data.byteLength > ARCHIVE_PREVIEW_LIMIT) throw new Error("ZIP 목록 미리보기는 20 MB 이하 파일만 지원합니다.");
  const view = new DataView(data), bytes = new Uint8Array(data), invalid = () => new Error("유효한 ZIP 목록이 아니거나 파일이 손상되었습니다.");
  let end = -1;
  for (let offset = data.byteLength - 22; offset >= Math.max(0, data.byteLength - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === data.byteLength) { end = offset; break; }
  }
  if (end < 0) throw invalid();
  const count = view.getUint16(end + 10, true), length = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count) throw new Error("분할 ZIP 파일은 목록 미리보기를 지원하지 않습니다.");
  if (count === 0xffff || length === 0xffffffff || start === 0xffffffff) throw new Error("ZIP64 형식은 현재 목록 미리보기를 지원하지 않습니다.");
  if (count > ARCHIVE_ENTRY_LIMIT) throw new Error("ZIP 목록 미리보기는 10,000개 이하 항목만 지원합니다.");
  if (start + length > end) throw invalid();
  const entries: ArchiveEntry[] = [], folders = new Set<string>(); let offset = start, files = 0, size = 0, compressedSize = 0, warnings = false;
  // Only central-directory records are inspected. Local headers and payloads are never decoded or inflated.
  for (let id = 0; id < count; id++) {
    if (offset + 46 > start + length || view.getUint32(offset, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(offset + 8, true), compressed = view.getUint32(offset + 20, true), uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    if (view.getUint16(offset + 34, true)) throw new Error("분할 ZIP 파일은 목록 미리보기를 지원하지 않습니다.");
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || view.getUint32(offset + 42, true) === 0xffffffff) throw new Error("ZIP64 형식은 현재 목록 미리보기를 지원하지 않습니다.");
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || next > start + length) throw invalid();
    const raw = filename(bytes.subarray(offset + 46, offset + 46 + nameLength), !!(flags & 0x800), bytes.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength));
    const directory = raw.endsWith("/") || !!(view.getUint32(offset + 38, true) & 0x10);
    const parts = raw.replaceAll("\\", "/").split("/").filter(Boolean);
    const unsafe = raw.length > 4096 || parts.length > 100 || /^(\/|\\|[a-z]:)/i.test(raw) || /[\u0000-\u001f\u007f]/.test(raw) || parts.some(part => part === "." || part === "..") || !parts.length;
    const path = unsafe ? raw : `${parts.join("/")}${directory ? "/" : ""}`;
    warnings ||= unsafe || !!(flags & 1);
    entries.push({ id, path, name: unsafe ? raw : parts.at(-1) || raw, directory, size: uncompressed, compressedSize: compressed, encrypted: !!(flags & 1), unsafe });
    if (!directory) { files++; size += uncompressed; compressedSize += compressed; }
    if (!unsafe) for (let depth = 1; depth <= parts.length - (directory ? 0 : 1); depth++) {
      folders.add(`${parts.slice(0, depth).join("/")}/`);
      if (folders.size > ARCHIVE_ENTRY_LIMIT) throw new Error("ZIP 목록의 폴더 구조가 너무 큽니다. 다운로드해서 확인해 주세요.");
    }
    offset = next;
  }
  if (offset !== start + length) {
    // The optional central-directory digital signature is metadata too.
    if (offset + 6 > start + length || view.getUint32(offset, true) !== 0x05054b50 || offset + 6 + view.getUint16(offset + 4, true) !== start + length) throw invalid();
  }
  return { entries, files, folders: folders.size, size, compressedSize, warnings };
}
export function archiveFolder(entries: ArchiveEntry[], path = ""): ArchiveRow[] {
  const folders = new Map<string, ArchiveRow>(), files: ArchiveRow[] = [];
  for (const entry of entries) {
    if (entry.unsafe) { if (!path) files.push(entry); continue; }
    if (!entry.path.startsWith(path)) continue;
    const relative = entry.path.slice(path.length);
    if (!relative) continue;
    const slash = relative.indexOf("/");
    if (slash >= 0) {
      const name = relative.slice(0, slash), folderPath = `${path}${name}/`;
      if (!folders.has(folderPath)) folders.set(folderPath, { id: -1, path: folderPath, name, directory: true, size: 0, compressedSize: 0, encrypted: false, unsafe: false, virtual: true });
    } else files.push(entry);
  }
  const compare = (a: ArchiveRow, b: ArchiveRow) => a.name.localeCompare(b.name, "ko", { numeric: true });
  return [...Array.from(folders.values()).sort(compare), ...files.sort(compare)];
}
export function archiveBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
export async function readArchiveResponse(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "로그인 세션을 확인해 주세요." : "ZIP 파일을 읽을 수 없습니다. 접근 권한을 확인해 주세요.");
  const oversize = () => new Error("ZIP 목록 미리보기는 20 MB 이하 파일만 지원합니다.");
  if (Number(response.headers.get("content-length")) > ARCHIVE_PREVIEW_LIMIT) { await response.body?.cancel(); throw oversize(); }
  if (!response.body) throw new Error("파일 내용을 읽을 수 없습니다.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > ARCHIVE_PREVIEW_LIMIT) { await reader.cancel(); throw oversize(); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data.buffer;
}
