import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import type { SQLiteDatabase } from "expo-sqlite";
import { openDatabaseAsync } from "expo-sqlite";
import { Platform } from "react-native";
import { migrateCashflowDatabase } from "@/data/cashflow/schema";
import { getPreference } from "@/lib/preferences";
import { authClient } from "@/lib/auth-client";
import { getDbLockGeneration, withDbLock } from "@/lib/sync/dbLock";
import { syncNow } from "@/lib/sync/syncEngine";

const DATABASE_NAME = "ethos-cashflow.db";
const SYNC_TASK = "ethos-sync";
let registrationQueue: Promise<void> = Promise.resolve();

async function runSyncBackgroundAsync() {
  const lockGeneration = getDbLockGeneration();
  let expired = false;
  const abortController = new AbortController();
  const expirationSubscription = Platform.OS === "ios"
    ? BackgroundTask.addExpirationListener(() => {
        expired = true;
        abortController.abort(new Error("Background sync expired"));
      })
    : null;

  try {
    if (!(await getPreference("cloudSyncEnabled")) || !authClient.getCookie()) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    return await withDbLock(async () => {
      let db: SQLiteDatabase | null = null;
      try {
        db = await openDatabaseAsync(DATABASE_NAME);
        await migrateCashflowDatabase(db);
        if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
        const summary = await syncNow(db, { signal: abortController.signal });
        return !expired && summary.errors === 0
          ? BackgroundTask.BackgroundTaskResult.Success
          : BackgroundTask.BackgroundTaskResult.Failed;
      } catch (error) {
        console.error("[sync-background] failed", error);
        return BackgroundTask.BackgroundTaskResult.Failed;
      } finally {
        if (db) await db.closeAsync().catch(() => undefined);
      }
    }, lockGeneration);
  } catch (error) {
    console.error("[sync-background] failed to queue", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    expirationSubscription?.remove();
  }
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(SYNC_TASK)) {
  TaskManager.defineTask(SYNC_TASK, runSyncBackgroundAsync);
}

async function setSyncBackgroundTaskRegistrationAsync(shouldRegister: boolean) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (!(await TaskManager.isAvailableAsync())) return;
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
  if (shouldRegister && !isRegistered) {
    await BackgroundTask.registerTaskAsync(SYNC_TASK, {
      minimumInterval: 60,
    });
  } else if (!shouldRegister && isRegistered) {
    await BackgroundTask.unregisterTaskAsync(SYNC_TASK);
  }
}

export function reconcileSyncBackgroundTaskAsync(shouldRegister: boolean): Promise<void> {
  const reconciliation = registrationQueue
    .catch(() => undefined)
    .then(() => setSyncBackgroundTaskRegistrationAsync(shouldRegister));
  registrationQueue = reconciliation;
  return reconciliation;
}
