"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, Clock3, CloudUpload, HardDrive, Star, Users } from "lucide-react";
import type { Item } from "@/lib/drive/drive-api";
import { useUserSession } from "@/components/auth/use-user-session";
import { homeSections } from "@/lib/drive/drive-home";
import styles from "./drive-home.module.css";

type Props = {
  items: Item[]; totalBytes: number; disabled: boolean;
  onUpload: () => void; onStorage: () => void;
  onNavigate: (area: "recent" | "starred" | "shared") => void;
  renderItem: (item: Item, variant: "card" | "row") => ReactNode;
};
export default function DriveHome({ items, totalBytes, disabled, onUpload, onStorage, onNavigate, renderItem }: Props) {
  const user = useUserSession();
  const name = user?.displayName || user?.handle || "";
  const sections = homeSections(items);
  const bytes = totalBytes < 1024 ** 3 ? `${(totalBytes / 1024 ** 2).toFixed(1)} MB` : `${(totalBytes / 1024 ** 3).toFixed(2)} GB`;
  return <div className={styles.home}>
    <section className={styles.welcome} aria-label="환영 및 저장 현황">
      <div className={styles.greeting}><p className={styles.eyebrow}>나의 작업 공간</p><h2>{name ? `${name}님, 다시 만나서 반가워요` : "다시 만나서 반가워요"}</h2><p>최근 파일을 이어서 열거나, 새로운 작업을 시작해 보세요.</p></div>
      <div className={styles.quickActions}><button type="button" className={styles.storage} onClick={onStorage}><HardDrive size={18} /><span><strong>{bytes}</strong> 사용 중</span></button><button type="button" className={styles.upload} disabled={disabled} onClick={onUpload}><CloudUpload size={18} />파일 업로드</button></div>
    </section>
    <section aria-labelledby="home-recent-title">
      <div className={styles.sectionHeading}><div><h2 id="home-recent-title"><Clock3 size={18} />최근 수정한 파일</h2><p>폴더 위치와 관계없이 최근 수정된 파일을 모았어요.</p></div><button type="button" onClick={() => onNavigate("recent")}>전체 보기<ArrowUpRight size={15} /></button></div>
      {sections.recent.length ? <div className={styles.cards}>{sections.recent.map(item => <div key={item.id} className={styles.cardSlot}>{renderItem(item, "card")}</div>)}</div> : <p className={styles.empty}>아직 파일이 없어요. 파일을 업로드해 작업을 시작해 보세요.</p>}
    </section>
    <div className={styles.columns}>
      <section className={styles.listSection} aria-labelledby="home-starred-title"><div className={styles.sectionHeading}><div><h2 id="home-starred-title"><Star size={18} />즐겨찾기</h2><p>자주 사용하는 파일과 폴더를 빠르게 열어보세요.</p></div><button type="button" onClick={() => onNavigate("starred")}>전체 보기<ArrowUpRight size={15} /></button></div>
        {sections.starred.length ? <div className={styles.rows}>{sections.starred.map(item => <div key={item.id}>{renderItem(item, "row")}</div>)}</div> : <p className={styles.empty}>파일이나 폴더에 별표를 누르면 여기에 표시됩니다.</p>}
      </section>
      <section className={styles.listSection} aria-labelledby="home-shared-title"><div className={styles.sectionHeading}><div><h2 id="home-shared-title"><Users size={18} />공유받은 파일</h2><p>공유받은 파일과 폴더를 최근 수정 순으로 보여드려요.</p></div><button type="button" onClick={() => onNavigate("shared")}>전체 보기<ArrowUpRight size={15} /></button></div>
        {sections.shared.length ? <div className={styles.rows}>{sections.shared.map(item => <div key={item.id}>{renderItem(item, "row")}</div>)}</div> : <p className={styles.empty}>아직 공유받은 파일이 없습니다.</p>}
      </section>
    </div>
  </div>;
}
