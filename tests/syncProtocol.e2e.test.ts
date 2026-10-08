// @ts-nocheck -- Opt-in: isolated server fixture; real SQLite and PostgreSQL.
import { expect,mock,test } from "bun:test";
import { createSyncDatabase } from "./helpers/syncDatabase";
const enabled=process.env.ETHOS_SYNC_E2E==="1";
const url=enabled?(await Bun.file("/tmp/ethos-sync-e2e-url.json").json()).url:"";
let loseResponse=false; const identities=[];
async function post(path,body){const response=await fetch(url+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
mock.module("../src/lib/api/client",()=>({apiGet:async()=>{throw new Error("Unexpected GET");},ApiError:class ApiError extends Error {},apiPost:async(path,body)=>{identities.push(body.mutations.map(m=>m.mutationId));const data=await post(path,body);if(loseResponse){loseResponse=false;throw new Error("response lost after commit");}return data;}}));
const {reconcileIncrementalLifeFlow:sync}=await import("../src/lib/sync/lifeflowIncremental");
const stamp="2026-10-02T10:00:00.000Z";
(enabled?test:test.skip)("two mobile clients converge through actual server receipts, revisions, old timestamps, and deletes",async()=>{
 const first=await createSyncDatabase(),second=await createSyncDatabase();
 try{
  first.sqlite.query("INSERT INTO items (id,kind,name,color,starts_on,recurrence_frequency,created_at,updated_at) VALUES ('read','habit','Read','#123456','2026-10-01','daily',?,?)").run(stamp,stamp);
  loseResponse=true; await expect(sync(first.db)).rejects.toThrow("response lost after commit");
  await sync(first.db);expect(identities[0]).toEqual(identities[1]);
  await sync(second.db);expect(second.sqlite.query("SELECT name FROM items WHERE id='read'").get().name).toBe("Read");
  // A clock behind the server must not make a locally based edit disappear.
  first.sqlite.exec("UPDATE items SET name='Read books',updated_at='2020-01-01T00:00:00.000Z' WHERE id='read'");
  await sync(first.db);await sync(second.db);
  expect(second.sqlite.query("SELECT name FROM items WHERE id='read'").get().name).toBe("Read books");
  second.sqlite.query("INSERT INTO habit_logs VALUES ('read','2026-10-02',?,?)").run(stamp,stamp);
  await sync(second.db);await sync(first.db);
  expect(first.sqlite.query("SELECT count(*) count FROM habit_logs").get().count).toBe(1);
  const noOp=await sync(first.db);expect(noOp).toMatchObject({pushed:0,pulled:0,changed:0});
  first.sqlite.exec("DELETE FROM items WHERE id='read'");
  await sync(first.db);await sync(second.db);
  expect(second.sqlite.query("SELECT count(*) count FROM items").get().count).toBe(0);
  expect(second.sqlite.query("SELECT count(*) count FROM habit_logs").get().count).toBe(0);
  const remote=await fetch(url+"/dump").then(r=>r.json());expect(remote).toHaveLength(2);expect(remote.every(row=>row.deletedAt!==null)).toBe(true);
 }finally{first.sqlite.close();second.sqlite.close();await post("/cleanup",{});}
},15000);
