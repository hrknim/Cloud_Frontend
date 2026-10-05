"use client";

import { ChevronDown, LayoutGrid } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Item } from "@/lib/drive/drive-api";
import styles from "./drive.module.css";
import { fileCategories } from "@/lib/files/file-types";
import ItemIcon, { fileIcons } from "./file-icon";

export type Category = "all" | Item["kind"];
const categories = [
  { id: "all", label: "전체 항목", icon: LayoutGrid },
  ...fileCategories.map(category => ({ ...category, icon: fileIcons[category.id] })),
] as const;

export default function CategoryMenu({ value, onChange }: { value: Category; onChange: (value: Category) => void }) {
  const selected = categories.find(category => category.id === value) || categories[0];
  const Icon = selected.icon;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={`${styles.categoryButton} ${value !== "all" ? styles.categoryActive : ""}`} aria-label={`카테고리: ${selected.label}`}>
        {selected.id === "all" ? <Icon size={16} /> : <ItemIcon kind={selected.id} size={16} />}<span>{selected.label}</span><ChevronDown size={14} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className={styles.categoryMenu}>
      <DropdownMenuRadioGroup value={value} onValueChange={next => { if (categories.some(category => category.id === next)) onChange(next as Category); }}>
        {categories.map(({ id, label, icon: CategoryIcon }) => <DropdownMenuRadioItem key={id} value={id}>{id === "all" ? <CategoryIcon size={16} /> : <ItemIcon kind={id} size={16} />}{label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
