// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { Database } from "bun:sqlite";

test("updating an existing habit log does not create a sync tombstone", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE habit_logs (
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      management_id TEXT NOT NULL,
      PRIMARY KEY (habit_id, date)
    );
    CREATE TABLE lifeflow_tombstones (
      management_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (management_id, kind, entity_id)
    );
    CREATE TRIGGER habit_logs_sync_delete AFTER DELETE ON habit_logs BEGIN
      INSERT OR REPLACE INTO lifeflow_tombstones VALUES
        (OLD.management_id, 'habit_log', OLD.habit_id || '|' || OLD.date, datetime('now'));
    END;
    INSERT INTO habit_logs VALUES ('habit-1', '2026-08-05', 'first', 'wallet-a');
  `);

  db.query(`
    INSERT INTO habit_logs (habit_id, date, completed_at, management_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(habit_id, date) DO UPDATE SET completed_at = excluded.completed_at
  `).run("habit-1", "2026-08-05", "second", "wallet-a");

  assert.equal(db.query("SELECT completed_at FROM habit_logs").get().completed_at, "second");
  assert.equal(db.query("SELECT count(*) AS count FROM lifeflow_tombstones").get().count, 0);
  db.close();
});
