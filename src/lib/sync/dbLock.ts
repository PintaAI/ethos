// Serializes migration, clearing, and background access to the shared database.
//
// Both `ethos-sync` (syncBackground.ts) and `ethos-automatic-entries`
// (automaticEntries.ts) call `openDatabaseAsync` on the same SQLite file and
// subsequently run `migrateCashflowDatabase`, which uses exclusive
// transactions. Without serialization one task can run into SQLITE_BUSY and
// the resulting native exception bypasses JS try/catch (caught by
// expo-updates' RCTFatalExceptionHandler in background launches, where the
// first-render safety net has not fired). We chain everything through a
// single module-level promise so these operations never overlap.

let dbAccessChain: Promise<unknown> = Promise.resolve();
let barrierGeneration = 0;

export class DbOperationInvalidatedError extends Error {
  constructor() {
    super("Database operation was invalidated by a clear barrier");
    this.name = "DbOperationInvalidatedError";
  }
}

export function getDbLockGeneration(): number {
  return barrierGeneration;
}

export function withDbLock<T>(operation: () => Promise<T>, generation = barrierGeneration): Promise<T> {
  const chained = dbAccessChain.catch(() => undefined).then(() => {
    if (generation !== barrierGeneration) throw new DbOperationInvalidatedError();
    return operation();
  });
  // Keep the chain alive even if the caller ignores the returned promise.
  dbAccessChain = chained.then(
    () => undefined,
    () => undefined,
  );
  return chained;
}

export function withDbClearBarrier<T>(operation: () => Promise<T>): Promise<T> {
  // Invalidate already-queued work before waiting for the current holder to finish.
  barrierGeneration += 1;
  const chained = dbAccessChain.catch(() => undefined).then(() => operation());
  dbAccessChain = chained.then(
    () => undefined,
    () => undefined,
  );
  return chained;
}
