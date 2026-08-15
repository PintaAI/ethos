import type { SQLiteDatabase } from "expo-sqlite";
import type { LifeFlowKind, LifeFlowSyncEntity } from "@/lib/api/lifeflow";

export const lifeFlowTables: { kind: LifeFlowKind; table: string; id: (row: Record<string, unknown>) => string }[] = [
  { kind: "item", table: "items", id: (row) => String(row.id) },
  { kind: "habit_log", table: "habit_logs", id: (row) => `${row.item_id}|${row.date}` },
  { kind: "item_exception", table: "item_exceptions", id: (row) => `${row.item_id}|${row.original_date}` },
];

const specs: Record<LifeFlowKind, string[]> = {
  item: ["id", "kind", "name", "color", "starts_on", "start_time", "end_time", "break_durations_json", "recurrence_frequency", "recurrence_interval", "recurrence_weekdays_json", "recurrence_ends_on", "system_type", "created_at"],
  habit_log: ["item_id", "date", "completed_at"],
  item_exception: ["item_id", "original_date", "replacement_date", "cancelled", "replacement_json", "created_at"],
};

function identity(kind: LifeFlowKind, id: string) {
  if (kind === "item") return [id];
  const separator = id.lastIndexOf("|");
  if (separator < 1) throw new Error(`Invalid ${kind} identity.`);
  return [id.slice(0, separator), id.slice(separator + 1)];
}

function definition(kind: LifeFlowKind) {
  return lifeFlowTables.find((item) => item.kind === kind)!;
}

async function existingUpdatedAt(db: SQLiteDatabase, entity: LifeFlowSyncEntity) {
  const parts = identity(entity.kind, entity.id);
  if (entity.kind === "item") return db.getFirstAsync<{ updated_at: string }>("SELECT updated_at FROM items WHERE id = ?", parts[0]);
  const secondColumn = entity.kind === "habit_log" ? "date" : "original_date";
  return db.getFirstAsync<{ updated_at: string }>(
    `SELECT updated_at FROM ${definition(entity.kind).table} WHERE item_id = ? AND ${secondColumn} = ?`,
    ...parts,
  );
}

async function deleteEntity(db: SQLiteDatabase, entity: LifeFlowSyncEntity) {
  const parts = identity(entity.kind, entity.id);
  if (entity.kind === "item") await db.runAsync("DELETE FROM items WHERE id = ?", parts[0]);
  else {
    const secondColumn = entity.kind === "habit_log" ? "date" : "original_date";
    await db.runAsync(`DELETE FROM ${definition(entity.kind).table} WHERE item_id = ? AND ${secondColumn} = ?`, ...parts);
  }
}

async function assertParent(db: SQLiteDatabase, entity: LifeFlowSyncEntity) {
  if (entity.kind === "item") return;
  const [itemId] = identity(entity.kind, entity.id);
  const parent = await db.getFirstAsync<{ kind: string; recurrence_frequency: string | null }>(
    "SELECT kind, recurrence_frequency FROM items WHERE id = ?", itemId,
  );
  if (!parent) throw new Error(`Missing parent Item for ${entity.kind}.`);
  if (entity.kind === "habit_log" && parent.kind !== "habit") throw new Error("Habit logs require a habit Item parent.");
  if (entity.kind === "item_exception" && (parent.kind !== "event" || parent.recurrence_frequency === null)) {
    throw new Error("Item exceptions require a recurring event parent.");
  }
}

export async function applyLifeFlowEntity(db: SQLiteDatabase, entity: LifeFlowSyncEntity) {
  const existing = await existingUpdatedAt(db, entity);
  if (existing && existing.updated_at > entity.updatedAt) return;
  if (entity.deleted) {
    await deleteEntity(db, entity);
    await db.runAsync("DELETE FROM lifeflow_tombstones WHERE kind = ? AND entity_id = ?", entity.kind, entity.id);
    return;
  }
  if (!entity.data) return;
  await assertParent(db, entity);
  const data = { ...entity.data };
  if (entity.kind === "item_exception") {
    data.cancelled = data.cancelled ? 1 : 0;
    const replacement = data.replacement as Record<string, unknown> | null;
    data.replacement_json = replacement == null ? null : JSON.stringify({
      kind: "event",
      name: replacement.name,
      color: replacement.color,
      startTime: replacement.start_time,
      endTime: replacement.end_time,
      breakDurations: JSON.parse(String(replacement.break_durations_json)),
    });
  }
  const columns = specs[entity.kind];
  const keyColumns = entity.kind === "item" ? ["id"] : entity.kind === "habit_log" ? ["item_id", "date"] : ["item_id", "original_date"];
  const allColumns = [...columns, "updated_at"];
  const mutable = allColumns.filter((column) => !keyColumns.includes(column));
  await db.runAsync(
    `INSERT INTO ${definition(entity.kind).table} (${allColumns.join(", ")}) VALUES (${allColumns.map(() => "?").join(", ")})
     ON CONFLICT(${keyColumns.join(", ")}) DO UPDATE SET ${mutable.map((column) => `${column} = excluded.${column}`).join(", ")}`,
    ...columns.map((column) => data[column] as string | number | null), entity.updatedAt,
  );
  await db.runAsync("DELETE FROM lifeflow_tombstones WHERE kind = ? AND entity_id = ?", entity.kind, entity.id);
}
