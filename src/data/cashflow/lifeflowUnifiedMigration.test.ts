// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { Database } from "bun:sqlite";
import { migrateUnifiedLifeFlow } from "./lifeflowUnifiedMigration.ts";

function createPort(sqlite: Database) {
  const port = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    runAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).run(...params),
    getAllAsync: async <T>(sql: string, ...params: unknown[]) => sqlite.query(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) => sqlite.query(sql).get(...params) as T | null,
    withExclusiveTransactionAsync: async (task: (txn: unknown) => Promise<void>) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try { await task(port); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return port;
}

test("unified migration destroys only LifeFlow data and preserves cashflow and notes", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managements (id TEXT PRIMARY KEY, remote_id TEXT, deleted_at TEXT);
    CREATE TABLE management_members (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE entries (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE categories (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE recurring_entries (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE quick_fills (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE overall_budgets (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE audit_snapshots (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE note_cache (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE note_drafts (id TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE habits (id TEXT PRIMARY KEY, management_id TEXT);
    CREATE TABLE habit_logs (habit_id TEXT, date TEXT, management_id TEXT);
    CREATE TABLE time_boxes (id TEXT PRIMARY KEY, management_id TEXT);
    CREATE TABLE day_presets (id TEXT PRIMARY KEY, management_id TEXT);
    CREATE TABLE day_preset_blocks (id TEXT PRIMARY KEY, management_id TEXT);
    CREATE TABLE day_preset_schedules (id TEXT PRIMARY KEY, management_id TEXT);
    CREATE TABLE lifeflow_tombstones (management_id TEXT, kind TEXT, entity_id TEXT, updated_at TEXT,
      PRIMARY KEY (management_id, kind, entity_id));
    INSERT INTO managements VALUES ('wallet', 'remote-wallet', NULL);
    INSERT INTO management_members VALUES ('member', 'member-value');
    INSERT INTO entries VALUES ('entry', 'entry-value');
    INSERT INTO categories VALUES ('category', 'category-value');
    INSERT INTO recurring_entries VALUES ('recurring', 'recurring-value');
    INSERT INTO quick_fills VALUES ('quick', 'quick-value');
    INSERT INTO overall_budgets VALUES ('budget', 'budget-value');
    INSERT INTO audit_snapshots VALUES ('audit', 'audit-value');
    INSERT INTO note_cache VALUES ('note', 'note-value');
    INSERT INTO note_drafts VALUES ('draft', 'draft-value');
    INSERT INTO habits VALUES ('old-habit', 'wallet');
    INSERT INTO habit_logs VALUES ('old-habit', '2026-08-01', 'wallet');
    INSERT INTO time_boxes VALUES ('old-box', 'wallet');
    INSERT INTO day_presets VALUES ('old-preset', 'wallet');
    INSERT INTO day_preset_blocks VALUES ('old-block', 'wallet');
    INSERT INTO day_preset_schedules VALUES ('old-schedule', 'wallet');
    INSERT INTO lifeflow_tombstones VALUES ('wallet', 'habit', 'gone', 'now');
    INSERT INTO app_preferences VALUES ('atomic_habits_app_check_in_id', 'old-habit', NULL);
    INSERT INTO app_preferences VALUES ('lifeflow_journal_enabled:wallet', 'true', NULL);
  `);
  const preserved = ["managements", "management_members", "entries", "categories", "recurring_entries", "quick_fills", "overall_budgets", "audit_snapshots", "note_cache", "note_drafts"];
  const before = Object.fromEntries(preserved.map((table) => [table, sqlite.query(`SELECT * FROM ${table}`).all()]));

  await migrateUnifiedLifeFlow(createPort(sqlite) as never, "2026-08-08");

  for (const table of preserved) assert.deepEqual(sqlite.query(`SELECT * FROM ${table}`).all(), before[table], table);
  for (const table of ["habits", "time_boxes", "day_presets", "day_preset_blocks", "day_preset_schedules"]) {
    assert.equal(sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), null);
  }
  assert.equal(sqlite.query("SELECT count(*) AS count FROM lifeflow_tombstones").get().count, 0);
  assert.deepEqual(sqlite.query("SELECT id, system_type, starts_on, created_at FROM items ORDER BY system_type").all(), [
    { id: "lifeflow-app-check-in-remote-wallet", system_type: "app_check_in", starts_on: "2020-01-01", created_at: "2020-01-01T00:00:00.000Z" },
    { id: "lifeflow-journal-remote-wallet", system_type: "journal", starts_on: "2020-01-01", created_at: "2020-01-01T00:00:00.000Z" },
  ]);
  assert.ok(sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'item_exceptions_sync_delete'").get());
  sqlite.close();
});

test("unified migration rolls back legacy data and schema when system Item creation fails", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managements (id TEXT PRIMARY KEY, remote_id TEXT, deleted_at TEXT);
    CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE habits (id TEXT PRIMARY KEY, management_id TEXT);
    CREATE TABLE habit_logs (habit_id TEXT, date TEXT, management_id TEXT);
    CREATE TABLE lifeflow_tombstones (
      management_id TEXT,
      kind TEXT,
      entity_id TEXT,
      updated_at TEXT,
      PRIMARY KEY (management_id, kind, entity_id)
    );
    INSERT INTO managements VALUES ('wallet', NULL, NULL);
    INSERT INTO habits VALUES ('old-habit', 'wallet');
    INSERT INTO habit_logs VALUES ('old-habit', '2026-08-01', 'wallet');
    INSERT INTO lifeflow_tombstones VALUES ('wallet', 'habit', 'gone', 'now');
  `);
  const base = createPort(sqlite);
  const failing: typeof base = {
    ...base,
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (sql.includes("INSERT INTO items")) throw new Error("injected failure");
      return base.runAsync(sql, ...params);
    },
    withExclusiveTransactionAsync: async (task: (txn: unknown) => Promise<void>) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        await task(failing);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };

  await assert.rejects(
    () => migrateUnifiedLifeFlow(failing as never, "2026-08-08"),
    /injected failure/,
  );
  assert.deepEqual(sqlite.query("SELECT * FROM habits").all(), [
    { id: "old-habit", management_id: "wallet" },
  ]);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM habit_logs").get().count, 1);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM lifeflow_tombstones").get().count, 1);
  assert.equal(
    sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'items'").get(),
    null,
  );
  sqlite.close();
});
