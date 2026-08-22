import { describe, expect, test } from "bun:test";

import { AUTO_SYNC_FRESHNESS_MS, isAutomaticSyncStale, syncRefreshDecision } from "../src/lib/sync/syncPolicy.ts";

describe("sync policy", () => {
  test("guards fresh automatic syncs", () => {
    const now = Date.parse("2026-08-19T12:00:00.000Z");
    expect(isAutomaticSyncStale(new Date(now - AUTO_SYNC_FRESHNESS_MS + 1).toISOString(), now)).toBe(false);
    expect(isAutomaticSyncStale(new Date(now - AUTO_SYNC_FRESHNESS_MS).toISOString(), now)).toBe(true);
  });

  test("does not refresh visible providers for a no-op", () => {
    expect(syncRefreshDecision({ pushed: 2, pulled: 0, conflicts: 0, errors: 0, cashflowChanged: 0, lifeFlowChanged: 0, pages: 1 })).toEqual({ cashflow: false, lifeFlow: false });
  });
});
