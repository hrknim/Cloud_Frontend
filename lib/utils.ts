import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function copyText(text: string, field: HTMLInputElement | null): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { /* Permission denial: try copying the visible selection instead. */ }
  }
  if (!field?.isConnected) return false;
  const document = field.ownerDocument;
  const previous = document.activeElement;
  // Use the input inside the dialog so its focus trap does not steal focus
  // from a temporary textarea appended outside the dialog.
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, field.value.length);
  let copied = false;
  try { copied = document.execCommand?.("copy") === true; }
  catch { /* Browser may block both programmatic clipboard methods. */ }
  if (copied && previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
  // On failure keep the URL selected for Ctrl/Cmd+C or the mobile copy menu.
  return copied;
}
