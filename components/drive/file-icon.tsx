import { Archive, Box, Code2, File, FileText, Folder, ImageIcon, Music, Palette, Presentation, Sheet, Type, Video, type LucideIcon } from "lucide-react";
import type { FileKind } from "@/lib/files/file-types";
import styles from "./file-icon.module.css";

export const fileIcons: Record<FileKind, LucideIcon> = {
  folder: Folder, "3d": Box, image: ImageIcon, document: FileText, spreadsheet: Sheet,
  presentation: Presentation, video: Video, audio: Music, archive: Archive, code: Code2,
  design: Palette, font: Type, file: File,
};

export const fileToneClasses = Object.fromEntries(Object.keys(fileIcons).map(kind => [kind, `${styles.tone} ${styles[kind === "3d" ? "model" : kind]}`])) as Record<FileKind, string>;

export default function ItemIcon({ kind, size = 19 }: { kind: FileKind; size?: number }) {
  const Icon = fileIcons[kind];
  return <Icon size={size} className={`${styles.icon} ${fileToneClasses[kind]}`} data-file-kind={kind} aria-hidden="true" />;
}
