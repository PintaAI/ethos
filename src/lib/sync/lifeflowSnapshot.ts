import type { SQLiteDatabase } from "expo-sqlite";
import type { LifeFlowSyncEntity } from "@/lib/api/lifeflow";
import { applyLifeFlowEntity } from "./lifeflowApply";
import { collectLifeFlowEntities } from "./lifeflowCollect";
import { orderLifeFlowSnapshot } from "./lifeflowOrder";
import { canonicalSyncValue } from "./syncIdentity";

function key(entity: LifeFlowSyncEntity) {
  return `${entity.kind}:${entity.id}`;
}

// The comparison and apply share a transaction. A local change during the
// request wins over its stale response, independent of device clock skew.
export async function applyLifeFlowSnapshot(
  db: SQLiteDatabase,
  received: LifeFlowSyncEntity[],
  sent: LifeFlowSyncEntity[],
): Promise<number> {
  let changes = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const current = await collectLifeFlowEntities(txn);
    const before = new Map(sent.map((entity) => [key(entity), canonicalSyncValue(entity)]));
    const after = new Map(current.map((entity) => [key(entity), canonicalSyncValue(entity)]));
    const protectedKeys = new Set([...before.keys(), ...after.keys()].filter((id) => before.get(id) !== after.get(id)));
    // Preserve parent/child consistency too: a server parent delete must not
    // cascade through a child edited locally while the request was in flight.
    for (const entity of [...sent, ...current]) {
      if (entity.kind !== "item" && protectedKeys.has(key(entity))) {
        const parent = entity.data?.item_id ?? entity.id.slice(0, entity.id.lastIndexOf("|"));
        protectedKeys.add(`item:${parent}`);
      }
    }
    for (const entity of orderLifeFlowSnapshot(received)) {
      if (protectedKeys.has(key(entity))) continue;
      if (entity.kind !== "item") {
        const parent = entity.data?.item_id ?? entity.id.slice(0, entity.id.lastIndexOf("|"));
        if (protectedKeys.has(`item:${parent}`)) continue;
      }
      changes += await applyLifeFlowEntity(txn, entity);
    }
  });
  return changes;
}
