// @ts-nocheck -- Executed directly by Bun's test runner.
import { expect, test } from "bun:test";
import { createSyncDatabase } from "../../../tests/helpers/syncDatabase";
import { migrateCashflowDatabase } from "./schema";

test("a compatible future database keeps its schema version and pending data", async () => {
  const { db, sqlite } = await createSyncDatabase();
  try {
    sqlite.exec("PRAGMA user_version = 29; CREATE TABLE future_sync_state (payload TEXT); INSERT INTO future_sync_state VALUES ('pending');");
    await migrateCashflowDatabase(db);
    expect(sqlite.query("PRAGMA user_version").get().user_version).toBe(29);
    expect(sqlite.query("SELECT payload FROM future_sync_state").get().payload).toBe("pending");
  } finally { sqlite.close(); }
});

test("replaying the additive migration after a legacy version marker is safe", async () => {
  const { db, sqlite } = await createSyncDatabase();
  try {
    sqlite.exec("INSERT INTO app_preferences (key, value) VALUES ('pending-proof', 'keep'); PRAGMA user_version = 26;");
    await migrateCashflowDatabase(db);
    await migrateCashflowDatabase(db);
    expect(sqlite.query("PRAGMA user_version").get().user_version).toBe(27);
    expect(sqlite.query("SELECT value FROM app_preferences WHERE key = 'pending-proof'").get().value).toBe("keep");
    expect(sqlite.query("PRAGMA integrity_check").get().integrity_check).toBe("ok");
  } finally { sqlite.close(); }
});

test("a failed additive migration rolls back columns and version before a safe retry", async () => {
  const { db, sqlite } = await createSyncDatabase();
  try {
    sqlite.exec("ALTER TABLE items DROP COLUMN notify_start; ALTER TABLE items DROP COLUMN notify_end; PRAGMA user_version = 26; INSERT INTO app_preferences (key, value) VALUES ('pending-proof', 'keep');");
    const execute = db.execAsync;
    db.execAsync = async (sql) => {
      if (sql.includes("ADD COLUMN notify_end")) throw new Error("injected migration failure");
      return execute(sql);
    };
    await expect(migrateCashflowDatabase(db)).rejects.toThrow("injected migration failure");
    expect(sqlite.query("PRAGMA user_version").get().user_version).toBe(26);
    expect(sqlite.query("PRAGMA table_info(items)").all().some((column) => column.name.startsWith("notify_"))).toBe(false);
    expect(sqlite.query("SELECT value FROM app_preferences WHERE key = 'pending-proof'").get().value).toBe("keep");
    db.execAsync = execute;
    await migrateCashflowDatabase(db);
    expect(sqlite.query("PRAGMA user_version").get().user_version).toBe(27);
    expect(sqlite.query("PRAGMA integrity_check").get().integrity_check).toBe("ok");
  } finally { sqlite.close(); }
});
