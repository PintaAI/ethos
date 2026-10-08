// @ts-nocheck -- Executed directly by Bun's test runner.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Database } from "bun:sqlite";
import type { LifeFlowSyncEntity } from "@/lib/api/lifeflow";
import { applyLifeFlowEntity } from "./lifeflowApply";
import { orderLifeFlowSnapshot } from "./lifeflowOrder";
import { collectLifeFlowEntities } from "./lifeflowCollect";

function port(sqlite: Database) {
  return {
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) => sqlite.query(sql).get(...params) as T | null,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) => sqlite.query(sql).all(...params) as T[],
    runAsync: async (sql: string, ...params: unknown[]) => sqlite.query(sql).run(...params),
  };
}

describe("unified LifeFlow sync protocol", () => {
  test("serializes live items, habit logs, and event exceptions to the server contract", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE items (id TEXT, kind TEXT, name TEXT, color TEXT, starts_on TEXT,
        start_time TEXT, end_time TEXT, notify_start INTEGER, notify_end INTEGER, break_durations_json TEXT, recurrence_frequency TEXT,
        recurrence_interval INTEGER, recurrence_weekdays_json TEXT, recurrence_ends_on TEXT, system_type TEXT,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE habit_logs (item_id TEXT, date TEXT, completed_at TEXT, updated_at TEXT);
      CREATE TABLE item_exceptions (item_id TEXT, original_date TEXT, replacement_date TEXT,
        cancelled INTEGER, replacement_json TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE lifeflow_tombstones (kind TEXT, entity_id TEXT, updated_at TEXT);
    `);
    const stamp = "2026-08-08T10:00:00.000Z";
    sqlite.query("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "event", "event", "Plan", "#5B8CFF", "2026-08-08", "09:00", "10:00", 1, 0, "[]",
      "daily", 1, "[]", null, null, stamp, stamp,
    );
    sqlite.query("INSERT INTO habit_logs VALUES (?, ?, ?, ?)").run("habit", "2026-08-08", stamp, stamp);
    sqlite.query("INSERT INTO item_exceptions VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "event", "2026-08-08", null, 1, null, stamp, stamp,
    );
    sqlite.query("INSERT INTO item_exceptions VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "event", "2026-08-09", "2026-08-09", 0,
      JSON.stringify({ kind: "event", name: "Same", color: "#5B8CFF", startTime: "10:00", endTime: "11:00", breakDurations: [] }), stamp, stamp,
    );
    sqlite.query("INSERT INTO item_exceptions VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "event", "2026-08-10", "2026-08-12", 0,
      JSON.stringify({ kind: "event", name: "Moved", color: "#EF4444", startTime: null, endTime: null, breakDurations: [] }), stamp, stamp,
    );

    const entities = await collectLifeFlowEntities(port(sqlite) as never);
    const item = entities.find((entity) => entity.kind === "item")!;
    assert.equal(item.data?.updated_at, undefined);
    const log = entities.find((entity) => entity.kind === "habit_log")!;
    assert.equal(log.data?.updated_at, stamp);
    const exceptions = entities.filter((entity) => entity.kind === "item_exception");
    assert.equal(exceptions[0].data?.cancelled, true);
    assert.equal(exceptions[0].data?.replacement, null);
    assert.equal(exceptions[1].data?.cancelled, false);
    assert.equal(exceptions[1].data?.replacement_date, "2026-08-09");
    assert.deepEqual(exceptions[1].data?.replacement, {
      name: "Same", color: "#5B8CFF", start_time: "10:00", end_time: "11:00",
      notify_start: true, notify_end: true, break_durations_json: "[]",
    });
    assert.equal(exceptions[2].data?.replacement_date, "2026-08-12");
    sqlite.close();
  });

  test("applies Item parents first and deletes them last", () => {
    const entity = (kind: LifeFlowSyncEntity["kind"], deleted = false): LifeFlowSyncEntity => ({
      kind, id: `${kind}-id`, updatedAt: "2026-08-05T00:00:00.000Z", deleted, data: {},
    });
    const ordered = orderLifeFlowSnapshot([
      entity("item_exception"), entity("item"), entity("habit_log", true), entity("item", true),
    ]);
    assert.deepEqual(ordered.map((item) => `${item.deleted ? "delete" : "upsert"}:${item.kind}`), [
      "upsert:item", "upsert:item_exception", "delete:habit_log", "delete:item",
    ]);
  });

  test("round trips all unified payload kinds and rejects a wrong-kind parent", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE items (id TEXT, kind TEXT, name TEXT, color TEXT, starts_on TEXT,
        start_time TEXT, end_time TEXT, notify_start INTEGER, notify_end INTEGER, break_durations_json TEXT, recurrence_frequency TEXT,
        recurrence_interval INTEGER, recurrence_weekdays_json TEXT, recurrence_ends_on TEXT, system_type TEXT,
        created_at TEXT, updated_at TEXT, UNIQUE(id));
      CREATE TABLE habit_logs (item_id TEXT, date TEXT, completed_at TEXT, updated_at TEXT,
        UNIQUE(item_id, date));
      CREATE TABLE item_exceptions (item_id TEXT, original_date TEXT, replacement_date TEXT,
        cancelled INTEGER, replacement_json TEXT, created_at TEXT, updated_at TEXT,
        UNIQUE(item_id, original_date));
      CREATE TABLE lifeflow_tombstones (kind TEXT, entity_id TEXT, updated_at TEXT);
    `);
    const db = port(sqlite);
    const updatedAt = "2026-08-08T00:00:00.000Z";
    await applyLifeFlowEntity(db as never, {
      kind: "item", id: "habit", updatedAt, data: {
        id: "habit", kind: "habit", name: "Read", color: "#123456", starts_on: "2026-08-08",
        start_time: null, end_time: null, break_durations_json: "[]", recurrence_frequency: "daily",
        recurrence_interval: 1, recurrence_weekdays_json: "[]", recurrence_ends_on: null,
        system_type: null, created_at: updatedAt,
      },
    });
    await applyLifeFlowEntity(db as never, {
      kind: "habit_log", id: "habit|2026-08-08", updatedAt,
      data: { item_id: "habit", date: "2026-08-08", completed_at: updatedAt },
    });
    assert.equal(sqlite.query("SELECT recurrence_frequency FROM items").get().recurrence_frequency, "daily");
    assert.equal(sqlite.query("SELECT item_id FROM habit_logs").get().item_id, "habit");
    await assert.rejects(() => applyLifeFlowEntity(db as never, {
      kind: "item_exception", id: "habit|2026-08-08", updatedAt,
      data: { item_id: "habit", original_date: "2026-08-08", replacement_date: null, cancelled: 1, replacement_json: null, created_at: updatedAt },
    }), /recurring event/);
    await applyLifeFlowEntity(db as never, {
      kind: "item", id: "event", updatedAt, data: {
        id: "event", kind: "event", name: "Plan", color: "#5B8CFF", starts_on: "2026-08-08",
        start_time: null, end_time: null, break_durations_json: "[]", recurrence_frequency: "daily",
        recurrence_interval: 1, recurrence_weekdays_json: "[]", recurrence_ends_on: null,
        system_type: null, created_at: updatedAt,
      },
    });
    await applyLifeFlowEntity(db as never, {
      kind: "item_exception", id: "event|2026-08-08", updatedAt, data: {
        item_id: "event", original_date: "2026-08-08", replacement_date: "2026-08-09", cancelled: false,
        replacement: { name: "Moved", color: "#EF4444", start_time: null, end_time: null, break_durations_json: "[]" },
        created_at: updatedAt, updated_at: updatedAt,
      },
    });
    const applied = sqlite.query("SELECT cancelled, replacement_json, updated_at FROM item_exceptions WHERE item_id = 'event'").get();
    assert.equal(applied.cancelled, 0);
    assert.deepEqual(JSON.parse(applied.replacement_json), {
      kind: "event", name: "Moved", color: "#EF4444", startTime: null, endTime: null,
      notifyStart: true, notifyEnd: true, breakDurations: [],
    });
    assert.equal(applied.updated_at, updatedAt);
    const beforeReplay = sqlite.query("SELECT total_changes() AS count").get().count;
    const snapshot = await collectLifeFlowEntities(db as never);
    for (const entity of snapshot) await applyLifeFlowEntity(db as never, entity);
    assert.equal(sqlite.query("SELECT total_changes() AS count").get().count, beforeReplay, "identical snapshots must not write domain rows");
    sqlite.query("DELETE FROM items WHERE id = ?").run("event");
    sqlite.query("INSERT INTO lifeflow_tombstones VALUES (?, ?, ?)").run("item", "event", "2026-08-09T00:00:00.000Z");
    await applyLifeFlowEntity(db as never, snapshot.find((entity) => entity.kind === "item" && entity.id === "event")!);
    assert.equal(sqlite.query("SELECT id FROM items WHERE id = 'event'").get(), null, "stale snapshots must not resurrect local deletes");
    sqlite.close();
  });
});
