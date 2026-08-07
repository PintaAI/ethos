import type { LifeFlowKind, LifeFlowSyncEntity } from "@/lib/api/lifeflow";

export function orderLifeFlowSnapshot(entities: LifeFlowSyncEntity[]) {
  const dependencyOrder: Record<LifeFlowKind, number> = {
    habit: 0,
    day_preset: 1,
    day_preset_block: 2,
    day_preset_schedule: 3,
    habit_log: 4,
    time_box: 5,
  };
  return [...entities].sort((left, right) => {
    if (left.deleted !== right.deleted) return left.deleted ? 1 : -1;
    const direction = left.deleted ? -1 : 1;
    return direction * (dependencyOrder[left.kind] - dependencyOrder[right.kind]);
  });
}
