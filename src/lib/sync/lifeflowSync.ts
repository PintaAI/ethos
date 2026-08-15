import type { SQLiteDatabase } from "expo-sqlite";
import { canonicalizeSystemItemsForSync } from "@/data/lifeflow/unifiedRepository";
import { syncLifeFlow } from "@/lib/api/lifeflow";
import { applyLifeFlowEntity } from "./lifeflowApply";
import { collectLifeFlowEntities } from "./lifeflowCollect";
import { orderLifeFlowSnapshot } from "./lifeflowOrder";

export { collectLifeFlowEntities } from "./lifeflowCollect";

export async function reconcileLifeFlow(
  db: SQLiteDatabase,
  signal?: AbortSignal,
): Promise<{ pushed: number; pulled: number }> {
  await canonicalizeSystemItemsForSync(db);
  const local = await collectLifeFlowEntities(db);
  const response = await syncLifeFlow(local, signal);
  const ordered = orderLifeFlowSnapshot(response.entities);
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const entity of ordered) await applyLifeFlowEntity(txn, entity);
  });
  return { pushed: local.length, pulled: response.entities.length };
}
