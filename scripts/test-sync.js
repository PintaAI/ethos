// Isolate transport mocks between suites. Domain tests use real SQLite.
const { spawnSync } = require("node:child_process");
const files = [
  "src/lib/sync/dbLock.test.ts",
  "src/lib/sync/lifeflowSync.test.ts",
  "src/lib/sync/lifeflowSnapshot.test.ts",
  "src/lib/sync/syncScheduler.test.ts",
  "src/lib/sync/syncStatus.test.ts",
  "tests/syncEngine.integration.test.ts",
  "tests/lifeflowIncremental.integration.test.ts",
  "tests/legacyMigration.integration.test.ts",
  "src/data/cashflow/schemaCompatibility.test.ts",
  "src/data/cashflow/lifeflowUnifiedMigration.test.ts",
  "src/data/cashflow/lifeflowPersonalMigration.test.ts",
  "src/data/lifeflow/unifiedRepository.test.ts",
  "tests/syncPolicy.test.mjs",
  "tests/syncSql.test.mjs",
];
for (const file of files) {
  const result = spawnSync("bun", ["test", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
