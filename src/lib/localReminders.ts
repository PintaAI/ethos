import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

import i18n from "@/i18n";
import { getWeekStartEnd, toDateKey } from "@/lib/date";
import {
  DEFAULT_NOTIFICATION_CHANNEL_ID,
  notificationsAreAllowedAsync,
  prepareDefaultNotificationChannelAsync,
} from "@/lib/notifications";

const SETTINGS_KEY = "local_reminder_settings";
const BUDGET_ALERTS_KEY = "local_budget_alerts_sent";
const NO_ENTRY_KIND = "standalone-no-entry-reminder";
const MONTHLY_REVIEW_KIND = "standalone-monthly-review";
const MONTHLY_REVIEW_SCHEDULE = "day-1-at-10:00";
let reconcileQueue: Promise<void> = Promise.resolve();

export type LocalReminderSettings = {
  noEntryEnabled: boolean;
  noEntryTime: string;
  budgetAlertEnabled: boolean;
  budgetThreshold: number;
  monthlyReviewEnabled: boolean;
};

export const DEFAULT_LOCAL_REMINDER_SETTINGS: LocalReminderSettings = {
  noEntryEnabled: false,
  noEntryTime: "20:00",
  budgetAlertEnabled: false,
  budgetThreshold: 80,
  monthlyReviewEnabled: false,
};

export async function getLocalReminderSettingsAsync(db: SQLiteDatabase): Promise<LocalReminderSettings> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key = ?",
    SETTINGS_KEY,
  );
  if (!row) {
    const defaults = { ...DEFAULT_LOCAL_REMINDER_SETTINGS };
    if (await notificationsAreAllowedAsync()) {
      defaults.noEntryEnabled = true;
      defaults.budgetAlertEnabled = true;
    }
    return defaults;
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<LocalReminderSettings>;
    return {
      noEntryEnabled: parsed.noEntryEnabled === true,
      noEntryTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.noEntryTime ?? "")
        ? parsed.noEntryTime!
        : DEFAULT_LOCAL_REMINDER_SETTINGS.noEntryTime,
      budgetAlertEnabled: parsed.budgetAlertEnabled === true,
      budgetThreshold: [50, 80, 90, 100].includes(parsed.budgetThreshold ?? 0)
        ? parsed.budgetThreshold!
        : DEFAULT_LOCAL_REMINDER_SETTINGS.budgetThreshold,
      monthlyReviewEnabled: parsed.monthlyReviewEnabled === true,
    };
  } catch {
    return DEFAULT_LOCAL_REMINDER_SETTINGS;
  }
}

export async function saveLocalReminderSettingsAsync(db: SQLiteDatabase, settings: LocalReminderSettings) {
  await db.runAsync(
    `INSERT INTO app_preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    SETTINGS_KEY,
    JSON.stringify(settings),
  );
  await reconcileLocalRemindersAsync(db);
}

export function reconcileLocalRemindersAsync(db: SQLiteDatabase) {
  const next = reconcileQueue.catch(() => undefined).then(() => reconcileLocalRemindersNowAsync(db));
  reconcileQueue = next;
  return next;
}

async function reconcileLocalRemindersNowAsync(db: SQLiteDatabase) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;

  const settings = await getLocalReminderSettingsAsync(db);
  await reconcileNoEntryReminderAsync(db, settings);
  if (settings.budgetAlertEnabled) await evaluateBudgetAlertsAsync(db, settings.budgetThreshold);
  await reconcileMonthlyReviewAsync(settings);
}

async function reconcileMonthlyReviewAsync(settings: LocalReminderSettings) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const title = i18n.t("reminder.monthlyReviewNotificationTitle");
  const body = i18n.t("reminder.monthlyReviewNotificationBody");
  const monthlyReviews = scheduled.filter((notification) => notification.content.data?.kind === MONTHLY_REVIEW_KIND);

  if (!settings.monthlyReviewEnabled || !await notificationsAreAllowedAsync()) {
    await Promise.all(monthlyReviews.map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)));
    return;
  }

  const current = monthlyReviews.find((notification) => (
    notification.content.data?.schedule === MONTHLY_REVIEW_SCHEDULE &&
    notification.content.title === title &&
    notification.content.body === body
  ));
  await Promise.all(
    monthlyReviews
      .filter((notification) => notification.identifier !== current?.identifier)
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
  );
  if (current) return;

  await prepareDefaultNotificationChannelAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: {
        kind: MONTHLY_REVIEW_KIND,
        schedule: MONTHLY_REVIEW_SCHEDULE,
        url: "/summary",
        period: "lastMonth",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: 1,
      hour: 10,
      minute: 0,
      channelId: Platform.OS === "android" ? DEFAULT_NOTIFICATION_CHANNEL_ID : undefined,
    },
  });
}

async function reconcileNoEntryReminderAsync(db: SQLiteDatabase, settings: LocalReminderSettings) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => notification.content.data?.kind === NO_ENTRY_KIND)
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
  );

  if (!settings.noEntryEnabled || !await notificationsAreAllowedAsync()) return;

  const now = new Date();
  const today = toDateKey(now);
  const entry = await db.getFirstAsync<{ present: number }>(
    "SELECT 1 AS present FROM entries WHERE deleted_at IS NULL AND date = ? LIMIT 1",
    today,
  );
  const [hour, minute] = settings.noEntryTime.split(":").map(Number);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (entry || date <= now) date.setDate(date.getDate() + 1);

  await prepareDefaultNotificationChannelAsync();
  await Promise.all(Array.from({ length: 14 }, (_, dayOffset) => {
    const notificationDate = new Date(date);
    notificationDate.setDate(notificationDate.getDate() + dayOffset);
    return Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t("reminder.noEntryNotificationTitle"),
        body: i18n.t("reminder.noEntryNotificationBody"),
        sound: "default",
        data: { kind: NO_ENTRY_KIND, url: "/home" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationDate,
        channelId: Platform.OS === "android" ? DEFAULT_NOTIFICATION_CHANNEL_ID : undefined,
      },
    });
  }));
}

type BudgetRule = {
  id: string;
  name: string;
  managementId: string;
  categoryId: string | null;
  period: "daily" | "weekly" | "monthly";
  nominal: number;
};

async function evaluateBudgetAlertsAsync(db: SQLiteDatabase, threshold: number) {
  if (!await notificationsAreAllowedAsync()) return;

  const overall = await db.getAllAsync<{
    id: string;
    management_id: string;
    management_name: string;
    period: BudgetRule["period"];
    nominal: number;
  }>(
    `SELECT b.id, b.management_id, m.name AS management_name, b.period, b.nominal
     FROM overall_budgets b
     JOIN managements m ON m.id = b.management_id
     WHERE b.deleted_at IS NULL AND m.deleted_at IS NULL AND b.nominal > 0`,
  );
  const categories = await db.getAllAsync<{
    id: string;
    management_id: string;
    name: string;
    budget_daily: number | null;
    budget_weekly: number | null;
    budget_monthly: number | null;
  }>(
    `SELECT id, management_id, name, budget_daily, budget_weekly, budget_monthly
     FROM categories
     WHERE deleted_at IS NULL`,
  );
  const rules: BudgetRule[] = overall.map((budget) => ({
    id: `overall:${budget.id}`,
    name: budget.management_name,
    managementId: budget.management_id,
    categoryId: null,
    period: budget.period,
    nominal: budget.nominal,
  }));
  for (const category of categories) {
    for (const period of ["daily", "weekly", "monthly"] as const) {
      const nominal = category[`budget_${period}`];
      if (nominal && nominal > 0) {
        rules.push({
          id: `category:${category.id}`,
          name: category.name,
          managementId: category.management_id,
          categoryId: category.id,
          period,
          nominal,
        });
      }
    }
  }

  const sentRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key = ?",
    BUDGET_ALERTS_KEY,
  );
  let sent = new Set<string>();
  try {
    sent = new Set(JSON.parse(sentRow?.value ?? "[]") as string[]);
  } catch {
    // Invalid local alert history can be safely replaced.
  }

  const now = new Date();
  let changed = false;
  for (const rule of rules) {
    const range = getPeriodRange(now, rule.period);
    const key = `${rule.id}:${rule.period}:${range.key}:${threshold}`;
    if (sent.has(key)) continue;

    const total = rule.categoryId
      ? await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(nominal), 0) AS total FROM entries
           WHERE deleted_at IS NULL AND io = 'Expenses' AND management_id = ? AND category_id = ? AND date BETWEEN ? AND ?`,
          rule.managementId,
          rule.categoryId,
          range.start,
          range.end,
        )
      : await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(nominal), 0) AS total FROM entries
           WHERE deleted_at IS NULL AND io = 'Expenses' AND management_id = ? AND date BETWEEN ? AND ?`,
          rule.managementId,
          range.start,
          range.end,
        );
    const percentage = Math.round(((total?.total ?? 0) / rule.nominal) * 100);
    if (percentage < threshold) continue;

    await prepareDefaultNotificationChannelAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t("reminder.budgetNotificationTitle"),
        body: i18n.t("reminder.budgetNotificationBody", {
          name: rule.name,
          percent: percentage,
          period: i18n.t(`autoEntry.${rule.period}`),
        }),
        sound: "default",
        data: { kind: "standalone-budget-alert", url: "/forms/categories" },
      },
      trigger: null,
    });
    sent.add(key);
    changed = true;
  }

  if (changed) {
    await db.runAsync(
      `INSERT INTO app_preferences (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      BUDGET_ALERTS_KEY,
      JSON.stringify([...sent].slice(-200)),
    );
  }
}

function getPeriodRange(date: Date, period: BudgetRule["period"]) {
  if (period === "daily") {
    const key = toDateKey(date);
    return { start: key, end: key, key };
  }
  if (period === "weekly") {
    const { start, end } = getWeekStartEnd(date);
    return { start: toDateKey(start), end: toDateKey(end), key: toDateKey(start) };
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateKey(start), end: toDateKey(end), key: toDateKey(start) };
}
