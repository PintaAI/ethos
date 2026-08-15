import type { Item, ItemOccurrence } from "@/data/lifeflow/types";
import { toDateKey } from "@/lib/date";
import { getLifeFlowDailyProgress } from "@/lib/lifeFlowProgress";

export const sampleLifeFlowDate = new Date();
const today = toDateKey(sampleLifeFlowDate);
const createdAt = new Date(sampleLifeFlowDate.getTime() - 30 * 86400000).toISOString();
const recurrence = { frequency: "daily" as const, interval: 1, weekdays: [], endsOn: null };
export const sampleLifeFlowItems: Item[] = [
  { id: "sample-check-in", kind: "habit", name: "App check-in", color: "#5B8CFF", startsOn: today, startTime: null, endTime: null, breakDurations: [], recurrence, systemType: "app_check_in", createdAt, updatedAt: createdAt },
  { id: "sample-journal", kind: "habit", name: "Daily Journal", color: "#208AEF", startsOn: today, startTime: null, endTime: null, breakDurations: [], recurrence, systemType: "journal", createdAt, updatedAt: createdAt },
  { id: "sample-movement", kind: "habit", name: "Morning movement", color: "#16A34A", startsOn: today, startTime: null, endTime: null, breakDurations: [], recurrence, systemType: null, createdAt, updatedAt: createdAt },
  { id: "sample-work", kind: "event", name: "Focused work", color: "#0F766E", startsOn: today, startTime: "10:00", endTime: "11:30", breakDurations: [10], recurrence: null, systemType: null, createdAt, updatedAt: createdAt },
];
export const sampleLifeFlowOccurrences: ItemOccurrence[] = sampleLifeFlowItems.map((item) => ({ id: `${item.id}|${today}`, itemId: item.id, originalDate: today, date: today, kind: item.kind, name: item.name, color: item.color, startTime: item.startTime, endTime: item.endTime, breakDurations: item.breakDurations, completed: item.kind === "habit", overridden: false }));
export const sampleLifeFlowHabitLogs = sampleLifeFlowOccurrences
  .filter((item) => item.kind === "habit" && item.completed)
  .map((item) => ({ itemId: item.itemId, date: item.date, completedAt: createdAt, updatedAt: createdAt }));
export const sampleLifeFlowProgress = getLifeFlowDailyProgress(sampleLifeFlowOccurrences);
