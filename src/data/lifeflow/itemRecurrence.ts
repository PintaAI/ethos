import { timeBoxBreaksFit } from "../../lib/timeBox.ts";
import type {
  CreateItemInput,
  Item,
  ItemException,
  ItemOccurrence,
  ItemOccurrenceSnapshot,
  Recurrence,
  UnifiedHabitLog,
  Weekday,
} from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DAY_MS = 86_400_000;
const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type CivilDate = { year: number; month: number; day: number };

function parseDate(value: string): CivilDate | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function dayNumber(value: CivilDate) {
  return Date.UTC(value.year, value.month - 1, value.day) / DAY_MS;
}

function dateFromDayNumber(value: number) {
  const date = new Date(value * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addLocalDateDays(value: string, days: number) {
  const parsed = parseDate(value);
  if (!parsed || !Number.isInteger(days)) throw new Error("Invalid local date.");
  return dateFromDayNumber(dayNumber(parsed) + days);
}

export function assertValidLocalDate(value: string, label = "Date") {
  if (!parseDate(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
}

export function assertValidRecurrence(recurrence: Recurrence, startsOn: string) {
  if (!Number.isInteger(recurrence.interval) || recurrence.interval < 1) throw new Error("Recurrence interval must be a positive integer.");
  if (recurrence.endsOn !== null && (!parseDate(recurrence.endsOn) || recurrence.endsOn < startsOn)) {
    throw new Error("Recurrence end date must be on or after the start date.");
  }
  const uniqueWeekdays = new Set(recurrence.weekdays);
  if (uniqueWeekdays.size !== recurrence.weekdays.length || recurrence.weekdays.some((day) => !WEEKDAYS.includes(day))) {
    throw new Error("Recurrence weekdays must be unique valid weekday codes.");
  }
  if (recurrence.frequency === "weekly" && recurrence.weekdays.length === 0) throw new Error("Weekly recurrence requires a weekday.");
  if (recurrence.frequency !== "weekly" && recurrence.weekdays.length > 0) throw new Error("Only weekly recurrence accepts weekdays.");
}

export function assertValidItem(input: CreateItemInput | ItemOccurrenceSnapshot, startsOn?: string, recurrence?: Recurrence | null) {
  if (!input.name.trim()) throw new Error("Item name is required.");
  if (input.name.trim().length > 200) throw new Error("Item name must be 200 characters or fewer.");
  if (!COLOR_PATTERN.test(input.color)) throw new Error("Item color must be a six-digit hex color.");
  if ((input.startTime === null) !== (input.endTime === null)) throw new Error("Start and end times must be supplied together.");
  if (input.startTime !== null && (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime!))) throw new Error("Times must use HH:mm.");
  if (input.startTime !== null && input.startTime === input.endTime) throw new Error("Start and end times must differ.");
  if (input.startTime === null && input.breakDurations.length > 0) throw new Error("Untimed items cannot have breaks.");
  if (input.startTime !== null && !timeBoxBreaksFit(input.startTime, input.endTime!, input.breakDurations)) throw new Error("Break durations do not fit the timed item.");
  if (startsOn !== undefined) {
    if (!parseDate(startsOn)) throw new Error("Item start date must use YYYY-MM-DD.");
    if (input.kind === "habit" && recurrence === null) throw new Error("Habits require recurrence.");
    if (recurrence) assertValidRecurrence(recurrence, startsOn);
  }
}

export function recurrenceAppliesOnDate(item: Pick<Item, "startsOn" | "recurrence">, date: string) {
  const target = parseDate(date);
  const anchor = parseDate(item.startsOn);
  if (!target || !anchor || !item.recurrence || date < item.startsOn) return false;
  const recurrence = item.recurrence;
  if (recurrence.endsOn && date > recurrence.endsOn) return false;
  const elapsedDays = dayNumber(target) - dayNumber(anchor);
  if (recurrence.frequency === "daily") return elapsedDays % recurrence.interval === 0;
  if (recurrence.frequency === "weekly") {
    const anchorWeekMonday = dayNumber(anchor) - ((new Date(dayNumber(anchor) * DAY_MS).getUTCDay() + 6) % 7);
    const targetWeekMonday = dayNumber(target) - ((new Date(dayNumber(target) * DAY_MS).getUTCDay() + 6) % 7);
    const weekday = WEEKDAYS[new Date(dayNumber(target) * DAY_MS).getUTCDay()];
    return recurrence.weekdays.includes(weekday) && ((targetWeekMonday - anchorWeekMonday) / 7) % recurrence.interval === 0;
  }
  if (recurrence.frequency === "monthly") {
    const elapsedMonths = (target.year - anchor.year) * 12 + target.month - anchor.month;
    return target.day === anchor.day && elapsedMonths % recurrence.interval === 0;
  }
  return target.month === anchor.month && target.day === anchor.day && (target.year - anchor.year) % recurrence.interval === 0;
}

function baseOccurrence(item: Item, originalDate: string): ItemOccurrence {
  return {
    id: `${item.id}|${originalDate}`,
    itemId: item.id,
    originalDate,
    date: originalDate,
    kind: item.kind,
    name: item.name,
    color: item.color,
    startTime: item.startTime,
    endTime: item.endTime,
    notifyStart: item.notifyStart !== false,
    notifyEnd: item.notifyEnd !== false,
    breakDurations: [...item.breakDurations],
    completed: false,
    overridden: false,
  };
}

export function resolveItemOccurrences(
  startDate: string,
  days: number,
  items: Item[],
  exceptions: ItemException[],
  logs: UnifiedHabitLog[],
): ItemOccurrence[] {
  if (!parseDate(startDate) || !Number.isInteger(days) || days < 0) throw new Error("Occurrence range must be a valid local date and non-negative day count.");
  const endExclusive = addLocalDateDays(startDate, days);
  const exceptionByOccurrence = new Map(exceptions.map((item) => [`${item.itemId}|${item.originalDate}`, item]));
  const completed = new Set(logs.map((log) => `${log.itemId}|${log.date}`));
  const occurrences: ItemOccurrence[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = addLocalDateDays(startDate, offset);
    for (const item of items) {
      const applies = item.recurrence ? recurrenceAppliesOnDate(item, date) : item.kind === "event" && item.startsOn === date;
      if (!applies) continue;
      const occurrence = baseOccurrence(item, date);
      const exception = item.kind === "event" && item.recurrence ? exceptionByOccurrence.get(occurrence.id) : undefined;
      if (exception?.cancelled || (exception && exception.replacementDate !== date)) continue;
      if (exception?.replacement && exception.replacementDate) Object.assign(occurrence, exception.replacement, { date: exception.replacementDate, overridden: true });
      occurrence.completed = item.kind === "habit" && completed.has(`${item.id}|${date}`);
      occurrences.push(occurrence);
    }
  }

  for (const exception of exceptions) {
    if (exception.cancelled || !exception.replacement || !exception.replacementDate || exception.replacementDate < startDate || exception.replacementDate >= endExclusive) continue;
    if (exception.replacementDate === exception.originalDate) continue;
    const item = items.find((candidate) => candidate.id === exception.itemId && candidate.kind === "event" && candidate.recurrence);
    if (!item || !recurrenceAppliesOnDate(item, exception.originalDate)) continue;
    occurrences.push({
      ...baseOccurrence(item, exception.originalDate),
      ...exception.replacement,
      date: exception.replacementDate,
      overridden: true,
    });
  }

  return occurrences.sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if ((left.startTime === null) !== (right.startTime === null)) return left.startTime === null ? -1 : 1;
    return (left.startTime ?? "").localeCompare(right.startTime ?? "") || left.itemId.localeCompare(right.itemId) || left.originalDate.localeCompare(right.originalDate);
  });
}
