-- Keep existing grants; null roles store preferences without granting access.
BEGIN;
ALTER TABLE "cloud_share" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cloud_share" ALTER COLUMN "role" DROP NOT NULL;
COMMIT;
