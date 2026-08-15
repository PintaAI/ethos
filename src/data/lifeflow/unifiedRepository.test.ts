// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { Database } from "bun:sqlite";
import {
  canonicalizeSystemItemsForSync,
  recordUnifiedJournalActivity,
  setJournalItemEnabled,
} from "./unifiedRepository.ts";

function port(sqlite: Database) {
  const adapter = {
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) =>
      sqlite.query(sql).get(...params) as T | null,
    runAsync: async (sql: string, ...params: unknown[]) =>
      sqlite.query(sql).run(...params),
    withExclusiveTransactionAsync: async (task: (txn: unknown) => Promise<void>) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        await task(adapter);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return adapter;
}

function createDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE app_preferences (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      starts_on TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      break_durations_json TEXT NOT NULL,
      recurrence_frequency TEXT,
      recurrence_interval INTEGER NOT NULL,
      recurrence_weekdays_json TEXT NOT NULL,
      recurrence_ends_on TEXT,
      system_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE habit_logs (
      item_id TEXT NOT NULL,
      date TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (item_id, date),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );
    CREATE TABLE lifeflow_tombstones (
      kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (kind, entity_id)
    );
    CREATE UNIQUE INDEX items_system_idx
      ON items(system_type) WHERE system_type IS NOT NULL;
    CREATE TRIGGER items_sync_delete AFTER DELETE ON items BEGIN
      INSERT OR REPLACE INTO lifeflow_tombstones VALUES
        ('item', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER habit_logs_sync_delete AFTER DELETE ON habit_logs BEGIN
      INSERT OR REPLACE INTO lifeflow_tombstones VALUES
        ('habit_log', OLD.item_id || '|' || OLD.date, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
  `);
  return sqlite;
}

test("Journal tracking remains optional and disabled activity cannot recreate it", async () => {
  const sqlite = createDatabase();
  const db = port(sqlite);

  assert.equal(await recordUnifiedJournalActivity(db as never, "2026-08-08"), false);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM items").get().count, 0);

  await setJournalItemEnabled(db as never, true, "2026-08-08");
  assert.deepEqual(
    sqlite.query("SELECT id, starts_on, created_at FROM items").get(),
    {
      id: "lifeflow-journal",
      starts_on: "2020-01-01",
      created_at: "2020-01-01T00:00:00.000Z",
    },
  );
  assert.equal(await recordUnifiedJournalActivity(db as never, "2026-08-08"), true);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM habit_logs").get().count, 1);

  await setJournalItemEnabled(db as never, false, "2026-08-08");
  assert.equal(sqlite.query("SELECT value FROM app_preferences WHERE key = 'lifeflow_journal_enabled'").get().value, "false");
  assert.equal(sqlite.query("SELECT count(*) AS count FROM items").get().count, 0);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM habit_logs").get().count, 0);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM lifeflow_tombstones WHERE kind = 'item'").get().count, 1);
  assert.equal(await recordUnifiedJournalActivity(db as never, "2026-08-09"), false);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM items").get().count, 0);

  await setJournalItemEnabled(db as never, true, "2026-08-09");
  assert.equal(sqlite.query("SELECT count(*) AS count FROM lifeflow_tombstones WHERE kind = 'item'").get().count, 0);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM lifeflow_tombstones WHERE kind = 'habit_log'").get().count, 1);

  sqlite.close();
});

test("system Items use a stable personal identity", async () => {
  const sqlite = createDatabase();
  const db = port(sqlite);
  await canonicalizeSystemItemsForSync(db as never);

  assert.deepEqual(sqlite.query("SELECT id, system_type FROM items").get(), {
    id: "lifeflow-app-check-in",
    system_type: "app_check_in",
  });
  assert.equal(sqlite.query("SELECT count(*) AS count FROM lifeflow_tombstones").get().count, 0);

  sqlite.close();
});
