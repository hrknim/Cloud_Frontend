-- Add only Cloud link sharing; default access requires an explicit or inherited share.
BEGIN;
DO $$ BEGIN
  CREATE TYPE "CloudLinkAccess" AS ENUM ('RESTRICTED', 'PUBLIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "cloud_link" (
  "itemId" TEXT PRIMARY KEY REFERENCES "cloud_item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "access" "CloudLinkAccess" NOT NULL DEFAULT 'RESTRICTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;
