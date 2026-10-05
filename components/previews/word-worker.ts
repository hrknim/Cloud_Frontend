import { convertWord, readWordResponse } from "@/lib/previews/word-preview";

self.onmessage = async (event: MessageEvent<{ contentUrl?: string; id: string }>) => {
  try {
    const response = await fetch(event.data.contentUrl || `/api/files/${encodeURIComponent(event.data.id)}/content`, { credentials: "same-origin", cache: "no-store" });
    self.postMessage(await convertWord(await readWordResponse(response)));
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "워드 문서를 읽지 못했습니다." });
  }
};
