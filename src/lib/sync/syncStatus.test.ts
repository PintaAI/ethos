// @ts-nocheck -- Executed directly by Bun's test runner.
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { markSynced, upsertByRemoteId } from "./syncStatus";

function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`CREATE TABLE categories (
    id TEXT PRIMARY KEY, remote_id TEXT, name TEXT, updated_at TEXT,
    sync_status TEXT, last_synced_at TEXT, deleted_at TEXT
  ); INSERT INTO categories VALUES ('local', NULL, 'First', '2026-10-02T10:00:00.000Z', 'pending', NULL, NULL);`);
  const db = {
    getFirstAsync: async (sql, ...params) => sqlite.query(sql).get(...params),
    runAsync: async (sql, ...params) => sqlite.query(sql).run(...params),
    withExclusiveTransactionAsync: async (work) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try { const result = await work(db); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { sqlite, db, read: () => sqlite.query("SELECT * FROM categories").get() };
}

describe("sync acknowledgments", () => {
  test("a create acknowledgment keeps an edit made during the request pending, even with the same timestamp", async () => {
    const { sqlite, db, read } = fixture();
    try {
      const sent = read();
      sqlite.exec("UPDATE categories SET name = 'Second'");
      await markSynced(db, "categories", sent.id, "remote", "2026-10-02T11:00:00.000Z", sent);
      expect(read()).toMatchObject({ name: "Second", remote_id: "remote", sync_status: "updated", updated_at: sent.updated_at });
    } finally { sqlite.close(); }
  });

  test("a create acknowledgment retains a delete made during the request", async () => {
    const { sqlite, db, read } = fixture();
    try {
      const sent = read();
      sqlite.exec("UPDATE categories SET sync_status = 'deleted', deleted_at = '2026-10-02T10:01:00.000Z'");
      await markSynced(db, "categories", sent.id, "remote", "2026-10-02T11:00:00.000Z", sent);
      expect(read()).toMatchObject({ remote_id: "remote", sync_status: "deleted", deleted_at: "2026-10-02T10:01:00.000Z" });
    } finally { sqlite.close(); }
  });

  test("acknowledges an unchanged version", async () => {
    const { sqlite, db, read } = fixture();
    try {
      const sent = read();
      await markSynced(db, "categories", sent.id, "remote", "2026-10-02T11:00:00.000Z", sent);
      expect(read()).toMatchObject({ remote_id: "remote", sync_status: "synced", updated_at: "2026-10-02T11:00:00.000Z" });
    } finally { sqlite.close(); }
  });

  test("a newer server snapshot cannot overwrite an unacknowledged edit", async () => {
    const { sqlite, db, read } = fixture();
    try {
      sqlite.exec("UPDATE categories SET remote_id = 'remote', sync_status = 'updated'");
      await upsertByRemoteId(db, "categories", "remote", { name: "Old server", updated_at: "2026-10-02T11:00:00.000Z" });
      expect(read()).toMatchObject({ name: "First", sync_status: "updated" });
    } finally { sqlite.close(); }
  });
});
