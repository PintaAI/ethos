import type { LifeFlowKind, LifeFlowSyncEntity } from "@/lib/api/lifeflow";

export function orderLifeFlowSnapshot(entities: LifeFlowSyncEntity[]) {
  const dependencyOrder: Record<LifeFlowKind, number> = {
    item: 0,
    habit_log: 1,
    item_exception: 1,
  };
  return [...entities].sort((left, right) => {
    if (left.deleted !== right.deleted) return left.deleted ? 1 : -1;
    const direction = left.deleted ? -1 : 1;
    return direction * (dependencyOrder[left.kind] - dependencyOrder[right.kind]);
  });
}
