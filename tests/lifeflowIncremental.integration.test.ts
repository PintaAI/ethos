// @ts-nocheck -- Real SQLite domain/storage; only the network transport is mocked.
import { expect, mock, test } from "bun:test";
import { createSyncDatabase } from "./helpers/syncDatabase";
let request;
mock.module("../src/lib/api/client", () => ({ apiPost: (...args) => request(...args), apiGet: (...args) => request(...args), ApiError: class ApiError extends Error { constructor(public status: number) { super(String(status)); } } }));
const { reconcileIncrementalLifeFlow: sync } = await import("../src/lib/sync/lifeflowIncremental");
const { getSyncCapabilities } = await import("../src/lib/api/sync");
const { ApiError } = await import("../src/lib/api/client");
const { bindSyncOwner } = await import("../src/lib/sync/syncStorage");
const stamp = "2026-10-02T10:00:00.000Z";
function insert(sqlite, id, kind = "habit") {
  sqlite.query("INSERT INTO items (id,kind,name,color,starts_on,recurrence_frequency,created_at,updated_at) VALUES (?,?,?,'#123456','2026-10-01','daily',?,?)").run(id,kind,id,stamp,stamp);
}
function reply(body, entities = [], revisions = [], cursor = "cursor") {
  return { results: body.mutations.map((mutation) => ({ mutationId: mutation.mutationId, ok: true, entity: mutation.entity, revision: "1" })), entities, revisions, nextCursor: cursor, hasMore: false, resetRequired: false };
}

test("10,000 clean rows upload zero mutations; exactly two edits upload two", async () => {
  const { db, sqlite } = await createSyncDatabase();
  try {
    sqlite.exec("UPDATE sync_control SET suppress=1;");
    for (let i=0;i<10000;i++) insert(sqlite, `habit-${i}`);
    sqlite.exec("UPDATE sync_control SET suppress=0;");
    const sizes=[];
    request=async (_path,body) => { sizes.push(body.mutations.length); return reply(body); };
    await sync(db);
    sqlite.exec("UPDATE items SET name='Edited' WHERE id IN ('habit-1','habit-2')");
    await sync(db); await sync(db);
    expect(sizes).toEqual([0,2,0]);
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_outbox").get().count).toBe(0);
  } finally { sqlite.close(); }
});

test("lost responses keep the persisted mutation identity across migration/restart", async () => {
  const { db,sqlite }=await createSyncDatabase();
  try {
    insert(sqlite,"habit"); let first;
    request=async (_path,body)=>{ first=body.mutations[0]; throw new Error("response lost"); };
    await expect(sync(db)).rejects.toThrow("response lost");
    const { migrateCashflowDatabase }=await import("../src/data/cashflow/schema");
    await migrateCashflowDatabase(db);
    request=async (_path,body)=>{ expect(body.mutations[0]).toEqual(first); return reply(body); };
    await sync(db);
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_outbox").get().count).toBe(0);
  } finally { sqlite.close(); }
});

test("edit and delete during upload retain newer pending changes after old ACKs", async () => {
  const { db,sqlite }=await createSyncDatabase();
  try {
    insert(sqlite,"habit"); let original;
    request=async (_path,body)=>{ original=body.mutations[0].mutationId; sqlite.exec("UPDATE items SET name='New edit' WHERE id='habit'"); return reply(body); };
    await sync(db);
    expect(sqlite.query("SELECT name FROM items WHERE id='habit'").get().name).toBe("New edit");
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_outbox").get().count).toBe(1);
    request=async (_path,body)=>{ expect(body.mutations[0].mutationId).not.toBe(original); sqlite.exec("DELETE FROM items WHERE id='habit'"); return reply(body); };
    await sync(db);
    expect(sqlite.query("SELECT count(*) count FROM items").get().count).toBe(0);
    request=async (_path,body)=>{ expect(body.mutations[0].entity.deleted).toBe(true); return reply(body); };
    await sync(db);
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_outbox").get().count).toBe(0);
  } finally { sqlite.close(); }
});

test("a child deferred by a dirty parent survives the cursor commit and applies later", async () => {
  const { db,sqlite }=await createSyncDatabase();
  try {
    insert(sqlite,"habit");
    const child={ kind:"habit_log", id:"habit|2026-10-02", updatedAt:stamp, data:{item_id:"habit", date:"2026-10-02", completed_at:stamp} };
    request=async (_path,body)=>{ sqlite.exec("UPDATE items SET name='Edited in flight' WHERE id='habit'"); return reply(body,[child],["2"]); };
    await sync(db);
    expect(sqlite.query("SELECT count(*) count FROM habit_logs").get().count).toBe(0);
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_inbox").get().count).toBeGreaterThan(0);
    request=async (_path,body)=>reply(body);
    await sync(db);
    expect(sqlite.query("SELECT count(*) count FROM habit_logs").get().count).toBe(1);
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_inbox").get().count).toBe(0);
  } finally { sqlite.close(); }
});

test("failed page apply rolls back ACK deletion, cursor, and suppression together", async () => {
  const { db,sqlite }=await createSyncDatabase();
  try {
    insert(sqlite,"habit");
    request=async (_path,body)=>reply(body,[{kind:"habit_log", id:"missing|2026-10-02",updatedAt:stamp,data:{item_id:"missing",date:"2026-10-02",completed_at:stamp}}],["2"]);
    await expect(sync(db)).rejects.toThrow("Missing parent");
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_outbox").get().count).toBe(1);
    expect(sqlite.query("SELECT count(*) count FROM sync_cursors").get().count).toBe(0);
    expect(sqlite.query("SELECT suppress FROM sync_control").get().suppress).toBe(0);
  } finally { sqlite.close(); }
});

test("missing ACK is reported and retains pending data", async () => {
  const { db,sqlite }=await createSyncDatabase();
  try { insert(sqlite,"habit"); request=async (_path,body)=>({...reply(body),results:[]});
    await expect(sync(db)).rejects.toThrow("not acknowledged");
    expect(sqlite.query("SELECT count(*) count FROM lifeflow_sync_outbox").get().count).toBe(1);
  } finally {sqlite.close();}
});

test("legacy fallback is limited to endpoint absence; account ownership is enforced", async () => {
  for (const status of [404,405]) { request=async()=>{throw new ApiError(status);}; expect(await getSyncCapabilities()).toEqual({lifeFlow:1,metadata:0}); }
  request=async()=>{throw new ApiError(500);}; await expect(getSyncCapabilities()).rejects.toThrow("500");
  const {db,sqlite}=await createSyncDatabase();
  try { await bindSyncOwner(db,"first"); await expect(bindSyncOwner(db,"second")).rejects.toThrow("another account"); }
  finally {sqlite.close();}
});

test("an epoch reset drops deferred rows from the old revision space before bootstrap",async()=>{
 const {db,sqlite}=await createSyncDatabase();
 try{
  sqlite.exec("UPDATE sync_control SET suppress=1");insert(sqlite,"habit");sqlite.exec("UPDATE sync_control SET suppress=0");
  const data=sqlite.query("SELECT * FROM items WHERE id='habit'").get();
  const {serializeLifeFlowRow}=await import("../src/lib/sync/lifeflowCollect");
  const old={kind:"item",id:"habit",updatedAt:stamp,data:{...serializeLifeFlowRow("item",data),name:"Stale old epoch"}};
  const fresh={...old,data:{...old.data,name:"Fresh new epoch"}};
  sqlite.query("INSERT INTO lifeflow_sync_inbox VALUES ('item','habit','900',?)").run(JSON.stringify(old));
  sqlite.exec("INSERT INTO lifeflow_remote_versions VALUES ('item','habit','900'); INSERT INTO sync_cursors VALUES ('lifeflow-v2','expired')");
  let calls=0;
  request=async(_path,body)=>++calls===1?{...reply(body),resetRequired:true,nextCursor:null}:reply(body,[fresh],["1"]);
  await sync(db);
  expect(sqlite.query("SELECT name FROM items WHERE id='habit'").get().name).toBe("Fresh new epoch");
  expect(sqlite.query("SELECT revision FROM lifeflow_remote_versions").get().revision).toBe("1");
 }finally{sqlite.close();}
});
