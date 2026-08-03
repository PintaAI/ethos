// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { canAllocateTimeBox, findNextAvailableTimeSlot, getTimeBoxDuration, timeBoxesOverlap } from "./timeBox.ts";

test("suggests the next quarter-hour slot for today", () => {
  const now = new Date(2026, 6, 26, 9, 7);

  assert.deepEqual(findNextAvailableTimeSlot("2026-07-26", 30, [], now), {
    date: "2026-07-26",
    startTime: "09:15",
    endTime: "09:45",
  });
});

test("skips occupied time when planning a habit", () => {
  const now = new Date(2026, 6, 26, 9, 7);
  const boxes = [{ date: "2026-07-26", startTime: "09:00", endTime: "10:00" }];

  assert.deepEqual(findNextAvailableTimeSlot("2026-07-26", 30, boxes, now), {
    date: "2026-07-26",
    startTime: "10:00",
    endTime: "10:30",
  });
});

test("returns no suggestion when the planning day is full", () => {
  const now = new Date(2026, 6, 26, 9, 7);
  const boxes = [{ date: "2026-07-27", startTime: "07:00", endTime: "22:00" }];

  assert.equal(findNextAvailableTimeSlot("2026-07-27", 30, boxes, now), null);
});

test("overnight sleep occupies eight hours of one circular day", () => {
  assert.equal(getTimeBoxDuration("22:00", "06:00"), 8 * 60);
  const sleep = { date: "2026-07-30", startTime: "22:00", endTime: "06:00" };
  assert.equal(timeBoxesOverlap(sleep, { date: sleep.date, startTime: "05:00", endTime: "07:00" }), true);
  assert.equal(canAllocateTimeBox({ date: sleep.date, startTime: "06:00", endTime: "22:00" }, [sleep]), true);
});

test("a full circular day rejects any additional allocation", () => {
  const date = "2026-07-30";
  const full = [
    { date, startTime: "22:00", endTime: "06:00" },
    { date, startTime: "06:00", endTime: "22:00" },
  ];
  assert.equal(canAllocateTimeBox({ date, startTime: "12:00", endTime: "12:05" }, full), false);
});
