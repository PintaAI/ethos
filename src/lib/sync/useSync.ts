import { useCallback, useEffect, useRef, useState } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { useAuth } from "@/components/AuthProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { syncNow } from "./syncEngine";
import { reconcileSyncBackgroundTaskAsync } from "@/tasks/syncBackground";

export type SyncStatus = "idle" | "syncing" | "error";

export type SyncHook = {
  status: SyncStatus;
  lastSync: Date | null;
  syncNow: () => Promise<void>;
};

export function isSyncEligible(memberCount: number | undefined | null): boolean {
  return memberCount != null && memberCount > 1;
}

export function useSync(): SyncHook {
  const db = useSQLiteContext();
  const { isAuthenticated, isPending } = useAuth();
  const { activeManagement, refresh } = useCashflowData();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const runningRef = useRef(false);

  const eligible = isSyncEligible(activeManagement?.memberCount);

  const runSync = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus("syncing");
    try {
      const summary = await syncNow(db);
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
      console.warn("[sync] syncNow failed", error);
      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, [db, refresh]);

  useEffect(() => {
    if (isPending || !isAuthenticated) return;
    const initialSync = setTimeout(() => void runSync(), 0);
    return () => clearTimeout(initialSync);
  }, [isAuthenticated, isPending, runSync]);

  useEffect(() => {
    reconcileSyncBackgroundTaskAsync(isAuthenticated && !isPending && eligible).catch((error) =>
      console.error("[sync] failed to reconcile background sync", error),
    );
  }, [isAuthenticated, isPending, eligible]);

  return { status, lastSync, syncNow: runSync };
}
