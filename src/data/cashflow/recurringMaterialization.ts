import { addDays, parseDateKey, toDateKey } from "../../lib/date.ts";
import type { RecurringFrequency } from "./types";

export class InvalidRecurringScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRecurringScheduleError";
  }
}

function assertDateKey(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InvalidRecurringScheduleError(`Invalid ${field}`);
  const date = parseDateKey(value);
  if (!Number.isFinite(date.getTime()) || toDateKey(date) !== value) throw new InvalidRecurringScheduleError(`Invalid ${field}`);
}

function nextRecurringDate(dateKey: string, frequency: RecurringFrequency) {
  if (frequency === "daily") return toDateKey(addDays(parseDateKey(dateKey), 1));
  if (frequency === "weekly") return toDateKey(addDays(parseDateKey(dateKey), 7));
  if (frequency !== "monthly") throw new InvalidRecurringScheduleError("Invalid recurring frequency");

  const current = parseDateKey(dateKey);
  const desiredDay = current.getDate();
  const year = current.getFullYear();
  const month = current.getMonth() + 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return toDateKey(new Date(year, month, Math.min(desiredDay, lastDay)));
}

export function takeDueRecurringDates(
  nextDate: string,
  frequency: RecurringFrequency,
  throughDate: string,
  limit: number,
) {
  assertDateKey(nextDate, "next date");
  assertDateKey(throughDate, "through date");
  if (!Number.isFinite(limit)) throw new InvalidRecurringScheduleError("Invalid materialization limit");
  const dates: string[] = [];
  let cursor = nextDate;

  while (cursor <= throughDate && dates.length < Math.max(0, limit)) {
    dates.push(cursor);
    cursor = nextRecurringDate(cursor, frequency);
  }

  return { dates, nextDate: cursor };
}
