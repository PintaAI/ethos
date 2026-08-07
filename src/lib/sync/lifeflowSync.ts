import type { SQLiteDatabase } from "expo-sqlite";
import { syncLifeFlow, type LifeFlowKind, type LifeFlowSyncEntity } from "@/lib/api/lifeflow";
import { orderLifeFlowSnapshot } from "./lifeflowOrder";

const tables: { kind: LifeFlowKind; table: string; id: (row: Record<string, unknown>) => string }[] = [
  { kind: "habit", table: "habits", id: (row) => String(row.id) },
  { kind: "habit_log", table: "habit_logs", id: (row) => `${row.habit_id}|${row.date}` },
  { kind: "day_preset", table: "day_presets", id: (row) => String(row.id) },
  { kind: "day_preset_block", table: "day_preset_blocks", id: (row) => String(row.id) },
  { kind: "day_preset_schedule", table: "day_preset_schedules", id: (row) => String(row.id) },
  { kind: "time_box", table: "time_boxes", id: (row) => String(row.id) },
];

export async function collectLifeFlowEntities(db: SQLiteDatabase, managementId: string): Promise<LifeFlowSyncEntity[]> {
  const entities: LifeFlowSyncEntity[] = [];
  for (const definition of tables) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${definition.table} WHERE management_id = ?`,
      managementId,
    );
    for (const row of rows) {
      const { updated_at, management_id: _managementId, ...data } = row;
      entities.push({
        kind: definition.kind,
        id: definition.id(row),
        updatedAt: String(updated_at),
        data,
      });
    }
  }
  const tombstones = await db.getAllAsync<{ kind: LifeFlowKind; entity_id: string; updated_at: string }>(
    "SELECT kind, entity_id, updated_at FROM lifeflow_tombstones WHERE management_id = ?",
    managementId,
  );
  entities.push(...tombstones.map((row) => ({
    kind: row.kind,
    id: row.entity_id,
    updatedAt: row.updated_at,
    deleted: true,
  })));
  return entities;
}

function values(data: Record<string, unknown>, columns: string[]) {
  return columns.map((column) => data[column] as string | number | null);
}

async function applyEntity(db: SQLiteDatabase, managementId: string, entity: LifeFlowSyncEntity) {
  const existingUpdatedAt = entity.kind === "habit_log"
    ? await db.getFirstAsync<{ updated_at: string }>(
        "SELECT updated_at FROM habit_logs WHERE management_id = ? AND habit_id = ? AND date = ?",
        managementId,
        ...entity.id.split("|", 2),
      )
    : await db.getFirstAsync<{ updated_at: string }>(
        `SELECT updated_at FROM ${tables.find((item) => item.kind === entity.kind)!.table} WHERE management_id = ? AND id = ?`,
        managementId,
        entity.id,
      );
  if (existingUpdatedAt && new Date(existingUpdatedAt.updated_at).getTime() > new Date(entity.updatedAt).getTime()) return;

  if (entity.deleted) {
    if (entity.kind === "habit_log") {
      await db.runAsync("DELETE FROM habit_logs WHERE management_id = ? AND habit_id = ? AND date = ?", managementId, ...entity.id.split("|", 2));
    } else {
      await db.runAsync(`DELETE FROM ${tables.find((item) => item.kind === entity.kind)!.table} WHERE management_id = ? AND id = ?`, managementId, entity.id);
    }
    await db.runAsync("DELETE FROM lifeflow_tombstones WHERE management_id = ? AND kind = ? AND entity_id = ?", managementId, entity.kind, entity.id);
    return;
  }
  if (!entity.data) return;
  const specs: Record<LifeFlowKind, string[]> = {
    habit: ["id", "name", "color", "created_at", "weekdays_json", "preferred_duration", "system_type"],
    habit_log: ["habit_id", "date", "completed_at"],
    time_box: ["id", "date", "title", "start_time", "end_time", "completed", "created_at", "color", "preset_schedule_id", "preset_block_id", "break_durations_json", "dismissed", "habit_id"],
    day_preset: ["id", "name", "created_at"],
    day_preset_block: ["id", "preset_id", "title", "start_time", "end_time", "color", "sort_order", "break_durations_json"],
    day_preset_schedule: ["id", "preset_id", "start_date", "frequency", "weekdays_json", "active", "created_at"],
  };
  const columns = specs[entity.kind];
  const allColumns = [...columns, "updated_at", "management_id"];
  const conflictColumns = entity.kind === "habit_log" ? ["habit_id", "date"] : ["id"];
  const mutableColumns = allColumns.filter((column) => !conflictColumns.includes(column));
  await db.runAsync(
    `INSERT INTO ${tables.find((item) => item.kind === entity.kind)!.table}
     (${allColumns.join(", ")}) VALUES (${allColumns.map(() => "?").join(", ")})
     ON CONFLICT(${conflictColumns.join(", ")}) DO UPDATE SET
       ${mutableColumns.map((column) => `${column} = excluded.${column}`).join(", ")}`,
    ...values(entity.data, columns),
    entity.updatedAt,
    managementId,
  );
  await db.runAsync("DELETE FROM lifeflow_tombstones WHERE management_id = ? AND kind = ? AND entity_id = ?", managementId, entity.kind, entity.id);
}

export async function reconcileLifeFlow(
  db: SQLiteDatabase,
  localManagementId: string,
  managementId: string,
  signal?: AbortSignal,
): Promise<{ pushed: number; pulled: number }> {
  const local = await collectLifeFlowEntities(db, localManagementId);
  const response = await syncLifeFlow(managementId, local, signal);
  const ordered = orderLifeFlowSnapshot(response.entities);
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const entity of ordered) await applyEntity(txn, localManagementId, entity);
  });
  return { pushed: local.length, pulled: response.entities.length };
}
