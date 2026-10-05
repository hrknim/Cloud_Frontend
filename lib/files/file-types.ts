// Classification only: a known extension does not imply browser preview support.
export const fileCategories = [
  { id: "folder", label: "폴더" },
  { id: "3d", label: "3D·CAD 파일" },
  { id: "image", label: "이미지" },
  { id: "document", label: "문서·텍스트" },
  { id: "spreadsheet", label: "스프레드시트" },
  { id: "presentation", label: "프레젠테이션" },
  { id: "video", label: "영상" },
  { id: "audio", label: "음원" },
  { id: "archive", label: "압축 파일" },
  { id: "code", label: "코드·설정" },
  { id: "design", label: "디자인 원본" },
  { id: "font", label: "폰트" },
  { id: "file", label: "기타 파일" },
] as const;

export type FileKind = typeof fileCategories[number]["id"];
export function isEpubPreview(name: string, mimeType: string | null): boolean {
  return name.toLowerCase().endsWith(".epub") || (!name.includes(".") && (mimeType || "").split(";")[0].trim().toLowerCase() === "application/epub+zip");
}
export function isArchivePreview(name: string, mimeType: string | null): boolean {
  if (name.toLowerCase().endsWith(".zip")) return true;
  return !name.includes(".") && ["application/zip", "application/x-zip-compressed"].includes((mimeType || "").split(";")[0].trim().toLowerCase());
}
export function isPresentationPreview(name: string, mimeType: string | null): boolean {
  if (name.toLowerCase().endsWith(".pptx")) return true;
  return !name.includes(".") && (mimeType || "").split(";")[0].trim().toLowerCase() === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}
export function isWordPreview(name: string, mimeType: string | null): boolean {
  if (name.toLowerCase().endsWith(".docx")) return true;
  return !name.includes(".") && (mimeType || "").split(";")[0].trim().toLowerCase() === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}
export function isSpreadsheetPreview(name: string, mimeType: string | null): boolean {
  const extension = name.toLowerCase().split(".").pop() || "";
  if (["xlsx", "xls", "xlsm", "xlsb", "xlt", "xltx", "xltm", "ods", "ots", "csv", "tsv"].includes(extension)) return true;
  if (name.includes(".")) return false;
  return ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet", "text/csv", "text/tab-separated-values"].includes((mimeType || "").split(";")[0].trim().toLowerCase());
}
const mediaTypes: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg", mkv: "video/x-matroska", avi: "video/x-msvideo", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", wave: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg" };
export function mediaPreviewMime(name: string, mimeType: string | null): string | null {
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (/^(audio|video)\/[a-z0-9.+-]+$/.test(mime)) return mime;
  return mediaTypes[name.toLowerCase().split(".").pop() || ""] || null;
}

export const extensions: Partial<Record<FileKind, readonly string[]>> = {
  "3d": ["blend", "glb", "gltf", "obj", "fbx", "stl", "3ds", "max", "ma", "mb", "c4d", "dae", "ply", "abc", "usd", "usda", "usdc", "usdz", "3mf", "amf", "mtl", "dwg", "dxf", "step", "stp", "iges", "igs", "ifc", "rvt", "rfa", "skp", "3dm", "sldprt", "sldasm", "slddrw", "ipt", "iam", "f3d", "f3z", "stpnc"],
  image: ["jpg", "jpeg", "jpe", "jfif", "png", "gif", "webp", "avif", "bmp", "dib", "tif", "tiff", "svg", "svgz", "ico", "icns", "heic", "heif", "hif", "jxl", "apng", "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2", "raf", "pef", "srw", "exr", "hdr", "tga", "dds", "ktx", "ktx2"],
  document: ["pdf", "doc", "docx", "docm", "dot", "dotx", "odt", "ott", "rtf", "txt", "text", "md", "markdown", "rst", "log", "hwp", "hwpx", "hwt", "pages", "epub", "mobi", "azw", "azw3", "djvu", "djv", "tex"],
  spreadsheet: ["xls", "xlsx", "xlsm", "xlsb", "xlt", "xltx", "xltm", "ods", "ots", "csv", "tsv", "numbers"],
  presentation: ["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "odp", "otp", "key"],
  video: ["mp4", "m4v", "mov", "mkv", "webm", "avi", "wmv", "flv", "mpg", "mpeg", "mpe", "m2v", "m2ts", "mts", "3gp", "3g2", "ogv", "vob", "mxf"],
  audio: ["mp3", "wav", "wave", "flac", "aac", "m4a", "ogg", "oga", "opus", "wma", "aif", "aiff", "alac", "mid", "midi", "amr", "ape", "caf"],
  archive: ["zip", "zipx", "rar", "7z", "tar", "gz", "gzip", "bz2", "bzip2", "xz", "zst", "zstd", "tgz", "tbz", "tbz2", "txz", "lz", "lzma", "cab", "jar", "war"],
  code: ["js", "jsx", "ts", "tsx", "mjs", "cjs", "html", "htm", "css", "scss", "sass", "less", "vue", "svelte", "astro", "json", "jsonc", "jsonl", "yaml", "yml", "xml", "toml", "ini", "cfg", "conf", "env", "sql", "py", "ipynb", "rb", "php", "java", "kt", "kts", "scala", "go", "rs", "c", "h", "cpp", "cc", "cxx", "hpp", "cs", "swift", "m", "mm", "dart", "lua", "r", "sh", "bash", "zsh", "ps1", "bat", "cmd", "pl", "pm", "ex", "exs", "erl", "hrl", "clj", "cljs", "hs", "fs", "fsx", "proto", "graphql", "gql", "prisma", "lock"],
  design: ["psd", "psb", "ai", "eps", "sketch", "fig", "xd", "indd", "idml", "afdesign", "afphoto", "afpub", "procreate", "kra", "ora", "clip", "xcf", "aep", "aepx", "prproj", "drp"],
  font: ["ttf", "otf", "woff", "woff2", "eot", "ttc"],
};

const extensionKinds = new Map(Object.entries(extensions).flatMap(([kind, values]) => values.map(extension => [extension, kind as FileKind] as const)));
const textExtensions = new Set([
  ...extensions.code!, "txt", "text", "md", "markdown", "mdx", "rst", "log", "tex", "rtf", "csv", "tsv",
  "srt", "vtt", "ass", "ssa", "lrc", "adoc", "asc", "nfo", "properties", "config", "cnf", "rc", "service", "desktop", "manifest", "map",
  "svg", "gltf", "obj", "mtl", "usda", "dae", "step", "stp", "iges", "igs", "ifc", "dxf", "ma",
  "cmake", "gradle", "dockerfile", "gitignore", "gitattributes", "editorconfig", "npmrc", "nvmrc", "yarnrc", "babelrc", "eslintrc", "prettierrc",
]);
const textNames = new Set(["dockerfile", "containerfile", "makefile", "gnumakefile", "cmakelists.txt", "readme", "license", "licence", "changelog", "authors", "notice", "procfile", "gemfile", "rakefile", "justfile", ".env"]);

export function isTextFile(name: string, mimeType: string | null): boolean {
  const filename = name.toLowerCase();
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  // .ts may be either source code or a binary transport-stream video.
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return false;
  if (textNames.has(filename) || filename.startsWith(".env.")) return true;
  const extension = filename.includes(".") ? filename.split(".").pop()! : "";
  if (textExtensions.has(extension)) return true;
  // Known binary formats must not open as text even with an inaccurate MIME.
  if (extensionKinds.has(extension)) return false;
  return mime.startsWith("text/") || ["application/json", "application/ld+json", "application/xml", "application/javascript", "application/yaml", "application/toml"].includes(mime) || mime.endsWith("+json") || mime.endsWith("+xml");
}
export const mimeKinds: Record<string, FileKind> = {
  "application/pdf": "document", "application/msword": "document", "application/rtf": "document", "application/epub+zip": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document", "application/vnd.oasis.opendocument.text": "document",
  "application/vnd.ms-excel": "spreadsheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet", "application/vnd.oasis.opendocument.spreadsheet": "spreadsheet", "text/csv": "spreadsheet", "text/tab-separated-values": "spreadsheet",
  "application/vnd.ms-powerpoint": "presentation", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation", "application/vnd.oasis.opendocument.presentation": "presentation",
  "application/zip": "archive", "application/x-zip-compressed": "archive", "application/x-7z-compressed": "archive", "application/vnd.rar": "archive", "application/x-rar-compressed": "archive", "application/gzip": "archive", "application/x-tar": "archive", "application/x-bzip2": "archive", "application/x-xz": "archive", "application/zstd": "archive",
  "application/json": "code", "application/ld+json": "code", "application/xml": "code", "application/javascript": "code", "text/javascript": "code", "text/html": "code", "text/css": "code", "text/xml": "code", "application/yaml": "code", "text/yaml": "code", "application/toml": "code",
  "image/vnd.adobe.photoshop": "design", "application/postscript": "design", "application/vnd.adobe.illustrator": "design",
  "application/font-woff": "font", "application/vnd.ms-fontobject": "font", "application/x-font-ttf": "font", "application/x-font-opentype": "font",
};

export function classifyFile(name: string, mimeType: string | null): FileKind {
  const filename = name.toLowerCase();
  if (["dockerfile", "makefile", "cmakelists.txt", ".gitignore", ".gitattributes", ".editorconfig", ".env"].includes(filename) || filename.startsWith(".env.")) return "code";
  if (filename.endsWith(".ts") && mimeType?.toLowerCase().startsWith("video/")) return "video";
  const extension = filename.includes(".") ? filename.split(".").pop()! : "";
  const kind = extensionKinds.get(extension);
  if (kind) return kind;
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (mimeKinds[mime]) return mimeKinds[mime];
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("model/")) return "3d";
  if (mime.startsWith("font/")) return "font";
  if (mime.startsWith("text/")) return "document";
  return "file";
}
