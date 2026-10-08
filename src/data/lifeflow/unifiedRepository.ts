import type { SQLiteDatabase } from "expo-sqlite";
import { assertValidItem, assertValidLocalDate, recurrenceAppliesOnDate } from "./itemRecurrence";
import { persistJournalEnabled } from "./journalPreference";
import { SYSTEM_ITEM_ANCHOR_DATE, SYSTEM_ITEM_ANCHOR_TIMESTAMP } from "./systemItems";
import type {
  CreateItemInput,
  Item,
  ItemException,
  OverrideOccurrenceInput,
  Recurrence,
  SystemItemType,
  UnifiedHabitLog,
  UpdateItemInput,
} from "./types";

type ItemRow = {
  id: string; kind: Item["kind"]; name: string; color: string; starts_on: string;
  start_time: string | null; end_time: string | null; break_durations_json: string;
  notify_start: number; notify_end: number;
  recurrence_frequency: Recurrence["frequency"] | null; recurrence_interval: number;
  recurrence_weekdays_json: string; recurrence_ends_on: string | null; system_type: SystemItemType | null;
  created_at: string; updated_at: string;
};

type ExceptionRow = {
  item_id: string; original_date: string; replacement_date: string | null; cancelled: number;
  replacement_json: string | null; created_at: string; updated_at: string;
};

const SYSTEM_ITEMS: Record<SystemItemType, { name: string; color: string }> = {
  app_check_in: { name: "App check-in", color: "#5B8CFF" },
  journal: { name: "Daily Journal", color: "#A855F7" },
};

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function mapItem(row: ItemRow): Item {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    color: row.color,
    startsOn: row.starts_on,
    startTime: row.start_time,
    endTime: row.end_time,
    notifyStart: row.notify_start !== 0,
    notifyEnd: row.notify_end !== 0,
    breakDurations: parseArray<number>(row.break_durations_json),
    recurrence: row.recurrence_frequency ? {
      frequency: row.recurrence_frequency,
      interval: row.recurrence_interval,
      weekdays: parseArray(row.recurrence_weekdays_json),
      endsOn: row.recurrence_ends_on,
    } : null,
    systemType: row.system_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function systemItemId(type: SystemItemType) {
  return `lifeflow-${type.replaceAll("_", "-")}`;
}

async function clearTombstone(
  db: SQLiteDatabase,
  kind: "item" | "habit_log" | "item_exception",
  entityId: string,
) {
  await db.runAsync(
    "DELETE FROM lifeflow_tombstones WHERE kind = ? AND entity_id = ?",
    kind,
    entityId,
  );
}

function systemItemIsCanonical(item: ItemRow, id: string, type: SystemItemType) {
  const appearance = SYSTEM_ITEMS[type];
  return item.id === id
    && item.kind === "habit"
    && item.name === appearance.name
    && item.color === appearance.color
    && item.starts_on === SYSTEM_ITEM_ANCHOR_DATE
    && item.start_time === null
    && item.end_time === null
    && item.break_durations_json === "[]"
    && item.recurrence_frequency === "daily"
    && item.recurrence_interval === 1
    && item.recurrence_weekdays_json === "[]"
    && item.recurrence_ends_on === null
    && item.system_type === type
    && item.created_at === SYSTEM_ITEM_ANCHOR_TIMESTAMP;
}

async function insertCanonicalSystemItem(
  db: SQLiteDatabase,
  id: string,
  type: SystemItemType,
  updatedAt: string,
) {
  await db.runAsync(
    `INSERT INTO items (id, kind, name, color, starts_on, start_time, end_time, notify_start, notify_end,
      break_durations_json, recurrence_frequency, recurrence_interval, recurrence_weekdays_json, recurrence_ends_on,
      system_type, created_at, updated_at) VALUES (?, 'habit', ?, ?, ?, NULL, NULL, 1, 1, '[]', 'daily', 1, '[]', NULL, ?, ?, ?)`,
    id,
    SYSTEM_ITEMS[type].name,
    SYSTEM_ITEMS[type].color,
    SYSTEM_ITEM_ANCHOR_DATE,
    type,
    SYSTEM_ITEM_ANCHOR_TIMESTAMP,
    updatedAt,
  );
  await clearTombstone(db, "item", id);
}

async function ensureCanonicalSystemItem(
  db: SQLiteDatabase,
  type: SystemItemType,
  createIfMissing: boolean,
) {
  const id = systemItemId(type);
  const current = await db.getFirstAsync<ItemRow>(
    "SELECT * FROM items WHERE system_type = ?",
    type,
  );
  if (!current) {
    if (createIfMissing) await insertCanonicalSystemItem(db, id, type, new Date().toISOString());
    return createIfMissing ? id : null;
  }
  if (systemItemIsCanonical(current, id, type)) {
    await clearTombstone(db, "item", id);
    return id;
  }

  await db.withExclusiveTransactionAsync(async (txn) => {
    const conflicting = await txn.getFirstAsync<{ system_type: string | null }>(
      "SELECT system_type FROM items WHERE id = ?",
      id,
    );
    if (conflicting && id !== current.id) throw new Error(`Cannot adopt canonical ${type} Item identity.`);

    if (id === current.id) {
      await txn.runAsync(
        `UPDATE items SET kind = 'habit', name = ?, color = ?, starts_on = ?, start_time = NULL, end_time = NULL,
          break_durations_json = '[]', recurrence_frequency = 'daily', recurrence_interval = 1,
          recurrence_weekdays_json = '[]', recurrence_ends_on = NULL, system_type = ?, created_at = ?
         WHERE id = ?`,
        SYSTEM_ITEMS[type].name,
        SYSTEM_ITEMS[type].color,
        SYSTEM_ITEM_ANCHOR_DATE,
        type,
        SYSTEM_ITEM_ANCHOR_TIMESTAMP,
        id,
      );
      await clearTombstone(txn, "item", id);
      return;
    }

    await txn.runAsync(
      "UPDATE items SET system_type = NULL WHERE id = ?",
      current.id,
    );
    await insertCanonicalSystemItem(txn, id, type, new Date().toISOString());
    await txn.runAsync(
      `DELETE FROM habit_logs
       WHERE item_id = ?
          AND EXISTS (
            SELECT 1 FROM habit_logs replacement
            WHERE replacement.item_id = ?
              AND replacement.date = habit_logs.date
          )`,
      current.id,
      id,
    );
    await txn.runAsync(
      "UPDATE habit_logs SET item_id = ? WHERE item_id = ?",
      id,
      current.id,
    );
    await txn.runAsync(
      `DELETE FROM lifeflow_tombstones
       WHERE kind = 'habit_log'
          AND entity_id IN (
            SELECT item_id || '|' || date FROM habit_logs
            WHERE item_id = ?
          )`,
      id,
    );
    await txn.runAsync(
      "DELETE FROM items WHERE id = ?",
      current.id,
    );
  });
  return id;
}

export async function canonicalizeSystemItemsForSync(
  db: SQLiteDatabase,
) {
  await ensureCanonicalSystemItem(db, "app_check_in", true);
  await ensureCanonicalSystemItem(db, "journal", false);
}

export async function listItems(db: SQLiteDatabase): Promise<Item[]> {
  return (await db.getAllAsync<ItemRow>("SELECT * FROM items ORDER BY created_at, id")).map(mapItem);
}

export async function listUnifiedHabitLogs(db: SQLiteDatabase, fromDate?: string): Promise<UnifiedHabitLog[]> {
  const rows = await db.getAllAsync<{ item_id: string; date: string; completed_at: string; updated_at: string }>(
    `SELECT item_id, date, completed_at, updated_at FROM habit_logs${fromDate ? " WHERE date >= ?" : ""} ORDER BY date, item_id`,
    ...(fromDate ? [fromDate] : []),
  );
  return rows.map((row) => ({ itemId: row.item_id, date: row.date, completedAt: row.completed_at, updatedAt: row.updated_at }));
}

export async function listItemExceptions(db: SQLiteDatabase): Promise<ItemException[]> {
  const rows = await db.getAllAsync<ExceptionRow>("SELECT * FROM item_exceptions ORDER BY original_date, item_id");
  return rows.map((row) => ({
    itemId: row.item_id,
    originalDate: row.original_date,
    replacementDate: row.replacement_date,
    cancelled: row.cancelled === 1,
    replacement: row.replacement_json ? JSON.parse(row.replacement_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createItem(db: SQLiteDatabase, input: CreateItemInput): Promise<Item> {
  assertValidItem(input, input.startsOn, input.recurrence);
  const now = new Date().toISOString();
  const item: Item = { ...input, id: `item-${createId()}`, systemType: null, createdAt: now, updatedAt: now };
  await insertItem(db, item);
  return item;
}

async function insertItem(db: SQLiteDatabase, item: Item) {
  await db.runAsync(
    `INSERT INTO items (id, kind, name, color, starts_on, start_time, end_time, notify_start, notify_end, break_durations_json,
      recurrence_frequency, recurrence_interval, recurrence_weekdays_json, recurrence_ends_on, system_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.kind, item.name.trim(), item.color, item.startsOn, item.startTime, item.endTime,
    item.notifyStart === false ? 0 : 1, item.notifyEnd === false ? 0 : 1,
    JSON.stringify(item.breakDurations), item.recurrence?.frequency ?? null, item.recurrence?.interval ?? 1,
    JSON.stringify(item.recurrence?.weekdays ?? []), item.recurrence?.endsOn ?? null, item.systemType, item.createdAt, item.updatedAt,
  );
}

function recurrenceKey(item: Pick<Item, "startsOn" | "recurrence">) {
  return JSON.stringify([item.startsOn, item.recurrence]);
}

export async function updateItem(db: SQLiteDatabase, id: string, input: UpdateItemInput, resetHistory = false): Promise<void> {
  const row = await db.getFirstAsync<ItemRow>("SELECT * FROM items WHERE id = ?", id);
  if (!row) throw new Error("Item not found.");
  const current = mapItem(row);
  if (current.systemType) throw new Error("System items cannot be edited.");
  const next = { ...current, ...input };
  assertValidItem(next, next.startsOn, next.recurrence);
  const recurrenceChanged = recurrenceKey(current) !== recurrenceKey(next);
  if (recurrenceChanged && !resetHistory) throw new Error("Changing recurrence requires resetHistory confirmation.");
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (recurrenceChanged) {
      await txn.runAsync("DELETE FROM habit_logs WHERE item_id = ?", id);
      await txn.runAsync("DELETE FROM item_exceptions WHERE item_id = ?", id);
    }
    await txn.runAsync(
      `UPDATE items SET name = ?, color = ?, starts_on = ?, start_time = ?, end_time = ?, notify_start = ?, notify_end = ?, break_durations_json = ?,
       recurrence_frequency = ?, recurrence_interval = ?, recurrence_weekdays_json = ?, recurrence_ends_on = ?, updated_at = ?
       WHERE id = ?`,
      next.name.trim(), next.color, next.startsOn, next.startTime, next.endTime,
      next.notifyStart === false ? 0 : 1, next.notifyEnd === false ? 0 : 1, JSON.stringify(next.breakDurations),
      next.recurrence?.frequency ?? null, next.recurrence?.interval ?? 1, JSON.stringify(next.recurrence?.weekdays ?? []),
      next.recurrence?.endsOn ?? null, new Date().toISOString(), id,
    );
  });
}

export async function deleteItem(db: SQLiteDatabase, id: string) {
  const item = await db.getFirstAsync<{ system_type: string | null }>("SELECT system_type FROM items WHERE id = ?", id);
  if (!item) return;
  if (item.system_type) throw new Error("System items cannot be deleted through normal item actions.");
  await db.runAsync("DELETE FROM items WHERE id = ?", id);
}

export async function setUnifiedHabitCompleted(db: SQLiteDatabase, itemId: string, date: string, completed: boolean, allowSystem = false) {
  const row = await db.getFirstAsync<ItemRow>("SELECT * FROM items WHERE id = ?", itemId);
  if (!row) throw new Error("Item not found.");
  const item = mapItem(row);
  if (item.kind !== "habit") throw new Error("Events cannot be completed.");
  if (item.systemType && !allowSystem) throw new Error("System habits cannot be manually completed.");
  if (!recurrenceAppliesOnDate(item, date)) throw new Error("Habit does not occur on this date.");
  if (!completed) {
    await db.runAsync("DELETE FROM habit_logs WHERE item_id = ? AND date = ?", itemId, date);
    return;
  }
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO habit_logs (item_id, date, completed_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id, date) DO UPDATE SET completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
    itemId, date, now, now,
  );
  await clearTombstone(db, "habit_log", `${itemId}|${date}`);
}

async function recurringEvent(db: SQLiteDatabase, itemId: string, originalDate: string) {
  const row = await db.getFirstAsync<ItemRow>("SELECT * FROM items WHERE id = ?", itemId);
  const item = row ? mapItem(row) : null;
  if (!item || item.kind !== "event" || !item.recurrence || !recurrenceAppliesOnDate(item, originalDate)) {
    throw new Error("Exception must reference a recurring event occurrence.");
  }
  return item;
}

export async function overrideEventOccurrence(db: SQLiteDatabase, input: OverrideOccurrenceInput) {
  assertValidItem(input.replacement);
  assertValidLocalDate(input.replacementDate, "Replacement date");
  if (input.replacement.kind !== "event") throw new Error("An event override must remain an event.");
  await recurringEvent(db, input.itemId, input.originalDate);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO item_exceptions (item_id, original_date, replacement_date, cancelled, replacement_json, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(item_id, original_date) DO UPDATE SET replacement_date = excluded.replacement_date,
       cancelled = 0, replacement_json = excluded.replacement_json, updated_at = excluded.updated_at`,
    input.itemId, input.originalDate, input.replacementDate, JSON.stringify(input.replacement), now, now,
  );
  await clearTombstone(db, "item_exception", `${input.itemId}|${input.originalDate}`);
}

export async function cancelEventOccurrence(db: SQLiteDatabase, itemId: string, originalDate: string) {
  await recurringEvent(db, itemId, originalDate);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO item_exceptions (item_id, original_date, replacement_date, cancelled, replacement_json, created_at, updated_at)
     VALUES (?, ?, NULL, 1, NULL, ?, ?)
     ON CONFLICT(item_id, original_date) DO UPDATE SET replacement_date = NULL, cancelled = 1,
       replacement_json = NULL, updated_at = excluded.updated_at`,
    itemId, originalDate, now, now,
  );
  await clearTombstone(db, "item_exception", `${itemId}|${originalDate}`);
}

export async function restoreEventOccurrence(db: SQLiteDatabase, itemId: string, originalDate: string) {
  await db.runAsync("DELETE FROM item_exceptions WHERE item_id = ? AND original_date = ?", itemId, originalDate);
}

export async function ensureSystemItem(db: SQLiteDatabase, type: SystemItemType) {
  return (await ensureCanonicalSystemItem(db, type, true))!;
}

export async function ensureAppCheckInItem(db: SQLiteDatabase, date: string) {
  const id = await ensureSystemItem(db, "app_check_in");
  if (await db.getFirstAsync("SELECT 1 FROM habit_logs WHERE item_id = ? AND date = ?", id, date)) return false;
  await setUnifiedHabitCompleted(db, id, date, true, true);
  return true;
}

export async function setJournalItemEnabled(db: SQLiteDatabase, enabled: boolean, _date: string) {
  await persistJournalEnabled(db, enabled);
  if (enabled) await ensureSystemItem(db, "journal");
  else await db.runAsync("DELETE FROM items WHERE system_type = 'journal'");
}

export async function recordUnifiedJournalActivity(db: SQLiteDatabase, date: string) {
  const row = await db.getFirstAsync<{ id: string }>("SELECT id FROM items WHERE system_type = 'journal'");
  if (!row) return false;
  const id = row.id;
  await setUnifiedHabitCompleted(db, id, date, true, true);
  return true;
}
