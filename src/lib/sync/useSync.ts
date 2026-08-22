import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { useAuth } from "@/components/provider/AuthProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { getPreference, setPreference } from "@/lib/preferences";
import { syncNow } from "./syncEngine";
import { getLastPulledAt } from "./syncStatus";
import { isAutomaticSyncStale, syncRefreshDecision } from "./syncPolicy";
import { DbOperationInvalidatedError, getDbLockGeneration, withDbLock } from "./dbLock";
import { reconcileSyncBackgroundTaskAsync } from "@/tasks/syncBackground";

export type SyncStatus = "idle" | "syncing" | "warning" | "error";

export type SyncHook = {
  status: SyncStatus;
  lastSync: Date | null;
  cloudSyncEnabled: boolean;
  setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
};

export function useSync(): SyncHook {
  const db = useSQLiteContext();
  const { isAuthenticated, isPending } = useAuth();
  const { refresh } = useCashflowData();
  const { refresh: refreshLifeFlow } = useLifeFlow();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState<boolean | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    getPreference("cloudSyncEnabled")
      .then(setCloudSyncEnabledState)
      .catch((error) => console.warn("[sync] failed to load cloud sync preference", error));
  }, []);

  const setCloudSyncEnabled = useCallback(async (enabled: boolean) => {
    await setPreference("cloudSyncEnabled", enabled);
    setCloudSyncEnabledState(enabled);
  }, []);

  const runSync = useCallback(async () => {
    if (!isAuthenticated || isPending || !cloudSyncEnabled) return;
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus("syncing");
    const generation = getDbLockGeneration();
    try {
      const summary = await syncNow(db, { generation });
      if (generation !== getDbLockGeneration()) throw new DbOperationInvalidatedError();
      const refreshDecision = syncRefreshDecision(summary);
      await Promise.all([
        refreshDecision.cashflow ? refresh() : Promise.resolve(),
        refreshDecision.lifeFlow ? refreshLifeFlow() : Promise.resolve(),
      ]);
      const completedAt = new Date();
      if (summary.errors > 0) {
        console.warn(`[sync] completed with ${summary.errors} error(s)`);
        setLastSync(completedAt);
        setStatus("warning");
      } else {
        setLastSync(completedAt);
        setStatus("idle");
      }
    } catch (error) {
      if (error instanceof DbOperationInvalidatedError) {
        setStatus("idle");
        return;
      }
      console.warn("[sync] syncNow failed", error);
      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, [cloudSyncEnabled, db, isAuthenticated, isPending, refresh, refreshLifeFlow]);

  useEffect(() => {
    if (cloudSyncEnabled === null) return;
    const shouldSync = isAuthenticated && !isPending && cloudSyncEnabled === true;
    reconcileSyncBackgroundTaskAsync(shouldSync).catch((error) =>
      console.error("[sync] failed to reconcile background sync", error),
    );
  }, [cloudSyncEnabled, isAuthenticated, isPending]);

  useEffect(() => {
    if (!isAuthenticated || isPending || cloudSyncEnabled !== true) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        void withDbLock(() => getLastPulledAt(db)).then((lastPulledAt) => {
          if (cancelled) return;
          if (isAutomaticSyncStale(lastPulledAt)) void runSync();
        }).catch((error) => console.warn("[sync] freshness check failed", error));
      }, 250);
    });
    return () => {
      cancelled = true;
      interaction.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [cloudSyncEnabled, db, isAuthenticated, isPending, runSync]);

  return {
    status,
    lastSync,
    cloudSyncEnabled: cloudSyncEnabled === true,
    setCloudSyncEnabled,
    syncNow: runSync,
  };
}
