import { parsePresentation, readPresentationResponse } from "@/lib/previews/presentation-preview";
self.onmessage = async (event: MessageEvent<{ contentUrl?: string; id: string }>) => {
  try {
    const response = await fetch(event.data.contentUrl || `/api/files/${encodeURIComponent(event.data.id)}/content`, { credentials: "same-origin", cache: "no-store" });
    self.postMessage({ document: await parsePresentation(await readPresentationResponse(response)) });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "프레젠테이션을 읽지 못했습니다." }); }
};
