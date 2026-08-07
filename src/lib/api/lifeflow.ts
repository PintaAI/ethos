import { apiPost } from "./client";

export type LifeFlowKind = "habit" | "habit_log" | "time_box" | "day_preset" | "day_preset_block" | "day_preset_schedule";

export type LifeFlowSyncEntity = {
  kind: LifeFlowKind;
  id: string;
  updatedAt: string;
  deleted?: boolean;
  data?: Record<string, unknown> | null;
};

export function syncLifeFlow(
  managementId: string,
  entities: LifeFlowSyncEntity[],
  signal?: AbortSignal,
) {
  return apiPost<{ entities: LifeFlowSyncEntity[] }>(
    "/lifeflow/sync",
    { managementId, entities },
    { signal },
  );
}
