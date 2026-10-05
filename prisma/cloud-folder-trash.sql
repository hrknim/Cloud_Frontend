-- Additive migration: existing trash stays independent of new folder trash batches.
ALTER TABLE "cloud_item" ADD COLUMN IF NOT EXISTS "trashBatchId" TEXT;
