import type { Item } from "./drive-api";

export type BatchResult = { id: string; name: string; status: "success" | "skipped" | "error"; message?: string };
export async function runItemBatch(items: Item[], action: (item: Item) => Promise<unknown>, onResult?: (result: BatchResult) => void) {
  const results: BatchResult[] = [];
  for (const item of items) {
    let result: BatchResult;
    try { await action(item); result = { id: item.id, name: item.name, status: "success" }; }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      result = { id: item.id, name: item.name, status: code === "ALREADY_SHARED" ? "skipped" : "error", message: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." };
    }
    results.push(result); onResult?.(result);
  }
  return results;
}
