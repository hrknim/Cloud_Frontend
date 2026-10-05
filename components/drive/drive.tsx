"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ArrowDown, ArrowUpRight, ChevronRight, Clock3, Cloud, Folder, Grid2X2, HardDrive, Home, Info, List, Menu, Star, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import styles from "./drive.module.css";
import { useDriveSearch } from "./drive-search";
import { canDropInto, driveRequest, folderPath, itemEndpoint, loadDriveItems, patchDriveItem, toDriveItem, type DrivePageOptions, type StoredItem, type Item, type SortOrder } from "@/lib/drive/drive-api";
import NewMenu from "./new-menu";
import MoveDialog from "./move-dialog";
import CategoryMenu, { type Category } from "./category-menu";
import SortMenu from "./sort-menu";
import { useDriveDrag } from "./use-drive-drag";
import ItemMenu, { ItemContextMenu } from "./item-menu";
import ShareDialog from "./share-dialog";
import OwnerProfile from "./owner-profile";
import { hasSearchFilters } from "@/lib/drive/drive-search";
import { fileCategories } from "@/lib/files/file-types";
import ItemIcon, { fileToneClasses } from "./file-icon";
import fileIconStyles from "./file-icon.module.css";
import UploadAreaMenu from "@/components/transfers/upload-area-menu";
import ImagePreview from "@/components/previews/image-preview";
import TextPreview from "@/components/previews/text-preview";
import PdfPreview from "@/components/previews/pdf-preview";
import MediaPreview from "@/components/previews/media-preview";
import ModelPreview from "@/components/previews/model-preview";
import SpreadsheetPreview from "@/components/previews/spreadsheet-preview";
import WordPreview from "@/components/previews/word-preview";
import PresentationPreview from "@/components/previews/presentation-preview";
import ArchivePreview from "@/components/previews/archive-preview";
import EpubPreview from "@/components/previews/epub-preview";
import { PreviewNavigationProvider } from "@/components/previews/preview-file-navigation";
import { UploadQueue } from "@/lib/transfers/upload-queue";
import UploadProgress from "@/components/transfers/upload-progress";
import DriveHome from "./drive-home";
import homeStyles from "./drive-home.module.css";
import { homeSections } from "@/lib/drive/drive-home";
import { dragSelection, selectDriveItem, type Selection } from "@/lib/drive/drive-selection";
import { runItemBatch } from "@/lib/drive/drive-batch";
import SelectionToolbar from "./selection-toolbar";
import BulkShareDialog from "./bulk-share-dialog";
import { readDroppedTree, readUploadDirectory, uploadTree, type UploadDirectoryHandle, type UploadDropEntry } from "@/lib/transfers/folder-upload";
import { saveDownloadTree, type DownloadManifestEntry, type SaveDirectoryHandle } from "@/lib/transfers/folder-download";
import { downloadName } from "@/lib/files/download-names";

function directoryPicker() {
  return (window as Window & { showDirectoryPicker?: (options: { mode: "read" | "readwrite" }) => Promise<UploadDirectoryHandle & SaveDirectoryHandle> }).showDirectoryPicker?.bind(window);
}

type Area = "home" | "drive" | "shared" | "recent" | "starred" | "trash";
const navigation = [
  { id: "home", label: "홈", icon: Home }, { id: "drive", label: "내 드라이브", icon: HardDrive },
  { id: "shared", label: "공유된 파일", icon: Users }, { id: "recent", label: "최근 파일", icon: Clock3 },
  { id: "starred", label: "즐겨찾기", icon: Star }, { id: "trash", label: "휴지통", icon: Trash2 },
] as const;
const labels = Object.fromEntries(fileCategories.map(category => [category.id, category.label]));
function canPreview(item: Item) {
  return !item.deleted && (item.kind === "3d" || item.kind === "image" || item.kind === "video" || item.kind === "audio" || item.spreadsheetPreview || item.wordPreview || item.presentationPreview || item.archivePreview || item.epubPreview || item.textPreview || item.pdfPreview);
}
function Artwork({ item }: { item: Item }) {
  if (item.url && item.kind === "image") return <div className={styles.artwork} style={{ backgroundImage: `url("${item.url}")`, backgroundSize: "cover", backgroundPosition: "center" }} role="img" aria-label={item.name} />;
  return <div className={`${styles.artwork} ${styles.generic} ${fileIconStyles.surface} ${fileToneClasses[item.kind]}`} aria-hidden="true">
    <ItemIcon kind={item.kind} />
  </div>;
}

function OwnerLabel({ item }: { item: Item }) {
  if (item.owned !== false) return <>나</>;
  if (!item.owner) return <span>소유자 정보를 불러올 수 없음</span>;
  return <span className={styles.ownerIdentity}>
    <span title={item.owner.displayName}>{item.owner.displayName}</span>
    <span className={styles.ownerHandle} title={`@${item.owner.handle.replace(/^@/, "")}`}>@{item.owner.handle.replace(/^@/, "")}</span>
  </span>;
}

export default function Drive() {
  const [items, setItems] = useState<Item[]>([]);
  const [loadingState, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadSequence = useRef(0);
  const [rename, setRename] = useState("");
  const [area, setArea] = useState<Area>("drive");
  const { query, searchFilters, setSearchFilters, resetSearch } = useDriveSearch();
  const filter = searchFilters.kind;
  const setFilter = (kind: Category) => setSearchFilters({ ...searchFilters, kind });
  const [view, setView] = useState("list");
  const [sortOrder, setSortOrder] = useState<SortOrder>("modified");
  const [folder, setFolder] = useState<Item | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [selection, setSelection] = useState<Selection & { scope: string }>({ scope: "", ids: [], anchor: null });
  const [preview, setPreview] = useState<Item | null>(null);
  const [renameTarget, setRenameTarget] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [sharing, setSharing] = useState<Item | null>(null);
  const [sharingMany, setSharingMany] = useState<Item[] | null>(null);
  const [moving, setMoving] = useState<Item | null>(null);
  const [movingMany, setMovingMany] = useState<Item[] | null>(null);
  const [trashMany, setTrashMany] = useState<Item[] | null>(null);
  const [dialog, setDialog] = useState<"folder" | "help" | "storage" | null>(null);
  const [folderName, setFolderName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderScans = useRef(new Set<AbortController>());
  const [uploads] = useState(() => new UploadQueue());
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [dataKey, setDataKey] = useState("");
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [storageLimit, setStorageLimit] = useState<number | null>(null);
  const [neighborResult, setPreviewNavigation] = useState<{ key: string; previous: Item | null; next: Item | null }>({ key: "", previous: null, next: null });
  const neighborKey = `${preview?.id || ""}:${sortOrder}`;
  const previewNavigation = neighborResult.key === neighborKey ? neighborResult : { previous: null, next: null };
  const pageKey = JSON.stringify({ area, parentId: folder?.id, scope: area === "home" ? "all" : searchFilters.scope, q: query, kind: filter, sort: sortOrder, starredOnly: searchFilters.starredOnly, from: searchFilters.modifiedFrom, to: searchFilters.modifiedTo });
  const loading = loadingState || dataKey !== pageKey;
  const pageOptions = useMemo(() => JSON.parse(pageKey) as DrivePageOptions, [pageKey]);
  const optionsRef = useRef(pageOptions);
  useEffect(() => { optionsRef.current = pageOptions; }, [pageOptions]);
  const reloadStorage = useCallback(async () => {
    try { const data = await driveRequest<{ bytes: number; limitBytes: number }>("/api/drive/storage"); setStorageBytes(data.bytes); setStorageLimit(data.limitBytes); }
    catch { setStorageBytes(null); setStorageLimit(null); }
  }, []);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    const options = optionsRef.current;
    try {
      const next = await loadDriveItems(options, signal);
      if (sequence !== loadSequence.current || signal?.aborted) return;
      setItems([...new Map([...next.context, ...next.items].map(item => [item.id, item])).values()]); setVisibleIds(next.items.map(item => item.id)); setTotal(next.total); setNextOffset(next.offset + next.items.length); setDataKey(JSON.stringify(options)); setLoadError("");
    } catch (error) {
      if (sequence === loadSequence.current && !signal?.aborted) { setItems([]); setVisibleIds([]); setDataKey(JSON.stringify(options)); setLoadError(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); }
    } finally { if (sequence === loadSequence.current && !signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { setLoading(true); setItems([]); setVisibleIds([]); setLoadingMore(false); void reload(controller.signal); }, query.trim() ? 250 : 0);
    // Invalidate late responses as soon as the view changes, not after debounce.
    ++loadSequence.current;
    return () => { clearTimeout(timer); controller.abort(); };
  }, [pageKey, query, reload]);
  useEffect(() => { const timer = setTimeout(() => { void reloadStorage(); }, 0); return () => clearTimeout(timer); }, [reloadStorage]);
  const loadMore = async () => {
    if (loading || loadingMore || nextOffset >= total) return;
    const sequence = loadSequence.current; setLoadingMore(true);
    try {
      const next = await loadDriveItems({ ...optionsRef.current, offset: nextOffset });
      if (sequence !== loadSequence.current) return;
      setItems(previous => [...new Map([...previous, ...next.context, ...next.items].map(item => [item.id, item])).values()]);
      setVisibleIds(previous => [...new Set([...previous, ...next.items.map(item => item.id)])]); setTotal(next.total); setNextOffset(next.offset + next.items.length);
    } catch (error) { if (sequence === loadSequence.current) toast.error(error instanceof Error ? error.message : "목록을 더 불러오지 못했습니다."); }
    finally { if (sequence === loadSequence.current) setLoadingMore(false); }
  };
  useEffect(() => {
    if (!preview) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPreviewNavigation({ key: neighborKey, previous: null, next: null });
      void driveRequest<{ previous: StoredItem | null; next: StoredItem | null }>(`/api/drive/neighbors?itemId=${encodeURIComponent(preview.id)}&sort=${sortOrder}`, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) {
          const previous = data.previous ? toDriveItem(data.previous) : null, next = data.next ? toDriveItem(data.next) : null;
          setPreviewNavigation({ key: neighborKey, previous, next });
          setItems(items => [...new Map([...items, ...[previous, next].filter((item): item is Item => !!item)].map(item => [item.id, item])).values()]);
        }
      }).catch(() => { /* Viewer stays usable if neighbor lookup fails. */ });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [preview, sortOrder, neighborKey]);
  useEffect(() => {
    const scans = folderScans.current;
    uploads.setIdleHandler(() => { void reload(); void reloadStorage(); });
    return () => { scans.forEach(scan => scan.abort()); scans.clear(); uploads.setIdleHandler(); uploads.cancelAll(); };
  }, [uploads, reload, reloadStorage]);
  const runAction = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const navigate = (next: Area) => { setArea(next); setFolder(null); resetSearch(); setSidebarOpen(false); };
  const currentFolder = folder ? items.find(item => item.id === folder.id && !item.deleted) || folder : null;
  const path = folderPath(items, currentFolder?.id);
  const sharedFolder = currentFolder?.owned === false;
  const canAdd = area !== "trash" && area !== "shared" && currentFolder?.permission !== "VIEWER";
  const searching = !!query.trim() || hasSearchFilters(searchFilters);
  const byId = new Map(items.map(item => [item.id, item]));
  const visible = dataKey === pageKey ? visibleIds.map(id => byId.get(id)).filter((item): item is Item => !!item) : [];
  const selectionScope = JSON.stringify([area, currentFolder?.id, query, searchFilters, sortOrder, view]);
  if (selection.scope !== selectionScope) setSelection({ scope: selectionScope, ids: [], anchor: null });
  const home = homeSections(visible);
  const selectionOrder = area === "home" && !searching ? [...new Set([...home.recent, ...home.starred, ...home.shared].map(item => item.id))] : visible.map(item => item.id);
  const pickedIds = selection.scope === selectionScope ? selection.ids.filter(id => selectionOrder.includes(id)) : [];
  const pickedItems = pickedIds.map(id => items.find(item => item.id === id)).filter((item): item is Item => !!item);
  const clearSelection = () => setSelection({ scope: selectionScope, ids: [], anchor: null });
  const pickOnly = (id: string) => setSelection({ scope: selectionScope, ids: [id], anchor: id });
  const selectionProps = (item: Item) => ({
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (busyRef.current || loading || event.detail > 1) return;
      const target = event.target;
      if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
      const control = target.closest("button, a, input, select, textarea, [role='menuitem']");
      if (control && !control.hasAttribute("data-item-open")) return;
      setSelection(previous => ({ scope: selectionScope, ...selectDriveItem(previous.scope === selectionScope ? previous : { ids: [], anchor: null }, selectionOrder, item.id, event.ctrlKey || event.metaKey, event.shiftKey) }));
    },
    onContextMenu: () => { if (!busyRef.current && !pickedIds.includes(item.id)) pickOnly(item.id); },
  });
  const title = navigation.find(nav => nav.id === area)?.label || "내 드라이브";
  const totalBytes = storageBytes || 0;
  const storagePercent = storageLimit === 0 ? 100 : storageLimit ? Math.min(100, totalBytes / storageLimit * 100) : 0;
  const storageKnown = storageBytes !== null && storageLimit !== null;
  const storageLimitGB = storageLimit === null ? "—" : (storageLimit / 1024 ** 3).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  const browseFolder = (next: Item | null) => { setFolder(next); setArea("drive"); resetSearch(); };
  const beginFolder = () => { setFolderName(""); setDialog("folder"); };
  const beginUpload = () => input.current?.click();
  const beginFolderUpload = () => {
    if (!canAdd || busy || loading) return;
    const picker = directoryPicker();
    if (!picker) { folderInput.current?.click(); return; }
    const parentId = currentFolder?.id || null, destination = currentFolder?.name || "내 드라이브";
    const controller = new AbortController(); folderScans.current.add(controller);
    void (async () => {
      try {
        const directory = await picker({ mode: "read" });
        if (controller.signal.aborted) return;
        setArea("drive"); resetSearch();
        uploads.addTree(await readUploadDirectory(directory, controller.signal), parentId, destination);
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) toast.error(error instanceof Error ? error.message : "폴더를 읽지 못했습니다."); }
      finally { folderScans.current.delete(controller); }
    })();
  };
  const selectItem = (item: Item) => setSelected(item);
  const beginRename = (item: Item) => { setRename(item.name); setRenameTarget(item); };
  const openItem = (item: Item) => {
    if (busyRef.current || loading) return;
    if (item.kind === "folder" && !item.deleted) { setFolder(item); setArea("drive"); resetSearch(); }
    else if (canPreview(item)) setPreview(item);
    else selectItem(item);
  };
  const openOnDoubleClick = (event: MouseEvent<HTMLElement>, item: Item) => {
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    // Action buttons and portalled menus keep their own interactions.
    const control = target.closest("button, a, input, select, textarea, [role='menuitem']");
    if (control && !control.hasAttribute("data-item-open")) return;
    openItem(item);
  };
  const toggleStar = (item: Item) => runAction(async () => {
    const updated = await patchDriveItem(item, { starred: !item.starred });
    setItems(prev => prev.map(current => current.id === item.id ? updated : current));
    if (selected?.id === item.id) setSelected(updated);
    if (preview?.id === item.id) setPreview(updated);
  });
  const addFiles = (incoming: FileList | File[]) => {
    if (!canAdd) { toast.error("파일을 추가할 내 폴더 또는 편집 가능한 공유 폴더를 열어 주세요."); return; }
    uploads.add(Array.from(incoming), currentFolder?.id || null, currentFolder?.name || "내 드라이브");
    setArea("drive"); resetSearch();
  };
  const addFolderFiles = (incoming: FileList | File[]) => {
    if (!canAdd) return;
    try {
      uploads.addTree(uploadTree(Array.from(incoming).map(file => ({ path: file.webkitRelativePath || file.name, file }))), currentFolder?.id || null, currentFolder?.name || "내 드라이브");
      setArea("drive"); resetSearch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "폴더를 업로드하지 못했습니다."); }
  };
  const onExternalDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (drag.isInternalDrag()) return;
    if (!canAdd) { toast.error("업로드할 내 폴더 또는 편집 가능한 공유 폴더를 열어 주세요."); return; }
    // Capture entry handles while the browser's drag data store is still readable.
    const entries = Array.from(event.dataTransfer.items).filter(item => item.kind === "file").map(item => item.webkitGetAsEntry?.() as unknown as UploadDropEntry | null).filter((entry): entry is UploadDropEntry => !!entry);
    if (!entries.some(entry => entry.isDirectory)) { if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); return; }
    const parentId = currentFolder?.id || null, destination = currentFolder?.name || "내 드라이브";
    setArea("drive"); resetSearch();
    const controller = new AbortController(); folderScans.current.add(controller);
    void readDroppedTree(entries, controller.signal).then(tree => { if (!controller.signal.aborted) uploads.addTree(tree, parentId, destination); }).catch(error => { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "폴더를 읽지 못했습니다."); }).finally(() => { folderScans.current.delete(controller); });
  };
  const createFolder = () => runAction(async () => {
    await driveRequest("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: folderName.trim(), parentId: currentFolder?.id || null }) });
    setArea("drive"); resetSearch(); setDialog(null); setSidebarOpen(false);
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
    setDeleteTarget(null); await reload(); void reloadStorage(); toast.success("완전 삭제했습니다.");
  });
  const moveTo = (item: Item, destination?: string, context = items) => runAction(async () => {
    const updated = await patchDriveItem(item, { parentId: destination || null });
    setItems(previous => previous.map(item => item.id === updated.id ? updated : item));
    if (selected?.id === item.id) setSelected(updated);
    setMoving(null); await reload();
    toast.success("이동했습니다.", { description: `${updated.name} → ${context.find(item => item.id === destination)?.name || "내 드라이브"}` });
  });
  const moveItem = (destination?: string, context = items) => { if (moving) return moveTo(moving, destination, context); };
  const moveGroup = (group: Item[], destination?: string, context = items) => runAction(async () => {
    if (!group.length || !group.every(item => canDropInto(context, item, destination))) return;
    const completed = new Set<string>();
    const failures: string[] = [];
    for (const item of group) {
      try {
        const updated = await patchDriveItem(item, { parentId: destination || null });
        completed.add(item.id);
        setItems(previous => previous.map(current => current.id === updated.id ? updated : current));
        if (selected?.id === updated.id) setSelected(updated);
      } catch (error) { failures.push(`${item.name}: ${error instanceof Error ? error.message : "이동 실패"}`); }
    }
    const movedIds = new Set(items.filter(item => completed.has(item.id) || folderPath(items, item.parent).some(parent => completed.has(parent.id))).map(item => item.id));
    setSelection(previous => ({ ...previous, ids: previous.ids.filter(id => !movedIds.has(id)), anchor: null }));
    await reload();
    if (completed.size) toast.success(`${completed.size}개 항목을 이동했습니다.`);
    if (failures.length) toast.error(`${failures.length}개 항목 이동 실패`, { description: failures.slice(0, 3).join(" / ") });
  });
  const drag = useDriveDrag(items, busy || loading, (group, destination) => void moveGroup(group, destination), pickedIds, pickOnly);
  const movePicked = () => {
    if (!pickedItems.length || pickedItems.some(item => item.deleted || item.owned === false)) return;
    setMovingMany(pickedItems);
  };
  const movePickedTo = (destination?: string, context = items) => {
    if (busyRef.current || !movingMany?.length) return;
    const group = dragSelection(context, movingMany.map(item => item.id), movingMany[0]).filter(item => item.parent !== destination);
    if (!group.length || !group.every(item => canDropInto(context, item, destination))) return;
    void moveGroup(group, destination, context).then(() => setMovingMany(null));
  };
  const beginTrashPicked = () => {
    if (!pickedItems.length || pickedItems.some(item => item.deleted || item.owned === false)) return;
    setTrashMany(pickedItems);
  };
  const trashPicked = () => runAction(async () => {
    if (!trashMany?.length || trashMany.some(item => item.deleted || item.owned === false)) return;
    const group = dragSelection(items, trashMany.map(item => item.id), trashMany[0]);
    const results = await runItemBatch(group, async item => {
      await driveRequest(itemEndpoint(item), { method: "DELETE" });
      const subtree = new Set(items.filter(current => current.id === item.id || folderPath(items, current.parent).some(parent => parent.id === item.id)).map(current => current.id));
      setItems(previous => previous.map(current => subtree.has(current.id) ? { ...current, deleted: true } : current));
    });
    const successes = results.filter(result => result.status === "success");
    const failures = results.filter(result => result.status === "error");
    const roots = new Set(successes.map(result => result.id));
    const completed = new Set(items.filter(item => roots.has(item.id) || folderPath(items, item.parent).some(parent => roots.has(parent.id))).map(item => item.id));
    setSelection(previous => ({ ...previous, ids: previous.ids.filter(id => !completed.has(id)), anchor: null }));
    setSelected(current => current && completed.has(current.id) ? null : current);
    setPreview(current => current && completed.has(current.id) ? null : current);
    setTrashMany(null); await reload();
    if (successes.length) toast.success(`${successes.length}개 항목을 휴지통으로 이동했습니다.`);
    if (failures.length) toast.error(`${failures.length}개 항목 휴지통 이동 실패`, { description: failures.slice(0, 3).map(result => `${result.name}: ${result.message}`).join(" / ") });
  });
  const download = (item: Item) => item.kind === "folder" ? downloadItems([item]) : runAction(async () => {
    const response = await fetch(`/api/files/${item.id}/content`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error?.message || "다운로드하지 못했습니다."); }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = downloadName(item.name); link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  const downloadItems = (targets: Item[]) => {
    if (!targets.length || targets.some(item => item.deleted) || targets.length > 100) return;
    if (targets.length === 1 && targets[0].kind !== "folder") { void download(targets[0]); return; }
    void runAction(async () => {
      let notification: string | number | undefined;
      try {
        const picker = targets.some(item => item.kind === "folder") ? directoryPicker() : undefined;
        if (picker) {
          let destination;
          try { destination = await picker({ mode: "readwrite" }); }
          catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; throw error; }
          notification = toast.loading("폴더 다운로드를 준비합니다.");
          const data = await driveRequest<{ entries: DownloadManifestEntry[] }>("/api/files/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: targets.map(item => item.id), mode: "manifest" }) });
          await saveDownloadTree(destination, data.entries, fetch, (done, total) => { toast.loading(`폴더 저장 중 · ${done}/${total}개`, { id: notification }); });
          toast.success("폴더 구조를 유지해 저장했습니다."); return;
        }
        notification = toast.loading("폴더·파일 ZIP 다운로드를 준비합니다.");
        const response = await fetch("/api/files/download", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: targets.map(item => item.id) }) });
        if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error?.message || "다운로드하지 못했습니다."); }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a"); link.href = url; link.download = "Cloud-files.zip"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        toast.success("선택한 파일을 ZIP으로 다운로드합니다.");
      } finally { if (notification !== undefined) toast.dismiss(notification); }
    });
  };
  const downloadPicked = () => downloadItems(pickedItems);
  const sharePicked = () => {
    if (!pickedItems.length || pickedItems.some(item => item.deleted || item.owned === false)) return;
    if (pickedItems.length === 1) setSharing(pickedItems[0]); else setSharingMany(pickedItems);
  };
  const starPicked = () => runAction(async () => {
    if (!pickedItems.length || pickedItems.some(item => item.deleted)) return;
    const starred = !pickedItems.every(item => item.starred);
    const results = await runItemBatch(pickedItems, async item => {
      const updated = await patchDriveItem(item, { starred });
      setItems(previous => previous.map(current => current.id === item.id ? updated : current));
      if (selected?.id === item.id) setSelected(updated);
      if (preview?.id === item.id) setPreview(updated);
    });
    const successes = results.filter(result => result.status === "success");
    const failures = results.filter(result => result.status === "error");
    if (successes.length) toast.success(`${successes.length}개 항목의 즐겨찾기를 ${starred ? "추가" : "해제"}했습니다.`);
    if (failures.length) toast.error(`${failures.length}개 항목 처리 실패`, { description: failures.slice(0, 3).map(result => `${result.name}: ${result.message}`).join(" / ") });
  });
  const PreviewViewer = preview?.epubPreview ? EpubPreview : preview?.archivePreview ? ArchivePreview : preview?.presentationPreview ? PresentationPreview : preview?.wordPreview ? WordPreview : preview?.spreadsheetPreview ? SpreadsheetPreview : preview?.kind === "3d" ? ModelPreview : preview?.kind === "video" || preview?.kind === "audio" ? MediaPreview : preview?.pdfPreview ? PdfPreview : preview?.textPreview ? TextPreview : ImagePreview;
  const renderHomeItem = (item: Item, variant: "card" | "row") => {
    const actions = { item, busy: busy || loading, onInfo: () => selectItem(item), onRename: () => beginRename(item), onDownload: () => void download(item),
      onMove: () => setMoving(item), onStar: () => void toggleStar(item), onDelete: () => void deleteOrRestore(item), onPermanentDelete: () => setDeleteTarget(item), onShare: () => setSharing(item) };
    const picked = pickedIds.includes(item.id);
    const interactions = { ...selectionProps(item), onDoubleClick: (event: MouseEvent<HTMLElement>) => openOnDoubleClick(event, item), ...drag.sourceProps(item), ...(item.kind === "folder" ? drag.targetProps(item.id) : {}) };
    const stateClass = `${picked ? styles.itemSelected : ""} ${drag.draggingIds.includes(item.id) ? styles.dragging : ""} ${drag.dropTarget === item.id ? styles.dropHighlight : ""}`;
    return <ItemContextMenu {...actions}>{variant === "card" ? <article {...interactions} className={`${styles.gridFile} ${styles.itemCard} ${stateClass}`}>
      <button data-item-open className={styles.itemOpen} disabled={busy || loading} aria-pressed={picked} aria-label={`${item.name} 선택 (더블클릭으로 열기)`}><Artwork item={item} /></button>
      <div className={styles.itemCardInfo}><ItemIcon kind={item.kind} /><button data-item-open disabled={busy || loading} title={item.name} aria-pressed={picked}>{item.name}</button><ItemMenu {...actions} /></div>
      <small>{item.date} · {item.size}</small><div className={`${styles.cardOwner} ${styles.ownerInfo}`}><OwnerProfile item={item} /><OwnerLabel item={item} /></div>
    </article> : <div {...interactions} className={`${homeStyles.row} ${stateClass}`}>
      <span className={`${styles.typeTile} ${fileIconStyles.surface} ${fileToneClasses[item.kind]}`}><ItemIcon kind={item.kind} /></span>
      <div className={homeStyles.rowName}><button data-item-open disabled={busy || loading} title={item.name} aria-pressed={picked}>{item.name}</button><div className={homeStyles.rowMeta}><OwnerProfile item={item} /><OwnerLabel item={item} /></div></div>
      <span className={homeStyles.rowDate}>{item.date}</span><ItemMenu {...actions} />
    </div>}</ItemContextMenu>;
  };
  return <div className={styles.app} aria-busy={loading || busy}>
    <div className={styles.mobileToolbar}><button className={styles.iconButton} aria-label="드라이브 메뉴 열기" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button><span>{title}</span></div>
    {sidebarOpen && <button className={styles.scrim} aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)} />}
    <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
      <NewMenu className={styles.newButton} onFolder={beginFolder} onUpload={beginUpload} onFolderUpload={beginFolderUpload} disabled={busy || loading || !canAdd} />
      <nav aria-label="드라이브 메뉴">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`${styles.navItem} ${area === id ? styles.navActive : ""} ${id === "drive" && drag.dropTarget === "sidebar-root" ? styles.dropHighlight : ""}`} {...(id === "drive" ? drag.targetProps(undefined, "sidebar-root") : {})} aria-current={area === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={19} fill={id === "starred" && area === id ? "currentColor" : "none"} /><span>{label}</span>{id === "shared" && <span className={styles.navCount}>{items.filter(i => i.owned === false && i.sharedRoot && !i.deleted).length}</span>}</button>)}</nav>
      <div className={styles.storage}>
        <button onClick={() => setDialog("storage")}><Cloud size={19} />저장용량</button>
        <div className={`${styles.storageTrack} ${storagePercent >= 90 ? styles.storageWarning : ""}`} role="progressbar" aria-label="저장용량 사용률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={storageKnown ? storagePercent : undefined} aria-valuetext={storageKnown ? `${storageLimitGB} GB 중 ${(totalBytes / 1024 ** 3).toFixed(2)} GB 사용` : "사용량 확인 중"}>
          <span style={{ width: storageKnown ? `${storagePercent}%` : "0%" }} />
        </div>
        <p>{storageKnown ? `${storageLimitGB} GB 중 ${(totalBytes / 1024 ** 3).toFixed(2)} GB 사용` : loading ? "사용량을 불러오는 중…" : "사용량을 확인할 수 없습니다."}</p>
        <button className={styles.storageManage} onClick={() => setDialog("storage")}>저장용량 관리<ArrowUpRight size={14} /></button>
      </div>
    </aside>
    <div className={styles.main} tabIndex={-1} onClick={event => {
      const target = event.target;
      if (target instanceof Element && event.currentTarget.contains(target) && !target.closest("button, a, input, select, textarea")) event.currentTarget.focus({ preventScroll: true });
      if (!busy && target instanceof Element && event.currentTarget.contains(target) && !target.closest("[data-drive-item], button, a, input, select, textarea, [role='toolbar'], [role='menu'], [role='dialog']")) clearSelection();
    }} onKeyDown={event => { if (event.key === "Escape" && !busy) clearSelection(); }} onDragOver={e => { e.preventDefault(); if (drag.isInternalDrag()) e.dataTransfer.dropEffect = "none"; }} onDrop={onExternalDrop}>
      <div className={styles.mainHeading}>
        <div className={styles.headingText}>
          {area === "drive" ? <nav className={styles.breadcrumbs} aria-label="현재 폴더 경로">
            <h1>
              <button className={drag.dropTarget === "root" ? styles.dropHighlight : ""} {...(!sharedFolder ? drag.targetProps() : {})} aria-current={!currentFolder ? "page" : undefined} onClick={() => sharedFolder ? navigate("shared") : browseFolder(null)}>{sharedFolder ? "공유된 파일" : "내 드라이브"}</button>
              {path.map((part, index) => <span key={part.id}>
                <ChevronRight size={22} aria-hidden="true" />
                <button className={drag.dropTarget === `path-${part.id}` ? styles.dropHighlight : ""} {...drag.targetProps(part.id, `path-${part.id}`)} aria-current={index === path.length - 1 ? "page" : undefined} onClick={() => browseFolder(part)}>{part.name}</button>
              </span>)}
            </h1>
          </nav> : <h1>{area === "home" && searching ? "홈 검색 결과" : title}</h1>}
        </div>
        <div className={styles.mobileCreate}><NewMenu className={styles.uploadButton} onFolder={beginFolder} onUpload={beginUpload} onFolderUpload={beginFolderUpload} disabled={busy || loading || !canAdd} /></div>
      </div>
      <input ref={input} type="file" multiple hidden onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={node => { folderInput.current = node; node?.setAttribute("webkitdirectory", ""); }} type="file" multiple hidden onChange={event => { if (event.target.files?.length) addFolderFiles(event.target.files); event.target.value = ""; }} />
      <div className={`${styles.toolbar} ${pickedIds.length ? styles.toolbarSelection : ""} ${area === "home" && !searching && !pickedIds.length ? styles.homeToolbarEmpty : ""}`} aria-hidden={area === "home" && !searching && !pickedIds.length ? true : undefined}>
        {pickedIds.length ? <SelectionToolbar items={pickedItems} busy={busy || loading} onClear={clearSelection} onDownload={downloadPicked} onShare={sharePicked} onStar={() => void starPicked()} onMove={movePicked} onTrash={beginTrashPicked} /> : <CategoryMenu value={filter} onChange={setFilter} />}
          <div className={styles.fileControls}>
            <SortMenu value={sortOrder} onChange={setSortOrder} />
            <div className={styles.viewToggle}>
              <button className={view === "list" ? styles.viewActive : ""} aria-label="목록 보기" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={17} /></button>
              <button className={view === "grid" ? styles.viewActive : ""} aria-label="격자 보기" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={16} /></button>
            </div>
          </div>
      </div>
      {loadError && <div className={styles.apiStatus} role="alert">{loadError}<button onClick={() => void reload()}>다시 시도</button></div>}
      {loading && <div className={styles.apiStatus} role="status">파일 목록을 불러오는 중입니다.</div>}
      {area === "home" && !searching ? !loading && !loadError && <DriveHome items={visible} totalBytes={totalBytes} disabled={busy || loading} onUpload={beginUpload} onStorage={() => setDialog("storage")} onNavigate={navigate} renderItem={renderHomeItem} /> : <section className={`${styles.section} ${styles.fileSection}`} aria-label="파일 및 폴더 목록">
        <UploadAreaMenu disabled={busy || loading || !canAdd} onFolder={beginFolder} onUpload={beginUpload} onFolderUpload={beginFolderUpload}>
        {visible.length > 0 ? view === "list" ? <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col"><button onClick={() => setSortOrder("name")}>이름{sortOrder === "name" && <ArrowDown size={13} />}</button></th><th scope="col">소유자</th><th scope="col"><button onClick={() => setSortOrder("modified")}>수정한 날짜{sortOrder === "modified" && <ArrowDown size={13} />}</button></th><th scope="col"><button onClick={() => setSortOrder("size")}>파일 크기{sortOrder === "size" && <ArrowDown size={13} />}</button></th><th scope="col"><span className={styles.srOnly}>항목 작업</span></th></tr></thead>
            <tbody>{visible.map(item => <ItemContextMenu key={item.id} item={item} busy={busy} onInfo={() => selectItem(item)} onRename={() => beginRename(item)} onDownload={() => void download(item)} onMove={() => setMoving(item)} onStar={() => void toggleStar(item)} onDelete={() => void deleteOrRestore(item)} onPermanentDelete={() => setDeleteTarget(item)} onShare={() => setSharing(item)}><tr {...selectionProps(item)} aria-selected={pickedIds.includes(item.id)} onDoubleClick={event => openOnDoubleClick(event, item)} {...drag.sourceProps(item)} {...(item.kind === "folder" && !item.deleted ? drag.targetProps(item.id) : {})} className={`${pickedIds.includes(item.id) ? styles.itemSelected : ""} ${drag.draggingIds.includes(item.id) ? styles.dragging : ""} ${drag.dropTarget === item.id ? styles.dropHighlight : ""}`}>
              <td><div className={styles.fileName}>
                <span className={`${styles.typeTile} ${fileIconStyles.surface} ${fileToneClasses[item.kind]}`}><ItemIcon kind={item.kind} /></span>
                <button data-item-open title={item.name} aria-pressed={pickedIds.includes(item.id)} aria-label={`${item.name} 선택 (더블클릭으로 열기)`}>{item.name}</button>
                {item.shared && <Users size={14} className={styles.mutedIcon} />}
              </div></td>
              <td><div className={styles.ownerInfo}><OwnerProfile item={item} /><OwnerLabel item={item} /></div></td><td>{item.date}</td><td>{item.size}</td>
              <td><div className={styles.rowActions}>
                <button disabled={busy || item.deleted} className={styles.iconButton} aria-label={`${item.name} ${item.starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}`} aria-pressed={!!item.starred} onClick={() => toggleStar(item)}><Star size={16} fill={item.starred ? "#f4b400" : "none"} color={item.starred ? "#e8a400" : "currentColor"} /></button>
                <ItemMenu item={item} busy={busy} onInfo={() => selectItem(item)} onRename={() => beginRename(item)} onDownload={() => void download(item)} onMove={() => setMoving(item)} onStar={() => void toggleStar(item)} onDelete={() => void deleteOrRestore(item)} onPermanentDelete={() => setDeleteTarget(item)} onShare={() => setSharing(item)} />
              </div></td>
            </tr></ItemContextMenu>)}</tbody>
          </table>
        </div> : <div className={styles.previewGrid}>
          {visible.map(item => <ItemContextMenu key={item.id} item={item} busy={busy} onInfo={() => selectItem(item)} onRename={() => beginRename(item)} onDownload={() => void download(item)} onMove={() => setMoving(item)} onStar={() => void toggleStar(item)} onDelete={() => void deleteOrRestore(item)} onPermanentDelete={() => setDeleteTarget(item)} onShare={() => setSharing(item)}><article {...selectionProps(item)} onDoubleClick={event => openOnDoubleClick(event, item)} {...drag.sourceProps(item)} {...(item.kind === "folder" && !item.deleted ? drag.targetProps(item.id) : {})} className={`${styles.gridFile} ${styles.itemCard} ${pickedIds.includes(item.id) ? styles.itemSelected : ""} ${drag.draggingIds.includes(item.id) ? styles.dragging : ""} ${drag.dropTarget === item.id ? styles.dropHighlight : ""}`}>
            <button data-item-open className={styles.itemOpen} aria-pressed={pickedIds.includes(item.id)} aria-label={`${item.name} 선택 (더블클릭으로 열기)`}><Artwork item={item} /></button>
            <div className={styles.itemCardInfo}><ItemIcon kind={item.kind} /><button data-item-open aria-pressed={pickedIds.includes(item.id)} title={item.name}>{item.name}</button><ItemMenu item={item} busy={busy} onInfo={() => selectItem(item)} onRename={() => beginRename(item)} onDownload={() => void download(item)} onMove={() => setMoving(item)} onStar={() => void toggleStar(item)} onDelete={() => void deleteOrRestore(item)} onPermanentDelete={() => setDeleteTarget(item)} onShare={() => setSharing(item)} /></div>
            <small>{item.kind === "folder" ? "폴더" : item.size}</small>
            <div className={`${styles.cardOwner} ${styles.ownerInfo}`}><OwnerProfile item={item} /><OwnerLabel item={item} /></div>
          </article></ItemContextMenu>)}
        </div> : area === "drive" ? <div className={styles.empty}>
          <Folder size={36} strokeWidth={1.3} />
          <h3>{searching ? "조건에 맞는 항목이 없어요" : "아직 항목이 없어요"}</h3>
          <p>{searching ? "검색어나 상세 검색 조건을 바꿔 보세요." : "파일을 업로드하거나 폴더를 만들어 보세요."}</p>
          {searching && <button type="button" onClick={resetSearch}>검색 초기화</button>}
          <NewMenu className={styles.emptyCreate} onFolder={beginFolder} onUpload={beginUpload} onFolderUpload={beginFolderUpload} disabled={busy || loading || !canAdd} />
        </div> : <p className={styles.emptyMessage}>파일이 없습니다.</p>}
        </UploadAreaMenu>
        {!loading && !loadError && total > 0 && <div className={styles.pagination}><span>{visible.length} / {total}개 항목</span>{nextOffset < total && <button type="button" disabled={loadingMore || busy} onClick={() => void loadMore()}>{loadingMore ? "불러오는 중…" : "더 보기"}</button>}</div>}
      </section>}
    </div>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent><DialogTitle>{dialog === "folder" ? "새 폴더 만들기" : dialog === "storage" ? "저장용량" : "Cloud에 오신 것을 환영해요"}</DialogTitle><DialogDescription>{dialog === "folder" ? "작업을 정리할 폴더의 이름을 입력하세요." : "파일과 폴더는 로그인한 계정의 서버 저장소에 보관됩니다."}</DialogDescription>{dialog === "folder" ? <form className={styles.dialogForm} onSubmit={e => { e.preventDefault(); if (folderName.trim()) void createFolder(); }}><label htmlFor="folder-name">폴더 이름</label><input id="folder-name" autoFocus required maxLength={255} value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="이름 없는 폴더" /><button type="submit" disabled={busy} className={styles.uploadButton}>{busy ? "만드는 중…" : "만들기"}</button></form> : <div className={styles.dialogText}><Info size={23} /><p>{dialog === "storage" ? storageKnown ? `전체 ${storageLimitGB} GB 중 ${(totalBytes / 1024 ** 2).toFixed(1)} MB를 사용 중입니다. 직접 업로드한 파일은 공유 폴더에 있어도 내 용량에 포함됩니다. 휴지통의 파일은 완전 삭제해야 용량이 확보됩니다.` : "저장용량 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." : "검색, 파일 유형 필터, 폴더 생성, 즐겨찾기, 휴지통과 보기 전환을 사용해 보세요."}</p><p>파일은 새로고침 후에도 유지됩니다. 파일당 최대 100 MB를 업로드할 수 있습니다. 공유 메뉴에서 지인의 핸들을 입력해 접근 권한을 부여할 수 있습니다.</p></div>}</DialogContent></Dialog>
    {preview && <PreviewNavigationProvider value={{ ...previewNavigation, busy: busy || loading, onSelect: item => { if (!busyRef.current && !loading) setPreview(item); } }}><PreviewViewer key={preview.id} item={preview} busy={busy}
      onClose={() => setPreview(null)}
      onDownload={() => void download(preview)}
      onInfo={() => { setPreview(null); selectItem(preview); }}
      onRename={() => { setPreview(null); beginRename(preview); }}
      onMove={() => { setPreview(null); setMoving(preview); }}
      onStar={() => void toggleStar(preview)}
      onDelete={() => { setPreview(null); void deleteOrRestore(preview); }}
      onPermanentDelete={() => { setPreview(null); setDeleteTarget(preview); }}
      onShare={() => { setPreview(null); setSharing(preview); }}
    /></PreviewNavigationProvider>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent>{selected && <>
        <DialogTitle className="pr-6 break-all">{selected.name}</DialogTitle>
        <DialogDescription>{labels[selected.kind]} · {selected.size} · 서버에 저장됨</DialogDescription>
        {selected.kind !== "folder" && <Artwork item={selected} />}
        <dl className={styles.details}>
          <dt>소유자</dt><dd className={styles.ownerInfo}><OwnerProfile item={selected} /><OwnerLabel item={selected} /></dd>
          <dt>수정한 날짜</dt><dd>{selected.date}</dd>
          <dt>위치</dt><dd>{folderPath(items, selected.parent).map(part => part.name).join(" / ") || (selected.owned === false ? "공유된 파일" : "내 드라이브")}</dd>
          <dt>공유 상태</dt><dd>{selected.owned === false ? `공유받음 · ${selected.permission === "EDITOR" ? "편집" : "보기"}` : selected.shared ? "다른 사용자와 공유 중" : "나만 보기"}</dd>
          <dt>상태</dt><dd>{selected.deleted ? "휴지통" : "저장됨"}</dd>
          {selected.kind === "folder" && <><dt>포함된 항목</dt><dd>{selected.childCount !== undefined ? `${selected.childCount}개` : "폴더를 열어 확인하세요."}</dd></>}
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
    <UploadProgress queue={uploads} />
    {moving && <MoveDialog key={moving.id} item={moving} items={items} busy={busy} onClose={() => setMoving(null)} onMove={(destination, context) => void moveItem(destination, context)} />}
    {movingMany && <MoveDialog item={movingMany[0]} selection={movingMany} items={items} busy={busy} onClose={() => setMovingMany(null)} onMove={movePickedTo} />}
    {sharing && <ShareDialog key={sharing.id} item={sharing} onClose={() => setSharing(null)} onChanged={() => reload()} />}
    {sharingMany && <BulkShareDialog items={sharingMany} onClose={() => setSharingMany(null)} onChanged={() => reload()} />}
    <AlertDialog open={trashMany !== null} onOpenChange={open => { if (!open && !busyRef.current) setTrashMany(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>선택한 {trashMany?.length || 0}개 항목을 휴지통으로 옮길까요?</AlertDialogTitle><AlertDialogDescription>원본은 유지되며 휴지통에서 복원할 수 있습니다. 공유 중인 항목은 휴지통에 있는 동안 다른 사용자가 접근할 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
        <div className={styles.shareList} aria-label="휴지통으로 이동할 항목">{trashMany?.map(item => <div key={item.id} className={styles.bulkResult}><span title={item.name}>{item.name}</span></div>)}</div>
        {trashMany?.some(item => item.kind === "folder") && <p className={styles.moveHint}>폴더 안의 파일과 하위 폴더도 함께 이동합니다. 폴더를 복원하면 이번에 함께 삭제한 항목만 복원됩니다.</p>}
        <AlertDialogFooter><button className={styles.cancelDelete} disabled={busy} onClick={() => setTrashMany(null)}>취소</button><button className={styles.confirmDelete} disabled={busy} onClick={() => void trashPicked()}>{busy ? "이동 중…" : "휴지통으로 이동"}</button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>완전 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription className="break-all">{deleteTarget?.name}을 서버에서 완전히 삭제합니다.{deleteTarget?.kind === "folder" && " 하위 파일과 폴더도 모두 삭제됩니다."} 원본과 정보가 삭제되며 복원할 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><button className={styles.cancelDelete} disabled={busy} onClick={() => setDeleteTarget(null)}>취소</button><button className={styles.confirmDelete} disabled={busy} onClick={() => void permanentlyDelete()}>{busy ? "삭제 중…" : "완전 삭제"}</button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
