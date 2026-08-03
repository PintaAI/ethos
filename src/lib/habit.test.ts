// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { ALL_HABIT_WEEKDAYS, isHabitScheduledOnDate } from "./habit.ts";

test("daily habits are scheduled from their creation day", () => {
  const habit = { createdAt: "2026-07-20T12:00:00", weekdays: ALL_HABIT_WEEKDAYS };

  assert.equal(isHabitScheduledOnDate(habit, "2026-07-19"), false);
  assert.equal(isHabitScheduledOnDate(habit, "2026-07-20"), true);
  assert.equal(isHabitScheduledOnDate(habit, "2026-07-21"), true);
});

test("weekly habits are scheduled only on selected weekdays", () => {
  const habit = { createdAt: "2026-07-20T12:00:00", weekdays: [1, 4] };

  assert.equal(isHabitScheduledOnDate(habit, "2026-07-20"), true);
  assert.equal(isHabitScheduledOnDate(habit, "2026-07-21"), false);
  assert.equal(isHabitScheduledOnDate(habit, "2026-07-23"), true);
});

test("invalid creation timestamps do not hide valid schedule days", () => {
  const habit = { createdAt: "invalid", weekdays: [6] };

  assert.equal(isHabitScheduledOnDate(habit, "2026-07-25"), true);
  assert.equal(isHabitScheduledOnDate(habit, "2026-07-26"), false);
});
