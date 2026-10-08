import type { SQLiteDatabase } from "expo-sqlite";
import { canonicalizeSystemItemsForSync } from "@/data/lifeflow/unifiedRepository";
import { syncLifeFlow } from "@/lib/api/lifeflow";
import { applyLifeFlowSnapshot } from "./lifeflowSnapshot";
import { collectLifeFlowEntities } from "./lifeflowCollect";
import { reconcileIncrementalLifeFlow } from "./lifeflowIncremental";

export { collectLifeFlowEntities } from "./lifeflowCollect";

export async function reconcileLifeFlow(
  db: SQLiteDatabase,
  signal?: AbortSignal,
  incremental = false,
): Promise<{ pushed: number; pulled: number; changed: number }> {
  await canonicalizeSystemItemsForSync(db);
  if (incremental) return reconcileIncrementalLifeFlow(db, signal);
  let local: Awaited<ReturnType<typeof collectLifeFlowEntities>> = [];
  await db.withExclusiveTransactionAsync(async (txn) => { local = await collectLifeFlowEntities(txn); });
  const response = await syncLifeFlow(local, signal);
  const changed = await applyLifeFlowSnapshot(db, response.entities, local);
  return { pushed: local.length, pulled: response.entities.length, changed };
}
