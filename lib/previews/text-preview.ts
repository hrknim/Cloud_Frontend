export const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;

export function decodePreviewText(bytes: Uint8Array): { text: string; encoding: string } {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch {
    if (encoding !== "utf-8") throw new Error("텍스트 인코딩을 읽을 수 없습니다.");
    encoding = "euc-kr";
    try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
    catch { throw new Error("텍스트 인코딩을 읽을 수 없습니다. UTF-8 또는 한국어 인코딩으로 저장해 주세요."); }
  }
  const controls = text.match(/[\u0000-\u0008\u000e-\u001f]/g)?.length || 0;
  if (text.includes("\0") || controls > Math.max(3, text.length * .01)) throw new Error("텍스트가 아닌 바이너리 파일은 미리볼 수 없습니다.");
  return { text, encoding };
}

export async function readPreviewText(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "로그인 세션을 확인해 주세요." : "파일을 읽을 수 없습니다. 접근 권한 또는 원본 파일을 확인해 주세요.");
  if (Number(response.headers.get("content-length")) > TEXT_PREVIEW_LIMIT) {
    await response.body?.cancel();
    throw new Error("텍스트 미리보기는 2 MB 이하 파일만 지원합니다.");
  }
  if (!response.body) throw new Error("파일 내용을 읽을 수 없습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > TEXT_PREVIEW_LIMIT) {
        await reader.cancel();
        throw new Error("텍스트 미리보기는 2 MB 이하 파일만 지원합니다.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return decodePreviewText(bytes);
}
