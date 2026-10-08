// @ts-nocheck -- Bun SQLite adapter for integration tests, no native runtime.
import { Database } from "bun:sqlite";
import { migrateCashflowDatabase } from "../../src/data/cashflow/schema";

export async function createSyncDatabase() {
  const sqlite = new Database(":memory:");
  const db = {
    execAsync: async (sql) => { sqlite.exec(sql); },
    getFirstAsync: async (sql, ...params) => sqlite.query(sql).get(...params),
    getAllAsync: async (sql, ...params) => sqlite.query(sql).all(...params),
    runAsync: async (sql, ...params) => sqlite.query(sql).run(...params),
    withExclusiveTransactionAsync: async (work) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try { const result = await work(db); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  try { await migrateCashflowDatabase(db); }
  catch (error) { sqlite.close(); throw error; }
  return { db, sqlite };
}
