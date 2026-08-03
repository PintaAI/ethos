// @ts-nocheck -- Executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";

import {
  DbOperationInvalidatedError,
  getDbLockGeneration,
  withDbClearBarrier,
  withDbLock,
} from "./dbLock.ts";

test("clear barrier waits for active work and invalidates older queued work", async () => {
  let releaseActive: () => void;
  let markActiveStarted: () => void;
  const activeGate = new Promise<void>((resolve) => { releaseActive = resolve; });
  const activeStarted = new Promise<void>((resolve) => { markActiveStarted = resolve; });
  const order: string[] = [];

  const active = withDbLock(async () => {
    order.push("active-start");
    markActiveStarted!();
    await activeGate;
    order.push("active-end");
  });
  await activeStarted;
  const queued = withDbLock(async () => { order.push("queued"); });
  const clear = withDbClearBarrier(async () => { order.push("clear"); });

  releaseActive!();
  await active;
  await assert.rejects(queued, DbOperationInvalidatedError);
  await clear;
  assert.deepEqual(order, ["active-start", "active-end", "clear"]);
});

test("work queued after a clear barrier runs after the clear", async () => {
  const generation = getDbLockGeneration();
  const order: string[] = [];
  const clear = withDbClearBarrier(async () => { order.push("clear"); });
  const afterClear = withDbLock(async () => { order.push("after-clear"); });

  await Promise.all([clear, afterClear]);
  assert.ok(getDbLockGeneration() > generation);
  assert.deepEqual(order, ["clear", "after-clear"]);
});

test("a workflow generation cannot persist after a later clear", async () => {
  const generation = getDbLockGeneration();
  await withDbClearBarrier(async () => undefined);
  await assert.rejects(withDbLock(async () => undefined, generation), DbOperationInvalidatedError);
});

test("failed operations do not deadlock later work", async () => {
  await assert.rejects(withDbLock(async () => { throw new Error("expected"); }), /expected/);
  let completed = false;
  await withDbLock(async () => { completed = true; });
  assert.equal(completed, true);
});
