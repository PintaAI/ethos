import { describe, expect, test } from "bun:test";

import { DbOperationInvalidatedError, getDbLockGeneration, withDbClearBarrier, withDbLock } from "../src/lib/sync/dbLock.ts";

describe("sync DB generation", () => {
  test("prevents a post-network write after a clear invalidates the captured generation", async () => {
    const generation = getDbLockGeneration();
    await withDbClearBarrier(async () => undefined);
    let wrote = false;

    await expect(withDbLock(async () => {
      wrote = true;
    }, generation)).rejects.toBeInstanceOf(DbOperationInvalidatedError);
    expect(wrote).toBe(false);
  });
});
