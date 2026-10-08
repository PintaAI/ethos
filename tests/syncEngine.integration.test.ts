// @ts-nocheck -- Bun SQLite with mocked external transport/native image IO.
import { describe, expect, mock, test } from "bun:test";
import { createSyncDatabase } from "./helpers/syncDatabase";

class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
let transport: (method: string, path: string, body?: any, init?: any) => Promise<any>;
mock.module("../src/lib/api/client", () => ({
  ApiError,
  apiGet: (path, init) => transport("GET", path, undefined, init),
  apiPost: (path, body, init) => transport("POST", path, body, init),
  apiPatch: (path, body, init) => transport("PATCH", path, body, init),
  apiPut: (path, body, init) => transport("PUT", path, body, init),
  apiDelete: (path, init) => transport("DELETE", path, undefined, init),
  apiUploadFile: (path, body, init) => transport("UPLOAD", path, body, init),
}));
mock.module("../src/lib/walletImages", () => ({
  isOwnedWalletImage: () => false, walletImageUploadMetadata: () => null, deleteOwnedWalletImage: () => undefined,
}));
const { syncNow, waitForSyncIdleAsync } = await import("../src/lib/sync/syncEngine");
const stamp = "2026-10-02T10:00:00.000Z";

function entry(id = "remote-entry", name = "First") {
  return { id, name, nominal: 100, originalNominal: 100, originalCurrency: "IDR", exchangeRateToIdr: 1,
    exchangeRateAt: stamp, categoryId: null, date: "2026-10-02", io: "Expenses", createdAt: stamp, updatedAt: stamp, deletedAt: null };
}

async function fixture() {
  const value = await createSyncDatabase();
  value.sqlite.query("INSERT INTO managements (id, remote_id, name, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'synced')").run("wallet", "remote-wallet", "Wallet", stamp, stamp);
  return value;
}

function defaultTransport(entries: () => any[] = () => []) {
  return async (method, path, body) => {
    if (path === "/sync/capabilities") return { lifeFlow: 1, metadata: 0 };
    if (path === "/managements" && method === "GET") return [{ id: "remote-wallet", name: "Wallet", createdAt: stamp, updatedAt: stamp }];
    if (path === "/lifeflow/sync") return { entities: body.entities };
    if (path.startsWith("/entries/sync") && method === "GET") return { entries: entries(), hasMore: false, nextCursor: "cursor" };
    if (method === "GET") return [];
    throw new Error(`Unexpected transport ${method} ${path}`);
  };
}

describe("sync engine with concurrent user changes", () => {
  test("Cashflow refresh counts stay independent of LifeFlow traffic and no-op replay", async () => {
    const { db, sqlite } = await fixture();
    try {
      transport = defaultTransport(() => [entry()]);
      const first = await syncNow(db);
      expect(first.errors).toBe(0);
      expect(first.cashflowChanged).toBe(1);
      expect(first.lifeFlowChanged).toBe(0);
      expect(first.pushed).toBeGreaterThan(0);
      sqlite.exec("CREATE TABLE item_write_audit (id TEXT); CREATE TRIGGER audit_item_writes AFTER UPDATE ON items BEGIN INSERT INTO item_write_audit VALUES (NEW.id); END;");
      const second = await syncNow(db);
      expect(second.cashflowChanged).toBe(0);
      expect(second.lifeFlowChanged).toBe(0);
      expect(sqlite.query("SELECT count(*) AS count FROM item_write_audit").get().count).toBe(0);
      expect(sqlite.query("SELECT name FROM entries").get().name).toBe("First");
    } finally { sqlite.close(); }
  });

  test("create then edit during upload keeps one remote row and sends a distinct retry identity", async () => {
    const { db, sqlite } = await fixture();
    try {
      sqlite.query("INSERT INTO entries (id, name, nominal, io, date, management_id, created_at, updated_at, sync_status) VALUES ('local-entry', 'First', 100, 'Expenses', '2026-10-02', 'wallet', ?, ?, 'pending')").run(stamp, stamp);
      let stored = null;
      const receipts = new Map();
      const ids: string[] = [];
      const fallback = defaultTransport(() => stored ? [stored] : []);
      transport = async (method, path, body) => {
        if (path === "/entries/sync" && method === "POST") {
          const mutation = body.mutations[0];
          ids.push(mutation.mutationId);
          if (!receipts.has(mutation.mutationId)) {
            stored = { ...entry(mutation.clientId ?? mutation.entryId, mutation.data.name), updatedAt: "2026-10-02T11:00:00.000Z" };
            receipts.set(mutation.mutationId, stored);
          }
          if (ids.length === 1) sqlite.exec("UPDATE entries SET name = 'Second' WHERE id = 'local-entry'");
          return { results: [{ mutationId: mutation.mutationId, ok: true, entry: receipts.get(mutation.mutationId) }] };
        }
        return fallback(method, path, body);
      };
      const first = await syncNow(db);
      expect(first.errors).toBe(0);
      expect(sqlite.query("SELECT name, remote_id, sync_status FROM entries").get()).toEqual({ name: "Second", remote_id: "local-entry", sync_status: "updated" });
      await syncNow(db);
      expect(ids[0]).not.toBe(ids[1]);
      expect(stored.name).toBe("Second");
      expect(sqlite.query("SELECT count(*) AS count FROM entries").get().count).toBe(1);
      expect(sqlite.query("SELECT sync_status FROM entries").get().sync_status).toBe("synced");
    } finally { sqlite.close(); }
  });

  test("cancellation waits for the in-flight LifeFlow request before reporting idle", async () => {
    const { db, sqlite } = await fixture();
    try {
      let started!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => { started = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const fallback = defaultTransport();
      transport = async (method, path, body) => {
        if (path === "/lifeflow/sync") { started(); await gate; }
        return fallback(method, path, body);
      };
      const controller = new AbortController();
      const running = syncNow(db, { signal: controller.signal });
      await entered;
      controller.abort(new Error("Stopped scope"));
      let idle = false;
      const stopping = waitForSyncIdleAsync(db).then(() => { idle = true; });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(idle).toBe(false);
      release();
      await expect(running).rejects.toThrow("Stopped scope");
      await stopping;
      expect(idle).toBe(true);
    } finally { sqlite.close(); }
  });

  test("metadata requests are bounded across wallets while keeping one wallet's lists concurrent", async () => {
    const { db, sqlite } = await fixture();
    try {
      for (let index = 0; index < 5; index++) {
        sqlite.query("INSERT INTO managements (id, remote_id, name, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'synced')").run(`wallet-${index}`, `remote-wallet-${index}`, `Wallet ${index}`, stamp, stamp);
      }
      const fallback = defaultTransport();
      let active = 0;
      let maximum = 0;
      let requests = 0;
      transport = async (method, path, body) => {
        if (method === "GET" && !path.startsWith("/sync/") && !path.startsWith("/managements") && !path.startsWith("/entries")) {
          active += 1;
          requests += 1;
          maximum = Math.max(maximum, active);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          active -= 1;
        }
        return fallback(method, path, body);
      };
      await syncNow(db);
      expect(maximum).toBe(3);
      expect(active).toBe(0);
      expect(requests).toBe(24);
    } finally { sqlite.close(); }
  });
});

test("unchanged manifests skip all four lists; a revision fetches only its area and applies same-timestamp metadata", async () => {
  const {db,sqlite}=await fixture();
  try {
    const calls=[]; let revision="0", color="#123456";
    const fallback=defaultTransport();
    transport=async(method,path,body)=>{
      if(path==="/sync/capabilities") return {lifeFlow:1,metadata:1,accountId:"test-user"};
      if(path.startsWith("/sync/manifest")) return {managementId:"remote-wallet", categories:revision,quickFills:"0",budgets:"0",recurring:"0"};
      if(method==="GET" && ["/categories?","/quick-fills?","/budgets/overall?","/recurring?"].some((prefix)=>path.startsWith(prefix))) {
        calls.push(path);
        return path.startsWith("/categories?") ? [{id:"category",name:"Food",color,createdAt:stamp,updatedAt:stamp}] : [];
      }
      return fallback(method,path,body);
    };
    expect((await syncNow(db,{accountId:"test-user"})).errors).toBe(0);
    expect(calls).toHaveLength(4); calls.length=0;
    expect((await syncNow(db,{accountId:"test-user"})).errors).toBe(0);
    expect(calls).toHaveLength(0);
    revision="1";color="#654321";
    expect((await syncNow(db,{accountId:"test-user"})).errors).toBe(0);
    expect(calls).toHaveLength(1);
    expect(sqlite.query("SELECT color FROM categories").get().color).toBe(color);
    // An old bundle/direct SQLite writer invalidates the relevant cache token.
    sqlite.exec("UPDATE categories SET color='#abcdef'");
    expect(sqlite.query("SELECT count(*) count FROM sync_metadata_versions WHERE area='categories'").get().count).toBe(0);
  } finally {sqlite.close();}
});

test("a different server account fails before any local push",async()=>{
  const {db,sqlite}=await fixture();
  try {let calls=0; transport=async(_method,path)=>{calls++; expect(path).toBe("/sync/capabilities"); return {lifeFlow:2,metadata:1,accountId:"different"};};
    await expect(syncNow(db,{accountId:"current"})).rejects.toThrow("account changed"); expect(calls).toBe(1);
  } finally {sqlite.close();}
});
