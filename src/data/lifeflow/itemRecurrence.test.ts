// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { assertValidItem, recurrenceAppliesOnDate, resolveItemOccurrences } from "./itemRecurrence.ts";

const item = (overrides = {}) => ({
  id: "item", kind: "event", name: "Coding", color: "#5B8CFF",
  startsOn: "2026-08-08", startTime: "19:00", endTime: "20:00", breakDurations: [],
  recurrence: { frequency: "weekly", interval: 1, weekdays: ["FR", "SA"], endsOn: null },
  systemType: null, createdAt: "now", updatedAt: "now", ...overrides,
});

test("daily, weekly, monthly and yearly recurrence use anchored civil dates", () => {
  assert.equal(recurrenceAppliesOnDate(item({ startsOn: "2020-01-01", recurrence: { frequency: "daily", interval: 1, weekdays: [], endsOn: null } }), "2036-07-30"), true);
  assert.equal(recurrenceAppliesOnDate(item({ recurrence: { frequency: "weekly", interval: 2, weekdays: ["FR", "SA"], endsOn: null } }), "2026-08-21"), true);
  assert.equal(recurrenceAppliesOnDate(item({ startsOn: "2026-01-31", recurrence: { frequency: "monthly", interval: 1, weekdays: [], endsOn: null } }), "2026-04-30"), false);
  assert.equal(recurrenceAppliesOnDate(item({ startsOn: "2024-02-29", recurrence: { frequency: "yearly", interval: 1, weekdays: [], endsOn: null } }), "2025-02-28"), false);
});

test("endsOn is inclusive and null remains bounded only by the requested range", () => {
  const ending = item({ recurrence: { frequency: "daily", interval: 1, weekdays: [], endsOn: "2026-08-10" } });
  assert.equal(recurrenceAppliesOnDate(ending, "2026-08-10"), true);
  assert.equal(recurrenceAppliesOnDate(ending, "2026-08-11"), false);
  assert.equal(resolveItemOccurrences("2040-01-01", 2, [item({ startsOn: "2026-08-08", recurrence: { frequency: "daily", interval: 1, weekdays: [], endsOn: null } })], [], []).length, 2);
});

test("resolution keeps overlaps, attaches logs, and applies cancelled, full and moved overrides", () => {
  const habit = item({ id: "habit", kind: "habit", name: "Read", startTime: null, endTime: null, recurrence: { frequency: "daily", interval: 1, weekdays: [], endsOn: null } });
  const event = item({ recurrence: { frequency: "daily", interval: 1, weekdays: [], endsOn: null } });
  const other = item({ id: "other", recurrence: null, startsOn: "2026-08-09" });
  const exceptions = [
    { itemId: "item", originalDate: "2026-08-08", replacementDate: null, cancelled: true, replacement: null },
    { itemId: "item", originalDate: "2026-08-09", replacementDate: "2026-08-10", cancelled: false,
      replacement: { kind: "event", name: "Moved", color: "#abcdef", startTime: null, endTime: null, breakDurations: [] } },
  ];
  const result = resolveItemOccurrences("2026-08-08", 3, [habit, event, other], exceptions, [{ itemId: "habit", date: "2026-08-08" }]);
  assert.equal(result.find((occurrence) => occurrence.itemId === "habit" && occurrence.date === "2026-08-08").completed, true);
  assert.equal(result.some((occurrence) => occurrence.itemId === "item" && occurrence.date === "2026-08-08"), false);
  assert.equal(result.find((occurrence) => occurrence.name === "Moved").date, "2026-08-10");
  assert.equal(result.filter((occurrence) => occurrence.date === "2026-08-09").length, 2);
});

test("strict validation rejects invalid recurrence, time pairs and breaks", () => {
  assert.throws(() => assertValidItem(item({ kind: "habit", recurrence: null }), "2026-08-08", null), /require recurrence/);
  assert.throws(() => assertValidItem(item({ name: "x".repeat(201) }), "2026-08-08", item().recurrence), /200 characters/);
  assert.throws(() => assertValidItem(item({ endTime: null }), "2026-08-08", item().recurrence), /supplied together/);
  assert.throws(() => assertValidItem(item({ breakDurations: [7] }), "2026-08-08", item().recurrence), /do not fit/);
});
