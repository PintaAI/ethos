// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { takeDueRecurringDates } from "./recurringMaterialization.ts";

test("bounded recurring catch-up continues without gaps or duplicates", () => {
  const first = takeDueRecurringDates("2026-01-01", "daily", "2026-01-05", 3);
  assert.deepEqual(first, {
    dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
    nextDate: "2026-01-04",
  });

  const second = takeDueRecurringDates(first.nextDate, "daily", "2026-01-05", 3);
  assert.deepEqual(second, {
    dates: ["2026-01-04", "2026-01-05"],
    nextDate: "2026-01-06",
  });
});

test("zero limit does not advance the recurring cursor", () => {
  assert.deepEqual(takeDueRecurringDates("2026-01-01", "weekly", "2026-02-01", 0), {
    dates: [],
    nextDate: "2026-01-01",
  });
});

test("monthly recurrence clamps without skipping a month", () => {
  assert.deepEqual(takeDueRecurringDates("2025-01-31", "monthly", "2025-04-30", 4), {
    dates: ["2025-01-31", "2025-02-28", "2025-03-28", "2025-04-28"],
    nextDate: "2025-05-28",
  });
  assert.deepEqual(takeDueRecurringDates("2024-01-31", "monthly", "2024-03-31", 3).dates,
    ["2024-01-31", "2024-02-29", "2024-03-29"]);
});

test("negative limits do not advance and malformed schedules fail", () => {
  assert.deepEqual(takeDueRecurringDates("2026-01-01", "daily", "2026-02-01", -1).nextDate, "2026-01-01");
  assert.throws(() => takeDueRecurringDates("2026-02-30", "daily", "2026-03-01", 2), /Invalid next date/);
  assert.throws(() => takeDueRecurringDates("2026-01-01", "yearly", "2027-01-01", 2), /frequency/);
});
