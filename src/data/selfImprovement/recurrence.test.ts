// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { presetBlocksConflictWithDate, recurringPresetsConflict, resolveTimeBoxesForDate } from "./recurrence.ts";

const daily = {
  id: "preset",
  name: "Routine",
  blocks: [{ id: "sleep", title: "Sleep", startTime: "22:00", endTime: "06:00", breakDurations: [], color: "#123456" }],
  schedule: { id: "schedule", startDate: "2026-01-01", frequency: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6] },
};

test("daily recurrence resolves years ahead with a stable id", () => {
  const boxes = resolveTimeBoxesForDate("2036-07-30", [], [daily]);
  assert.equal(boxes[0].id, "time-box-schedule-sleep-2036-07-30");
});

test("weekly recurrence resolves only selected weekdays", () => {
  const weekly = { ...daily, schedule: { ...daily.schedule, frequency: "weekly", weekdays: [1] } };
  assert.equal(resolveTimeBoxesForDate("2026-08-03", [], [weekly]).length, 1);
  assert.equal(resolveTimeBoxesForDate("2026-08-04", [], [weekly]).length, 0);
});

test("stored completion and edit overlay virtual values", () => {
  const stored = [{
    id: "time-box-schedule-sleep-2036-07-30", date: "2036-07-30", title: "Edited", startTime: "21:00", endTime: "05:00",
    breakDurations: [], color: null, completed: true, habitId: null, createdAt: "2036-01-01T00:00:00.000Z",
    presetScheduleId: "schedule", presetBlockId: "sleep",
  }];
  assert.deepEqual(resolveTimeBoxesForDate("2036-07-30", stored, [daily]), stored);
  const updatedTemplate = {
    ...daily,
    blocks: [{ ...daily.blocks[0], title: "Updated template", startTime: "20:00", endTime: "04:00" }],
  };
  assert.deepEqual(resolveTimeBoxesForDate("2036-07-30", stored, [updatedTemplate]), stored);
});

test("dismissed recurring snapshot remains omitted", () => {
  const tombstone = [{
    id: "time-box-schedule-sleep-2036-07-30", date: "2036-07-30", title: "Sleep", startTime: "22:00", endTime: "06:00",
    breakDurations: [], color: null, completed: false, habitId: null, createdAt: "2036-01-01T00:00:00.000Z", dismissed: true,
    presetScheduleId: "schedule", presetBlockId: "sleep",
  }];
  assert.equal(resolveTimeBoxesForDate("2036-07-30", tombstone, [daily]).length, 0);
});

test("legacy overlapping virtual blocks are deterministically skipped after persisted data", () => {
  const manual = [{ id: "manual", date: "2036-07-30", title: "Manual", startTime: "05:00", endTime: "07:00", breakDurations: [], color: null, completed: false, habitId: null, createdAt: "" }];
  assert.deepEqual(resolveTimeBoxesForDate("2036-07-30", manual, [daily]), manual);
});

test("recurring presets conflict only on shared weekdays with overlapping blocks", () => {
  const first = { weekdays: [1], blocks: [{ startTime: "22:00", endTime: "06:00", color: null }] };
  assert.equal(recurringPresetsConflict(first, { weekdays: [1], blocks: [{ startTime: "05:00", endTime: "07:00", color: null }] }), true);
  assert.equal(recurringPresetsConflict(first, { weekdays: [2], blocks: [{ startTime: "05:00", endTime: "07:00", color: null }] }), false);
});

test("preset internal overlap is rejected by the circular allocation guard", async () => {
  const { timeBoxRangesAreValid } = await import("../../lib/timeBox.ts");
  const date = "2000-01-03";
  assert.equal(timeBoxRangesAreValid([
    { date, startTime: "22:00", endTime: "06:00" },
    { date, startTime: "05:00", endTime: "07:00" },
  ]), false);
});

test("a preset block can be added to a partially filled day when it does not conflict", () => {
  const existing = [{ date: "2026-08-03", startTime: "09:00", endTime: "10:00", color: "#123456" }];
  assert.equal(presetBlocksConflictWithDate(
    "2026-08-03",
    [{ startTime: "14:00", endTime: "15:00", color: "#654321" }],
    existing,
  ), false);
  assert.equal(presetBlocksConflictWithDate(
    "2026-08-03",
    [{ startTime: "09:30", endTime: "10:30", color: "#654321" }],
    existing,
  ), true);
});
