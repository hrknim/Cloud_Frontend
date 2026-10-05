import { openEpub, readEpubChapter, readEpubResponse, type EpubBook } from "@/lib/previews/epub-preview";
let book: EpubBook | undefined;
self.onmessage = async (event: MessageEvent<{ type: "load" | "chapter"; contentUrl?: string; id?: string; index: number; sequence: number }>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      const response = await fetch(request.contentUrl || `/api/files/${encodeURIComponent(request.id || "")}/content`, { credentials: "same-origin", cache: "no-store" });
      book = await openEpub(await readEpubResponse(response));
    }
    if (!book) throw new Error("EPUB를 읽지 못했습니다.");
    self.postMessage({ ...await readEpubChapter(book, request.index), metadata: book.metadata, sequence: request.sequence });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "EPUB를 읽지 못했습니다.", metadata: book?.metadata, sequence: request.sequence }); }
};
