-- Add only the cloud tables; existing auth tables are not changed.
-- Apply once with: npx prisma db execute --file prisma/cloud-schema.sql
BEGIN;
CREATE TYPE "CloudItemKind" AS ENUM ('FILE', 'FOLDER');
CREATE TABLE "cloud_item" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" "CloudItemKind" NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "parentId" TEXT,
  "mimeType" TEXT,
  "size" BIGINT NOT NULL DEFAULT 0,
  "storageKey" TEXT,
  "starred" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  "trashBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cloud_item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cloud_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cloud_item_storageKey_key" ON "cloud_item"("storageKey");
CREATE INDEX "cloud_item_ownerId_parentId_deletedAt_idx" ON "cloud_item"("ownerId", "parentId", "deletedAt");
CREATE INDEX "cloud_item_ownerId_kind_deletedAt_idx" ON "cloud_item"("ownerId", "kind", "deletedAt");
COMMIT;
