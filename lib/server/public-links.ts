import { randomBytes } from "node:crypto";
import { Prisma, type cloud_item } from "@prisma/client";
import { prismaSetting as prisma } from "./prisma";
import { CloudError } from "./cloud-error";
import { accessibleItem, cloudResponse, getCloudOwnerId, readCloudBody, streamCloudFile, validateId } from "./cloud";

const missing = () => new CloudError(404, "LINK_NOT_FOUND", "공유 링크가 해제되었거나 파일을 찾을 수 없습니다.");

async function activeFile(db: Prisma.TransactionClient, item: cloud_item) {
  if (item.kind !== "FILE" || item.deletedAt) throw missing();
  const seen = new Set([item.id]);
  let parentId = item.parentId;
  while (parentId) {
    if (seen.has(parentId)) throw missing();
    seen.add(parentId);
    const parent = await db.cloud_item.findFirst({ where: { id: parentId, ownerId: item.ownerId, kind: "FOLDER", deletedAt: null } });
    if (!parent) throw missing();
    parentId = parent.parentId;
  }
}

function settings(link: { token: string; access: string } | null) {
  return { enabled: !!link, access: link?.access || "RESTRICTED", path: link ? `/s/${link.token}` : null };
}

export async function manageFileLink(request: Request) {
  const userId = await getCloudOwnerId(request);
  const body = request.method === "GET" ? { itemId: new URL(request.url).searchParams.get("itemId") } : await readCloudBody(request);
  const itemId = validateId(body.itemId);
  if (request.method === "POST" && body.access !== "PUBLIC" && body.access !== "RESTRICTED") throw new CloudError(400, "INVALID_LINK_ACCESS", "공유 링크의 접근 범위를 선택하세요.");
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const item = await tx.cloud_item.findFirst({ where: { id: itemId, ownerId: userId, kind: "FILE" } });
    if (!item) throw missing(); // Only the tree owner can manage links, not editors.
    if (request.method === "DELETE") {
      await tx.cloud_link.deleteMany({ where: { itemId } });
      return settings(null);
    }
    await activeFile(tx, item);
    if (request.method === "GET") return settings(await tx.cloud_link.findUnique({ where: { itemId } }));
    const access = body.access as "PUBLIC" | "RESTRICTED";
    return settings(await tx.cloud_link.upsert({
      where: { itemId }, create: { itemId, token: randomBytes(32).toString("base64url"), access }, update: { access },
    }));
  });
  return Response.json(result, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export async function resolveFileLink(request: Request, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw missing();
  const link = await prisma.cloud_link.findUnique({ where: { token }, include: { item: true } });
  if (!link) throw missing();
  await activeFile(prisma, link.item);
  if (link.access === "RESTRICTED") await accessibleItem(prisma, link.item.id, await getCloudOwnerId(request), "FILE");
  return link.item;
}

export async function publicFileData(request: Request, token: string) {
  const item = await resolveFileLink(request, token);
  // Never reveal real item IDs, uploader/owner UUIDs, parent paths or storage keys.
  return { id: token, name: item.name, kind: "file" as const, parentId: null, mimeType: item.mimeType,
    size: Number(item.size), starred: false, deletedAt: null, createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(), permission: "VIEWER" as const,
    downloadUrl: `/api/public/files/${token}/content` };
}

export function publicLinkResponse(action: () => Promise<Response>) {
  return cloudResponse(action).then(response => {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  });
}

export async function downloadFileLink(request: Request, token: string) {
  return streamCloudFile(request, await resolveFileLink(request, token));
}
