import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, InteractionManager } from "react-native";
import * as Network from "expo-network";
import { useSQLiteContext } from "expo-sqlite";
import { useAuth } from "@/components/provider/AuthProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { getPreference, setPreference } from "@/lib/preferences";
import { syncNow, waitForSyncIdleAsync, type SyncIssueArea } from "./syncEngine";
import { getLastPulledAt } from "./syncStatus";
import { isAutomaticSyncStale, syncRefreshDecision, syncRetryDecision } from "./syncPolicy";
import { DbOperationInvalidatedError, getDbLockGeneration, withDbLock } from "./dbLock";
import { createSyncScheduler } from "./syncScheduler";
import { stopSyncRequests, subscribeSyncEvents } from "./syncEvents";
import { reconcileSyncBackgroundTaskAsync } from "@/tasks/syncBackground";

export type SyncStatus = "idle" | "syncing" | "warning" | "error";
export type SyncHook = {
  status: SyncStatus;
  lastSync: Date | null;
  cloudSyncEnabled: boolean;
  issueAreas: SyncIssueArea[];
  setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
};

export function useSync(): SyncHook {
  const db = useSQLiteContext();
  const { user, isAuthenticated, isPending } = useAuth();
  const { refresh } = useCashflowData();
  const { refresh: refreshLifeFlow } = useLifeFlow();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState<boolean | null>(null);
  const [issueAreas, setIssueAreas] = useState<SyncIssueArea[]>([]);
  const schedulerRef = useRef<ReturnType<typeof createSyncScheduler> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPreference("cloudSyncEnabled")
      .then((enabled) => { if (!cancelled) setCloudSyncEnabledState(enabled); })
      .catch((error) => console.warn("[sync] failed to load cloud sync preference", error));
    return () => { cancelled = true; };
  }, []);

  const setCloudSyncEnabled = useCallback(async (enabled: boolean) => {
    if (!enabled) await stopSyncRequests();
    await setPreference("cloudSyncEnabled", enabled);
    setCloudSyncEnabledState(enabled);
  }, []);

  useEffect(() => {
    if (cloudSyncEnabled === null) return;
    reconcileSyncBackgroundTaskAsync(isAuthenticated && !isPending && cloudSyncEnabled)
      .catch((error) => console.error("[sync] failed to reconcile background sync", error));
  }, [cloudSyncEnabled, isAuthenticated, isPending]);

  useEffect(() => {
    if (!user?.id || isPending || cloudSyncEnabled !== true) return;
    let stopped = false;
    const scheduler = createSyncScheduler({
      run: async (signal) => {
        // A previous scope/background task must finish before this scope starts.
        await waitForSyncIdleAsync(db);
        if (stopped || signal.aborted) return { retry: false };
        const generation = getDbLockGeneration();
        setStatus("syncing");
        setIssueAreas([]);
        try {
          const summary = await syncNow(db, { generation, signal, accountId: user.id });
          if (stopped || signal.aborted || generation !== getDbLockGeneration()) return { retry: false };
          const decision = syncRefreshDecision(summary);
          await Promise.all([
            decision.cashflow ? refresh() : Promise.resolve(),
            decision.lifeFlow ? refreshLifeFlow() : Promise.resolve(),
          ]);
          if (stopped || signal.aborted || generation !== getDbLockGeneration()) return { retry: false };
          setIssueAreas(summary.issueAreas);
          setStatus(summary.errors > 0 ? "warning" : "idle");
          if (summary.errors === 0) setLastSync(new Date());
          return { retry: summary.retryable === true, retryAfterMs: summary.retryAfterMs, blockAutomatic: summary.automaticRetryBlocked };
        } catch (error) {
          if (stopped || signal.aborted || error instanceof DbOperationInvalidatedError) return { retry: false };
          console.warn("[sync] syncNow failed", error);
          setIssueAreas(["connection"]);
          setStatus("error");
          return syncRetryDecision(error);
        }
      },
      onError: (error) => { if (!stopped) console.warn("[sync] scheduler failed", error); },
    });
    schedulerRef.current = scheduler;
    scheduler.setActive(AppState.currentState !== "background" && AppState.currentState !== "inactive");
    const checkFreshness = () => {
      void withDbLock(() => getLastPulledAt(db)).then((lastPulledAt) => {
        if (!stopped && isAutomaticSyncStale(lastPulledAt)) void scheduler.request("automatic");
      }).catch((error) => { if (!stopped) console.warn("[sync] freshness check failed", error); });
    };
    const unsubscribe = subscribeSyncEvents(async (event) => {
      if (event === "mutation") { if (!stopped) void scheduler.request("mutation"); return; }
      stopped = true;
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
      await scheduler.dispose();
      setStatus("idle");
    });
    const appSubscription = AppState.addEventListener("change", (state) => {
      scheduler.setActive(state === "active");
      if (state === "active" && !stopped) checkFreshness();
    });
    const networkSubscription = Network.addNetworkStateListener((state) => {
      scheduler.setOnline(state.isConnected !== false);
      if (state.isConnected !== false && !stopped) checkFreshness();
    });
    void Network.getNetworkStateAsync().then((state) => {
      if (!stopped) scheduler.setOnline(state.isConnected !== false);
    }).catch((error) => console.warn("[sync] network state unavailable", error));
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      // LifeFlow v1 has no durable dirty marker: always recover unsent offline
      // state on startup. Foreground checks after that obey freshness.
      startupTimer = setTimeout(() => { if (!stopped) void scheduler.request("automatic"); }, 250);
    });
    return () => {
      stopped = true;
      unsubscribe();
      appSubscription.remove();
      networkSubscription.remove();
      interaction.cancel();
      if (startupTimer) clearTimeout(startupTimer);
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
      void scheduler.dispose();
    };
  }, [cloudSyncEnabled, db, isPending, refresh, refreshLifeFlow, user?.id]);

  const runSync = useCallback(async () => { await schedulerRef.current?.request("manual"); }, []);
  return { status, lastSync, cloudSyncEnabled: cloudSyncEnabled === true, issueAreas, setCloudSyncEnabled, syncNow: runSync };
}
