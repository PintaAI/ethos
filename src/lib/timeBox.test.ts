// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import { getTimeBoxDuration, timeBoxBreaksFit } from "./timeBox.ts";

test("overnight sleep occupies eight hours of one circular day", () => {
  assert.equal(getTimeBoxDuration("22:00", "06:00"), 8 * 60);
  assert.equal(timeBoxBreaksFit("22:00", "06:00", [30]), true);
});

test("break validation retains minimum focus segments", () => {
  assert.equal(timeBoxBreaksFit("12:00", "12:15", [5]), true);
  assert.equal(timeBoxBreaksFit("12:00", "12:10", [5]), false);
});
