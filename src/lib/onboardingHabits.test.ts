// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { collectOnboardingHabitDrafts, findMatchingCustomHabit, HABIT_RECURRENCES, normalizeHabitName } from "./onboardingHabits.ts";

test("habit recurrence presets use JavaScript weekday numbers", () => {
  assert.deepEqual(HABIT_RECURRENCES.daily, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(HABIT_RECURRENCES.weekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual(HABIT_RECURRENCES.weekends, [0, 6]);
});

test("habit matching normalizes whitespace and case while excluding system habits", () => {
  const habits = [
    { id: "system", name: "Read 1 page", isAppCheckIn: true, isJournalHabit: false },
    { id: "custom", name: "  READ 1 PAGE ", isAppCheckIn: false, isJournalHabit: false },
  ];
  assert.equal(normalizeHabitName(" Read 1 Page "), "read 1 page");
  assert.equal(findMatchingCustomHabit(habits, "read 1 page")?.id, "custom");
});

test("finishing an edited habit replaces its draft without appending a duplicate", () => {
  const original = { name: "Read", weekdays: [1], color: "blue", preferredDuration: 5 };
  const untouched = { name: "Walk", weekdays: [2], color: "green", preferredDuration: 15 };
  const edited = { name: "Read ten pages", weekdays: [1, 3], color: "purple", preferredDuration: 30 };

  assert.deepEqual(collectOnboardingHabitDrafts([original, untouched], edited, 0), [edited, untouched]);
  assert.deepEqual(collectOnboardingHabitDrafts([original], edited, null), [original, edited]);
  assert.deepEqual(collectOnboardingHabitDrafts([original], null, 0), [original]);
});
