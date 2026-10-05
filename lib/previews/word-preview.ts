import mammoth from "mammoth/mammoth.browser";

export const WORD_PREVIEW_LIMIT = 20 * 1024 * 1024;
export const WORD_HTML_LIMIT = 5 * 1024 * 1024;
export async function readWordResponse(response: Response): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(response.status === 401 ? "로그인 세션을 확인해 주세요." : "파일을 읽을 수 없습니다. 접근 권한을 확인해 주세요.");
  if (Number(response.headers.get("content-length")) > WORD_PREVIEW_LIMIT) { await response.body?.cancel(); throw new Error("워드 미리보기는 20 MB 이하 파일만 지원합니다."); }
  if (!response.body) throw new Error("파일 내용을 읽을 수 없습니다.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > WORD_PREVIEW_LIMIT) { await reader.cancel(); throw new Error("워드 미리보기는 20 MB 이하 파일만 지원합니다."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data.buffer;
}

export async function convertWord(data: ArrayBuffer) {
  if (data.byteLength > WORD_PREVIEW_LIMIT) throw new Error("워드 미리보기는 20 MB 이하 파일만 지원합니다.");
  let images = 0, imageSize = 0, skippedImages = false;
  const converted = await mammoth.convertToHtml({ arrayBuffer: data }, {
    externalFileAccess: false,
    includeEmbeddedStyleMap: false,
    ignoreEmptyParagraphs: false,
    convertImage: mammoth.images.imgElement(async image => {
      if (++images > 100 || !/^image\/(png|jpeg|gif|webp|avif)$/i.test(image.contentType)) { skippedImages = true; return { src: "" }; }
      const base64 = await image.readAsBase64String();
      imageSize += base64.length;
      if (imageSize > 3 * 1024 * 1024) { skippedImages = true; return { src: "" }; }
      return { src: `data:${image.contentType.toLowerCase()};base64,${base64}` };
    }),
  });
  if (converted.value.length > WORD_HTML_LIMIT) throw new Error("문서 내용이 너무 큽니다. 다운로드해서 확인해 주세요.");
  return { html: converted.value, partial: skippedImages || converted.messages.length > 0 };
}
