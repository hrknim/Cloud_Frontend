import type { Prisma } from "@prisma/client";
import { CloudError } from "./cloud-error";

type DB = Prisma.TransactionClient;

export function storageAccount(db: DB, userId: string) {
  return db.cloud_storage.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function chargeStorage(db: DB, userId: string, bytes: bigint) {
  await storageAccount(db, userId);
  // The condition and increment share one row lock, even for concurrent uploads
  // into different owners' shared folders. Never trust a client quota or UUID.
  const count = await db.$executeRaw`
    UPDATE "cloud_storage" SET "usedBytes" = "usedBytes" + ${bytes}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId} AND "usedBytes" + ${bytes} <= "limitBytes"
  `;
  if (count !== 1) throw new CloudError(413, "STORAGE_QUOTA_EXCEEDED", "저장용량이 부족합니다. 휴지통에서 파일을 완전 삭제한 후 다시 시도해 주세요.");
}

export async function releaseStorage(db: DB, items: { kind: string; ownerId: string; storageOwnerId: string | null; size: bigint }[]) {
  const totals = new Map<string, bigint>();
  for (const item of items) if (item.kind === "FILE" && item.size > BigInt(0)) {
    const userId = item.storageOwnerId || item.ownerId;
    totals.set(userId, (totals.get(userId) || BigInt(0)) + item.size);
  }
  // Consistent row order avoids deadlocks when purging mixed-uploader trees.
  for (const [userId, bytes] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
    const count = await db.$executeRaw`
      UPDATE "cloud_storage" SET "usedBytes" = "usedBytes" - ${bytes}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "usedBytes" >= ${bytes}
    `;
    if (count !== 1) throw new CloudError(503, "STORAGE_ACCOUNTING_ERROR", "저장용량 정보를 확인하지 못했습니다. 다시 시도해 주세요.");
  }
}
