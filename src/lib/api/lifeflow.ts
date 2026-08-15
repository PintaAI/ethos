import { apiPost } from "./client";

export type LifeFlowKind = "item" | "habit_log" | "item_exception";

export type LifeFlowSyncEntity = {
  kind: LifeFlowKind;
  id: string;
  updatedAt: string;
  deleted?: boolean;
  data?: Record<string, unknown> | null;
};

export function syncLifeFlow(
  entities: LifeFlowSyncEntity[],
  signal?: AbortSignal,
) {
  return apiPost<{ entities: LifeFlowSyncEntity[] }>(
    "/lifeflow/sync",
    { entities },
    { signal },
  );
}
