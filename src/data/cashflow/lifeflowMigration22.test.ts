// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { Database } from "bun:sqlite";
import { adoptLifeFlowScope, ensureLifeFlowScopeColumns } from "./lifeflowMigration22.ts";

function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managements (id TEXT PRIMARY KEY);
    CREATE TABLE app_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE habits (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE habit_logs (habit_id TEXT, date TEXT);
    CREATE TABLE time_boxes (id TEXT PRIMARY KEY);
    CREATE TABLE day_presets (id TEXT PRIMARY KEY);
    CREATE TABLE day_preset_blocks (id TEXT PRIMARY KEY);
    CREATE TABLE day_preset_schedules (id TEXT PRIMARY KEY);
  `);
  return {
    sqlite,
    port: {
      execAsync: async (sql: string) => { sqlite.exec(sql); },
      runAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).run(...params),
      getAllAsync: async <T>(sql: string) => sqlite.query(sql).all() as T[],
    },
  };
}

test("v22 creates scope columns on a fresh database without a management", async () => {
  const { sqlite, port } = fixture();
  await ensureLifeFlowScopeColumns(port);
  for (const table of ["habits", "habit_logs", "time_boxes", "day_presets", "day_preset_blocks", "day_preset_schedules"]) {
    assert.ok(sqlite.query(`PRAGMA table_info(${table})`).all().some((column) => column.name === "management_id"));
  }
  assert.ok(sqlite.query("PRAGMA table_info(habits)").all().some((column) => column.name === "system_type"));
  sqlite.close();
});

test("v22 adopts existing data and scoped system habit flags", async () => {
  const { sqlite, port } = fixture();
  sqlite.exec(`
    INSERT INTO managements VALUES ('wallet-a');
    INSERT INTO habits VALUES ('habit-check-in', 'Check in');
    INSERT INTO habit_logs VALUES ('habit-check-in', '2026-08-05');
    INSERT INTO time_boxes VALUES ('box');
    INSERT INTO day_presets VALUES ('preset');
    INSERT INTO day_preset_blocks VALUES ('block');
    INSERT INTO day_preset_schedules VALUES ('schedule');
    INSERT INTO app_preferences VALUES ('atomic_habits_app_check_in_id', 'habit-check-in');
  `);
  await ensureLifeFlowScopeColumns(port);
  await adoptLifeFlowScope(port, "wallet-a");
  assert.equal(sqlite.query("SELECT management_id, system_type FROM habits").get().management_id, "wallet-a");
  assert.equal(sqlite.query("SELECT system_type FROM habits").get().system_type, "app_check_in");
  for (const table of ["habit_logs", "time_boxes", "day_presets", "day_preset_blocks", "day_preset_schedules"]) {
    assert.equal(sqlite.query(`SELECT management_id FROM ${table}`).get().management_id, "wallet-a");
  }
  sqlite.close();
});
