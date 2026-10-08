import type { SQLiteDatabase } from "expo-sqlite";
import type { LifeFlowKind, LifeFlowSyncEntity } from "@/lib/api/lifeflow";
import { syncLifeFlowPage, type LifeFlowMutation, type LifeFlowPage } from "@/lib/api/sync";
import { applyLifeFlowEntity } from "./lifeflowApply";
import { serializeLifeFlowRow } from "./lifeflowCollect";
import { syncMutationId } from "./syncIdentity";

type Pending = { kind: LifeFlowKind; entity_id: string; version: number; updated_at: string; deleted: number; mutation_id: string | null; mutation_json: string | null };
type Prepared = { row: Pending; mutation: LifeFlowMutation };
const key = (entity: LifeFlowSyncEntity) => `${entity.kind}:${entity.id}`;
const rank = (entity: LifeFlowSyncEntity) => entity.kind === "item" ? entity.deleted ? 3 : 1 : entity.deleted ? 0 : 2;

async function prepareMutations(db: SQLiteDatabase): Promise<Prepared[]> {
  let prepared: Prepared[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    const rows = await txn.getAllAsync<Pending>("SELECT * FROM lifeflow_sync_outbox ORDER BY version");
    prepared = [];
    for (const row of rows) {
      if (row.mutation_json) { prepared.push({ row, mutation: JSON.parse(row.mutation_json) }); continue; }
      let current: Record<string, unknown> | null = null;
      if (row.kind === "item") current = await txn.getFirstAsync("SELECT * FROM items WHERE id = ?", row.entity_id);
      else {
        const index = row.entity_id.lastIndexOf("|"), parent = row.entity_id.slice(0, index), date = row.entity_id.slice(index + 1);
        current = row.kind === "habit_log"
          ? await txn.getFirstAsync("SELECT * FROM habit_logs WHERE item_id = ? AND date = ?", parent, date)
          : await txn.getFirstAsync("SELECT * FROM item_exceptions WHERE item_id = ? AND original_date = ?", parent, date);
      }
      const remote = await txn.getFirstAsync<{ revision: string }>("SELECT revision FROM lifeflow_remote_versions WHERE kind = ? AND entity_id = ?", row.kind, row.entity_id);
      const entity: LifeFlowSyncEntity = current
        ? { kind: row.kind, id: row.entity_id, updatedAt: String(current.updated_at), data: serializeLifeFlowRow(row.kind, current) }
        : { kind: row.kind, id: row.entity_id, updatedAt: row.updated_at, deleted: true };
      const body = { baseRevision: remote?.revision ?? "0", entity };
      const mutation: LifeFlowMutation = { mutationId: syncMutationId(row.entity_id, String(row.version), body), ...body };
      await txn.runAsync("UPDATE lifeflow_sync_outbox SET mutation_id = ?, mutation_json = ? WHERE kind = ? AND entity_id = ? AND version = ?", mutation.mutationId, JSON.stringify(mutation), row.kind, row.entity_id, row.version);
      prepared.push({ row, mutation });
    }
  });
  return prepared.sort((a, b) => rank(a.mutation.entity) - rank(b.mutation.entity));
}

async function applyPage(db: SQLiteDatabase, page: LifeFlowPage, sent: Prepared[]) {
  if (page.entities.length !== page.revisions.length || !page.nextCursor) throw new Error("Invalid incremental LifeFlow page");
  let changes = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("UPDATE sync_control SET suppress = 1 WHERE id = 1");
    const accepted: { entity: LifeFlowSyncEntity; revision: string }[] = [];
    for (const item of sent) {
      const result = page.results.find((value) => value.mutationId === item.mutation.mutationId);
      if (!result?.ok) continue;
      const removed = await txn.runAsync("DELETE FROM lifeflow_sync_outbox WHERE kind = ? AND entity_id = ? AND version = ? AND mutation_id = ?", item.row.kind, item.row.entity_id, item.row.version, item.mutation.mutationId);
      await txn.runAsync("INSERT INTO lifeflow_remote_versions VALUES (?, ?, ?) ON CONFLICT(kind, entity_id) DO UPDATE SET revision = excluded.revision WHERE CAST(excluded.revision AS INTEGER) > CAST(lifeflow_remote_versions.revision AS INTEGER)", result.entity.kind, result.entity.id, result.revision);
      if (removed.changes) accepted.push({ entity: result.entity, revision: result.revision });
    }
    const dirty = await txn.getAllAsync<{ kind: LifeFlowKind; entity_id: string }>("SELECT kind, entity_id FROM lifeflow_sync_outbox");
    const protectedKeys = new Set(dirty.map((row) => `${row.kind}:${row.entity_id}`));
    for (const row of dirty) if (row.kind !== "item") protectedKeys.add(`item:${row.entity_id.slice(0, row.entity_id.lastIndexOf("|"))}`);
    for (const { entity, revision } of [...accepted, ...page.entities.map((entity, index) => ({ entity, revision: page.revisions[index] }))]) {
      await txn.runAsync("INSERT INTO lifeflow_sync_inbox VALUES (?, ?, ?, ?) ON CONFLICT(kind, entity_id) DO UPDATE SET revision = excluded.revision, entity_json = excluded.entity_json WHERE CAST(excluded.revision AS INTEGER) >= CAST(lifeflow_sync_inbox.revision AS INTEGER)", entity.kind, entity.id, revision, JSON.stringify(entity));
    }
    // Deferred remote rows share the cursor commit. A dirty parent must not
    // cause a downloaded child to disappear after that cursor advances.
    const inbox = await txn.getAllAsync<{ revision: string; entity_json: string }>("SELECT revision, entity_json FROM lifeflow_sync_inbox");
    const incoming = inbox.map((row) => ({ revision: row.revision, entity: JSON.parse(row.entity_json) as LifeFlowSyncEntity })).sort((a, b) => rank(a.entity) - rank(b.entity));
    for (const { entity, revision } of incoming) {
      if (protectedKeys.has(key(entity))) continue;
      if (entity.kind !== "item" && protectedKeys.has(`item:${entity.id.slice(0, entity.id.lastIndexOf("|"))}`)) continue;
      const previous = await txn.getFirstAsync<{ revision: string }>("SELECT revision FROM lifeflow_remote_versions WHERE kind = ? AND entity_id = ?", entity.kind, entity.id);
      // Accepted receipts may be older than a newer delta in the same response.
      if (!previous || BigInt(previous.revision) <= BigInt(revision)) {
        changes += await applyLifeFlowEntity(txn, entity, true);
        await txn.runAsync("INSERT INTO lifeflow_remote_versions VALUES (?, ?, ?) ON CONFLICT(kind, entity_id) DO UPDATE SET revision = excluded.revision", entity.kind, entity.id, revision);
      }
      await txn.runAsync("DELETE FROM lifeflow_sync_inbox WHERE kind = ? AND entity_id = ?", entity.kind, entity.id);
    }
    await txn.runAsync("INSERT INTO sync_cursors VALUES ('lifeflow-v2', ?) ON CONFLICT(scope) DO UPDATE SET cursor = excluded.cursor", page.nextCursor);
    await txn.runAsync("UPDATE sync_control SET suppress = 0 WHERE id = 1");
  });
  return changes;
}

export async function reconcileIncrementalLifeFlow(db: SQLiteDatabase, signal?: AbortSignal) {
  const pending = await prepareMutations(db);
  let cursor = (await db.getFirstAsync<{ cursor: string }>("SELECT cursor FROM sync_cursors WHERE scope = 'lifeflow-v2'"))?.cursor ?? null;
  let changed = 0, pulled = 0, pushed = 0, offset = 0, reset = false;
  do {
    const sent = pending.slice(offset, offset + 75);
    const page = await syncLifeFlowPage(sent.map((item) => item.mutation), cursor, signal);
    if (page.resetRequired) {
      if (reset) throw new Error("LifeFlow cursor reset repeated");
      reset = true;
      await db.withExclusiveTransactionAsync(async (txn) => { await txn.runAsync("DELETE FROM sync_cursors WHERE scope = 'lifeflow-v2'"); await txn.runAsync("DELETE FROM lifeflow_remote_versions"); await txn.runAsync("DELETE FROM lifeflow_sync_inbox"); });
      cursor = null;
      continue;
    }
    changed += await applyPage(db, page, sent);
    if (sent.some((item) => !page.results.some((result) => result.ok && result.mutationId === item.mutation.mutationId))) throw new Error("LifeFlow mutation was not acknowledged; pending changes retained");
    pushed += sent.length;
    pulled += page.entities.length;
    offset += sent.length;
    cursor = page.nextCursor;
    if (!page.hasMore && offset >= pending.length) break;
  } while (true);
  return { pushed, pulled, changed };
}
