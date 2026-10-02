"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Box, ChevronRight, Clock3, Cloud, File, Folder, Grid2X2, HardDrive, Home, ImageIcon, Info, List, Menu, ShieldCheck, Star, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import styles from "./drive.module.css";
import { useDriveSearch } from "./drive-search";
import { compareDriveItems, driveRequest, folderPath, itemEndpoint, loadDriveItems, patchDriveItem, type Item, type SortOrder } from "./drive-api";
import NewMenu from "./new-menu";
import MoveDialog from "./move-dialog";
import CategoryMenu, { type Category } from "./category-menu";
import SortMenu from "./sort-menu";
import { useDriveDrag } from "./use-drive-drag";
import ItemMenu from "./item-menu";
import ShareDialog from "./share-dialog";

type Area = "home" | "drive" | "shared" | "recent" | "starred" | "trash";
const navigation = [
  { id: "home", label: "홈", icon: Home }, { id: "drive", label: "내 드라이브", icon: HardDrive },
  { id: "shared", label: "공유된 파일", icon: Users }, { id: "recent", label: "최근 파일", icon: Clock3 },
  { id: "starred", label: "즐겨찾기", icon: Star }, { id: "trash", label: "휴지통", icon: Trash2 },
] as const;
const labels = { folder: "폴더", "3d": "3D 파일", image: "이미지", file: "기타 파일" };
function ItemIcon({ kind }: { kind: Item["kind"] }) {
  const Icon = kind === "folder" ? Folder : kind === "3d" ? Box : kind === "image" ? ImageIcon : File;
  return <Icon size={19} className={styles[kind === "3d" ? "modelIcon" : kind === "image" ? "imageIcon" : "fileIcon"]} />;
}
function Artwork({ item }: { item: Item }) {
  if (item.url && item.kind === "image") return <div className={styles.artwork} style={{ backgroundImage: `url("${item.url}")`, backgroundSize: "cover", backgroundPosition: "center" }} role="img" aria-label={item.name} />;
  return <div className={`${styles.artwork} ${styles.generic}`} aria-hidden="true">
    <ItemIcon kind={item.kind} />
  </div>;
}

export default function Drive() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadSequence = useRef(0);
  const [rename, setRename] = useState("");
  const [area, setArea] = useState<Area>("drive");
  const { query, setQuery } = useDriveSearch();
  const [filter, setFilter] = useState<Category>("all");
  const [view, setView] = useState("list");
  const [sortOrder, setSortOrder] = useState<SortOrder>("modified");
  const [folder, setFolder] = useState<Item | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [renameTarget, setRenameTarget] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [sharing, setSharing] = useState<Item | null>(null);
  const [moving, setMoving] = useState<Item | null>(null);
  const [dialog, setDialog] = useState<"folder" | "help" | "storage" | null>(null);
  const [folderName, setFolderName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    try {
      const next = await loadDriveItems(signal);
      if (sequence !== loadSequence.current || signal?.aborted) return;
      setItems(next); setLoadError("");
    } catch (error) {
      if (sequence === loadSequence.current && !signal?.aborted) { setItems([]); setLoadError(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); }
    } finally { if (sequence === loadSequence.current && !signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++loadSequence.current;
    void loadDriveItems(controller.signal).then(next => {
      if (sequence === loadSequence.current && !controller.signal.aborted) { setItems(next); setLoadError(""); }
    }).catch(error => {
      if (sequence === loadSequence.current && !controller.signal.aborted) { setItems([]); setLoadError(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); }
    }).finally(() => {
      if (sequence === loadSequence.current && !controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);
  const runAction = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const navigate = (next: Area) => { setArea(next); setFolder(null); setFilter("all"); setQuery(""); setSidebarOpen(false); };
  const currentFolder = folder ? items.find(item => item.id === folder.id && !item.deleted) || null : null;
  const path = folderPath(items, currentFolder?.id);
  const sharedFolder = currentFolder?.owned === false;
  const canAdd = area !== "trash" && area !== "shared" && currentFolder?.permission !== "VIEWER";
  const visible = items.filter(item => {
    if (area === "trash" ? !item.deleted : item.deleted) return false;
    if (area === "shared" && !(item.owned === false && item.sharedRoot)) return false;
    if (area === "starred" && (!item.starred || item.owned === false)) return false;
    if (area === "recent" && item.kind === "folder") return false;
    if ((area === "drive" || area === "home") && item.parent !== currentFolder?.id) return false;
    if ((area === "drive" || area === "home") && !currentFolder && item.owned === false) return false;
    return item.name.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || item.kind === filter);
  }).sort((a, b) => compareDriveItems(a, b, sortOrder));
  const title = navigation.find(nav => nav.id === area)?.label || "내 드라이브";
  const totalBytes = items.reduce((sum, item) => sum + (item.owned === false ? 0 : item.bytes), 0);
  const browseFolder = (next: Item | null) => { setFolder(next); setArea("drive"); setQuery(""); setFilter("all"); };
  const beginFolder = () => { setFolderName(""); setDialog("folder"); };
  const beginUpload = () => input.current?.click();
  const selectItem = (item: Item) => setSelected(item);
  const beginRename = (item: Item) => { setRename(item.name); setRenameTarget(item); };
  const openItem = (item: Item) => { if (item.kind === "folder" && area !== "trash") { setFolder(item); setArea("drive"); setQuery(""); setFilter("all"); } else selectItem(item); };
  const toggleStar = (item: Item) => runAction(async () => {
    const updated = await patchDriveItem(item, { starred: !item.starred });
    setItems(prev => prev.map(current => current.id === item.id ? updated : current));
    if (selected?.id === item.id) setSelected(updated);
  });
  const addFiles = (incoming: FileList | File[]) => {
    if (!canAdd) { toast.error("파일을 추가할 내 폴더 또는 편집 가능한 공유 폴더를 열어 주세요."); return; }
    const pending = Array.from(incoming);
    return runAction(async () => {
      let uploaded = 0;
      const failures: string[] = [];
      for (const file of pending) {
        if (file.size > 100 * 1024 ** 2) { failures.push(`${file.name}: 최대 100 MB`); continue; }
        const form = new FormData(); form.set("file", file);
        if (currentFolder) form.set("parentId", currentFolder.id);
        try { await driveRequest("/api/files", { method: "POST", body: form }); uploaded++; }
        catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : "업로드 실패"}`); }
      }
      setArea("drive"); setQuery(""); setFilter("all"); await reload();
      if (uploaded) toast.success(`${uploaded}개 파일을 저장했습니다.`);
      if (failures.length) toast.error(`${failures.length}개 파일 업로드 실패`, { description: failures.slice(0, 3).join(" / ") });
    });
  };
  const createFolder = () => runAction(async () => {
    await driveRequest("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: folderName.trim(), parentId: currentFolder?.id || null }) });
    setArea("drive"); setFilter("all"); setQuery(""); setDialog(null); setSidebarOpen(false);
    await reload(); toast.success("폴더를 만들었습니다.");
  });
  const deleteOrRestore = (item: Item) => runAction(async () => {
    if (item.deleted) await patchDriveItem(item, { restore: true });
    else await driveRequest(itemEndpoint(item), { method: "DELETE" });
    setSelected(null); await reload(); toast.success(item.deleted ? "복원했습니다." : "휴지통으로 이동했습니다.");
  });
  const renameItem = (item: Item) => runAction(async () => {
    const updated = await patchDriveItem(item, { name: rename.trim() });
    if (selected?.id === item.id) setSelected(updated);
    setRenameTarget(null); await reload(); toast.success("이름을 변경했습니다.");
  });
  const permanentlyDelete = () => runAction(async () => {
    if (!deleteTarget?.deleted) return;
    await driveRequest(`${itemEndpoint(deleteTarget)}?permanent=true`, { method: "DELETE" });
    setItems(previous => previous.filter(item => item.id !== deleteTarget.id));
    if (selected?.id === deleteTarget.id) setSelected(null);
    setDeleteTarget(null); await reload(); toast.success("완전 삭제했습니다.");
  });
  const moveTo = (item: Item, destination?: string) => runAction(async () => {
    const updated = await patchDriveItem(item, { parentId: destination || null });
    setItems(previous => previous.map(item => item.id === updated.id ? updated : item));
    if (selected?.id === item.id) setSelected(updated);
    setMoving(null); await reload();
    toast.success("이동했습니다.", { description: `${updated.name} → ${items.find(item => item.id === destination)?.name || "내 드라이브"}` });
  });
  const moveItem = (destination?: string) => { if (moving) return moveTo(moving, destination); };
  const drag = useDriveDrag(items, busy || loading, (item, destination) => void moveTo(item, destination));
  const download = (item: Item) => runAction(async () => {
    const response = await fetch(`/api/files/${item.id}/content`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error?.message || "다운로드하지 못했습니다."); }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = item.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  return <div className={styles.app} aria-busy={loading || busy}>
    <div className={styles.mobileToolbar}><button className={styles.iconButton} aria-label="드라이브 메뉴 열기" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button><span>{title}</span></div>
    {sidebarOpen && <button className={styles.scrim} aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)} />}
    <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
      <NewMenu className={styles.newButton} onFolder={beginFolder} onUpload={beginUpload} disabled={busy || loading || !canAdd} />
      <nav aria-label="드라이브 메뉴">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`${styles.navItem} ${area === id ? styles.navActive : ""} ${id === "drive" && drag.dropTarget === "sidebar-root" ? styles.dropHighlight : ""}`} {...(id === "drive" ? drag.targetProps(undefined, "sidebar-root") : {})} aria-current={area === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={19} fill={id === "starred" && area === id ? "currentColor" : "none"} /><span>{label}</span>{id === "shared" && <span className={styles.navCount}>{items.filter(i => i.owned === false && i.sharedRoot && !i.deleted).length}</span>}</button>)}</nav>
      <div className={styles.storage}><button onClick={() => setDialog("storage")}><Cloud size={19} />저장용량</button><p>{(totalBytes / 1024 ** 3).toFixed(2)} GB 사용 중</p><button className={styles.storageManage} onClick={() => setDialog("storage")}>저장용량 관리<ArrowUpRight size={14} /></button></div>
      <div className={styles.sidebarFooter}><span className={styles.statusDot} />우리만의 작은 공간<p>소중한 작업을 한곳에.</p></div>
    </aside>
    <div className={styles.main} onDragOver={e => { e.preventDefault(); if (drag.isInternalDrag()) e.dataTransfer.dropEffect = "none"; }} onDrop={e => { e.preventDefault(); if (!drag.isInternalDrag() && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      <div className={styles.mainHeading}>
        <div className={styles.headingText}>
          <div className={styles.eyebrow}>YOUR CREATIVE SPACE</div>
          {area === "drive" ? <nav className={styles.breadcrumbs} aria-label="현재 폴더 경로">
            <h1>
              <button className={drag.dropTarget === "root" ? styles.dropHighlight : ""} {...(!sharedFolder ? drag.targetProps() : {})} aria-current={!currentFolder ? "page" : undefined} onClick={() => sharedFolder ? navigate("shared") : browseFolder(null)}>{sharedFolder ? "공유된 파일" : "내 드라이브"}</button>
              {path.map((part, index) => <span key={part.id}>
                <ChevronRight size={22} aria-hidden="true" />
                <button className={drag.dropTarget === `path-${part.id}` ? styles.dropHighlight : ""} {...drag.targetProps(part.id, `path-${part.id}`)} aria-current={index === path.length - 1 ? "page" : undefined} onClick={() => browseFolder(part)}>{part.name}</button>
              </span>)}
            </h1>
          </nav> : <h1>{title}</h1>}
          <p>{area === "trash" ? "삭제한 파일을 확인하고 복원할 수 있어요." : "아이디어부터 완성까지, 당신의 작업이 모이는 곳."}</p>
        </div>
        <div className={styles.mobileCreate}><NewMenu className={styles.uploadButton} onFolder={beginFolder} onUpload={beginUpload} disabled={busy || loading || !canAdd} /></div>
      </div>
      <input ref={input} type="file" multiple hidden onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
      {loadError && <div className={styles.apiStatus} role="alert">{loadError}<button onClick={() => void reload()}>다시 시도</button></div>}
      {loading && <div className={styles.apiStatus} role="status">파일 목록을 불러오는 중입니다.</div>}
      <section className={styles.welcome}><div className={styles.welcomeIcon}><Box size={26} /></div><div><h2>함께 만들고, 편하게 보관하세요.</h2><p>3D 모델, 렌더 이미지, 그리고 다음 프로젝트의 영감까지.</p></div><span className={styles.welcomePill}>작은 팀을 위한 드라이브<Users size={15} /></span></section>
      <div className={styles.toolbar}>
        <CategoryMenu value={filter} onChange={setFilter} />
          <div className={styles.fileControls}>
            <SortMenu value={sortOrder} onChange={setSortOrder} />
            <div className={styles.viewToggle}>
              <button className={view === "list" ? styles.viewActive : ""} aria-label="목록 보기" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={17} /></button>
              <button className={view === "grid" ? styles.viewActive : ""} aria-label="격자 보기" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={16} /></button>
            </div>
          </div>
      </div>
      <section className={styles.section} aria-label="파일 및 폴더 목록">
        <div className={styles.sectionHeading}><div className={styles.fileHeading}><h2>파일 및 폴더</h2><span>{visible.length}</span></div></div>
        {visible.length > 0 ? view === "list" ? <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col"><button onClick={() => setSortOrder("name")}>이름{sortOrder === "name" && <ArrowDown size={13} />}</button></th><th scope="col">소유자</th><th scope="col"><button onClick={() => setSortOrder("modified")}>수정한 날짜{sortOrder === "modified" && <ArrowDown size={13} />}</button></th><th scope="col"><button onClick={() => setSortOrder("size")}>파일 크기{sortOrder === "size" && <ArrowDown size={13} />}</button></th><th scope="col"><span className={styles.srOnly}>항목 작업</span></th></tr></thead>
            <tbody>{visible.map(item => <tr key={item.id} {...drag.sourceProps(item)} {...(item.kind === "folder" && !item.deleted ? drag.targetProps(item.id) : {})} className={`${drag.draggingId === item.id ? styles.dragging : ""} ${drag.dropTarget === item.id ? styles.dropHighlight : ""}`}>
              <td><div className={styles.fileName}>
                <span className={`${styles.typeTile} ${styles[item.kind]}`}><ItemIcon kind={item.kind} /></span>
                <button aria-label={`${item.name} ${item.kind === "folder" && !item.deleted ? "폴더 열기" : "상세 보기"}`} onClick={() => openItem(item)}>{item.name}</button>
                {item.shared && <Users size={14} className={styles.mutedIcon} />}
              </div></td>
              <td><span className={styles.ownerAvatar}>{item.owned === false ? "공" : "나"}</span>{item.owned === false ? "공유받음" : "나"}</td><td>{item.date}</td><td>{item.size}</td>
              <td><div className={styles.rowActions}>
                {item.owned !== false && <button disabled={busy || item.deleted} className={styles.iconButton} aria-label={`${item.name} ${item.starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}`} aria-pressed={!!item.starred} onClick={() => toggleStar(item)}><Star size={16} fill={item.starred ? "#f4b400" : "none"} color={item.starred ? "#e8a400" : "currentColor"} /></button>}
                <ItemMenu item={item} busy={busy} onInfo={() => selectItem(item)} onRename={() => beginRename(item)} onDownload={() => void download(item)} onMove={() => setMoving(item)} onStar={() => void toggleStar(item)} onDelete={() => void deleteOrRestore(item)} onPermanentDelete={() => setDeleteTarget(item)} onShare={() => setSharing(item)} />
              </div></td>
            </tr>)}</tbody>
          </table>
        </div> : <div className={styles.previewGrid}>
          {visible.map(item => <article key={item.id} {...drag.sourceProps(item)} {...(item.kind === "folder" && !item.deleted ? drag.targetProps(item.id) : {})} className={`${styles.gridFile} ${styles.itemCard} ${drag.draggingId === item.id ? styles.dragging : ""} ${drag.dropTarget === item.id ? styles.dropHighlight : ""}`}>
            <button className={styles.itemOpen} aria-label={`${item.name} ${item.kind === "folder" && !item.deleted ? "폴더 열기" : "상세 보기"}`} onClick={() => openItem(item)}><Artwork item={item} /></button>
            <div className={styles.itemCardInfo}><ItemIcon kind={item.kind} /><button onClick={() => openItem(item)} title={item.name}>{item.name}</button><ItemMenu item={item} busy={busy} onInfo={() => selectItem(item)} onRename={() => beginRename(item)} onDownload={() => void download(item)} onMove={() => setMoving(item)} onStar={() => void toggleStar(item)} onDelete={() => void deleteOrRestore(item)} onPermanentDelete={() => setDeleteTarget(item)} onShare={() => setSharing(item)} /></div>
            <small>{item.kind === "folder" ? `${items.filter(child => child.parent === item.id && !child.deleted).length}개 항목` : item.size}</small>
          </article>)}
        </div> : <div className={styles.empty}>
          <Folder size={36} strokeWidth={1.3} />
          <h3>{query || filter !== "all" ? "조건에 맞는 항목이 없어요" : "아직 항목이 없어요"}</h3>
          <p>{query || filter !== "all" ? "검색어나 카테고리를 바꿔 보세요." : "파일을 업로드하거나 폴더를 만들어 보세요."}</p>
          {area !== "trash" && <NewMenu className={styles.emptyCreate} onFolder={beginFolder} onUpload={beginUpload} disabled={busy || loading || !canAdd} />}
        </div>}
      </section>
      <div className={styles.bottomNote}><ShieldCheck size={14} /><span>지인들과 안전하게 함께 쓰는 공간입니다.</span><span>파일을 폴더나 상단 경로에 끌어놓아 이동하세요</span></div>
    </div>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent><DialogTitle>{dialog === "folder" ? "새 폴더 만들기" : dialog === "storage" ? "저장용량" : "Cloud에 오신 것을 환영해요"}</DialogTitle><DialogDescription>{dialog === "folder" ? "작업을 정리할 폴더의 이름을 입력하세요." : "파일과 폴더는 로그인한 계정의 서버 저장소에 보관됩니다."}</DialogDescription>{dialog === "folder" ? <form className={styles.dialogForm} onSubmit={e => { e.preventDefault(); if (folderName.trim()) void createFolder(); }}><label htmlFor="folder-name">폴더 이름</label><input id="folder-name" autoFocus required maxLength={255} value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="이름 없는 폴더" /><button type="submit" disabled={busy} className={styles.uploadButton}>{busy ? "만드는 중…" : "만들기"}</button></form> : <div className={styles.dialogText}><Info size={23} /><p>{dialog === "storage" ? `저장된 파일은 ${(totalBytes / 1024 ** 2).toFixed(1)} MB입니다. 휴지통의 원본도 서버에 남아 있으며, 용량 제한은 아직 설정하지 않았습니다.` : "검색, 파일 유형 필터, 폴더 생성, 즐겨찾기, 휴지통과 보기 전환을 사용해 보세요."}</p><p>파일은 새로고침 후에도 유지됩니다. 파일당 최대 100 MB를 업로드할 수 있습니다. 공유 메뉴에서 지인의 핸들을 입력해 접근 권한을 부여할 수 있습니다.</p></div>}</DialogContent></Dialog>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent>{selected && <>
        <DialogTitle className="pr-6 break-all">{selected.name}</DialogTitle>
        <DialogDescription>{labels[selected.kind]} · {selected.size} · 서버에 저장됨</DialogDescription>
        {selected.kind !== "folder" && <Artwork item={selected} />}
        <dl className={styles.details}>
          <dt>수정한 날짜</dt><dd>{selected.date}</dd>
          <dt>위치</dt><dd>{folderPath(items, selected.parent).map(part => part.name).join(" / ") || (selected.owned === false ? "공유된 파일" : "내 드라이브")}</dd>
          <dt>공유 상태</dt><dd>{selected.owned === false ? `공유받음 · ${selected.permission === "EDITOR" ? "편집" : "보기"}` : selected.shared ? "다른 사용자와 공유 중" : "나만 보기"}</dd>
          <dt>상태</dt><dd>{selected.deleted ? "휴지통" : "저장됨"}</dd>
          {selected.kind === "folder" && <><dt>포함된 항목</dt><dd>{items.filter(item => item.parent === selected.id && !item.deleted).length}개</dd></>}
        </dl>
      </>}</DialogContent>
    </Dialog>
    <Dialog open={renameTarget !== null} onOpenChange={open => { if (!open && !busy) setRenameTarget(null); }}>
      <DialogContent>{renameTarget && <>
        <DialogTitle>이름 바꾸기</DialogTitle>
        <DialogDescription className="break-all">{renameTarget.name}의 새 이름을 입력하세요.</DialogDescription>
        <form className={styles.dialogForm} onSubmit={event => { event.preventDefault(); if (rename.trim()) void renameItem(renameTarget); }}>
          <label htmlFor="rename-item">이름</label>
          <input id="rename-item" autoFocus value={rename} maxLength={255} required disabled={busy} onChange={event => setRename(event.target.value)} />
          <div className={styles.renameActions}><button type="button" disabled={busy} onClick={() => setRenameTarget(null)}>취소</button><button type="submit" className={styles.uploadButton} disabled={busy || !rename.trim() || rename.trim() === renameTarget.name}>{busy ? "변경 중…" : "저장"}</button></div>
        </form>
      </>}</DialogContent>
    </Dialog>
    {moving && <MoveDialog key={moving.id} item={moving} items={items} busy={busy} onClose={() => setMoving(null)} onMove={destination => void moveItem(destination)} />}
    {sharing && <ShareDialog key={sharing.id} item={sharing} onClose={() => setSharing(null)} onChanged={() => reload()} />}
    <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>완전 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription className="break-all">{deleteTarget?.name}을 서버에서 완전히 삭제합니다. 원본과 정보가 삭제되며 복원할 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><button className={styles.cancelDelete} disabled={busy} onClick={() => setDeleteTarget(null)}>취소</button><button className={styles.confirmDelete} disabled={busy} onClick={() => void permanentlyDelete()}>{busy ? "삭제 중…" : "완전 삭제"}</button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
