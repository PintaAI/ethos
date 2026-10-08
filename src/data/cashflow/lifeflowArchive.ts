import { SYSTEM_ITEM_ANCHOR_DATE, SYSTEM_ITEM_ANCHOR_TIMESTAMP } from "@/data/lifeflow/systemItems";
import type { SQLiteDatabase } from "expo-sqlite";
import { assertValidItem, recurrenceAppliesOnDate } from "@/data/lifeflow/itemRecurrence";
import type { Recurrence, Weekday } from "@/data/lifeflow/types";

type Row = Record<string, unknown>;
const legacyTables = ["habits", "habit_logs", "time_boxes", "day_presets", "day_preset_blocks", "day_preset_schedules", "items", "item_exceptions", "lifeflow_tombstones", "app_preferences"];

// Called inside the migration transaction, before any legacy table is removed.
export async function archiveLifeFlow(db: SQLiteDatabase, stage: number) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS lifeflow_migration_archive (
    stage INTEGER NOT NULL, source_table TEXT NOT NULL, row_json TEXT NOT NULL,
    PRIMARY KEY(stage, source_table, row_json));`);
  for (const table of legacyTables) {
    if (!await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table)) continue;
    const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
    for (const row of rows) {
      if (table === "app_preferences" && !String(row.key).includes("journal") && !String(row.key).includes("habit")) continue;
      await db.runAsync("INSERT OR IGNORE INTO lifeflow_migration_archive VALUES (?, ?, ?)", stage, table, JSON.stringify(row));
    }
  }
}

export async function hasLifeFlowArchive(db: SQLiteDatabase) {
  return Boolean(await db.getFirstAsync("SELECT 1 FROM lifeflow_migration_archive LIMIT 1"));
}

export async function readLifeFlowArchive(db: SQLiteDatabase) {
  const exists = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'lifeflow_migration_archive'");
  return exists ? db.getAllAsync<{ stage: number; source_table: string; row_json: string }>("SELECT * FROM lifeflow_migration_archive ORDER BY stage, source_table, row_json") : [];
}

export async function restorePersonalLifeFlow(db: SQLiteDatabase) {
  const archive = await readLifeFlowArchive(db);
  const rows = (table: string, stage: number) => archive.filter((row) => row.source_table === table && row.stage === stage).map((row) => JSON.parse(row.row_json) as Row);
  const items = rows("items", 24);
  const mapping = new Map<string, string>();
  const legacySystems = new Map<string, "app_check_in" | "journal">();
  for (const row of rows("app_preferences", 23)) {
    if (row.key === "atomic_habits_app_check_in_id") legacySystems.set(String(row.value), "app_check_in");
    if (row.key === "habits_daily_journal_id") legacySystems.set(String(row.value), "journal");
  }
  for (const [id, type] of legacySystems) mapping.set(id, type === "app_check_in" ? "lifeflow-app-check-in" : "lifeflow-journal");
  const converted = new Map<string, { startsOn: string; recurrence: Recurrence | null; kind: string }>();
  const add = async (source: Row) => {
    const row = source.system_type ? { ...source, kind: "habit", name: source.system_type === "app_check_in" ? "App check-in" : "Daily Journal", color: source.system_type === "app_check_in" ? "#5B8CFF" : "#A855F7", starts_on: SYSTEM_ITEM_ANCHOR_DATE, start_time: null, end_time: null, break_durations_json: "[]", recurrence_frequency: "daily", recurrence_interval: 1, recurrence_weekdays_json: "[]", recurrence_ends_on: null, created_at: SYSTEM_ITEM_ANCHOR_TIMESTAMP } : source;
    const recurrence: Recurrence | null = row.recurrence_frequency ? {
      frequency: row.recurrence_frequency as Recurrence["frequency"], interval: Number(row.recurrence_interval),
      weekdays: JSON.parse(String(row.recurrence_weekdays_json)), endsOn: row.recurrence_ends_on as string | null,
    } : null;
    const id = row.system_type === "app_check_in" ? "lifeflow-app-check-in" : row.system_type === "journal" ? "lifeflow-journal" : String(row.id);
    try {
      assertValidItem({ kind: row.kind as "habit" | "event", name: String(row.name), color: String(row.color), startTime: row.start_time as string | null, endTime: row.end_time as string | null, breakDurations: JSON.parse(String(row.break_durations_json)) }, String(row.starts_on), recurrence);
    } catch { return; } // The exact original remains available in the export.
    const columns = ["kind", "name", "color", "starts_on", "start_time", "end_time", "break_durations_json", "recurrence_frequency", "recurrence_interval", "recurrence_weekdays_json", "recurrence_ends_on", "system_type", "created_at", "updated_at"];
    await db.runAsync(`INSERT INTO items (id, ${columns.join(",")}) VALUES (?, ${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO NOTHING`, id, ...columns.map((column) => row[column] as string | number | null));
    mapping.set(String(row.id), id);
    if (!converted.has(id)) converted.set(id, { startsOn: String(row.starts_on), recurrence, kind: String(row.kind) });
  };
  // The latest deterministic source wins ordinary IDs; system definitions use
  // one canonical ID while completion history is merged below by date.
  items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || String(a.id).localeCompare(String(b.id)));
  for (const row of items) await add(row);
  const oldLogs = rows("habit_logs", 23);
  const weekdays: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  for (const row of rows("habits", 23)) {
    const dates = [String(row.created_at).slice(0, 10), ...oldLogs.filter((log) => log.habit_id === row.id).map((log) => String(log.date))].sort();
    let days: number[];
    try { days = JSON.parse(String(row.weekdays_json ?? "[0,1,2,3,4,5,6]")); } catch { continue; }
    if (!Array.isArray(days) || !days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) continue;
    await add({ id: row.id, kind: "habit", name: row.name, color: row.color, starts_on: dates[0], start_time: null, end_time: null, break_durations_json: "[]", recurrence_frequency: new Set(days).size === 7 ? "daily" : "weekly", recurrence_interval: 1, recurrence_weekdays_json: new Set(days).size === 7 ? "[]" : JSON.stringify([...new Set(days)].map((day) => weekdays[day])), recurrence_ends_on: null, system_type: row.system_type ?? legacySystems.get(String(row.id)) ?? null, created_at: row.created_at, updated_at: row.updated_at ?? row.created_at });
  }
  for (const row of rows("time_boxes", 23)) {
    await add({ id: row.id, kind: "event", name: row.title, color: row.color ?? "#64748b", starts_on: row.date, start_time: row.start_time, end_time: row.end_time, break_durations_json: row.break_durations_json ?? "[]", recurrence_frequency: null, recurrence_interval: 1, recurrence_weekdays_json: "[]", recurrence_ends_on: null, system_type: null, created_at: row.created_at, updated_at: row.updated_at ?? row.created_at });
  }
  for (const row of [...oldLogs, ...rows("habit_logs", 24)]) {
    const id = mapping.get(String(row.item_id ?? row.habit_id)), item = id && converted.get(id);
    if (!id || !item || item.kind !== "habit" || !recurrenceAppliesOnDate(item, String(row.date))) continue;
    await db.runAsync(`INSERT INTO habit_logs VALUES (?, ?, ?, ?) ON CONFLICT(item_id,date) DO UPDATE SET completed_at=excluded.completed_at, updated_at=excluded.updated_at WHERE excluded.updated_at > habit_logs.updated_at`, id, String(row.date), String(row.completed_at), String(row.updated_at ?? row.completed_at));
  }
  for (const row of rows("item_exceptions", 24)) {
    const id = mapping.get(String(row.item_id)), item = id && converted.get(id);
    if (!id || !item || item.kind !== "event" || !recurrenceAppliesOnDate(item, String(row.original_date))) continue;
    await db.runAsync("INSERT OR IGNORE INTO item_exceptions VALUES (?, ?, ?, ?, ?, ?, ?)", id, String(row.original_date), row.replacement_date as string | null, Number(row.cancelled), row.replacement_json as string | null, String(row.created_at), String(row.updated_at));
  }
  // Only modern tombstones have unambiguous identities in the new domain.
  for (const row of [...rows("lifeflow_tombstones", 23), ...rows("lifeflow_tombstones", 24)]) {
    if (["habit", "time_box"].includes(String(row.kind))) row.kind = "item";
    const separator = String(row.entity_id).lastIndexOf("|");
    const oldParent = separator < 0 ? String(row.entity_id) : String(row.entity_id).slice(0, separator);
    const parent = mapping.get(oldParent) ?? oldParent;
    if (parent === "lifeflow-app-check-in" || parent === "lifeflow-journal" || oldParent.startsWith("lifeflow-app-check-in-") || oldParent.startsWith("lifeflow-journal-")) continue;
    row.entity_id = separator < 0 ? parent : parent + String(row.entity_id).slice(separator);
    if (!["item", "habit_log", "item_exception"].includes(String(row.kind))) continue;
    await db.runAsync("INSERT INTO lifeflow_tombstones VALUES (?, ?, ?) ON CONFLICT(kind,entity_id) DO UPDATE SET updated_at=excluded.updated_at WHERE excluded.updated_at > lifeflow_tombstones.updated_at", String(row.kind), String(row.entity_id), String(row.updated_at));
  }
  if (archive.some((row) => row.source_table === "app_preferences" && (() => { const value = JSON.parse(row.row_json); return String(value.key).startsWith("lifeflow_journal_enabled") && value.value === "true"; })())) {
    await db.runAsync("INSERT INTO app_preferences (key,value) VALUES ('lifeflow_journal_enabled','true') ON CONFLICT(key) DO UPDATE SET value='true'");
  }
}
