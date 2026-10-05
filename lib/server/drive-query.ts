import { Prisma } from "@prisma/client";
import { CloudError } from "./cloud-error";
import { extensions, mimeKinds, fileCategories } from "@/lib/files/file-types";

export function parseDriveQuery(params: URLSearchParams) {
  const area = params.get("area") || "drive", sort = params.get("sort") || "modified", kind = params.get("kind") || "all";
  const scope = params.get("scope") || "current", q = params.get("q")?.trim() || "";
  const limit = Number(params.get("limit") || 50), offset = Number(params.get("offset") || 0);
  if (!["home", "drive", "shared", "recent", "starred", "trash"].includes(area) || !["modified", "name", "size"].includes(sort) || !["current", "all"].includes(scope) || !["all", ...fileCategories.map(category => category.id)].includes(kind) || q.length > 255 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new CloudError(400, "INVALID_QUERY", "목록 조회 조건이 올바르지 않습니다.");
  const date = (key: string, end = false) => {
    const value = params.get(key); if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new CloudError(400, "INVALID_QUERY", "날짜 조회 조건이 올바르지 않습니다.");
    return new Date(Date.parse(`${value}T00:00:00+09:00`) + (end ? 86400000 : 0));
  };
  return { area, sort, kind, scope, q, limit, offset, from: date("from"), to: date("to", true), starredOnly: params.get("starredOnly") === "true" };
}
export type DriveQuery = ReturnType<typeof parseDriveQuery>;

// Same extension-first classification rules as classifyFile, evaluated before SQL pagination.
export function categorySql() {
  const mime = Prisma.sql`lower(trim(split_part(coalesce("mimeType", ''), ';', 1)))`;
  const ext = Prisma.sql`CASE WHEN strpos("name", '.') > 0 THEN lower(regexp_replace("name", '^.*[.]', '')) ELSE '' END`;
  const branches = Object.entries(extensions).map(([kind, values]) => Prisma.sql`WHEN ${ext} IN (${Prisma.join(values)}) THEN ${kind}`);
  const mimeBranches = Object.entries(mimeKinds).map(([value, kind]) => Prisma.sql`WHEN ${mime} = ${value} THEN ${kind}`);
  return Prisma.sql`CASE WHEN "kind" = 'FOLDER' THEN 'folder'
    WHEN lower("name") IN ('dockerfile','makefile','cmakelists.txt','.gitignore','.gitattributes','.editorconfig','.env') OR lower("name") LIKE '.env.%' THEN 'code'
    WHEN lower("name") LIKE '%.ts' AND lower(coalesce("mimeType",'')) LIKE 'video/%' THEN 'video'
    ${Prisma.join(branches, " ")} ${Prisma.join(mimeBranches, " ")}
    WHEN ${mime} LIKE 'image/%' THEN 'image' WHEN ${mime} LIKE 'video/%' THEN 'video'
    WHEN ${mime} LIKE 'audio/%' THEN 'audio' WHEN ${mime} LIKE 'model/%' THEN '3d'
    WHEN ${mime} LIKE 'font/%' THEN 'font' WHEN ${mime} LIKE 'text/%' THEN 'document' ELSE 'file' END`;
}
export function orderSql(sort: string) {
  const names = Prisma.sql`lower("name") COLLATE "C" ASC, "id" ASC`;
  return Prisma.sql`CASE WHEN "kind" = 'FOLDER' THEN 0 ELSE 1 END ASC, ${sort === "name" ? names : sort === "size" ? Prisma.sql`"size" DESC, ${names}` : Prisma.sql`"updatedAt" DESC, ${names}`}`;
}

export function driveCandidates(userId: string) {
  return Prisma.sql`WITH RECURSIVE
    share_roots AS (
      SELECT i.*, s."role" AS permission FROM "cloud_share" s JOIN "cloud_item" i ON i."id"=s."itemId"
      WHERE s."userId"=${userId} AND s."role" IS NOT NULL AND i."ownerId"<>${userId} AND i."deletedAt" IS NULL
      AND NOT EXISTS (
        WITH RECURSIVE parents AS (
          SELECT p.*, ARRAY[i."id",p."id"] AS visited FROM "cloud_item" p WHERE p."id"=i."parentId"
          UNION ALL SELECT p.*, a.visited || p."id" FROM parents a JOIN "cloud_item" p ON p."id"=a."parentId" WHERE NOT p."id"=ANY(a.visited)
        ) SELECT 1 FROM parents WHERE "deletedAt" IS NOT NULL OR "ownerId"<>i."ownerId"
      )
    ), access AS (
      SELECT "id","ownerId",permission,ARRAY["id"] AS visited FROM share_roots
      UNION ALL SELECT c."id",c."ownerId",a.permission,a.visited || c."id" FROM access a JOIN "cloud_item" c ON c."parentId"=a."id" AND c."ownerId"=a."ownerId" WHERE c."deletedAt" IS NULL AND NOT c."id"=ANY(a.visited)
    ), grants AS (
      SELECT "id", CASE WHEN bool_or(permission='EDITOR') THEN 'EDITOR' ELSE 'VIEWER' END AS permission FROM access GROUP BY "id"
    ), candidates AS (
      SELECT i.*, 'OWNER'::text AS permission,i."starred" AS "personalStar",false AS "sharedRoot" FROM "cloud_item" i WHERE i."ownerId"=${userId}
      UNION ALL SELECT i.*, g.permission,coalesce(s."starred",false) AS "personalStar",coalesce(s."role" IS NOT NULL,false) AS "sharedRoot" FROM grants g JOIN "cloud_item" i ON i."id"=g."id" LEFT JOIN "cloud_share" s ON s."itemId"=i."id" AND s."userId"=${userId}
    )`;
}
export function driveWhere(query: DriveQuery, parentId: string | null) {
  const conditions = [query.area === "trash" ? Prisma.sql`"deletedAt" IS NOT NULL AND permission='OWNER'` : Prisma.sql`"deletedAt" IS NULL`];
  if (query.area === "shared") conditions.push(Prisma.sql`permission<>'OWNER'`, ...(query.scope === "all" ? [] : [Prisma.sql`"sharedRoot"=true`]));
  if (query.area === "starred" || query.starredOnly) conditions.push(Prisma.sql`"personalStar"=true`);
  if (query.area === "recent") conditions.push(Prisma.sql`"kind"='FILE'`);
  if (query.area === "drive" && query.scope === "current") conditions.push(Prisma.sql`"parentId" IS NOT DISTINCT FROM ${parentId}`, ...(parentId ? [] : [Prisma.sql`permission='OWNER'`]));
  if (query.q) conditions.push(Prisma.sql`"name" ILIKE ${`%${query.q.replace(/[\\%_]/g, character => `\\${character}`)}%`}`);
  if (query.kind !== "all") conditions.push(Prisma.sql`(${categorySql()})=${query.kind}`);
  if (query.from) conditions.push(Prisma.sql`"updatedAt">=${query.from}`);
  if (query.to) conditions.push(Prisma.sql`"updatedAt"<${query.to}`);
  return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}
