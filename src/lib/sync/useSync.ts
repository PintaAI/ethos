import { useCallback, useEffect, useRef, useState } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { useAuth } from "@/components/provider/AuthProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { getPreference, setPreference } from "@/lib/preferences";
import { syncNow } from "./syncEngine";
import { DbOperationInvalidatedError, getDbLockGeneration, withDbLock } from "./dbLock";
import { reconcileSyncBackgroundTaskAsync } from "@/tasks/syncBackground";

export type SyncStatus = "idle" | "syncing" | "error";

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
      const summary = await withDbLock(() => syncNow(db), generation);
      await refresh();
      const completedAt = new Date();
      if (summary.errors > 0) {
        console.warn(`[sync] completed with ${summary.errors} error(s)`);
        setStatus("error");
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
  }, [cloudSyncEnabled, db, isAuthenticated, isPending, refresh]);

  useEffect(() => {
    if (cloudSyncEnabled === null) return;
    const shouldSync = isAuthenticated && !isPending && cloudSyncEnabled === true;
    reconcileSyncBackgroundTaskAsync(shouldSync).catch((error) =>
      console.error("[sync] failed to reconcile background sync", error),
    );
  }, [cloudSyncEnabled, isAuthenticated, isPending]);

  useEffect(() => {
    if (!isAuthenticated || isPending || cloudSyncEnabled !== true) return;
    const initialSync = setTimeout(() => void runSync(), 0);
    return () => clearTimeout(initialSync);
  }, [cloudSyncEnabled, isAuthenticated, isPending, runSync]);

  return {
    status,
    lastSync,
    cloudSyncEnabled: cloudSyncEnabled === true,
    setCloudSyncEnabled,
    syncNow: runSync,
  };
}
