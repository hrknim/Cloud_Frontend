export const TREE_ENTRY_LIMIT = 5000;
export type UploadTree = { directories: string[]; files: { path: string; file: File }[] };
export function validateUploadPath(path: string) {
  const parts = path.split("/");
  if (parts.length > 64 || parts.some(part => !part.trim() || part !== part.trim() || part.length > 255 || part === "." || part === ".." || /[\\\u0000-\u001f\u007f]/.test(part))) throw new Error("폴더 경로 또는 파일 이름이 올바르지 않습니다.");
  return parts;
}
export function uploadTree(files: { path: string; file: File }[], directories: string[] = []): UploadTree {
  const dirs = new Set<string>();
  const paths = new Set<string>();
  for (const directory of directories) {
    const parts = validateUploadPath(directory);
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  for (const { path, file } of files) {
    const parts = validateUploadPath(path);
    if (parts.at(-1) !== file.name || paths.has(path)) throw new Error("같은 경로에 중복된 파일이 있거나 파일 이름이 일치하지 않습니다.");
    paths.add(path);
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  if ([...paths].some(path => dirs.has(path))) throw new Error("같은 경로에 파일과 폴더가 있습니다.");
  if (dirs.size + files.length > TREE_ENTRY_LIMIT) throw new Error("한 번에 파일과 폴더를 합쳐 최대 5,000개까지 업로드할 수 있습니다.");
  return { directories: [...dirs].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)), files };
}

export interface UploadDirectoryHandle {
  kind: "directory"; name: string;
  values(): AsyncIterable<UploadDirectoryHandle | { kind: "file"; name: string; getFile(): Promise<File> }>;
}
export async function readUploadDirectory(root: UploadDirectoryHandle, signal?: AbortSignal): Promise<UploadTree> {
  const directories: string[] = [], files: UploadTree["files"] = [];
  const visit = async (directory: UploadDirectoryHandle, path: string) => {
    signal?.throwIfAborted();
    validateUploadPath(path); directories.push(path);
    if (directories.length + files.length > TREE_ENTRY_LIMIT) throw new Error("한 번에 최대 5,000개 항목까지 업로드할 수 있습니다.");
    for await (const child of directory.values()) {
      signal?.throwIfAborted();
      const childPath = `${path}/${child.name}`;
      if (child.kind === "directory") await visit(child, childPath);
      else { validateUploadPath(childPath); files.push({ path: childPath, file: await child.getFile() }); }
      if (directories.length + files.length > TREE_ENTRY_LIMIT) throw new Error("한 번에 최대 5,000개 항목까지 업로드할 수 있습니다.");
    }
  };
  await visit(root, root.name); signal?.throwIfAborted(); return uploadTree(files, directories);
}

export interface UploadDropEntry {
  name: string; isDirectory: boolean; isFile: boolean;
  file(success: (file: File) => void, failure: (error: DOMException) => void): void;
  createReader(): { readEntries(success: (entries: UploadDropEntry[]) => void, failure: (error: DOMException) => void): void };
}
export async function readDroppedTree(entries: UploadDropEntry[], signal?: AbortSignal): Promise<UploadTree> {
  const directories: string[] = [], files: UploadTree["files"] = [];
  const visit = async (entry: UploadDropEntry, path: string) => {
    signal?.throwIfAborted();
    validateUploadPath(path);
    if (entry.isFile) files.push({ path, file: await new Promise<File>((resolve, reject) => entry.file(resolve, reject)) });
    else if (entry.isDirectory) {
      directories.push(path);
      const reader = entry.createReader();
      // Chromium returns at most 100 entries per call; drain all batches.
      while (true) {
        signal?.throwIfAborted();
        const children = await new Promise<UploadDropEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!children.length) break;
        for (const child of children) await visit(child, `${path}/${child.name}`);
      }
    }
    if (directories.length + files.length > TREE_ENTRY_LIMIT) throw new Error("한 번에 최대 5,000개 항목까지 업로드할 수 있습니다.");
  };
  for (const entry of entries) await visit(entry, entry.name);
  signal?.throwIfAborted(); return uploadTree(files, directories);
}
