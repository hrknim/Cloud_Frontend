import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink, rename } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { responseStream } from "./response-stream";
import { chargeStorage, releaseStorage, storageAccount } from "./storage-quota";
import { Prisma, type CloudItemKind, type CloudShareRole, type cloud_item } from "@prisma/client";
import { prismaSetting as prisma } from "./prisma";
import { proxyAuthRequest } from "./auth-proxy";
import { isAllowedMutationOrigin } from "./request-origin";
import { CloudError } from "./cloud-error";
import { resolveHandleProfile, resolveShareRecipient } from "./share-recipient";
import { resolveUserProfiles, type UserProfile } from "./user-profile";
import { mediaPreviewMime } from "@/lib/files/file-types";
import { parseByteRange } from "@/lib/files/http-range";
import JSZip from "jszip";
import { DOWNLOAD_BUNDLE_LIMIT, downloadName } from "@/lib/files/download-names";
import { buildDownloadTree } from "@/lib/files/download-tree";
export { CloudError } from "./cloud-error";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const storageRoot = path.resolve(process.cwd(), ".cloud-storage");

// Never accept owner IDs from query parameters, request bodies, or headers.
export async function getCloudOwnerId(request: Request) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (!isAllowedMutationOrigin(request)) {
      throw new CloudError(403, "INVALID_ORIGIN", "다른 사이트의 파일 수정 요청은 허용되지 않습니다.");
    }
  }
  // Server-to-server validation: no request to our own /api/user and no session cache.
  const response = await proxyAuthRequest(request, "/api/user");
  const data = await response.json();
  if (!response.ok) {
    throw new CloudError(response.status, data?.error?.code || "AUTH_UNAVAILABLE", data?.error?.message || "인증 서버에 연결할 수 없습니다.");
  }
  if (data === null || data.result === null) {
    throw new CloudError(401, "INVALID_SESSION", "로그인이 필요합니다.");
  }
  const id = data?.result?.id;
  if (typeof id !== "string" || !id.trim() || id.length > 255) {
    throw new CloudError(502, "INVALID_AUTH_RESPONSE", "인증 서버의 사용자 ID가 올바르지 않습니다.");
  }
  return id;
}

export async function cloudResponse(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CloudError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("Cloud API failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: { code: "STORAGE_UNAVAILABLE", message: "저장소에 연결할 수 없습니다. DB 설정과 cloud 테이블을 확인하세요." } }, { status: 503 });
  }
}

export function validateName(value: unknown): string {
  if (typeof value !== "string") throw new CloudError(400, "INVALID_NAME", "이름을 입력하세요.");
  const name = value.trim().normalize("NFC");
  if (!name || name.length > 255 || name === "." || name === ".." || /[\x00-\x1f\x7f/\\]/.test(name)) {
    throw new CloudError(400, "INVALID_NAME", "이름은 1~255자이며 경로 구분자와 제어 문자를 포함할 수 없습니다.");
  }
  return name;
}

export function validateId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new CloudError(400, "INVALID_ID", "올바른 항목 ID가 필요합니다.");
  }
  return value;
}

export function parseParent(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : validateId(value);
}

export async function readCloudBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length"));
  if (length > 16384) throw new CloudError(413, "BODY_TOO_LARGE", "요청 본문이 너무 큽니다.");
  let body: unknown;
  try { body = await boundedRequest(request, 16384).json(); } catch (error) {
    if (error instanceof CloudError) throw error;
    throw new CloudError(400, "INVALID_JSON", "올바른 JSON 본문이 필요합니다.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CloudError(400, "INVALID_JSON", "JSON 객체를 전달하세요.");
  return body as Record<string, unknown>;
}

type DB = Prisma.TransactionClient;

// Limit actual bytes too, including requests without Content-Length.
function boundedRequest(request: Request, maxBytes: number) {
  if (!request.body) return request;
  let bytes = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new CloudError(413, "BODY_TOO_LARGE", "요청 본문이 최대 크기를 초과했습니다.");
      controller.enqueue(chunk);
    },
  }));
  return new Request(request.url, { method: request.method, headers: request.headers, body, duplex: "half" } as RequestInit);
}

// Serialize tree mutations per owner, including duplicate-name checks and moves.
async function mutate<T>(ownerId: string, action: (tx: DB, ownerId: string) => Promise<T>, timeout = 5000) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;
    return action(tx, ownerId);
  }, { timeout });
}

// Parent-first traversal, including prior trash for purge/restore bookkeeping.
async function trashTree(db: DB, root: cloud_item, activeOnly = false) {
  const result = [root], seen = new Set([root.id]);
  let level = [root];
  while (level.length) {
    const next: cloud_item[] = [];
    for (let offset = 0; offset < level.length; offset += 500) {
      const children = await db.cloud_item.findMany({ where: { parentId: { in: level.slice(offset, offset + 500).map(item => item.id) }, ...(activeOnly ? { deletedAt: null } : {}) } });
      for (const child of children) {
        if (child.ownerId !== root.ownerId || seen.has(child.id)) throw new CloudError(409, "INVALID_TREE", "폴더 구조를 확인할 수 없습니다.");
        seen.add(child.id); result.push(child); next.push(child);
        if (result.length > 10000) throw new CloudError(413, "TREE_TOO_LARGE", "폴더 작업은 하위 항목 포함 10,000개까지 가능합니다.");
      }
    }
    level = next.filter(item => item.kind === "FOLDER");
  }
  return result;
}

async function restoreTree(db: DB, current: cloud_item, body: Record<string, unknown>) {
  let parentId = "parentId" in body ? parseParent(body.parentId) : current.parentId;
  try { await checkParent(db, parentId, current.ownerId, current.id); }
  catch (error) {
    if (!(error instanceof CloudError) || error.code !== "PARENT_DELETED" || "parentId" in body) throw error;
    parentId = null;
  }
  const tree = current.kind === "FOLDER" ? await trashTree(db, current) : [current];
  const restored = new Set<string>();
  const used = new Map<string | null, Set<string>>();
  for (const node of tree) {
    const sameBatch = node.id === current.id || (!!current.trashBatchId && node.trashBatchId === current.trashBatchId);
    if (node.id !== current.id && node.parentId && !restored.has(node.parentId)) continue;
    if (!node.deletedAt) { restored.add(node.id); continue; }
    if (!sameBatch) continue;
    const target = node.id === current.id ? parentId : node.parentId;
    let names = used.get(target);
    if (!names) {
      const active = await db.cloud_item.findMany({ where: { ownerId: current.ownerId, parentId: target, deletedAt: null } });
      names = new Set(active.map(item => item.name)); used.set(target, names);
    }
    const original = node.id === current.id && "name" in body ? validateName(body.name) : node.name;
    let name = original, index = 1;
    while (names.has(name)) {
      const suffix = ` (복원 ${index++})`;
      const dot = node.kind === "FILE" ? original.lastIndexOf(".") : -1;
      const clip = (value: string, limit: number) => {
        let result = "";
        for (const character of value) { if (result.length + character.length > limit) break; result += character; }
        return result;
      };
      const extension = dot > 0 ? clip(original.slice(dot), 64) : "";
      const stem = dot > 0 ? original.slice(0, dot) : original;
      name = `${clip(stem, 255 - suffix.length - extension.length)}${suffix}${extension}`;
    }
    names.add(name);
    await db.cloud_item.update({ where: { id: node.id }, data: { name, parentId: target, deletedAt: null, trashBatchId: null, ...(node.id === current.id && typeof body.starred === "boolean" ? { starred: body.starred } : {}) } });
    restored.add(node.id);
  }
  return requireItem(db, current.id, current.ownerId);
}

async function requireItem(db: DB, id: string, ownerId: string, kind?: CloudItemKind) {
  const item = await db.cloud_item.findFirst({ where: { id: validateId(id), ownerId, ...(kind ? { kind } : {}) } });
  if (!item) throw new CloudError(404, "NOT_FOUND", "항목을 찾을 수 없습니다.");
  return item;
}

type Permission = "OWNER" | CloudShareRole;

export async function accessibleItem(db: DB, id: string, userId: string, kind?: CloudItemKind) {
  const item = await db.cloud_item.findFirst({ where: { id: validateId(id), ...(kind ? { kind } : {}) } });
  const notFound = () => new CloudError(404, "NOT_FOUND", "항목을 찾을 수 없습니다.");
  if (!item) throw notFound();
  if (item.ownerId === userId) return { item, permission: "OWNER" as Permission };
  let current: cloud_item | null = item;
  let permission: CloudShareRole | null = null;
  const visited = new Set<string>();
  while (current) {
    if (current.deletedAt || current.ownerId !== item.ownerId || visited.has(current.id)) throw notFound();
    visited.add(current.id);
    const grant = await db.cloud_share.findUnique({ where: { itemId_userId: { itemId: current.id, userId } } });
    if (grant?.role && (grant.role === "EDITOR" || !permission)) permission = grant.role;
    current = current.parentId ? await db.cloud_item.findUnique({ where: { id: current.parentId } }) : null;
  }
  if (!permission) throw notFound();
  return { item, permission: permission as Permission };
}

async function writableParent(db: DB, parentId: string | null, userId: string) {
  if (!parentId) return userId;
  const { item, permission } = await accessibleItem(db, parentId, userId, "FOLDER");
  if (permission === "VIEWER") throw new CloudError(403, "READ_ONLY", "보기 권한으로는 이 폴더에 추가할 수 없습니다.");
  await checkParent(db, parentId, item.ownerId);
  return item.ownerId;
}

async function checkParent(db: DB, parentId: string | null, ownerId: string, movingId?: string) {
  const visited = new Set<string>();
  let current = parentId;
  while (current) {
    if (current === movingId || visited.has(current)) throw new CloudError(400, "INVALID_PARENT", "폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다.");
    visited.add(current);
    const parent = await requireItem(db, current, ownerId, "FOLDER");
    if (parent.deletedAt) throw new CloudError(409, "PARENT_DELETED", "휴지통에 있는 폴더는 사용할 수 없습니다.");
    current = parent.parentId;
  }
}

async function checkName(db: DB, ownerId: string, parentId: string | null, name: string, excludeId?: string) {
  const duplicate = await db.cloud_item.findFirst({ where: { ownerId, parentId, name, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  if (duplicate) throw new CloudError(409, "NAME_EXISTS", "같은 위치에 같은 이름의 항목이 있습니다.");
}

type OwnerProfile = UserProfile;

async function ownerProfile(request: Request, ownerId: string, permission: Permission): Promise<OwnerProfile | null> {
  if (permission === "OWNER") return null;
  return (await resolveUserProfiles(request, [ownerId])).get(ownerId) || null;
}

async function personalStar(db: DB, item: cloud_item, userId: string) {
  if (item.ownerId === userId) return item.starred;
  return !!(await db.cloud_share.findUnique({ where: { itemId_userId: { itemId: item.id, userId } }, select: { starred: true } }))?.starred;
}

export function serialize(item: cloud_item, extra: { permission?: Permission; shared?: boolean; sharedRoot?: boolean; owner?: OwnerProfile | null; starred?: boolean } = {}) {
  return {
    id: item.id, name: item.name, kind: item.kind === "FOLDER" ? "folder" : "file",
    parentId: item.parentId, mimeType: item.mimeType, size: Number(item.size),
    starred: item.starred, deletedAt: item.deletedAt, createdAt: item.createdAt, updatedAt: item.updatedAt,
    downloadUrl: item.kind === "FILE" && !item.deletedAt ? `/api/files/${item.id}/content` : null,
    ...extra,
  };
}

export async function listCloudItems(request: Request, kind: CloudItemKind) {
  const params = new URL(request.url).searchParams;
  const ownerId = await getCloudOwnerId(request);
  const trash = params.get("trash") === "true";
  const parentId = parseParent(params.get("parentId"));
  if (parentId) await checkParent(prisma, parentId, ownerId);
  const limit = Number(params.get("limit") ?? 50);
  const offset = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new CloudError(400, "INVALID_PAGINATION", "limit은 1~100, offset은 0 이상의 정수여야 합니다.");
  }
  const q = params.get("q")?.trim();
  if (q && q.length > 255) throw new CloudError(400, "INVALID_QUERY", "검색어는 255자 이하여야 합니다.");
  const where: Prisma.cloud_itemWhereInput = {
    ownerId, kind,
    ...(trash ? { deletedAt: { not: null } } : { deletedAt: null, ...(params.get("scope") === "all" ? {} : { parentId }) }),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(params.get("starred") === "true" ? { starred: true } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.cloud_item.findMany({ where, include: { _count: { select: { shares: { where: { role: { not: null } } } } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: offset, take: limit }),
    prisma.cloud_item.count({ where }),
  ]);
  const folders = await prisma.cloud_item.findMany({ where: { ownerId, kind: "FOLDER", deletedAt: null }, select: { id: true, parentId: true, _count: { select: { shares: { where: { role: { not: null } } } } } } });
  const parentMap = new Map(folders.map(folder => [folder.id, folder]));
  const isShared = (item: typeof rows[number]) => {
    if (item._count.shares > 0) return true;
    let parentId = item.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = parentMap.get(parentId);
      if (!parent) break;
      if (parent._count.shares > 0) return true;
      parentId = parent.parentId;
    }
    return false;
  };
  return Response.json({ items: rows.map(item => serialize(item, { permission: "OWNER", shared: isShared(item) })), total, limit, offset }, { headers: { "Cache-Control": "no-store" } });
}

export async function createCloudFolder(request: Request) {
  const userId = await getCloudOwnerId(request);
  const body = await readCloudBody(request);
  const name = validateName(body.name);
  const parentId = parseParent(body.parentId);
  const ownerId = await writableParent(prisma, parentId, userId);
  const item = await mutate(ownerId, async (tx, ownerId) => {
    await writableParent(tx, parentId, userId);
    await checkParent(tx, parentId, ownerId);
    await checkName(tx, ownerId, parentId, name);
    return tx.cloud_item.create({ data: { ownerId, kind: "FOLDER", name, parentId } });
  });
  return Response.json({ item: serialize(item) }, { status: 201 });
}

function blobPath(storageKey: string) {
  // Blob names are server-generated UUIDs, never client-supplied filenames.
  return path.join(storageRoot, validateId(storageKey));
}

export async function uploadCloudFile(request: Request) {
  const userId = await getCloudOwnerId(request);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    throw new CloudError(415, "INVALID_CONTENT_TYPE", "multipart/form-data로 파일을 전송하세요.");
  }
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 1024 * 1024) {
    throw new CloudError(413, "FILE_TOO_LARGE", "파일 최대 크기는 100 MB입니다.");
  }
  let form: FormData;
  try { form = await boundedRequest(request, MAX_UPLOAD_BYTES + 1024 * 1024).formData(); } catch (error) {
    if (error instanceof CloudError) throw error;
    throw new CloudError(400, "INVALID_FORM", "파일 전송 형식이 올바르지 않습니다.");
  }
  const files = form.getAll("file");
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File)) throw new CloudError(400, "FILE_REQUIRED", "file 필드에 파일 하나를 전달하세요.");
  if (file.size > MAX_UPLOAD_BYTES) throw new CloudError(413, "FILE_TOO_LARGE", "파일 최대 크기는 100 MB입니다.");
  const name = validateName(form.get("name") ?? file.name);
  const parentId = parseParent(form.get("parentId"));
  const ownerId = await writableParent(prisma, parentId, userId);
  const storageKey = randomUUID();
  const account = await storageAccount(prisma, userId);
  if (account.usedBytes + BigInt(file.size) > account.limitBytes) throw new CloudError(413, "STORAGE_QUOTA_EXCEEDED", "저장용량이 부족합니다. 휴지통에서 파일을 완전 삭제한 후 다시 시도해 주세요.");
  const target = blobPath(storageKey);
  await mkdir(storageRoot, { recursive: true });
  try {
    await pipeline(Readable.fromWeb(file.stream() as import("node:stream/web").ReadableStream), createWriteStream(target, { flags: "wx" }));
    const item = await mutate(ownerId, async (tx, ownerId) => {
      await writableParent(tx, parentId, userId);
      await checkParent(tx, parentId, ownerId);
      await checkName(tx, ownerId, parentId, name);
      await chargeStorage(tx, userId, BigInt(file.size));
      return tx.cloud_item.create({ data: { ownerId, storageOwnerId: userId, kind: "FILE", name, parentId, storageKey, size: BigInt(file.size), mimeType: file.type || "application/octet-stream" } });
    });
    return Response.json({ item: serialize(item) }, { status: 201 });
  } catch (error) {
    await unlink(target).catch(() => {});
    throw error;
  }
}

export async function getCloudItem(request: Request, id: string, kind: CloudItemKind) {
  const userId = await getCloudOwnerId(request);
  const { item, permission } = await accessibleItem(prisma, id, userId, kind);
  let shared = permission !== "OWNER";
  let current: cloud_item | null = item;
  const visited = new Set<string>();
  while (!shared && current && !visited.has(current.id)) {
    visited.add(current.id);
    shared = await prisma.cloud_share.count({ where: { itemId: current.id, role: { not: null } } }) > 0;
    current = current.parentId ? await prisma.cloud_item.findFirst({ where: { id: current.parentId, ownerId: item.ownerId, deletedAt: null } }) : null;
  }
  return Response.json({ item: serialize(item, { permission, shared, starred: await personalStar(prisma, item, userId), owner: await ownerProfile(request, item.ownerId, permission) }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function getCloudOwnerProfile(request: Request, id: string) {
  const userId = await getCloudOwnerId(request);
  const { item } = await accessibleItem(prisma, id, userId);
  const owner = await ownerProfile(request, item.ownerId, "VIEWER");
  if (!owner) throw new CloudError(502, "USER_LOOKUP_FAILED", "소유자 정보를 불러올 수 없습니다.");
  const profile = await resolveHandleProfile(request, owner.handle);
  // Do not show another account if a handle was reassigned between the two lookups.
  if (profile.id !== item.ownerId) throw new CloudError(502, "INVALID_AUTH_RESPONSE", "소유자 정보가 변경되었습니다. 다시 시도해 주세요.");
  const { handle, displayName, bio, avatarUrl } = profile;
  return Response.json({ profile: { handle, displayName, bio, avatarUrl } }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export async function updateCloudItem(request: Request, id: string, kind: CloudItemKind) {
  const userId = await getCloudOwnerId(request);
  const body = await readCloudBody(request);
  const allowed = ["name", "parentId", "starred", "restore"];
  if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) throw new CloudError(400, "INVALID_UPDATE", "name, parentId, starred, restore만 수정할 수 있습니다.");
  if ("starred" in body && typeof body.starred !== "boolean") throw new CloudError(400, "INVALID_UPDATE", "starred는 boolean이어야 합니다.");
  if ("restore" in body && body.restore !== true) throw new CloudError(400, "INVALID_UPDATE", "복원하려면 restore: true를 전달하세요.");
  const initial = await accessibleItem(prisma, id, userId, kind);
  const item = await mutate(initial.item.ownerId, async (tx, ownerId) => {
    const { item: current, permission } = await accessibleItem(tx, id, userId, kind);
    if (permission !== "OWNER" && Object.keys(body).some(key => key !== "starred" && !(permission === "EDITOR" && key === "name"))) {
      throw new CloudError(403, "FORBIDDEN", "공유받은 항목은 개인 즐겨찾기만 변경할 수 있으며, 편집자는 이름도 바꿀 수 있습니다.");
    }
    if (current.deletedAt && !body.restore) throw new CloudError(409, "ITEM_DELETED", "휴지통에 있는 항목은 먼저 복원하세요.");
    if (current.deletedAt && body.restore) return restoreTree(tx, current, body);
    if (permission !== "OWNER" && typeof body.starred === "boolean") {
      const where = { itemId_userId: { itemId: current.id, userId } };
      if (body.starred) {
        await tx.cloud_share.upsert({ where, create: { itemId: current.id, userId, role: null, starred: true }, update: { starred: true } });
      } else {
        const preference = await tx.cloud_share.findUnique({ where });
        if (preference?.role) await tx.cloud_share.update({ where, data: { starred: false } });
        else if (preference) await tx.cloud_share.delete({ where });
      }
      if (!("name" in body)) return current;
    }
    const name = "name" in body ? validateName(body.name) : current.name;
    const parentId = "parentId" in body ? parseParent(body.parentId) : current.parentId;
    await checkParent(tx, parentId, ownerId, current.id);
    await checkName(tx, ownerId, parentId, name, current.id);
    return tx.cloud_item.update({ where: { id: current.id }, data: { name, parentId, ...(permission === "OWNER" && typeof body.starred === "boolean" ? { starred: body.starred } : {}), ...(body.restore ? { deletedAt: null } : {}) } });
  }, kind === "FOLDER" && body.restore ? 60000 : 5000);
  return Response.json({ item: serialize(item, { permission: initial.permission, shared: initial.permission !== "OWNER", starred: await personalStar(prisma, item, userId), owner: await ownerProfile(request, item.ownerId, initial.permission) }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function deleteCloudItem(request: Request, id: string, kind: CloudItemKind) {
  const ownerId = await getCloudOwnerId(request);
  const permanentParam = new URL(request.url).searchParams.get("permanent");
  if (permanentParam !== null && permanentParam !== "true" && permanentParam !== "false") {
    throw new CloudError(400, "INVALID_DELETE", "permanent는 true 또는 false여야 합니다.");
  }
  const permanent = permanentParam === "true";
  const staged: { original: string; temporary: string }[] = [];
  try { await mutate(ownerId, async (tx, ownerId) => {
    const current = await requireItem(tx, id, ownerId, kind);
    if (permanent) {
      if (!current.deletedAt) throw new CloudError(409, "NOT_IN_TRASH", "휴지통의 항목만 완전 삭제할 수 있습니다.");
      const tree = kind === "FOLDER" ? await trashTree(tx, current) : [current];
      if (tree.some(item => !item.deletedAt)) throw new CloudError(409, "ACTIVE_DESCENDANT", "폴더 안에 휴지통으로 이동되지 않은 항목이 있습니다.");
      // Stage originals reversibly; do not destroy bytes until the DB commits.
      for (const item of tree) if (item.storageKey) {
        const original = blobPath(item.storageKey), temporary = `${original}.${randomUUID()}.deleting`;
        const info = await stat(original).catch(error => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw new CloudError(503, "FILE_DELETE_FAILED", "파일 원본을 확인하지 못했습니다. 다시 시도해 주세요.");
        });
        if (!info) continue;
        if (!info.isFile()) throw new CloudError(503, "FILE_DELETE_FAILED", "파일 원본의 저장 상태가 올바르지 않습니다.");
        try { await rename(original, temporary); staged.push({ original, temporary }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new CloudError(503, "FILE_DELETE_FAILED", "파일 원본을 정리하지 못했습니다. 다시 시도해 주세요."); }
      }
      await releaseStorage(tx, tree);
      for (const item of [...tree].reverse()) await tx.cloud_item.delete({ where: { id: item.id } });
      return;
    }
    if (current.deletedAt) return;
    const tree = kind === "FOLDER" ? await trashTree(tx, current, true) : [current];
    const deletedAt = new Date(), trashBatchId = randomUUID();
    for (let offset = 0; offset < tree.length; offset += 500) {
      const ids = tree.slice(offset, offset + 500).map(item => item.id);
      await tx.cloud_item.updateMany({ where: { id: { in: ids }, ownerId, deletedAt: null }, data: { deletedAt, trashBatchId } });
      // Trash revokes bearer links permanently; restoring must not re-expose files.
      await tx.cloud_link.deleteMany({ where: { itemId: { in: ids } } });
    }
  }, kind === "FOLDER" ? 60000 : 5000); }
  catch (error) {
    for (const file of staged.reverse()) await rename(file.temporary, file.original).catch(() => { console.error("Cloud purge rollback failed", file.temporary); });
    throw error;
  }
  for (const file of staged) await unlink(file.temporary).catch(() => { console.error("Cloud purge cleanup required", file.temporary); });
  return new Response(null, { status: 204 });
}

export async function downloadCloudFile(request: Request, id: string) {
  const userId = await getCloudOwnerId(request);
  const { item } = await accessibleItem(prisma, id, userId, "FILE");
  if (item.deletedAt) throw new CloudError(404, "NOT_FOUND", "휴지통의 파일은 다운로드할 수 없습니다.");
  await checkParent(prisma, item.parentId, item.ownerId);
  return streamCloudFile(request, item);
}

// Caller must authorize access before using the common range/stream response.
export async function streamCloudFile(request: Request, item: cloud_item) {
  if (item.deletedAt) throw new CloudError(404, "NOT_FOUND", "파일을 찾을 수 없습니다.");
  if (!item.storageKey) throw new CloudError(404, "FILE_MISSING", "파일 원본이 없습니다.");
  const target = blobPath(item.storageKey);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new CloudError(404, "FILE_MISSING", "파일 원본을 찾을 수 없습니다.");
  const previewRequested = new URL(request.url).searchParams.get("preview") === "true";
  const mediaMime = mediaPreviewMime(item.name, item.mimeType);
  const previewMime = /^image\/(png|jpeg|gif|webp|avif)$/.test(item.mimeType || "") ? item.mimeType : mediaMime;
  const preview = previewRequested && !!previewMime;
  const range = parseByteRange(request.method === "GET" && !request.headers.has("if-range") ? request.headers.get("range") : null, info.size);
  if (range === false) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}`, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" } });
  const stream = request.method === "HEAD" ? null : responseStream(createReadStream(target, range || undefined), request.signal);
  return new Response(stream, { status: range ? 206 : 200, headers: {
    "Content-Type": preview ? previewMime! : "application/octet-stream",
    "Content-Length": String(range ? range.end - range.start + 1 : info.size),
    "Accept-Ranges": "bytes",
    ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${info.size}` } : {}),
    "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="download"; filename*=UTF-8''${encodeURIComponent(downloadName(item.name)).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  } });
}

export async function downloadCloudFiles(request: Request) {
  const userId = await getCloudOwnerId(request);
  const body = await readCloudBody(request);
  if (!Array.isArray(body.itemIds) || !body.itemIds.length || body.itemIds.length > 100) throw new CloudError(400, "INVALID_SELECTION", "파일·폴더 1~100개를 선택하세요.");
  const ids = [...new Set(body.itemIds.map(value => validateId(value)))];
  const selected: cloud_item[] = [];
  let totalBytes = 0;
  // Authorize the entire set before streaming any contents; never trust client ownership.
  for (const id of ids) {
    const { item } = await accessibleItem(prisma, id, userId);
    if (item.deletedAt) throw new CloudError(404, "NOT_FOUND", "휴지통 파일은 다운로드할 수 없습니다.");
    await checkParent(prisma, item.parentId, item.ownerId);
    selected.push(item);
  }
  const selectedIds = new Set(selected.map(item => item.id));
  const roots: cloud_item[] = [];
  for (const item of selected) {
    let parent = item.parentId, nested = false;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      if (selectedIds.has(parent)) { nested = true; break; }
      visited.add(parent); parent = (await requireItem(prisma, parent, item.ownerId, "FOLDER")).parentId;
    }
    if (!nested) roots.push(item);
  }
  let entries;
  try {
    entries = await buildDownloadTree(roots, folder => prisma.cloud_item.findMany({ where: { parentId: folder.id, ownerId: folder.ownerId, deletedAt: null }, orderBy: { name: "asc" }, take: 5001 }));
  } catch (error) { throw new CloudError(400, "INVALID_TREE", error instanceof Error ? error.message : "폴더 구조를 읽을 수 없습니다."); }
  const files: { item: cloud_item; target: string; path: string }[] = [];
  for (const { item, path: archivePath } of entries) {
    if (item.kind === "FOLDER") continue;
    if (!item.storageKey) throw new CloudError(404, "FILE_MISSING", "파일 원본이 없습니다.");
    const target = blobPath(item.storageKey);
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) throw new CloudError(404, "FILE_MISSING", `${item.name}: 파일 원본을 찾을 수 없습니다.`);
    totalBytes += info.size;
    if (body.mode !== "manifest" && totalBytes > DOWNLOAD_BUNDLE_LIMIT) throw new CloudError(413, "DOWNLOAD_TOO_LARGE", "ZIP 다운로드는 총 1 GB까지 가능합니다. 파일을 나누어 선택하거나 폴더 그대로 저장 기능을 사용하세요.");
    files.push({ item, target, path: archivePath });
  }
  if (body.mode === "manifest") return Response.json({ entries: entries.map(({ item, path }) => ({ id: item.id, path, kind: item.kind === "FOLDER" ? "folder" : "file" })) }, { headers: { "Cache-Control": "private, no-store" } });
  const zip = new JSZip();
  for (const entry of entries) if (entry.item.kind === "FOLDER") zip.file(`${entry.path}/`, "", { dir: true, date: entry.item.updatedAt });
  const inputs = files.map(({ item, target, path }) => {
    // Open each source only when JSZip consumes it, even for large folder trees.
    const input = Readable.from((async function* () {
      const source = createReadStream(target);
      try { for await (const chunk of source) yield chunk; }
      finally { source.destroy(); }
    })());
    zip.file(path, input, { date: item.updatedAt, binary: true });
    return input;
  });
  const output = zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "STORE" }) as Readable;
  output.once("close", () => { inputs.forEach(input => input.destroy()); });
  // JSZip returns a legacy readable-stream without an async iterator.
  const wrapped = new Readable({
    objectMode: false,
    destroy(error, callback) { output.destroy(error || undefined); callback(error); },
  }).wrap(output);
  const stream = responseStream(wrapped, request.signal);
  return new Response(stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="Cloud-files.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function listSharedItems(request: Request) {
  const userId = await getCloudOwnerId(request);
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? 100);
  const offset = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new CloudError(400, "INVALID_PAGINATION", "올바른 limit과 offset이 필요합니다.");
  // Expand shared folders dynamically; future children inherit permissions too.
  const rows = await prisma.$queryRaw<(cloud_item & { permission: CloudShareRole; sharedRoot: boolean })[]>`
    WITH RECURSIVE access AS (
      SELECT i."id", i."ownerId", s."role", ARRAY[i."id"] AS visited
      FROM "cloud_share" s JOIN "cloud_item" i ON i."id"=s."itemId"
      WHERE s."userId"=${userId} AND s."role" IS NOT NULL AND i."ownerId"<>${userId} AND i."deletedAt" IS NULL
      UNION ALL
      SELECT c."id", c."ownerId", a."role", a.visited || c."id"
      FROM access a JOIN "cloud_item" c ON c."parentId"=a."id" AND c."ownerId"=a."ownerId"
      WHERE c."deletedAt" IS NULL AND NOT c."id"=ANY(a.visited)
    )
    SELECT DISTINCT ON (i."id") i.*, a."role" AS permission,
      EXISTS(SELECT 1 FROM "cloud_share" s WHERE s."itemId"=i."id" AND s."userId"=${userId} AND s."role" IS NOT NULL) AS "sharedRoot"
    FROM access a JOIN "cloud_item" i ON i."id"=a."id"
    ORDER BY i."id", a."role" DESC`;
  // Apply the same ancestor checks as downloads, including legacy trashed ancestors.
  const accessible: typeof rows = [];
  for (const row of rows) {
    try { const access = await accessibleItem(prisma, row.id, userId); accessible.push({ ...row, permission: access.permission as CloudShareRole }); }
    catch (error) { if (!(error instanceof CloudError) || error.status !== 404) throw error; }
  }
  accessible.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
  const page = accessible.slice(offset, offset + limit);
  const owners = await resolveUserProfiles(request, page.map(item => item.ownerId));
  const preferences = await prisma.cloud_share.findMany({ where: { userId, itemId: { in: page.map(item => item.id) }, starred: true }, select: { itemId: true } });
  const starredIds = new Set(preferences.map(preference => preference.itemId));
  return Response.json({ items: page.map(item => serialize(item, { permission: item.permission, shared: true, sharedRoot: item.sharedRoot, starred: starredIds.has(item.id), owner: owners.get(item.ownerId) || null })), total: accessible.length, limit, offset }, { headers: { "Cache-Control": "no-store" } });
}

function shareRole(value: unknown): CloudShareRole {
  if (value !== "VIEWER" && value !== "EDITOR") throw new CloudError(400, "INVALID_ROLE", "공유 권한은 VIEWER 또는 EDITOR여야 합니다.");
  return value;
}

export async function listItemShares(request: Request) {
  const userId = await getCloudOwnerId(request);
  const itemId = validateId(new URL(request.url).searchParams.get("itemId"));
  const item = await requireItem(prisma, itemId, userId);
  if (item.deletedAt) throw new CloudError(409, "ITEM_DELETED", "휴지통 항목은 공유할 수 없습니다.");
  const shares = await prisma.cloud_share.findMany({ where: { itemId, role: { not: null } }, orderBy: { createdAt: "asc" }, select: { userId: true, role: true } });
  const inherited = new Map<string, { userId: string; role: CloudShareRole; sourceId: string; sourceName: string }>();
  let parentId = item.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = await requireItem(prisma, parentId, userId, "FOLDER");
    if (parent.deletedAt) break;
    const grants = await prisma.cloud_share.findMany({ where: { itemId: parentId, role: { not: null } }, select: { userId: true, role: true } });
    for (const grant of grants) {
      if (!grant.role) continue;
      const existing = inherited.get(grant.userId);
      if (!existing || grant.role === "EDITOR") inherited.set(grant.userId, { ...grant, role: grant.role, sourceId: parent.id, sourceName: parent.name });
    }
    parentId = parent.parentId;
  }
  const inheritedShares = [...inherited.values()];
  const profiles = await resolveUserProfiles(request, [...shares, ...inheritedShares].map(share => share.userId));
  const withProfile = <T extends { userId: string }>(share: T) => ({ ...share, ...(profiles.get(share.userId) || { handle: "", displayName: "사용자 정보를 불러올 수 없음" }) });
  return Response.json({ shares: shares.map(withProfile), inherited: inheritedShares.map(withProfile) }, { headers: { "Cache-Control": "no-store" } });
}

export async function addItemShare(request: Request) {
  const userId = await getCloudOwnerId(request);
  const body = await readCloudBody(request);
  const itemId = validateId(body.itemId);
  const role = shareRole(body.role ?? "VIEWER");
  const item = await requireItem(prisma, itemId, userId);
  if (item.deletedAt) throw new CloudError(409, "ITEM_DELETED", "휴지통 항목은 공유할 수 없습니다.");
  const recipient = await resolveShareRecipient(request, body.handle);
  if (recipient.id === userId) throw new CloudError(400, "SELF_SHARE", "소유자는 이미 모든 권한을 가지고 있습니다.");
  const share = await mutate(userId, async tx => {
    const current = await requireItem(tx, itemId, userId);
    if (current.deletedAt) throw new CloudError(409, "ITEM_DELETED", "휴지통 항목은 공유할 수 없습니다.");
    const existing = await tx.cloud_share.findUnique({ where: { itemId_userId: { itemId, userId: recipient.id } } });
    if (existing?.role) throw new CloudError(409, "ALREADY_SHARED", "이미 공유된 사용자입니다. 목록에서 권한을 변경하세요.");
    if (existing) return tx.cloud_share.update({ where: { id: existing.id }, data: { role }, select: { userId: true, role: true } });
    return tx.cloud_share.create({ data: { itemId, userId: recipient.id, role }, select: { userId: true, role: true } });
  });
  return Response.json({ share: { ...share, handle: recipient.handle, displayName: recipient.displayName } }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function changeItemShare(request: Request) {
  const ownerId = await getCloudOwnerId(request);
  const body = await readCloudBody(request);
  const itemId = validateId(body.itemId);
  if (typeof body.userId !== "string" || !body.userId.trim() || body.userId.length > 255) throw new CloudError(400, "INVALID_USER", "올바른 사용자 ID가 필요합니다.");
  const userId = body.userId;
  const role = request.method === "PATCH" ? shareRole(body.role) : null;
  await mutate(ownerId, async tx => {
    const item = await requireItem(tx, itemId, ownerId);
    if (item.deletedAt) throw new CloudError(409, "ITEM_DELETED", "휴지통 항목의 공유는 변경할 수 없습니다.");
    const where = { itemId_userId: { itemId, userId } };
    const share = await tx.cloud_share.findUnique({ where });
    if (!share?.role) throw new CloudError(404, "SHARE_NOT_FOUND", "공유 사용자를 찾을 수 없습니다.");
    if (role) await tx.cloud_share.update({ where, data: { role } });
    else {
      await tx.cloud_share.delete({ where });
      // Remove inherited preferences that lost access, but preserve those still
      // reachable through another explicit share. Use the same checks as reads.
      const preferences = await tx.cloud_share.findMany({ where: { userId, role: null, item: { ownerId } }, select: { id: true, itemId: true } });
      for (const preference of preferences) {
        try { await accessibleItem(tx, preference.itemId, userId); }
        catch (error) {
          if (!(error instanceof CloudError) || error.status !== 404) throw error;
          await tx.cloud_share.delete({ where: { id: preference.id } });
        }
      }
    }
  });
  return new Response(null, { status: 204 });
}
