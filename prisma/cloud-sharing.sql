-- Add sharing without changing existing items or authentication tables.
BEGIN;
CREATE TYPE "CloudShareRole" AS ENUM ('VIEWER', 'EDITOR');
CREATE TABLE "cloud_share" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL REFERENCES "cloud_item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "CloudShareRole" NOT NULL DEFAULT 'VIEWER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_share_itemId_userId_key" UNIQUE ("itemId", "userId")
);
CREATE INDEX "cloud_share_userId_itemId_idx" ON "cloud_share"("userId", "itemId");
COMMIT;
