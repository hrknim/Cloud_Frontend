-- Additive, rerunnable migration; never change the central auth tables.
-- Historical uploads have no uploader record, so backfill their current owner.
BEGIN;
LOCK TABLE "cloud_item" IN ACCESS EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS "cloud_storage" (
  "userId" TEXT PRIMARY KEY,
  "usedBytes" BIGINT NOT NULL DEFAULT 0 CHECK ("usedBytes" >= 0),
  "limitBytes" BIGINT NOT NULL DEFAULT 10737418240 CHECK ("limitBytes" >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
LOCK TABLE "cloud_storage" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "cloud_item" ADD COLUMN IF NOT EXISTS "storageOwnerId" TEXT;
UPDATE "cloud_item" SET "storageOwnerId" = "ownerId" WHERE "kind" = 'FILE' AND "storageOwnerId" IS NULL;
CREATE INDEX IF NOT EXISTS "cloud_item_storageOwnerId_kind_idx" ON "cloud_item" ("storageOwnerId", "kind");
-- Include trash; counters are not reset when this script is run again.
INSERT INTO "cloud_storage" ("userId", "usedBytes", "updatedAt")
SELECT "storageOwnerId", COALESCE(SUM("size"), 0)::BIGINT, CURRENT_TIMESTAMP
FROM "cloud_item" WHERE "kind" = 'FILE' GROUP BY "storageOwnerId"
ON CONFLICT ("userId") DO NOTHING;
COMMIT;
