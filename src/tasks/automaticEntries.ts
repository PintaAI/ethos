import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { openDatabaseAsync } from "expo-sqlite";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import i18n from "@/i18n";
import {
  materializeAllDueRecurringEntries,
  RECURRING_MATERIALIZATION_LIMIT,
  type MaterializedRecurringEntry,
} from "@/data/cashflow/repository";
import { migrateCashflowDatabase } from "@/data/cashflow/schema";
import { listDayPresets, listTimeBoxes } from "@/data/lifeflow/repository";
import { resolveTimeBoxesForRange } from "@/data/lifeflow/recurrence";
import { getDbLockGeneration, withDbLock } from "@/lib/sync/dbLock";
import { toDateKey } from "@/lib/date";
import { reconcileLocalRemindersAsync } from "@/lib/localReminders";
import { prepareDefaultNotificationChannelAsync } from "@/lib/notifications";
import { reconcileTimeBoxNotificationsAsync } from "@/lib/timeBoxNotifications";

const DATABASE_NAME = "ethos-cashflow.db";
const AUTOMATIC_ENTRY_TASK = "ethos-automatic-entries";
const REMINDER_KIND = "automatic-entry-reminder";

async function notificationsAreAllowedAsync() {
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function notifyMaterializedAutomaticEntriesAsync(
  entries: MaterializedRecurringEntry[],
  shouldCancel: () => boolean = () => false,
) {
  if (entries.length === 0 || !await notificationsAreAllowedAsync()) return;
  if (shouldCancel()) return;
  await prepareDefaultNotificationChannelAsync();

  for (const entry of entries) {
    if (shouldCancel()) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t("autoEntry.recordedTitle"),
        body: i18n.t("autoEntry.recordedBody", { name: entry.name }),
        sound: "default",
        data: {
          kind: "automatic-entry-recorded",
          recurringEntryId: entry.recurringEntryId,
          managementId: entry.managementId,
          url: "/forms/automatic-entry",
        },
      },
      trigger: null,
    });
  }
}

export async function cancelLegacyAutomaticEntryRemindersAsync(shouldCancel: () => boolean = () => false) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (shouldCancel()) return;
    if (notification.content.data?.kind === REMINDER_KIND) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}

async function runAutomaticEntriesAsync() {
  const lockGeneration = getDbLockGeneration();
  let expired = false;
  const expirationSubscription = Platform.OS === "ios"
    ? BackgroundTask.addExpirationListener(() => { expired = true; })
    : null;

  try {
    return await withDbLock(async () => {
      let db: SQLiteDatabase | null = null;
      try {
        db = await openDatabaseAsync(DATABASE_NAME);
        await migrateCashflowDatabase(db);
        const materialized = await materializeAllDueRecurringEntries(db, {
          limit: RECURRING_MATERIALIZATION_LIMIT,
          shouldCancel: () => expired,
        });
        if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
        const [timeBoxes, dayPresets] = await Promise.all([listTimeBoxes(db), listDayPresets(db)]);
        if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
        await reconcileTimeBoxNotificationsAsync(
          resolveTimeBoxesForRange(toDateKey(new Date()), 14, timeBoxes, dayPresets),
          { requestPermission: false, shouldCancel: () => expired },
        );
        if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
        await notifyMaterializedAutomaticEntriesAsync(materialized, () => expired);
        if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
        await cancelLegacyAutomaticEntryRemindersAsync(() => expired);
        if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
        await reconcileLocalRemindersAsync(db, { shouldCancel: () => expired });
        if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch (error) {
        console.error("Failed to process automatic entries in the background", error);
        return BackgroundTask.BackgroundTaskResult.Failed;
      } finally {
        if (db) await db.closeAsync().catch(() => undefined);
      }
    }, lockGeneration);
  } catch (error) {
    console.error("Failed to queue automatic entries in the background", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    expirationSubscription?.remove();
  }
}

if (
  Platform.OS !== "web" &&
  !TaskManager.isTaskDefined(AUTOMATIC_ENTRY_TASK)
) {
  TaskManager.defineTask(AUTOMATIC_ENTRY_TASK, runAutomaticEntriesAsync);
}

export async function registerAutomaticEntryBackgroundTaskAsync() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (!await TaskManager.isAvailableAsync()) return;
  if (await TaskManager.isTaskRegisteredAsync(AUTOMATIC_ENTRY_TASK)) return;

  await BackgroundTask.registerTaskAsync(AUTOMATIC_ENTRY_TASK, {
    minimumInterval: 60,
  });
}
