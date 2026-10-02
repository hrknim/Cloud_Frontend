"use client";

import { FolderPlus, Plus, Upload } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import styles from "./drive.module.css";

export default function NewMenu({ onFolder, onUpload, disabled, className }: {
  onFolder: () => void; onUpload: () => void; disabled: boolean; className: string;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className={className} disabled={disabled}><Plus size={22} />새로 만들기</button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className={styles.newMenu}>
      <DropdownMenuItem onSelect={onFolder}><FolderPlus />새 폴더</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onUpload}><Upload />파일 업로드</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
