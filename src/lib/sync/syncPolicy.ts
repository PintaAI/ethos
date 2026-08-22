import type { SyncSummary } from "./syncEngine";

export const AUTO_SYNC_FRESHNESS_MS = 5 * 60 * 1000;

export function isAutomaticSyncStale(lastSuccessfulSync: string | null, now = Date.now()): boolean {
  if (!lastSuccessfulSync) return true;
  const timestamp = Date.parse(lastSuccessfulSync);
  return !Number.isFinite(timestamp) || now - timestamp >= AUTO_SYNC_FRESHNESS_MS;
}

export function syncRefreshDecision(summary: SyncSummary) {
  return {
    cashflow: summary.cashflowChanged > 0,
    lifeFlow: summary.lifeFlowChanged > 0,
  };
}
