"use client";

import { FolderPlus, FolderUp, Plus, Upload } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import styles from "./drive.module.css";

export function NewMenuActions({ onFolder, onUpload, onFolderUpload, disabled, context = false }: {
  onFolder: () => void; onUpload: () => void; onFolderUpload?: () => void; disabled: boolean; context?: boolean;
}) {
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;
  return <>
    <Item disabled={disabled} onSelect={onFolder}><FolderPlus />새 폴더</Item>
    <Separator />
    <Item disabled={disabled} onSelect={onUpload}><Upload />파일 업로드</Item>
    {onFolderUpload && <Item disabled={disabled} onSelect={onFolderUpload}><FolderUp />폴더 업로드</Item>}
  </>;
}

export default function NewMenu({ onFolder, onUpload, onFolderUpload, disabled, className }: {
  onFolder: () => void; onUpload: () => void; onFolderUpload?: () => void; disabled: boolean; className: string;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className={className} ><Plus size={22} />새로 만들기</button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className={styles.newMenu}>
      <NewMenuActions onFolder={onFolder} onUpload={onUpload} onFolderUpload={onFolderUpload} disabled={disabled} />
    </DropdownMenuContent>
  </DropdownMenu>;
}
