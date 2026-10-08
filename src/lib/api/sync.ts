import { ApiError, apiGet, apiPost } from "./client";
import type { LifeFlowSyncEntity } from "./lifeflow";

export type SyncCapabilities = { lifeFlow: number; metadata: number; accountId?: string };
export type MetadataArea = "categories" | "quickFills" | "budgets" | "recurring";
export type SyncManifest = Record<MetadataArea, string> & { managementId: string };
export type LifeFlowMutation = { mutationId: string; baseRevision: string; entity: LifeFlowSyncEntity };
export type LifeFlowPage = {
  results: { mutationId: string; ok: boolean; entity: LifeFlowSyncEntity; revision: string }[];
  entities: LifeFlowSyncEntity[]; revisions: string[]; nextCursor: string | null;
  hasMore: boolean; resetRequired: boolean;
};

export async function getSyncCapabilities(signal?: AbortSignal): Promise<SyncCapabilities> {
  try { return await apiGet<SyncCapabilities>("/sync/capabilities", { signal }); }
  catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return { lifeFlow: 1, metadata: 0 };
    throw error;
  }
}
export function getSyncManifest(managementId: string, signal?: AbortSignal) {
  return apiGet<SyncManifest>(`/sync/manifest?management_id=${encodeURIComponent(managementId)}`, { signal });
}
export function syncLifeFlowPage(mutations: LifeFlowMutation[], cursor: string | null, signal?: AbortSignal) {
  return apiPost<LifeFlowPage>("/lifeflow/sync-v2", { mutations, cursor }, { signal });
}
