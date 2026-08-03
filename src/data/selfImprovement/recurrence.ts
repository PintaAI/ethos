import { canAllocateTimeBox, timeBoxRangesAreValid, timeBoxesOverlap } from "../../lib/timeBox.ts";
import type { DayPreset, TimeBox } from "./types.ts";

export function recurringTimeBoxId(scheduleId: string, blockId: string, date: string) {
  return `time-box-${scheduleId}-${blockId}-${date}`;
}

export function scheduleAppliesOnDate(schedule: NonNullable<DayPreset["schedule"]>, date: string) {
  if (date < schedule.startDate) return false;
  if (schedule.frequency === "once") return date === schedule.startDate;
  if (schedule.frequency === "daily") return true;
  return schedule.weekdays.includes(weekdayForDate(date));
}

export function resolveTimeBoxesForDate(date: string, storedBoxes: TimeBox[], dayPresets: DayPreset[]) {
  const storedForDate = storedBoxes.filter((box) => box.date === date);
  const byId = new Map(storedForDate.map((box) => [box.id, box]));
  const effective = storedForDate.filter((box) => !box.dismissed);

  for (const preset of dayPresets) {
    if (!preset.schedule || !scheduleAppliesOnDate(preset.schedule, date)) continue;
    for (const block of preset.blocks) {
      const id = recurringTimeBoxId(preset.schedule.id, block.id, date);
      const snapshot = byId.get(id);
      if (snapshot) continue;
      const candidate: TimeBox = {
        id,
        date,
        title: block.title,
        startTime: block.startTime,
        endTime: block.endTime,
        breakDurations: block.breakDurations,
        color: block.color,
        completed: false,
        habitId: null,
        createdAt: `${date}T00:00:00.000Z`,
        presetScheduleId: preset.schedule.id,
        presetBlockId: block.id,
        virtual: true,
      };
      const colorConflict = candidate.color !== null && effective.some((box) => box.color === candidate.color);
      if (!colorConflict && canAllocateTimeBox(candidate, effective)) effective.push(candidate);
    }
  }
  return effective.sort((left, right) => left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id));
}

export function recurringPresetsConflict(
  first: { weekdays: number[]; blocks: Pick<TimeBox, "startTime" | "endTime" | "color">[] },
  second: { weekdays: number[]; blocks: Pick<TimeBox, "startTime" | "endTime" | "color">[] },
) {
  if (!first.weekdays.some((day) => second.weekdays.includes(day))) return false;
  return first.blocks.some((block) => second.blocks.some((other) => (
    timeBoxesOverlap({ ...block, date: "2000-01-03" }, { ...other, date: "2000-01-03" })
    || (block.color !== null && block.color === other.color)
  )));
}

export function presetBlocksConflictWithDate(
  date: string,
  blocks: Pick<TimeBox, "startTime" | "endTime" | "color">[],
  existing: Pick<TimeBox, "date" | "startTime" | "endTime" | "color">[],
) {
  const datedBlocks = blocks.map((block) => ({ ...block, date }));
  return !timeBoxRangesAreValid(datedBlocks) || datedBlocks.some((block) => existing.some((box) => (
    timeBoxesOverlap(block, box)
    || (block.color !== null && block.color === box.color)
  )));
}

export function resolveTimeBoxesForRange(fromDate: string, days: number, storedBoxes: TimeBox[], dayPresets: DayPreset[]) {
  const results: TimeBox[] = [];
  const date = parseDate(fromDate);
  for (let offset = 0; offset < days; offset += 1) {
    results.push(...resolveTimeBoxesForDate(formatDate(date), storedBoxes, dayPresets));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return results;
}

function weekdayForDate(date: string) {
  return parseDate(date).getUTCDay();
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
