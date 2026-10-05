-- One-time cleanup of inaccessible preference-only rows from the previous policy.
-- Actual grants and preferences reachable through another share are preserved.
BEGIN;
WITH RECURSIVE ancestry AS (
  SELECT s."id" AS preference_id, s."userId", i."ownerId", i."id", i."parentId",
    i."deletedAt" IS NOT NULL AS blocked, ARRAY[i."id"] AS visited,
    EXISTS (SELECT 1 FROM "cloud_share" g WHERE g."itemId"=i."id" AND g."userId"=s."userId" AND g."role" IS NOT NULL) AS has_access
  FROM "cloud_share" s JOIN "cloud_item" i ON i."id"=s."itemId"
  WHERE s."role" IS NULL
  UNION ALL
  SELECT a.preference_id, a."userId", a."ownerId", p."id", p."parentId",
    a.blocked OR p."deletedAt" IS NOT NULL, a.visited || p."id",
    a.has_access OR EXISTS (SELECT 1 FROM "cloud_share" g WHERE g."itemId"=p."id" AND g."userId"=a."userId" AND g."role" IS NOT NULL)
  FROM ancestry a JOIN "cloud_item" p ON p."id"=a."parentId" AND p."ownerId"=a."ownerId"
  WHERE NOT p."id"=ANY(a.visited)
)
DELETE FROM "cloud_share" s
WHERE s."role" IS NULL AND NOT EXISTS (
  SELECT 1 FROM ancestry a WHERE a.preference_id=s."id" AND a."parentId" IS NULL AND NOT a.blocked AND a.has_access
);
COMMIT;
