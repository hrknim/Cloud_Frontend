"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Link2, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { driveRequest, type Item } from "@/lib/drive/drive-api";
import styles from "./drive.module.css";
import { copyText } from "@/lib/utils";

type Share = { userId: string; handle: string; displayName: string; role: "VIEWER" | "EDITOR" };
type InheritedShare = Share & { sourceId: string; sourceName: string };
type ShareList = { shares: Share[]; inherited: InheritedShare[] };
type LinkSettings = { enabled: boolean; access: "RESTRICTED" | "PUBLIC"; path: string | null };

export default function ShareDialog({ item, onClose, onChanged }: { item: Item; onClose: () => void; onChanged: () => Promise<void> }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [inherited, setInherited] = useState<InheritedShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<Share["role"]>("VIEWER");
  const [link, setLink] = useState<LinkSettings | null>(null);
  const [linkError, setLinkError] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    if (item.kind !== "folder") void driveRequest<LinkSettings>(`/api/links?itemId=${item.id}`, { signal: abort.signal })
      .then(data => { if (!abort.signal.aborted) {setLink(data); setLinkError("");} })
      .catch(error => { if (!abort.signal.aborted) setLinkError(error instanceof Error ? error.message : "링크 설정을 불러오지 못했습니다."); });
    void driveRequest<ShareList>(`/api/shares?itemId=${item.id}`, { signal: abort.signal })
      .then(data => { if (!abort.signal.aborted) { setShares(data.shares); setInherited(data.inherited); } })
      .catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "공유 목록을 불러오지 못했습니다."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [item.id, item.kind]);
  const change = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      await action();
      const data = await driveRequest<ShareList>(`/api/shares?itemId=${item.id}`);
      setShares(data.shares); setInherited(data.inherited); setError(""); await onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "공유 설정을 변경하지 못했습니다."); }
    finally { pending.current = false; setBusy(false); }
  };
  const add = () => change(async () => {
    await driveRequest("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, handle: handle.trim(), role }) });
    setHandle(""); toast.success("공유 사용자를 추가했습니다.");
  });
  const update = (share: Share, next: Share["role"] | null) => change(async () => {
    await driveRequest("/api/shares", { method: next ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, userId: share.userId, ...(next ? { role: next } : {}) }) });
    toast.success(next ? "권한을 변경했습니다." : "공유를 해제했습니다.");
  });
  const updateLink = (access: "DISABLED" | "RESTRICTED" | "PUBLIC") => change(async () => {
    const next = await driveRequest<LinkSettings>("/api/links", { method: access === "DISABLED" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, ...(access === "DISABLED" ? {} : { access }) }) });
    setLink(next); setLinkError(""); toast.success(access === "DISABLED" ? "공유 링크를 해제했습니다. 기존 링크는 사용할 수 없습니다." : "공유 링크 설정을 저장했습니다.");
  });
  const copyLink = async () => {
    if (!link?.path) return;
    const copied = await copyText(new URL(link.path, window.location.origin).href, linkInput.current);
    if (copied) toast.success("공유 링크를 복사했습니다.");
    else toast.info("브라우저가 자동 복사를 제한했습니다. 선택된 링크를 Ctrl+C 또는 ⌘C로 복사해 주세요. 모바일에서는 주소를 길게 눌러 복사할 수 있습니다.");
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className={styles.shareDialog}>
    <DialogTitle className="pr-6 break-all">공유 · {item.name}</DialogTitle>
    <DialogDescription>사용자 핸들로 공유할 사람을 추가하세요. 여러 명을 각각 추가할 수 있습니다.</DialogDescription>
    <form className={styles.shareForm} onSubmit={event => { event.preventDefault(); if (handle.trim()) void add(); }}>
      <label className={styles.srOnly} htmlFor="share-handle">공유할 사용자 핸들</label>
      <input id="share-handle" placeholder="@사용자 핸들" autoFocus required maxLength={255} value={handle} disabled={busy || loading || !!error} onChange={event => setHandle(event.target.value)} />
      <select aria-label="추가할 사용자의 권한" value={role} disabled={busy || loading || !!error} onChange={event => setRole(event.target.value as Share["role"])}><option value="VIEWER">보기</option><option value="EDITOR">편집</option></select>
      <button className={styles.uploadButton} disabled={busy || loading || !!error || !handle.trim()}>{busy ? "저장 중…" : "추가"}</button>
    </form>
    {error && <p role="alert" className={styles.moveHint}>{error}</p>}
    <div className={styles.shareHeading}><Users size={17} /><strong>접근 권한이 있는 사람</strong><span>{new Set([...shares, ...inherited].map(share => share.userId)).size + 1}명</span></div>
    <div className={styles.shareList}>
      <div className={styles.sharePerson}><span className={styles.shareAvatar}>나</span><div><strong>나</strong><small>파일·폴더 소유자</small></div><span>소유자</span></div>
      {loading && <p role="status">공유 목록을 불러오는 중입니다.</p>}
      {shares.map(share => <div className={styles.sharePerson} key={share.userId}><span className={styles.shareAvatar}>{share.handle ? share.displayName.charAt(0) : "?"}</span><div><strong>{share.displayName}</strong>{share.handle && <small>@{share.handle}</small>}</div><select aria-label={`${share.handle || share.displayName} 권한`} disabled={busy} value={share.role} onChange={event => void update(share, event.target.value as Share["role"])}><option value="VIEWER">보기</option><option value="EDITOR">편집</option></select><button className={styles.iconButton} disabled={busy} aria-label={`${share.handle || share.displayName} 공유 해제`} onClick={() => void update(share, null)}><X size={16} /></button></div>)}
      {inherited.map(share => <div className={styles.sharePerson} key={`inherited-${share.userId}`}><span className={styles.shareAvatar}>{share.handle ? share.displayName.charAt(0) : "?"}</span><div><strong>{share.displayName}</strong><small>{share.handle && `@${share.handle} · `}{share.sourceName}에서 상속</small></div><span>{share.role === "EDITOR" ? "편집" : "보기"}</span></div>)}
    </div>
    <p className={styles.moveHint}>보기: 열람·다운로드 / 편집: 이름 변경, 공유 폴더에 업로드·폴더 생성<br />공유 관리·이동·삭제는 소유자만 할 수 있습니다.{item.kind === "folder" && <><br />폴더 공유는 현재와 앞으로 추가되는 하위 항목에 적용됩니다.</>}</p>
    {inherited.length > 0 && <p className={styles.moveHint}>상속된 권한은 상위 폴더의 공유 창에서 변경하세요. 직접 공유를 해제해도 상속된 접근 권한은 유지됩니다.</p>}
    {item.kind !== "folder" && <section className={styles.linkSharing} aria-label="파일 링크 공유">
      <div className={styles.shareHeading}><Link2 size={17} /><strong>링크 공유</strong></div>
      {linkError ? <p role="alert" className={styles.moveHint}>{linkError}</p> : <>
        <label htmlFor="link-access">접근 권한</label>
        <select id="link-access" disabled={busy || !link} value={link?.enabled ? link.access : "DISABLED"} onChange={event => void updateLink(event.target.value as "DISABLED" | "RESTRICTED" | "PUBLIC")}>
          <option value="DISABLED">링크 공유 끄기</option><option value="RESTRICTED">내가 공유한 사용자만</option><option value="PUBLIC">링크가 있는 누구나</option>
        </select>
        <p className={styles.moveHint}>{link?.access === "PUBLIC" && link.enabled ? "링크를 가진 사람은 로그인 없이 파일을 열람하고 다운로드할 수 있습니다." : "공유 목록 또는 상위 폴더의 권한이 있는 사용자만 로그인 후 열람할 수 있습니다."}<br />링크를 해제하거나 파일을 휴지통으로 이동하면 기존 링크는 무효가 됩니다.</p>
        {link?.path && <div className={styles.linkCopy}><input ref={linkInput} aria-label="파일 공유 링크" readOnly value={typeof window === "undefined" ? link.path : new URL(link.path, window.location.origin).href} onFocus={event => event.target.select()} /><button type="button" className={styles.uploadButton} disabled={busy} onClick={() => void copyLink()}><Copy size={16} />복사</button></div>}
      </>}
    </section>}
    <div className={styles.renameActions}><button className={styles.uploadButton} disabled={busy} onClick={onClose}>완료</button></div>
  </DialogContent></Dialog>;
}
