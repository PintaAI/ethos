import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { migrateCashflowDatabase } from "@/data/cashflow/schema";
import { getActiveManagementId } from "@/data/cashflow/repository";
import { syncNow } from "@/lib/sync/syncEngine";

const DATABASE_NAME = "ethos-cashflow.db";
const SYNC_TASK = "ethos-sync";
let registrationQueue: Promise<void> = Promise.resolve();

async function countActiveWalletMembers(db: SQLiteDatabase): Promise<number> {
  const activeId = await getActiveManagementId(db);
  if (!activeId) return 0;
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT MAX(COALESCE(m.member_count, 0), COALESCE(
      (SELECT COUNT(*) FROM management_members WHERE management_id = m.id AND deleted_at IS NULL), 0
    )) as count
    FROM managements m WHERE m.id = ? AND m.deleted_at IS NULL`,
    activeId,
  );
  return row?.count ?? 0;
}

async function runSyncBackgroundAsync() {
  const db = await openDatabaseAsync(DATABASE_NAME);
  try {
    await migrateCashflowDatabase(db);
    const memberCount = await countActiveWalletMembers(db);
    if (memberCount <= 1) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const summary = await syncNow(db);
    return summary.errors === 0
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch (error) {
    console.error("[sync-background] failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await db.closeAsync();
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
