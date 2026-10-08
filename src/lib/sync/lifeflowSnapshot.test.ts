// @ts-nocheck -- Executed directly by Bun's test runner.
import { describe, expect, test } from "bun:test";
import { createSyncDatabase } from "../../../tests/helpers/syncDatabase";
import { applyLifeFlowEntity } from "./lifeflowApply";
import { collectLifeFlowEntities } from "./lifeflowCollect";
import { applyLifeFlowSnapshot } from "./lifeflowSnapshot";

const stamp = "2026-10-02T10:00:00.000Z";
const event = {
  kind: "item", id: "event", updatedAt: stamp, data: {
    id: "event", kind: "event", name: "First", color: "#123456", starts_on: "2026-10-02",
    start_time: "09:00", end_time: "10:00", break_durations_json: "[]",
    recurrence_frequency: "daily", recurrence_interval: 1, recurrence_weekdays_json: "[]",
    recurrence_ends_on: null, system_type: null, created_at: stamp,
  },
};

describe("LifeFlow snapshots during local writes", () => {
  test("replaying an unchanged snapshot performs no writes, including timestamp triggers", async () => {
    const { db, sqlite } = await createSyncDatabase();
    try {
      await applyLifeFlowEntity(db, event);
      const sent = await collectLifeFlowEntities(db);
      const before = sqlite.query("SELECT total_changes() AS count").get().count;
      expect(await applyLifeFlowSnapshot(db, sent, sent)).toBe(0);
      expect(sqlite.query("SELECT total_changes() AS count").get().count).toBe(before);
      expect(sqlite.query("SELECT updated_at FROM items WHERE id = 'event'").get().updated_at).toBe(stamp);
    } finally { sqlite.close(); }
  });

  test("an edit during upload survives a later server timestamp", async () => {
    const { db, sqlite } = await createSyncDatabase();
    try {
      await applyLifeFlowEntity(db, event);
      const sent = await collectLifeFlowEntities(db);
      sqlite.exec("UPDATE items SET name = 'Second', updated_at = '2026-10-02T10:01:00.000Z' WHERE id = 'event'");
      expect(await applyLifeFlowSnapshot(db, [{ ...event, updatedAt: "2026-10-02T11:00:00.000Z" }], sent)).toBe(0);
      expect(sqlite.query("SELECT name FROM items WHERE id = 'event'").get().name).toBe("Second");
    } finally { sqlite.close(); }
  });

  test("a delete during upload survives a live response and retains its tombstone", async () => {
    const { db, sqlite } = await createSyncDatabase();
    try {
      await applyLifeFlowEntity(db, event);
      const sent = await collectLifeFlowEntities(db);
      sqlite.exec("DELETE FROM items WHERE id = 'event'");
      const tombstone = sqlite.query("SELECT * FROM lifeflow_tombstones").get();
      expect(await applyLifeFlowSnapshot(db, [{ ...event, updatedAt: "2099-01-01T00:00:00.000Z" }], sent)).toBe(0);
      expect(sqlite.query("SELECT * FROM items").get()).toBeNull();
      expect(sqlite.query("SELECT * FROM lifeflow_tombstones").get()).toEqual(tombstone);
    } finally { sqlite.close(); }
  });

  test("a parent delete cannot cascade through a child edited during upload", async () => {
    const { db, sqlite } = await createSyncDatabase();
    try {
      await applyLifeFlowEntity(db, event);
      const sent = await collectLifeFlowEntities(db);
      await applyLifeFlowEntity(db, { kind: "item_exception", id: "event|2026-10-02", updatedAt: stamp, data: {
        item_id: "event", original_date: "2026-10-02", replacement_date: null,
        cancelled: true, replacement: null, created_at: stamp,
      } });
      expect(await applyLifeFlowSnapshot(db, [{ kind: "item", id: "event", deleted: true, updatedAt: "2099-01-01T00:00:00.000Z" }], sent)).toBe(0);
      expect(sqlite.query("SELECT count(*) AS count FROM items").get().count).toBe(1);
      expect(sqlite.query("SELECT count(*) AS count FROM item_exceptions").get().count).toBe(1);
    } finally { sqlite.close(); }
  });
});
