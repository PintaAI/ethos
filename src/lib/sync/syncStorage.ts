import type { SQLiteDatabase } from "expo-sqlite";

const entities = [
  { kind: "item", table: "items", identity: (row: string) => `${row}.id` },
  { kind: "habit_log", table: "habit_logs", identity: (row: string) => `${row}.item_id || '|' || ${row}.date` },
  { kind: "item_exception", table: "item_exceptions", identity: (row: string) => `${row}.item_id || '|' || ${row}.original_date` },
];

// Metadata has its own idempotent initializer: an older OTA can lower
// user_version without deleting these tables or losing pending mutations.
export async function initializeSyncStorage(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_control (
        id INTEGER PRIMARY KEY CHECK (id = 1), owner TEXT, suppress INTEGER NOT NULL DEFAULT 0,
        local_revision INTEGER NOT NULL DEFAULT 0, initialized INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO sync_control(id) VALUES (1);
      CREATE TABLE IF NOT EXISTS lifeflow_sync_outbox (
        kind TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL,
        updated_at TEXT NOT NULL, deleted INTEGER NOT NULL,
        mutation_id TEXT, mutation_json TEXT, PRIMARY KEY (kind, entity_id)
      );
      CREATE TABLE IF NOT EXISTS lifeflow_remote_versions (
        kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision TEXT NOT NULL,
        PRIMARY KEY (kind, entity_id)
      );
      CREATE TABLE IF NOT EXISTS sync_cursors (scope TEXT PRIMARY KEY, cursor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lifeflow_sync_inbox (
        kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision TEXT NOT NULL, entity_json TEXT NOT NULL,
        PRIMARY KEY (kind, entity_id)
      );
      CREATE TABLE IF NOT EXISTS sync_metadata_versions (
        management_id TEXT NOT NULL, area TEXT NOT NULL, token TEXT NOT NULL,
        PRIMARY KEY (management_id, area)
      );
    `);
    const control = await txn.getFirstAsync<{ initialized: number }>("SELECT initialized FROM sync_control WHERE id = 1");
    const triggers = await txn.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'lifeflow_outbox_%'");
    const recover = control?.initialized !== 1 || triggers.length !== 9;
    for (const entity of entities) {
      for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
        const row = operation === "DELETE" ? "OLD" : "NEW";
        const stamp = operation === "DELETE" ? "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : `${row}.updated_at`;
        await txn.execAsync(`
          CREATE TRIGGER IF NOT EXISTS lifeflow_outbox_${entity.kind}_${operation.toLowerCase()}
          AFTER ${operation} ON ${entity.table} WHEN (SELECT suppress FROM sync_control WHERE id = 1) = 0 BEGIN
            UPDATE sync_control SET local_revision = local_revision + 1 WHERE id = 1;
            INSERT INTO lifeflow_sync_outbox(kind, entity_id, version, updated_at, deleted)
            SELECT '${entity.kind}', ${entity.identity(row)}, local_revision, ${stamp}, ${operation === "DELETE" ? 1 : 0} FROM sync_control WHERE id = 1
            ON CONFLICT(kind, entity_id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at,
              deleted = excluded.deleted, mutation_id = NULL, mutation_json = NULL;
          END;
        `);
      }
      if (recover) {
        await txn.execAsync(`
          UPDATE sync_control SET local_revision = local_revision + 1 WHERE id = 1;
          INSERT OR IGNORE INTO lifeflow_sync_outbox(kind, entity_id, version, updated_at, deleted)
          SELECT '${entity.kind}', ${entity.identity("source")}, (SELECT local_revision FROM sync_control WHERE id = 1), updated_at, 0 FROM ${entity.table} source;
        `);
      }
    }
    for (const [table, area] of [["categories", "categories"], ["quick_fills", "quickFills"], ["overall_budgets", "budgets"], ["recurring_entries", "recurring"]]) {
      for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
        const wallets = operation === "INSERT" ? "NEW.management_id" : operation === "DELETE" ? "OLD.management_id" : "NEW.management_id, OLD.management_id";
        await txn.execAsync(`CREATE TRIGGER IF NOT EXISTS sync_metadata_${table}_${operation.toLowerCase()}
          AFTER ${operation} ON ${table} BEGIN DELETE FROM sync_metadata_versions WHERE management_id IN (${wallets}) AND area = '${area}'; END;`);
      }
    }
    if (recover) {
      await txn.execAsync(`
        UPDATE sync_control SET local_revision = local_revision + 1 WHERE id = 1;
        INSERT OR IGNORE INTO lifeflow_sync_outbox(kind, entity_id, version, updated_at, deleted)
        SELECT kind, entity_id, (SELECT local_revision FROM sync_control WHERE id = 1), updated_at, 1 FROM lifeflow_tombstones;
        DELETE FROM sync_cursors;
        DELETE FROM lifeflow_remote_versions;
        DELETE FROM lifeflow_sync_inbox;
        DELETE FROM sync_metadata_versions;
        UPDATE sync_control SET initialized = 1 WHERE id = 1;
      `);
    }
  });
}

export async function bindSyncOwner(db: SQLiteDatabase, accountId: string) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const control = await txn.getFirstAsync<{ owner: string | null }>("SELECT owner FROM sync_control WHERE id = 1");
    if (control?.owner && control.owner !== accountId) throw new Error("Sync data belongs to another account. Clear local data before switching accounts.");
    await txn.runAsync("UPDATE sync_control SET owner = ? WHERE id = 1", accountId);
  });
}
