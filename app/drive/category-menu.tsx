"use client";

import { Box, ChevronDown, File, Folder, ImageIcon, LayoutGrid } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Item } from "./drive-api";
import styles from "./drive.module.css";

export type Category = "all" | Item["kind"];
const categories = [
  { id: "all", label: "전체 항목", icon: LayoutGrid },
  { id: "folder", label: "폴더", icon: Folder },
  { id: "3d", label: "3D 파일", icon: Box },
  { id: "image", label: "이미지", icon: ImageIcon },
  { id: "file", label: "기타 파일", icon: File },
] as const;

export default function CategoryMenu({ value, onChange }: { value: Category; onChange: (value: Category) => void }) {
  const selected = categories.find(category => category.id === value) || categories[0];
  const Icon = selected.icon;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={`${styles.categoryButton} ${value !== "all" ? styles.categoryActive : ""}`} aria-label={`카테고리: ${selected.label}`}>
        <Icon size={16} /><span>{selected.label}</span><ChevronDown size={14} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className={styles.categoryMenu}>
      <DropdownMenuRadioGroup value={value} onValueChange={next => { if (categories.some(category => category.id === next)) onChange(next as Category); }}>
        {categories.map(({ id, label, icon: CategoryIcon }) => <DropdownMenuRadioItem key={id} value={id}><CategoryIcon size={16} />{label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
