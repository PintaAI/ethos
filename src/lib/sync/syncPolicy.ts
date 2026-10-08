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

export function syncRetryDecision(error: unknown): { retry: boolean; retryAfterMs?: number } {
  if (error instanceof Error && error.name === "DbOperationInvalidatedError") return { retry: false };
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    const retry = error.status === 408 || error.status === 429 || error.status >= 500;
    const retryAfterMs = "retryAfterMs" in error && typeof error.retryAfterMs === "number" ? error.retryAfterMs : undefined;
    return { retry, retryAfterMs };
  }
  return { retry: error instanceof TypeError };
}
