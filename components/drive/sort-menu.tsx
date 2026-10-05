"use client";

import { ArrowDownWideNarrow, ArrowDownAZ, ChevronDown, Clock3 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SortOrder } from "@/lib/drive/drive-api";
import styles from "./drive.module.css";

const orders = [
  { id: "modified", label: "최근 수정순", icon: Clock3 },
  { id: "name", label: "이름순", icon: ArrowDownAZ },
  { id: "size", label: "파일 크기순", icon: ArrowDownWideNarrow },
] as const;

export default function SortMenu({ value, onChange }: { value: SortOrder; onChange: (value: SortOrder) => void }) {
  const selected = orders.find(order => order.id === value) || orders[0];
  const Icon = selected.icon;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={styles.categoryButton} aria-label={`정렬: ${selected.label}`}><Icon size={16} /><span>{selected.label}</span><ChevronDown size={14} /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className={styles.categoryMenu}>
      <DropdownMenuRadioGroup value={value} onValueChange={next => { if (orders.some(order => order.id === next)) onChange(next as SortOrder); }}>
        {orders.map(({ id, label, icon: OrderIcon }) => <DropdownMenuRadioItem key={id} value={id}><OrderIcon size={16} />{label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
