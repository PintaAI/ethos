import type { SQLiteDatabase } from "expo-sqlite";

const ALLOWED_TABLES = new Set([
  "managements",
  "entries",
  "categories",
  "quick_fills",
  "overall_budgets",
  "recurring_entries",
  "management_members",
]);

function assertTable(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`syncStatus: unsupported table '${table}'`);
  }
}

export type DirtyRow = Record<string, unknown>;

function snapshotPredicate(snapshot: object) {
  const entries = Object.entries(snapshot);
  if (entries.length === 0 || entries.some(([column]) => !/^[a-z_]+$/.test(column))) {
    throw new Error("syncStatus: invalid row snapshot");
  }
  return {
    sql: entries.map(([column]) => `${column} IS ?`).join(" AND "),
    values: entries.map(([, value]) => value as string | number | null),
  };
}

export function listDirty(db: SQLiteDatabase, table: string): Promise<DirtyRow[]> {
  assertTable(table);
  return db.getAllAsync<DirtyRow>(
    `SELECT * FROM ${table} WHERE sync_status IN ('pending', 'updated', 'deleted')`,
  );
}

export async function markSynced(
  db: SQLiteDatabase,
  table: string,
  localId: string,
  remoteId: string,
  serverUpdatedAt: string | null | undefined,
  sent: object,
): Promise<number> {
  assertTable(table);
  const stamp = serverUpdatedAt ?? new Date().toISOString();
  const match = snapshotPredicate(sent);
  // One atomic statement: acknowledge only the sent payload, including edits
  // sharing its timestamp. A successful create must still attach its remote ID
  // to a later edit/delete so that the next run updates/deletes that same row.
  const result = await db.runAsync(
    `UPDATE ${table} SET
       sync_status = CASE WHEN ${match.sql} THEN 'synced'
         WHEN sync_status = 'pending' THEN 'updated' ELSE sync_status END,
       updated_at = CASE WHEN ${match.sql} THEN ? ELSE updated_at END,
       remote_id = ?, last_synced_at = ?
     WHERE id = ? AND (remote_id IS NULL OR remote_id = ?)`,
    ...match.values,
    ...match.values,
    stamp,
    remoteId,
    stamp,
    localId,
    remoteId,
  );
  return result.changes;
}

export async function markDeleted(db: SQLiteDatabase, table: string, localId: string): Promise<void> {
  assertTable(table);
  await db.runAsync(
    `UPDATE ${table} SET sync_status = 'deleted', updated_at = ? WHERE id = ?`,
    new Date().toISOString(),
    localId,
  );
}

export async function getLastPulledAt(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_preferences WHERE key = 'last_pulled_at'`,
  );
  return row?.value ?? null;
}

export async function setLastPulledAt(db: SQLiteDatabase, iso: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_preferences (key, value) VALUES ('last_pulled_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    iso,
  );
}

function entryCursorKey(remoteManagementId: string, suffix: "cursor" | "bootstrapped") {
  return `entry_sync_v1:${remoteManagementId}:${suffix}`;
}

export async function getEntrySyncCursor(db: SQLiteDatabase, remoteManagementId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_preferences WHERE key = ?", entryCursorKey(remoteManagementId, "cursor"));
  return row?.value ?? null;
}

export async function isEntrySyncBootstrapped(db: SQLiteDatabase, remoteManagementId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_preferences WHERE key = ?", entryCursorKey(remoteManagementId, "bootstrapped"));
  return row?.value === "1";
}

export async function resetEntrySyncCursor(db: SQLiteDatabase, remoteManagementId: string): Promise<void> {
  await db.runAsync("DELETE FROM app_preferences WHERE key IN (?, ?)", entryCursorKey(remoteManagementId, "cursor"), entryCursorKey(remoteManagementId, "bootstrapped"));
}

export async function setEntrySyncCursor(db: SQLiteDatabase, remoteManagementId: string, cursor: string, bootstrapped = false): Promise<void> {
  await db.runAsync(
    "INSERT INTO app_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    entryCursorKey(remoteManagementId, bootstrapped ? "bootstrapped" : "cursor"), bootstrapped ? "1" : cursor,
  );
}

type SQLiteBindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

export type UpsertFields = Record<string, SQLiteBindValue>;

export async function upsertByRemoteId(
  db: SQLiteDatabase,
  table: string,
  remoteId: string,
  fields: UpsertFields,
  authoritative = false,
): Promise<number> {
  assertTable(table);
  if (!remoteId) throw new Error("upsertByRemoteId: remote_id is required");

  const columns = Object.keys(fields);

  let changes = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<Record<string, SQLiteBindValue> & { id: string; sync_status: string; updated_at: string }>(
      `SELECT * FROM ${table} WHERE remote_id = ? LIMIT 1`,
      remoteId,
    );

    if (existing) {
      if (columns.length === 0) return;
      // Recheck inside the write transaction. Locally dirty state is an overlay
      // until acknowledged, even if the server/device clocks disagree.
      if (existing.sync_status !== "synced") return;
      if (!authoritative && typeof fields.updated_at === "string" && Date.parse(fields.updated_at) <= Date.parse(existing.updated_at)) return;
      if (columns.filter((column) => column !== "last_synced_at" && (!authoritative || column !== "updated_at")).every((column) => fields[column] === existing[column])) return;
      const setClause = columns.map((c) => `${c} = ?`).join(", ");
      const values = columns.map((c) => fields[c]);
      const result = await txn.runAsync(
        `UPDATE ${table} SET ${setClause}, sync_status = 'synced', remote_id = ? WHERE id = ?`,
        ...values,
        remoteId,
        existing.id,
      );
      changes += result.changes;
      return;
    }

    const allColumns = [...columns, "remote_id"];
    const placeholders = allColumns.map(() => "?").join(", ");
    const values = allColumns.map((c) => (c === "remote_id" ? remoteId : fields[c]));
    const result = await txn.runAsync(
      `INSERT INTO ${table} (${allColumns.join(", ")}, sync_status) VALUES (${placeholders}, 'synced')`,
      ...values,
    );
    changes += result.changes;
  });
  return changes;
}

export async function hardDeleteByRemoteId(db: SQLiteDatabase, table: string, remoteId: string): Promise<number> {
  assertTable(table);
  const result = await db.runAsync(`DELETE FROM ${table} WHERE remote_id = ? AND sync_status = 'synced'`, remoteId);
  return result.changes;
}

export async function hardDeleteById(db: SQLiteDatabase, table: string, localId: string, sent: object): Promise<number> {
  assertTable(table);
  const match = snapshotPredicate(sent);
  const result = await db.runAsync(`DELETE FROM ${table} WHERE id = ? AND sync_status = 'deleted' AND ${match.sql}`, localId, ...match.values);
  return result.changes;
}
