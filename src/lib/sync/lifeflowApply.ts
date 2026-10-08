import type { SQLiteDatabase } from "expo-sqlite";
import type { LifeFlowKind, LifeFlowSyncEntity } from "@/lib/api/lifeflow";

export const lifeFlowTables: { kind: LifeFlowKind; table: string; id: (row: Record<string, unknown>) => string }[] = [
  { kind: "item", table: "items", id: (row) => String(row.id) },
  { kind: "habit_log", table: "habit_logs", id: (row) => `${row.item_id}|${row.date}` },
  { kind: "item_exception", table: "item_exceptions", id: (row) => `${row.item_id}|${row.original_date}` },
];

export const lifeFlowColumns: Record<LifeFlowKind, string[]> = {
  item: ["id", "kind", "name", "color", "starts_on", "start_time", "end_time", "notify_start", "notify_end", "break_durations_json", "recurrence_frequency", "recurrence_interval", "recurrence_weekdays_json", "recurrence_ends_on", "system_type", "created_at"],
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

async function existingRow(db: SQLiteDatabase, entity: LifeFlowSyncEntity) {
  const parts = identity(entity.kind, entity.id);
  if (entity.kind === "item") return db.getFirstAsync<Record<string, unknown>>("SELECT * FROM items WHERE id = ?", parts[0]);
  const secondColumn = entity.kind === "habit_log" ? "date" : "original_date";
  return db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${definition(entity.kind).table} WHERE item_id = ? AND ${secondColumn} = ?`,
    ...parts,
  );
}

async function deleteEntity(db: SQLiteDatabase, entity: LifeFlowSyncEntity) {
  const parts = identity(entity.kind, entity.id);
  if (entity.kind === "item") return (await db.runAsync("DELETE FROM items WHERE id = ?", parts[0])).changes;
  else {
    const secondColumn = entity.kind === "habit_log" ? "date" : "original_date";
    return (await db.runAsync(`DELETE FROM ${definition(entity.kind).table} WHERE item_id = ? AND ${secondColumn} = ?`, ...parts)).changes;
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

export async function applyLifeFlowEntity(db: SQLiteDatabase, entity: LifeFlowSyncEntity, authoritative = false): Promise<number> {
  const existing = await existingRow(db, entity);
  const tombstone = await db.getFirstAsync<{ updated_at: string }>(
    "SELECT updated_at FROM lifeflow_tombstones WHERE kind = ? AND entity_id = ?",
    entity.kind, entity.id,
  );
  const serverTime = Date.parse(entity.updatedAt);
  if (!authoritative && existing && Date.parse(String(existing.updated_at)) > serverTime) return 0;
  if (!authoritative && tombstone && (Date.parse(tombstone.updated_at) > serverTime || (!entity.deleted && Date.parse(tombstone.updated_at) === serverTime))) return 0;
  if (entity.deleted) {
    const changed = await deleteEntity(db, entity);
    await db.runAsync("DELETE FROM lifeflow_tombstones WHERE kind = ? AND entity_id = ?", entity.kind, entity.id);
    return changed;
  }
  if (!entity.data) return 0;
  const data = { ...entity.data };
  if (entity.kind === "item") {
    data.notify_start = data.notify_start === false ? 0 : Number(data.notify_start ?? 1);
    data.notify_end = data.notify_end === false ? 0 : Number(data.notify_end ?? 1);
  }
  if (entity.kind === "item_exception") {
    data.cancelled = data.cancelled ? 1 : 0;
    const replacement = data.replacement as Record<string, unknown> | null;
    data.replacement_json = replacement == null ? null : JSON.stringify({
      kind: "event",
      name: replacement.name,
      color: replacement.color,
      startTime: replacement.start_time,
      endTime: replacement.end_time,
      notifyStart: replacement.notify_start !== false && replacement.notify_start !== 0,
      notifyEnd: replacement.notify_end !== false && replacement.notify_end !== 0,
      breakDurations: JSON.parse(String(replacement.break_durations_json)),
    });
  }
  const columns = lifeFlowColumns[entity.kind];
  // Equal-version replay must not fire the local update triggers. Normalize
  // server booleans/exception JSON before checking the persisted payload.
  if (existing && existing.updated_at === entity.updatedAt && columns.every((column) => existing[column] === data[column])) return 0;
  await assertParent(db, entity);
  const keyColumns = entity.kind === "item" ? ["id"] : entity.kind === "habit_log" ? ["item_id", "date"] : ["item_id", "original_date"];
  const allColumns = [...columns, "updated_at"];
  const mutable = allColumns.filter((column) => !keyColumns.includes(column));
  const result = await db.runAsync(
    `INSERT INTO ${definition(entity.kind).table} (${allColumns.join(", ")}) VALUES (${allColumns.map(() => "?").join(", ")})
     ON CONFLICT(${keyColumns.join(", ")}) DO UPDATE SET ${mutable.map((column) => `${column} = excluded.${column}`).join(", ")}`,
    ...columns.map((column) => data[column] as string | number | null), entity.updatedAt,
  );
  await db.runAsync("DELETE FROM lifeflow_tombstones WHERE kind = ? AND entity_id = ?", entity.kind, entity.id);
  return result.changes;
}
