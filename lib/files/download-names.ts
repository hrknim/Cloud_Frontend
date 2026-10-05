// Bound client Blob size and stay below JSZip's non-ZIP64 output limits.
export const DOWNLOAD_BUNDLE_LIMIT = 1024 ** 3;

// Stay below both UTF-8 filename limits (Linux/macOS) and UTF-16 limits (Windows).
export const DOWNLOAD_NAME_BYTES = 240;
const encoder = new TextEncoder();
function clipBytes(value: string, limit: number) {
  let result = "", bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > limit) break;
    result += character; bytes += size;
  }
  return result;
}

/** Download-only conversion: never rename the original Cloud item. */
export function downloadName(name: string, index = 1) {
  let safe = name.normalize("NFC").replace(/[<>:"\\/|?*\u0000-\u001f\u007f]/g, "_").trim().replace(/[. ]+$/, "");
  if (!safe) safe = "file";
  // Device names remain reserved even with an extension or superscript digits.
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 ? clipBytes(safe.slice(dot), 64).replace(/[. ]+$/, "") : "";
  const suffix = index > 1 ? ` (${index})` : "";
  const stem = clipBytes(dot > 0 ? safe.slice(0, dot) : safe, DOWNLOAD_NAME_BYTES - encoder.encode(extension + suffix).length).replace(/[. ]+$/, "") || "file";
  return `${stem}${suffix}${extension}`;
}

/** Sibling names are unique after sanitizing, normalization and shortening. */
export function downloadEntryNames(names: string[]) {
  const used = new Set<string>();
  return names.map(name => {
    let candidate = downloadName(name), index = 2;
    while (used.has(candidate.toLowerCase())) candidate = downloadName(name, index++);
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
