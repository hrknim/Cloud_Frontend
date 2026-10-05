import { parseArchive, readArchiveResponse } from "@/lib/previews/archive-preview";
self.onmessage = async (event: MessageEvent<{ contentUrl?: string; id: string }>) => {
  try {
    const response = await fetch(event.data.contentUrl || `/api/files/${encodeURIComponent(event.data.id)}/content`, { credentials: "same-origin", cache: "no-store" });
    self.postMessage({ archive: parseArchive(await readArchiveResponse(response)) });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "ZIP 목록을 읽지 못했습니다." }); }
};
