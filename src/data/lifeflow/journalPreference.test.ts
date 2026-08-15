// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { Database } from "bun:sqlite";
import { isJournalEnabled, persistJournalEnabled } from "./journalPreference.ts";

test("journal enabled state persists for the user", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
  const db = {
    getFirstAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).get(...params),
    runAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).run(...params),
  };

  assert.equal(await isJournalEnabled(db as never), false);
  await persistJournalEnabled(db as never, true);
  assert.equal(await isJournalEnabled(db as never), true);
  await persistJournalEnabled(db as never, false);
  assert.equal(await isJournalEnabled(db as never), false);
  assert.equal(sqlite.query("SELECT value FROM app_preferences WHERE key = 'lifeflow_journal_enabled'").get().value, "false");
  sqlite.close();
});
