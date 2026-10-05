"use client";

import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { driveRequest, type Item } from "@/lib/drive/drive-api";
import styles from "./drive.module.css";

type Profile = { handle: string; displayName: string; bio: string | null; avatarUrl: string | null };

export default function OwnerProfile({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const load = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError(""); setProfile(null); setImageFailed(false);
    try {
      const data = await driveRequest<{ profile: Profile }>(`/api/items/${item.id}/owner`, { signal: controller.signal });
      if (!controller.signal.aborted) setProfile(data.profile);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "프로필을 불러오지 못했습니다.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const name = item.owned === false ? item.owner?.displayName || "소유자" : "나";
  return <Popover open={open} onOpenChange={next => {
    setOpen(next);
    if (next) void load(); else pending.current?.abort();
  }}>
    <PopoverTrigger asChild>
      <button type="button" className={`${styles.ownerAvatar} ${styles.ownerProfileTrigger}`} aria-label={`${name} 프로필 보기`} draggable={false} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}>
        {item.owned === false ? Array.from(item.owner?.displayName || "?")[0] : "나"}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className={styles.ownerPopover} aria-label="소유자 프로필" onContextMenu={event => event.stopPropagation()}>
      {loading && <p role="status" className={styles.profileStatus}>프로필을 불러오는 중입니다.</p>}
      {error && <div className={styles.profileStatus}><p role="alert">{error}</p><button type="button" onClick={() => void load()}>다시 시도</button></div>}
      {profile && <>
        <div className={styles.profileHeading}>
          <div className={styles.profileAvatar}>
            {profile.avatarUrl && !imageFailed ?
              // Remote profile images come from the central server and may use any host.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <span aria-hidden="true">{Array.from(profile.displayName || profile.handle)[0]}</span>}
          </div>
          <div className={styles.profileIdentity}><strong>{profile.displayName}</strong><span>@{profile.handle.replace(/^@/, "")}</span></div>
        </div>
        <p className={styles.profileBio}>{profile.bio?.trim() || "아직 소개 문구가 없습니다."}</p>
      </>}
    </PopoverContent>
  </Popover>;
}
