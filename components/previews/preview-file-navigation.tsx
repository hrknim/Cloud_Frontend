"use client";

import { createContext, useContext } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Item } from "@/lib/drive/drive-api";
import styles from "./image-preview.module.css";

type Navigation = { previous: Item | null; next: Item | null; busy: boolean; onSelect: (item: Item) => void };
const NavigationContext = createContext<Navigation | null>(null);
export const PreviewNavigationProvider = NavigationContext.Provider;
export default function PreviewFileNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) return null;
  const { previous, next, busy, onSelect } = navigation;
  return <div className={styles.fileNavigation} role="group" aria-label="같은 폴더의 파일 이동">
    <button className={styles.button} aria-label="이전 파일" title={previous ? `이전 파일: ${previous.name}` : "이전 미리보기 파일이 없습니다."} disabled={busy || !previous} onClick={() => { if (previous) onSelect(previous); }}><ChevronLeft size={22} /></button>
    <button className={styles.button} aria-label="다음 파일" title={next ? `다음 파일: ${next.name}` : "다음 미리보기 파일이 없습니다."} disabled={busy || !next} onClick={() => { if (next) onSelect(next); }}><ChevronRight size={22} /></button>
  </div>;
}
