-- Remove display metadata replicated from the central auth server.
-- Preserve item ownership, recipient UUIDs and all Cloud sharing permissions.
BEGIN;
ALTER TABLE "cloud_share" DROP COLUMN IF EXISTS "email";
ALTER TABLE "cloud_share" DROP COLUMN IF EXISTS "handle";
ALTER TABLE "cloud_share" DROP COLUMN IF EXISTS "displayName";
DROP TABLE IF EXISTS "cloud_profile";
COMMIT;
