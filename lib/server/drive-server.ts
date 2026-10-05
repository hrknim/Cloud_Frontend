import { Prisma, type cloud_item } from "@prisma/client";
import { prismaSetting as prisma } from "./prisma";
import { accessibleItem, getCloudOwnerId, parseParent, serialize, validateId } from "./cloud";
import { CloudError } from "./cloud-error";
import { resolveUserProfiles } from "./user-profile";
import { driveCandidates, driveWhere, orderSql, parseDriveQuery, type DriveQuery } from "./drive-query";
import { toDriveItem } from "@/lib/drive/drive-api";
import { supportsFilePreview } from "@/lib/previews/preview-navigation";
import { storageAccount } from "./storage-quota";

type Row = cloud_item & { permission: "OWNER" | "VIEWER" | "EDITOR"; personalStar: boolean; sharedRoot: boolean; position?: bigint; childCount?: bigint };
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function listDrivePage(request: Request) {
  const userId = await getCloudOwnerId(request), params = new URL(request.url).searchParams;
  const query = parseDriveQuery(params), parentId = parseParent(params.get("parentId"));
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof accessibleItem>> | null>>();
  const access = (id: string) => {
    let result = cache.get(id);
    if (!result) { result = accessibleItem(prisma, id, userId).catch(error => { if (error instanceof CloudError && error.status === 404) return null; throw error; }); cache.set(id, result); }
    return result;
  };
  const context = new Map<string, Awaited<ReturnType<typeof accessibleItem>>>();
  const ancestors = async (id: string | null) => {
    const path: string[] = [], seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id); const value = await access(id);
      if (!value || value.item.deletedAt || value.item.kind !== "FOLDER") break;
      context.set(id, value); path.unshift(id); id = value.item.parentId;
    }
    return path;
  };
  if (parentId) {
    const current = await access(parentId);
    if (!current || current.item.deletedAt || current.item.kind !== "FOLDER") throw new CloudError(404, "NOT_FOUND", "폴더를 찾을 수 없습니다.");
  }
  const path = await ancestors(parentId);
  const page = async (options: DriveQuery) => {
    const where = driveWhere(options, parentId), base = driveCandidates(userId);
    const [rows, counts] = await Promise.all([
      prisma.$queryRaw<Row[]>(Prisma.sql`${base} SELECT *, CASE WHEN "kind"='FOLDER' THEN (SELECT count(*) FROM "cloud_item" child WHERE child."parentId"=candidates."id" AND child."ownerId"=candidates."ownerId" AND child."deletedAt" IS NULL) ELSE 0 END AS "childCount" FROM candidates WHERE ${where} ORDER BY ${orderSql(options.sort)} LIMIT ${options.limit} OFFSET ${options.offset}`),
      prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`${base} SELECT count(*) AS total FROM candidates WHERE ${where}`),
    ]);
    return { rows, total: Number(counts[0].total) };
  };
  let result;
  if (query.area === "home" && !query.q && query.kind === "all" && !query.starredOnly && !query.from && !query.to) {
    const sections = await Promise.all([
      page({ ...query, area: "recent", limit: 8, offset: 0, sort: "modified" }),
      page({ ...query, area: "starred", limit: 6, offset: 0, sort: "modified" }),
      page({ ...query, area: "shared", scope: "current", limit: 5, offset: 0, sort: "modified" }),
    ]);
    result = { rows: [...new Map(sections.flatMap(section => section.rows).map(row => [row.id, row])).values()], total: 0 };
  } else result = await page(query);
  for (const row of result.rows) await ancestors(row.parentId);
  const owners = await resolveUserProfiles(request, [...result.rows.filter(row => row.permission !== "OWNER").map(row => row.ownerId), ...[...context.values()].filter(value => value.permission !== "OWNER").map(value => value.item.ownerId)]);
  const nodes = [...result.rows, ...[...context.values()].map(value => value.item)];
  const shares = nodes.length ? await prisma.cloud_share.findMany({ where: { itemId: { in: [...new Set(nodes.map(node => node.id))] }, role: { not: null } }, select: { itemId: true } }) : [];
  const shared = new Set(shares.map(share => share.itemId));
  const isShared = (row: cloud_item) => {
    const seen = new Set<string>(); let current: cloud_item | undefined = row;
    while (current && !seen.has(current.id)) { if (shared.has(current.id)) return true; seen.add(current.id); current = current.parentId ? context.get(current.parentId)?.item : undefined; }
    return false;
  };
  const items = result.rows.map(row => ({ ...serialize(row, { permission: row.permission, starred: row.personalStar, sharedRoot: row.sharedRoot, shared: row.permission !== "OWNER" || isShared(row), owner: row.permission === "OWNER" ? null : owners.get(row.ownerId) || null }), childCount: Number(row.childCount || 0) }));
  const ancestorsData = [...context.values()].map(({ item, permission }) => serialize(item, { permission, shared: permission !== "OWNER" || isShared(item), owner: permission === "OWNER" ? null : owners.get(item.ownerId) || null }));
  return Response.json({ items, context: ancestorsData, path, total: result.total, limit: query.limit, offset: query.offset }, { headers });
}

export async function driveStorage(request: Request) {
  const ownerId = await getCloudOwnerId(request);
  const account = await storageAccount(prisma, ownerId);
  return Response.json({ bytes: Number(account.usedBytes), limitBytes: Number(account.limitBytes) }, { headers });
}

export async function drivePreviewNeighbors(request: Request) {
  const userId = await getCloudOwnerId(request), params = new URL(request.url).searchParams;
  const query = parseDriveQuery(params), id = validateId(params.get("itemId"));
  const { item: current } = await accessibleItem(prisma, id, userId, "FILE");
  if (current.deletedAt) throw new CloudError(404, "NOT_FOUND", "파일을 찾을 수 없습니다.");
  const base = Prisma.sql`${driveCandidates(userId)}, ranked AS (
    SELECT *, row_number() OVER (ORDER BY ${orderSql(query.sort)}) AS position FROM candidates
    WHERE "ownerId"=${current.ownerId} AND "parentId" IS NOT DISTINCT FROM ${current.parentId} AND "deletedAt" IS NULL AND "kind"='FILE'
  )`;
  const anchor = await prisma.$queryRaw<{ position: bigint }[]>(Prisma.sql`${base} SELECT position FROM ranked WHERE "id"=${id}`);
  if (!anchor.length) throw new CloudError(404, "NOT_FOUND", "파일을 찾을 수 없습니다.");
  const neighbor = async (previous: boolean) => {
    let position = anchor[0].position;
    while (true) {
      const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`${base} SELECT * FROM ranked WHERE ${previous ? Prisma.sql`position<${position}` : Prisma.sql`position>${position}`} ORDER BY position ${previous ? Prisma.sql`DESC` : Prisma.sql`ASC`} LIMIT 50`);
      const row = rows.find(row => supportsFilePreview(toDriveItem({ ...serialize(row, { permission: row.permission }), kind: row.kind === "FOLDER" ? "folder" : "file", createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() || null })));
      if (row) return row;
      if (rows.length < 50) return null;
      position = rows.at(-1)!.position!;
    }
  };
  const [previous, next] = await Promise.all([neighbor(true), neighbor(false)]);
  const owners = await resolveUserProfiles(request, [previous, next].filter((row): row is Row => !!row && row.permission !== "OWNER").map(row => row.ownerId));
  const data = (row: Row | null) => row ? serialize(row, { permission: row.permission, starred: row.personalStar, shared: row.permission !== "OWNER", sharedRoot: row.sharedRoot, owner: owners.get(row.ownerId) || null }) : null;
  return Response.json({ previous: data(previous), next: data(next) }, { headers });
}
