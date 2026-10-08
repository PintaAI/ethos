// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { Database } from "bun:sqlite";
import { migratePersonalLifeFlow } from "./lifeflowPersonalMigration.ts";

test("personal LifeFlow migration preserves wallet-scoped data without touching cashflow", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managements (id TEXT PRIMARY KEY);
    CREATE TABLE entries (id TEXT PRIMARY KEY, management_id TEXT);
    CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE items (id TEXT PRIMARY KEY, management_id TEXT, kind TEXT, name TEXT, color TEXT, starts_on TEXT,
      start_time TEXT, end_time TEXT, break_durations_json TEXT, recurrence_frequency TEXT, recurrence_interval INTEGER,
      recurrence_weekdays_json TEXT, recurrence_ends_on TEXT, system_type TEXT, created_at TEXT, updated_at TEXT,
      UNIQUE(management_id, id));
    CREATE TABLE habit_logs (management_id TEXT, item_id TEXT, date TEXT, completed_at TEXT, updated_at TEXT);
    CREATE TABLE item_exceptions (management_id TEXT, item_id TEXT, original_date TEXT, replacement_date TEXT,
      cancelled INTEGER, replacement_json TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE lifeflow_tombstones (management_id TEXT, kind TEXT, entity_id TEXT, updated_at TEXT);
    INSERT INTO managements VALUES ('wallet');
    INSERT INTO entries VALUES ('entry', 'wallet');
    INSERT INTO items VALUES ('habit', 'wallet', 'habit', 'Read', '#123456', '2026-08-08', NULL, NULL, '[]', 'daily', 1, '[]', NULL, NULL, 'now', 'now');
    INSERT INTO app_preferences VALUES ('lifeflow_journal_enabled:wallet', 'true', NULL);
  `);
  const port = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    getFirstAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).get(...params),
    getAllAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).all(...params),
    runAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).run(...params),
    withExclusiveTransactionAsync: async (task: (txn: unknown) => Promise<void>) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try { await task(port); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };

  await migratePersonalLifeFlow(port as never);

  assert.deepEqual(sqlite.query("SELECT * FROM entries").all(), [{ id: "entry", management_id: "wallet" }]);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM items").get().count, 1);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM lifeflow_tombstones").get().count, 0);
  assert.equal(sqlite.query("SELECT value FROM app_preferences WHERE key = 'lifeflow_journal_enabled'").get().value, "true");
  assert.equal(sqlite.query("PRAGMA table_info(items)").all().some((column) => column.name === "management_id"), false);
  sqlite.close();
});
