// @ts-nocheck -- Production schema fixture with real SQLite.
import { Database } from "bun:sqlite";
import { expect,test } from "bun:test";
import { migrateCashflowDatabase as embeddedMigrate } from "./fixtures/embedded-schema-v20";
import { migrateCashflowDatabase } from "../src/data/cashflow/schema";
function port(sqlite) { const db={execAsync:async sql=>sqlite.exec(sql),getAllAsync:async(sql,...p)=>sqlite.query(sql).all(...p),getFirstAsync:async(sql,...p)=>sqlite.query(sql).get(...p),runAsync:async(sql,...p)=>sqlite.query(sql).run(...p),withExclusiveTransactionAsync:async work=>{sqlite.exec("BEGIN IMMEDIATE");try{const result=await work(db);sqlite.exec("COMMIT");return result;}catch(error){sqlite.exec("ROLLBACK");throw error;}}};return db; }
test("direct upgrade from installed schema20 preserves habits, history, timeboxes, presets and preferences",async()=>{
 const sqlite=new Database(":memory:"),db=port(sqlite);
 try {
  await embeddedMigrate(db);
  sqlite.exec(`INSERT INTO habits (id,name,color,created_at) VALUES ('read','Read','#123456','2026-07-01T00:00:00.000Z');
   INSERT INTO habit_logs VALUES ('read','2026-07-02','2026-07-02T00:00:00.000Z');
   INSERT INTO time_boxes (id,date,title,start_time,end_time,created_at) VALUES ('work','2026-07-02','Work','09:00','10:00','2026-07-01T00:00:00.000Z');
   INSERT INTO day_presets VALUES ('preset','Monday','2026-07-01T00:00:00.000Z');
   INSERT INTO app_preferences (key,value) VALUES ('lifeflow_journal_enabled','true');`);
  await migrateCashflowDatabase(db);
  expect(sqlite.query("SELECT id FROM items WHERE system_type IS NULL ORDER BY id").all()).toEqual([{id:"read"},{id:"work"}]);
  expect(sqlite.query("SELECT item_id,date FROM habit_logs").all()).toEqual([{item_id:"read",date:"2026-07-02"}]);
  expect(JSON.parse(sqlite.query("SELECT row_json FROM lifeflow_migration_archive WHERE source_table='day_presets'").get().row_json).name).toBe("Monday");
  expect(sqlite.query("SELECT value FROM app_preferences WHERE key='lifeflow_journal_enabled'").get().value).toBe("true");
  // The old runner can lower the marker. Reopening must inspect actual layout.
  await embeddedMigrate(db); expect(sqlite.query("PRAGMA user_version").get().user_version).toBe(20);
  await migrateCashflowDatabase(db);
  expect(sqlite.query("SELECT count(*) count FROM items WHERE system_type IS NULL").get().count).toBe(2);
  expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
 }finally{sqlite.close();}
});
test("a failed personal conversion is atomic and resumes from schema24",async()=>{
 const sqlite=new Database(":memory:"),db=port(sqlite);
 try {
  await embeddedMigrate(db);
  sqlite.exec("INSERT INTO habits (id,name,color,created_at) VALUES ('read','Read','#123456','2026-07-01T00:00:00.000Z')");
  const run=db.runAsync;
  db.runAsync=async(sql,...p)=>{if(sql.includes("INSERT INTO items (id, kind"))throw new Error("injected restore failure");return run(sql,...p);};
  await expect(migrateCashflowDatabase(db)).rejects.toThrow("injected restore failure");
  expect(sqlite.query("PRAGMA user_version").get().user_version).toBe(24);
  expect(sqlite.query("PRAGMA table_info(items)").all().some(row=>row.name==="management_id")).toBe(true);
  db.runAsync=run; await migrateCashflowDatabase(db);
  expect(sqlite.query("SELECT name FROM items WHERE id='read'").get().name).toBe("Read");
 }finally{sqlite.close();}
});

test("legacy system IDs without a wallet become canonical while preserving check-in history",async()=>{
 const sqlite=new Database(":memory:"),db=port(sqlite);
 try{
  await embeddedMigrate(db);
  sqlite.exec(`INSERT INTO habits (id,name,color,created_at) VALUES ('old-checkin','Old check-in','#123456','2026-07-01T00:00:00.000Z');
   INSERT INTO habit_logs VALUES ('old-checkin','2026-07-02','2026-07-02T00:00:00.000Z');
   INSERT INTO app_preferences (key,value) VALUES ('atomic_habits_app_check_in_id','old-checkin');`);
  await migrateCashflowDatabase(db);
  expect(sqlite.query("SELECT id,name,starts_on,created_at FROM items").get()).toEqual({id:"lifeflow-app-check-in",name:"App check-in",starts_on:"2020-01-01",created_at:"2020-01-01T00:00:00.000Z"});
  expect(sqlite.query("SELECT item_id,date FROM habit_logs").get()).toEqual({item_id:"lifeflow-app-check-in",date:"2026-07-02"});
 }finally{sqlite.close();}
});

test("two startup migrators recheck the committed version before replacing tables",async()=>{
 const sqlite=new Database(":memory:"),db=port(sqlite);
 try{
  await embeddedMigrate(db);
  sqlite.exec("INSERT INTO habits (id,name,color,created_at) VALUES ('read','Read','#123456','2026-07-01T00:00:00.000Z')");
  let queue=Promise.resolve();const original=db.withExclusiveTransactionAsync;
  db.withExclusiveTransactionAsync=async work=>{
   const previous=queue;let release;queue=new Promise(resolve=>release=resolve);
   await previous;try{return await original(work);}finally{release();}
  };
  await Promise.all([migrateCashflowDatabase(db),migrateCashflowDatabase(db)]);
  expect(sqlite.query("SELECT name FROM items WHERE id='read'").get().name).toBe("Read");
  expect(sqlite.query("PRAGMA user_version").get().user_version).toBe(27);
  expect(sqlite.query("PRAGMA integrity_check").get().integrity_check).toBe("ok");
 }finally{sqlite.close();}
});
