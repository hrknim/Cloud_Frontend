export type UploadStatus = "queued" | "uploading" | "saving" | "success" | "error" | "cancelled";
import { uploadTree, type UploadTree } from "./folder-upload";
export type UploadEntry = { id: number; name: string; destination: string; parentId: string | null; status: UploadStatus; percent: number; error?: string; file?: File; kind?: "file" | "folder"; folderName?: string; parentEntryId?: number; remoteId?: string };
export type UploadTransport = (file: File, parentId: string | null, signal: AbortSignal, progress: (percent: number) => void) => Promise<void>;
export const MAX_UPLOAD_SIZE = 100 * 1024 ** 2;
export type FolderTransport = (name: string, parentId: string | null, signal: AbortSignal) => Promise<string>;
const createUploadFolder: FolderTransport = async (name, parentId, signal) => {
  const response = await fetch("/api/folders", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId }), signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.item?.id) throw new Error(data?.error?.message || "폴더를 만들지 못했습니다.");
  return data.item.id;
};

// Fetch doesn't expose upload progress. The browser must set the multipart boundary.
export const uploadFile: UploadTransport = (file, parentId, signal, progress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  let settled = false;
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true; signal.removeEventListener("abort", abort);
    if (error) reject(error); else resolve();
  };
  const abort = () => { xhr.abort(); finish(new DOMException("전송을 취소했습니다.", "AbortError")); };
  if (signal.aborted) { abort(); return; }
  xhr.open("POST", "/api/files");
  xhr.upload.onprogress = event => { if (!settled && event.lengthComputable && event.total > 0) progress(Math.min(100, Math.floor(event.loaded / event.total * 100))); };
  xhr.upload.onload = () => { if (!settled) progress(100); };
  xhr.onload = () => {
    let data;
    try { data = JSON.parse(xhr.responseText); } catch { /* A proxy may return HTML. */ }
    if (xhr.status >= 200 && xhr.status < 300 && data?.item?.id) finish();
    else finish(new Error(xhr.status === 401 ? "로그인 세션을 확인해 주세요." : data?.error?.message || "업로드 결과를 확인하지 못했습니다. 목록을 확인한 뒤 재시도해 주세요."));
  };
  xhr.onerror = () => finish(new Error("연결이 끊겼습니다. 이미 저장되었는지 목록을 확인한 뒤 재시도해 주세요."));
  xhr.onabort = () => finish(new DOMException("전송을 취소했습니다.", "AbortError"));
  signal.addEventListener("abort", abort, { once: true });
  // Directory-selected files can carry a relative path in multipart filenames.
  // Hierarchy is represented by parentId, never by the uploaded filename.
  const form = new FormData(); form.set("file", file, file.name); form.set("name", file.name);
  if (parentId) form.set("parentId", parentId);
  try { xhr.send(form); } catch (error) { finish(error instanceof Error ? error : new Error("업로드를 시작하지 못했습니다.")); }
});

/** Sequential transfers bound multipart memory; every entry captures its destination. */
export class UploadQueue {
  private entries: UploadEntry[] = [];
  private listeners = new Set<() => void>();
  private sequence = 0;
  private active?: { id: number; controller: AbortController };
  private onIdle?: () => void;
  setIdleHandler(handler?: () => void) { this.onIdle = handler; }
  constructor(private transport: UploadTransport = uploadFile, private folderTransport: FolderTransport = createUploadFolder) {}
  getSnapshot = () => this.entries;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  private update(id: number, change: Partial<UploadEntry>) {
    this.entries = this.entries.map(entry => entry.id === id ? { ...entry, ...change } : entry); this.emit();
  }
  add(files: File[], parentId: string | null, destination: string) {
    this.entries = [...this.entries, ...files.map(file => ({ id: ++this.sequence, name: file.name, parentId, destination,
      status: file.size > MAX_UPLOAD_SIZE ? "error" as const : "queued" as const, percent: 0,
      error: file.size > MAX_UPLOAD_SIZE ? "파일당 최대 100 MB까지 업로드할 수 있습니다." : undefined,
      file: file.size > MAX_UPLOAD_SIZE ? undefined : file }))];
    this.emit(); void this.pump();
  }
  addTree(incoming: UploadTree, parentId: string | null, destination: string) {
    const tree = uploadTree(incoming.files, incoming.directories);
    const folderIds = new Map<string, number>();
    const jobs: UploadEntry[] = [];
    for (const path of tree.directories) {
      const id = ++this.sequence, parts = path.split("/");
      jobs.push({ id, name: path, kind: "folder", folderName: parts.at(-1), destination, parentId, parentEntryId: folderIds.get(parts.slice(0, -1).join("/")), status: "queued", percent: 0 });
      folderIds.set(path, id);
    }
    for (const { path, file } of tree.files) jobs.push({ id: ++this.sequence, name: path, destination, parentId, parentEntryId: folderIds.get(path.split("/").slice(0, -1).join("/")), status: file.size > MAX_UPLOAD_SIZE ? "error" : "queued", percent: 0,
      error: file.size > MAX_UPLOAD_SIZE ? "파일당 최대 100 MB까지 업로드할 수 있습니다." : undefined, file: file.size > MAX_UPLOAD_SIZE ? undefined : file });
    this.entries = [...this.entries, ...jobs]; this.emit(); void this.pump();
  }
  cancel(id: number) {
    const entry = this.entries.find(entry => entry.id === id);
    if (!entry || !["queued", "uploading", "saving"].includes(entry.status)) return;
    this.update(id, { status: "cancelled" });
    if (this.active?.id === id) this.active.controller.abort();
  }
  cancelAll() { this.entries.forEach(entry => this.cancel(entry.id)); }
  retry(id: number) {
    if (this.active?.id === id) return;
    const entry = this.entries.find(entry => entry.id === id);
    if ((!entry?.file && entry?.kind !== "folder") || !entry || !["error", "cancelled"].includes(entry.status)) return;
    this.update(id, { status: "queued", percent: 0, error: undefined }); void this.pump();
  }
  clear() { if (this.active || this.entries.some(entry => entry.status === "queued")) return; this.entries = []; this.emit(); }
  private async pump() {
    if (this.active) return;
    let entry: UploadEntry | undefined;
    while ((entry = this.entries.find(entry => entry.status === "queued" && (entry.file || entry.kind === "folder")))) {
      const parent = entry.parentEntryId ? this.entries.find(parent => parent.id === entry!.parentEntryId) : undefined;
      if (!entry.parentEntryId || (parent?.status === "success" && parent.remoteId)) break;
      this.update(entry.id, { status: "error", error: "상위 폴더가 생성되지 않았습니다. 상위 폴더를 먼저 재시도한 뒤 이 항목을 재시도해 주세요." });
    }
    if (!entry) { this.onIdle?.(); return; }
    const parent = entry.parentEntryId ? this.entries.find(parent => parent.id === entry!.parentEntryId) : undefined;
    const parentId = parent?.remoteId || entry.parentId;
    const job = entry;
    const controller = new AbortController(); this.active = { id: entry.id, controller };
    this.update(entry.id, { status: "uploading" });
    try {
      if (job.kind === "folder") {
        this.update(job.id, { status: "saving" });
        const remoteId = await this.folderTransport(job.folderName!, parentId, controller.signal);
        if (!controller.signal.aborted) this.update(job.id, { remoteId });
      } else await this.transport(job.file!, parentId, controller.signal, percent => {
        if (!controller.signal.aborted) this.update(job.id, { percent, status: percent >= 100 ? "saving" : "uploading" });
      });
      if (!controller.signal.aborted) this.update(job.id, { status: "success", percent: 100, file: undefined });
    } catch (error) {
      this.update(entry.id, controller.signal.aborted ? { status: "cancelled" } : { status: "error", error: error instanceof Error ? error.message : "업로드 실패" });
    } finally {
      this.active = undefined;
      if (this.entries.some(entry => entry.status === "queued")) void this.pump(); else this.onIdle?.();
    }
  }
}
