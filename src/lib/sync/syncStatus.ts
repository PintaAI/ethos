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
): Promise<void> {
  assertTable(table);
  const stamp = serverUpdatedAt ?? new Date().toISOString();
  await db.runAsync(
    `UPDATE ${table} SET sync_status = 'synced', remote_id = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`,
    remoteId,
    stamp,
    stamp,
    localId,
  );
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

type SQLiteBindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

export type UpsertFields = Record<string, SQLiteBindValue>;

export async function upsertByRemoteId(
  db: SQLiteDatabase,
  table: string,
  remoteId: string,
  fields: UpsertFields,
): Promise<void> {
  assertTable(table);
  if (!remoteId) throw new Error("upsertByRemoteId: remote_id is required");

  const columns = Object.keys(fields);

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string }>(
      `SELECT id FROM ${table} WHERE remote_id = ? LIMIT 1`,
      remoteId,
    );

    if (existing) {
      if (columns.length === 0) return;
      const setClause = columns.map((c) => `${c} = ?`).join(", ");
      const values = columns.map((c) => fields[c]);
      await txn.runAsync(
        `UPDATE ${table} SET ${setClause}, sync_status = 'synced', remote_id = ? WHERE id = ?`,
        ...values,
        remoteId,
        existing.id,
      );
      return;
    }

    const allColumns = [...columns, "remote_id"];
    const placeholders = allColumns.map(() => "?").join(", ");
    const values = allColumns.map((c) => (c === "remote_id" ? remoteId : fields[c]));
    await txn.runAsync(
      `INSERT INTO ${table} (${allColumns.join(", ")}, sync_status) VALUES (${placeholders}, 'synced')`,
      ...values,
    );
  });
}

export async function hardDeleteByRemoteId(db: SQLiteDatabase, table: string, remoteId: string): Promise<void> {
  assertTable(table);
  await db.runAsync(`DELETE FROM ${table} WHERE remote_id = ?`, remoteId);
}

export async function hardDeleteById(db: SQLiteDatabase, table: string, localId: string): Promise<void> {
  assertTable(table);
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, localId);
}