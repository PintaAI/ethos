import type { SQLiteDatabase } from "expo-sqlite";
import { getActiveManagementId } from "@/data/cashflow/repository";

import { findNextAvailableTimeSlot, getTimeBoxFocusDuration, timeBoxRangesAreValid, canAllocateTimeBox, timeBoxesOverlap } from "@/lib/timeBox";
import { presetBlocksConflictWithDate, recurringPresetsConflict, resolveTimeBoxesForDate, scheduleAppliesOnDate } from "./recurrence";
import type { ApplyDayPresetResult, CreateDayPresetInput, CreateHabitInput, CreateTimeBoxInput, DayPreset, DayPresetFrequency, Habit, HabitLog, PlanHabitResult, TimeBox, UpdateDayPresetInput, UpdateHabitInput, UpdateTimeBoxInput } from "./types";

type HabitRow = { id: string; name: string; color: string; weekdays_json: string; preferred_duration: number; system_type: string | null; created_at: string };
type HabitLogRow = { habit_id: string; date: string };
type TimeBoxRow = {
  id: string;
  date: string;
  title: string;
  start_time: string;
  end_time: string;
  break_durations_json: string;
  color: string | null;
  completed: number;
  habit_id: string | null;
  created_at: string;
  dismissed: number;
  preset_schedule_id: string | null;
  preset_block_id: string | null;
};

const APP_CHECK_IN_COLOR = "#5B8CFF";
const JOURNAL_HABIT_COLOR = "#A855F7";

async function activeManagementId(db: SQLiteDatabase): Promise<string> {
  const id = await getActiveManagementId(db);
  if (!id) throw new Error("An active wallet is required for LifeFlow.");
  return id;
}

function parseBreakDurations(value: string) {
  try {
    const durations = JSON.parse(value) as unknown;
    return Array.isArray(durations)
      ? durations.filter((duration): duration is number => Number.isInteger(duration) && duration > 0)
      : [];
  } catch {
    return [];
  }
}

function parseWeekdays(value: string) {
  try {
    const weekdays = JSON.parse(value) as unknown;
    if (!Array.isArray(weekdays)) return [0, 1, 2, 3, 4, 5, 6];
    const valid = [...new Set(weekdays.filter((weekday): weekday is number => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6))].sort();
    return valid.length > 0 ? valid : [0, 1, 2, 3, 4, 5, 6];
  } catch {
    return [0, 1, 2, 3, 4, 5, 6];
  }
}

function createId(prefix: string) {
  const randomUuid = globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomUuid}`;
}

export async function listHabits(db: SQLiteDatabase): Promise<Habit[]> {
  const managementId = await activeManagementId(db);
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT * FROM habits WHERE management_id = ?
     ORDER BY CASE system_type WHEN 'app_check_in' THEN 0 WHEN 'journal' THEN 1 ELSE 2 END, created_at, id`,
    managementId,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    weekdays: parseWeekdays(row.weekdays_json),
    preferredDuration: row.preferred_duration,
    isAppCheckIn: row.system_type === "app_check_in",
    isJournalHabit: row.system_type === "journal",
    createdAt: row.created_at,
  }));
}

export async function listHabitLogs(db: SQLiteDatabase, fromDate: string): Promise<HabitLog[]> {
  const managementId = await activeManagementId(db);
  const rows = await db.getAllAsync<HabitLogRow>(
    "SELECT habit_id, date FROM habit_logs WHERE management_id = ? AND date >= ? ORDER BY date",
    managementId,
    fromDate,
  );
  return rows.map((row) => ({ habitId: row.habit_id, date: row.date }));
}

async function ensureSystemHabit(
  db: SQLiteDatabase,
  systemType: "app_check_in" | "journal",
  name: string,
  color: string,
): Promise<string> {
  const managementId = await activeManagementId(db);
  let habitId = "";
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string }>(
      "SELECT id FROM habits WHERE management_id = ? AND system_type = ?",
      managementId,
      systemType,
    );
    if (existing) {
      habitId = existing.id;
    } else {
      habitId = createId("habit");
      await txn.runAsync(
        "INSERT INTO habits (id, name, color, weekdays_json, created_at, management_id, system_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
        habitId,
        name,
        color,
        JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
        new Date().toISOString(),
        managementId,
        systemType,
      );
    }
  });
  return habitId;
}

export async function ensureAppCheckIn(db: SQLiteDatabase, date: string): Promise<void> {
  const habitId = await ensureSystemHabit(db, "app_check_in", "App check-in", APP_CHECK_IN_COLOR);
  const managementId = await activeManagementId(db);
  await db.runAsync(
    "INSERT OR IGNORE INTO habit_logs (habit_id, date, completed_at, management_id) VALUES (?, ?, ?, ?)",
    habitId,
    date,
    new Date().toISOString(),
    managementId,
  );
}

export async function ensureJournalHabit(db: SQLiteDatabase): Promise<void> {
  await ensureSystemHabit(db, "journal", "Daily Journal", JOURNAL_HABIT_COLOR);
}

export async function recordJournalActivity(db: SQLiteDatabase, date: string): Promise<boolean> {
  const habitId = await ensureSystemHabit(db, "journal", "Daily Journal", JOURNAL_HABIT_COLOR);
  const managementId = await activeManagementId(db);
  const result = await db.runAsync(
    "INSERT OR IGNORE INTO habit_logs (habit_id, date, completed_at, management_id) VALUES (?, ?, ?, ?)",
    habitId,
    date,
    new Date().toISOString(),
    managementId,
  );
  return result.changes > 0;
}

async function isSystemHabit(db: SQLiteDatabase, id: string): Promise<boolean> {
  const managementId = await activeManagementId(db);
  const row = await db.getFirstAsync(
    "SELECT 1 FROM habits WHERE id = ? AND management_id = ? AND system_type IS NOT NULL",
    id,
    managementId,
  );
  return row !== null;
}

export async function createHabit(db: SQLiteDatabase, input: CreateHabitInput): Promise<void> {
  const managementId = await activeManagementId(db);
  await db.runAsync(
    "INSERT INTO habits (id, name, color, weekdays_json, preferred_duration, created_at, management_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    createId("habit"),
    input.name.trim(),
    input.color,
    JSON.stringify(input.weekdays),
    input.preferredDuration ?? 30,
    new Date().toISOString(),
    managementId,
  );
}

export async function updateHabit(db: SQLiteDatabase, id: string, input: UpdateHabitInput): Promise<void> {
  const managementId = await activeManagementId(db);
  if (await isSystemHabit(db, id)) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      "UPDATE habits SET name = ?, color = ?, weekdays_json = ?, preferred_duration = COALESCE(?, preferred_duration) WHERE id = ? AND management_id = ?",
      input.name.trim(),
      input.color,
      JSON.stringify(input.weekdays),
      input.preferredDuration ?? null,
      id,
      managementId,
    );
    await txn.runAsync(
      "UPDATE time_boxes SET title = ?, color = ? WHERE habit_id = ? AND management_id = ? AND completed = 0",
      input.name.trim(),
      input.color,
      id,
      managementId,
    );
  });
}

export async function deleteHabit(db: SQLiteDatabase, id: string): Promise<void> {
  const managementId = await activeManagementId(db);
  if (await isSystemHabit(db, id)) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("DELETE FROM time_boxes WHERE habit_id = ? AND management_id = ? AND completed = 0", id, managementId);
    await txn.runAsync("DELETE FROM habits WHERE id = ? AND management_id = ?", id, managementId);
  });
}

export async function setHabitCompleted(db: SQLiteDatabase, habitId: string, date: string, completed: boolean): Promise<void> {
  const managementId = await activeManagementId(db);
  const journalHabit = await db.getFirstAsync(
    "SELECT 1 FROM habits WHERE id = ? AND management_id = ? AND system_type = 'journal'",
    habitId,
    managementId,
  );
  if (journalHabit) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (completed) {
      await txn.runAsync(
        `INSERT INTO habit_logs (habit_id, date, completed_at, management_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(habit_id, date) DO UPDATE SET completed_at = excluded.completed_at`,
        habitId,
        date,
        new Date().toISOString(),
        managementId,
      );
    } else {
      await txn.runAsync("DELETE FROM habit_logs WHERE habit_id = ? AND date = ? AND management_id = ?", habitId, date, managementId);
    }
    await txn.runAsync(
      "UPDATE time_boxes SET completed = ? WHERE habit_id = ? AND date = ? AND management_id = ? AND dismissed = 0",
      completed ? 1 : 0,
      habitId,
      date,
      managementId,
    );
  });
}

export async function listTimeBoxes(db: SQLiteDatabase): Promise<TimeBox[]> {
  const managementId = await activeManagementId(db);
  const rows = await db.getAllAsync<TimeBoxRow>(
    "SELECT * FROM time_boxes WHERE management_id = ? ORDER BY date DESC, start_time, id",
    managementId,
  );
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    breakDurations: parseBreakDurations(row.break_durations_json),
    color: row.color,
    completed: row.completed === 1,
    habitId: row.habit_id,
    createdAt: row.created_at,
    dismissed: row.dismissed === 1,
    presetScheduleId: row.preset_schedule_id,
    presetBlockId: row.preset_block_id,
  }));
}

export async function createTimeBox(db: SQLiteDatabase, input: CreateTimeBoxInput): Promise<void> {
  const managementId = await activeManagementId(db);
  await assertCanAllocate(db, input);
  const completed = input.habitId
    ? await db.getFirstAsync("SELECT 1 FROM habit_logs WHERE habit_id = ? AND date = ? AND management_id = ?", input.habitId, input.date, managementId)
    : null;
  await db.runAsync(
    "INSERT INTO time_boxes (id, date, title, start_time, end_time, break_durations_json, color, completed, habit_id, created_at, management_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [createId("time-box"), input.date, input.title.trim(), input.startTime, input.endTime,
      JSON.stringify(input.breakDurations ?? []), input.color ?? null, completed ? 1 : 0,
      input.habitId ?? null, new Date().toISOString(), managementId],
  );
}

export async function setTimeBoxCompleted(db: SQLiteDatabase, box: TimeBox, completed: boolean): Promise<void> {
  const managementId = await activeManagementId(db);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await persistVirtualSnapshot(txn, box);
    const stored = await txn.getFirstAsync<{ habit_id: string | null; date: string }>(
      "SELECT habit_id, date FROM time_boxes WHERE id = ? AND management_id = ?",
      box.id,
      managementId,
    );
    await txn.runAsync("UPDATE time_boxes SET completed = ? WHERE id = ? AND management_id = ?", completed ? 1 : 0, box.id, managementId);
    if (!stored?.habit_id) return;
    if (completed) {
      await txn.runAsync(
        `INSERT INTO habit_logs (habit_id, date, completed_at, management_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(habit_id, date) DO UPDATE SET completed_at = excluded.completed_at`,
        stored.habit_id,
        stored.date,
        new Date().toISOString(),
        managementId,
      );
    } else {
      await txn.runAsync("DELETE FROM habit_logs WHERE habit_id = ? AND date = ? AND management_id = ?", stored.habit_id, stored.date, managementId);
    }
  });
}

export async function updateTimeBoxRange(db: SQLiteDatabase, box: TimeBox, startTime: string, endTime: string): Promise<void> {
  const managementId = await activeManagementId(db);
  await assertCanAllocate(db, { ...box, startTime, endTime }, box.id);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await persistVirtualSnapshot(txn, box);
    const stored = await txn.getFirstAsync<{ habit_id: string | null; break_durations_json: string }>(
      "SELECT habit_id, break_durations_json FROM time_boxes WHERE id = ? AND management_id = ?",
      box.id,
      managementId,
    );
    await txn.runAsync("UPDATE time_boxes SET start_time = ?, end_time = ? WHERE id = ? AND management_id = ?", startTime, endTime, box.id, managementId);
    if (stored?.habit_id) {
      await txn.runAsync(
        "UPDATE habits SET preferred_duration = ? WHERE id = ? AND management_id = ?",
        Math.max(5, getTimeBoxFocusDuration(startTime, endTime, parseBreakDurations(stored.break_durations_json))),
        stored.habit_id,
        managementId,
      );
    }
  });
}

export async function updateTimeBox(db: SQLiteDatabase, box: TimeBox, input: UpdateTimeBoxInput): Promise<void> {
  const managementId = await activeManagementId(db);
  await assertCanAllocate(db, { ...box, ...input }, box.id);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await persistVirtualSnapshot(txn, box);
    const stored = await txn.getFirstAsync<{ habit_id: string | null }>("SELECT habit_id FROM time_boxes WHERE id = ? AND management_id = ?", box.id, managementId);
    await txn.runAsync(
      `UPDATE time_boxes
       SET title = ?, start_time = ?, end_time = ?, break_durations_json = ?, color = ?
       WHERE id = ? AND management_id = ?`,
      input.title.trim(),
      input.startTime,
      input.endTime,
      JSON.stringify(input.breakDurations),
      input.color,
      box.id,
      managementId,
    );
    if (stored?.habit_id) {
      await txn.runAsync(
        "UPDATE habits SET preferred_duration = ? WHERE id = ? AND management_id = ?",
        Math.max(5, getTimeBoxFocusDuration(input.startTime, input.endTime, input.breakDurations)),
        stored.habit_id,
        managementId,
      );
    }
  });
}

export async function planHabit(db: SQLiteDatabase, habitId: string, date: string): Promise<PlanHabitResult> {
  const habit = (await listHabits(db)).find((item) => item.id === habitId);
  if (!habit || habit.isAppCheckIn || habit.isJournalHabit) return "not-found";
  const existing = resolveTimeBoxesForDate(date, await listTimeBoxes(db), await listDayPresets(db));
  if (existing.some((box) => box.habitId === habitId && box.date === date)) return "already-planned";
  const slot = findNextAvailableTimeSlot(date, habit.preferredDuration, existing);
  if (!slot) return "no-space";
  await createTimeBox(db, {
    ...slot,
    title: habit.name,
    color: habit.color,
    habitId,
  });
  return "planned";
}

export async function deleteTimeBox(db: SQLiteDatabase, box: TimeBox): Promise<void> {
  const managementId = await activeManagementId(db);
  await persistVirtualSnapshot(db, box);
  await db.runAsync(
    `UPDATE time_boxes SET dismissed = 1
     WHERE id = ? AND management_id = ? AND preset_schedule_id IS NOT NULL`,
    box.id,
    managementId,
  );
  await db.runAsync(
    "DELETE FROM time_boxes WHERE id = ? AND management_id = ? AND preset_schedule_id IS NULL",
    box.id,
    managementId,
  );
}

export async function clearTimeBoxesForDate(db: SQLiteDatabase, date: string): Promise<void> {
  const managementId = await activeManagementId(db);
  const effective = resolveTimeBoxesForDate(date, await listTimeBoxes(db), await listDayPresets(db));
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const box of effective) await persistVirtualSnapshot(txn, box);
    await txn.runAsync(
      "UPDATE time_boxes SET dismissed = 1 WHERE date = ? AND management_id = ? AND preset_schedule_id IS NOT NULL",
      date,
      managementId,
    );
    await txn.runAsync(
      "DELETE FROM time_boxes WHERE date = ? AND management_id = ? AND preset_schedule_id IS NULL",
      date,
      managementId,
    );
  });
}

export async function createDayPresetSchedule(db: SQLiteDatabase, input: CreateDayPresetInput): Promise<void> {
  const managementId = await activeManagementId(db);
  assertPresetBlocksValid(input.blocks);
  if (input.frequency && input.startDate) await assertRecurringPresetValid(db, input);
  const presetId = createId("day-preset");
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      "INSERT INTO day_presets (id, name, created_at, management_id) VALUES (?, ?, ?, ?)",
      presetId,
      input.name.trim(),
      now,
      managementId,
    );
    for (const [index, block] of input.blocks.entries()) {
      await txn.runAsync(
        `INSERT INTO day_preset_blocks
         (id, preset_id, title, start_time, end_time, break_durations_json, color, sort_order, management_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [createId("day-preset-block"), presetId, block.title, block.startTime, block.endTime,
          JSON.stringify(block.breakDurations), block.color, index, managementId],
      );
    }
    if (input.frequency && input.startDate) {
      await txn.runAsync(
        `INSERT INTO day_preset_schedules
         (id, preset_id, start_date, frequency, weekdays_json, active, created_at, management_id)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [createId("day-preset-schedule"), presetId, input.startDate, input.frequency,
          JSON.stringify(input.weekdays), now, managementId],
      );
    }
  });
}

export async function updateDayPreset(db: SQLiteDatabase, presetId: string, input: UpdateDayPresetInput): Promise<void> {
  const managementId = await activeManagementId(db);
  assertPresetBlocksValid(input.blocks);
  if (input.frequency && input.startDate) await assertRecurringPresetValid(db, input, presetId);
  const preset = (await listDayPresets(db)).find((item) => item.id === presetId);
  if (!preset) throw new Error("Day preset not found.");
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("UPDATE day_presets SET name = ? WHERE id = ? AND management_id = ?", input.name.trim(), presetId, managementId);
    for (const [index, block] of input.blocks.entries()) {
      const existing = preset.blocks[index];
      if (existing) {
        await txn.runAsync(
          `UPDATE day_preset_blocks
           SET title = ?, start_time = ?, end_time = ?, break_durations_json = ?, color = ?, sort_order = ?
            WHERE id = ? AND management_id = ?`,
          [block.title, block.startTime, block.endTime, JSON.stringify(block.breakDurations), block.color, index, existing.id, managementId],
        );
      } else {
        await txn.runAsync(
          `INSERT INTO day_preset_blocks
           (id, preset_id, title, start_time, end_time, break_durations_json, color, sort_order, management_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [createId("day-preset-block"), presetId, block.title, block.startTime, block.endTime,
            JSON.stringify(block.breakDurations), block.color, index, managementId],
        );
      }
    }
    for (const removed of preset.blocks.slice(input.blocks.length)) {
      await txn.runAsync("DELETE FROM day_preset_blocks WHERE id = ? AND management_id = ?", removed.id, managementId);
    }

    if (input.frequency && input.startDate) {
      if (preset.schedule) {
        await txn.runAsync(
          `UPDATE day_preset_schedules
           SET start_date = ?, frequency = ?, weekdays_json = ?, active = 1
            WHERE id = ? AND management_id = ?`,
          input.startDate, input.frequency, JSON.stringify(input.weekdays), preset.schedule.id, managementId,
        );
      } else {
        await txn.runAsync(
          `INSERT INTO day_preset_schedules
           (id, preset_id, start_date, frequency, weekdays_json, active, created_at, management_id)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          [createId("day-preset-schedule"), presetId, input.startDate, input.frequency, JSON.stringify(input.weekdays), now, managementId],
        );
      }
    } else if (preset.schedule) {
      await txn.runAsync("DELETE FROM time_boxes WHERE preset_schedule_id = ? AND management_id = ? AND completed = 0", preset.schedule.id, managementId);
      await txn.runAsync("UPDATE day_preset_schedules SET active = 0 WHERE id = ? AND management_id = ?", preset.schedule.id, managementId);
    }
  });
}

export async function listDayPresets(db: SQLiteDatabase): Promise<DayPreset[]> {
  const managementId = await activeManagementId(db);
  const rows = await db.getAllAsync<{
    preset_id: string;
    name: string;
    block_id: string;
    title: string;
    start_time: string;
    end_time: string;
    break_durations_json: string;
    color: string | null;
    schedule_id: string | null;
    start_date: string | null;
    frequency: DayPresetFrequency | null;
    weekdays_json: string | null;
  }>(
    `SELECT p.id AS preset_id, p.name, b.id AS block_id, b.title, b.start_time, b.end_time, b.break_durations_json, b.color,
            s.id AS schedule_id, s.start_date, s.frequency, s.weekdays_json
     FROM day_presets p
     JOIN day_preset_blocks b ON b.preset_id = p.id AND b.management_id = p.management_id
     LEFT JOIN day_preset_schedules s ON s.preset_id = p.id AND s.management_id = p.management_id AND s.active = 1
     WHERE p.management_id = ?
     ORDER BY p.created_at DESC, b.sort_order`,
    managementId,
  );
  const presets = new Map<string, DayPreset>();
  for (const row of rows) {
    let preset = presets.get(row.preset_id);
    if (!preset) {
      let weekdays: number[] = [];
      try {
        weekdays = JSON.parse(row.weekdays_json ?? "[]") as number[];
      } catch {
        // Invalid weekday data is treated as no selected days.
      }
      preset = {
        id: row.preset_id,
        name: row.name,
        blocks: [],
        schedule: row.schedule_id && row.start_date && row.frequency
          ? {
              id: row.schedule_id,
              startDate: row.start_date,
              frequency: row.frequency,
              weekdays,
            }
          : null,
      };
      presets.set(row.preset_id, preset);
    }
    preset.blocks.push({
      id: row.block_id,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      breakDurations: parseBreakDurations(row.break_durations_json),
      color: row.color,
    });
  }
  return [...presets.values()];
}

export async function deleteDayPreset(db: SQLiteDatabase, presetId: string): Promise<void> {
  const managementId = await activeManagementId(db);
  const schedules = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM day_preset_schedules WHERE preset_id = ? AND management_id = ?",
    presetId,
    managementId,
  );
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const schedule of schedules) {
      await txn.runAsync(
        "DELETE FROM time_boxes WHERE preset_schedule_id = ? AND management_id = ? AND completed = 0",
        schedule.id,
        managementId,
      );
    }
    await txn.runAsync("DELETE FROM day_presets WHERE id = ? AND management_id = ?", presetId, managementId);
  });
}

export async function stopDayPresetRecurrence(db: SQLiteDatabase, presetId: string): Promise<void> {
  const managementId = await activeManagementId(db);
  const schedules = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM day_preset_schedules WHERE preset_id = ? AND management_id = ? AND active = 1",
    presetId,
    managementId,
  );
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const schedule of schedules) {
      await txn.runAsync(
        "DELETE FROM time_boxes WHERE preset_schedule_id = ? AND management_id = ? AND completed = 0",
        schedule.id,
        managementId,
      );
    }
    await txn.runAsync(
      "UPDATE day_preset_schedules SET active = 0 WHERE preset_id = ? AND management_id = ? AND active = 1",
      presetId,
      managementId,
    );
  });
}

export async function applyDayPreset(db: SQLiteDatabase, presetId: string, date: string): Promise<ApplyDayPresetResult> {
  const managementId = await activeManagementId(db);
  const preset = (await listDayPresets(db)).find((item) => item.id === presetId);
  if (!preset) return "not-found";
  const stored = await listTimeBoxes(db);
  const existing = resolveTimeBoxesForDate(date, stored, await listDayPresets(db));

  const candidates = preset.blocks.map((block, index) => ({
    date,
    ...block,
    id: `time-box-applied-${preset.id}-${date}-${index}`,
    completed: false,
    createdAt: new Date().toISOString(),
  }));
  const conflicts = presetBlocksConflictWithDate(date, candidates, existing);
  if (conflicts) return "conflict";

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const candidate of candidates) {
      await txn.runAsync(
        `INSERT INTO time_boxes (id, date, title, start_time, end_time, break_durations_json, color, completed, created_at, management_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [candidate.id, candidate.date, candidate.title, candidate.startTime, candidate.endTime,
          JSON.stringify(candidate.breakDurations), candidate.color, candidate.createdAt, managementId],
      );
    }
  });
  return "applied";
}

async function persistVirtualSnapshot(db: SQLiteDatabase, box: TimeBox) {
  if (!box.virtual) return;
  const managementId = await activeManagementId(db);
  await db.runAsync(
    `INSERT OR IGNORE INTO time_boxes
     (id, date, title, start_time, end_time, break_durations_json, color, completed, habit_id, created_at, dismissed, preset_schedule_id, preset_block_id, management_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [box.id, box.date, box.title, box.startTime, box.endTime, JSON.stringify(box.breakDurations), box.color,
      box.completed ? 1 : 0, box.habitId, new Date().toISOString(), box.presetScheduleId ?? null, box.presetBlockId ?? null, managementId],
  );
}

async function assertCanAllocate(db: SQLiteDatabase, candidate: Pick<TimeBox, "date" | "startTime" | "endTime">, excludeId?: string) {
  const effective = resolveTimeBoxesForDate(candidate.date, await listTimeBoxes(db), await listDayPresets(db));
  const others = effective.filter((box) => box.id !== excludeId);
  const candidateColor = "color" in candidate ? candidate.color : null;
  if ((candidateColor !== null && others.some((box) => box.color === candidateColor)) || !canAllocateTimeBox(candidate, others)) {
    throw new Error("Time box overlaps another block or exceeds the 24-hour allocation.");
  }
}

function assertPresetBlocksValid(blocks: CreateDayPresetInput["blocks"]) {
  const dated = blocks.map((block) => ({ ...block, date: "2000-01-03" }));
  if (!timeBoxRangesAreValid(dated)) throw new Error("Preset blocks overlap or exceed the 24-hour allocation.");
}

async function assertRecurringPresetValid(db: SQLiteDatabase, input: CreateDayPresetInput, excludePresetId?: string) {
  const presets = await listDayPresets(db);
  const weekdays = input.frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : input.weekdays;
  for (const preset of presets) {
    if (!preset.schedule || preset.id === excludePresetId) continue;
    const otherDays = preset.schedule.frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : preset.schedule.weekdays;
    if (recurringPresetsConflict(
      { weekdays, blocks: input.blocks },
      { weekdays: otherDays, blocks: preset.blocks },
    )) throw new Error("Recurring preset conflicts with another active preset.");
  }
  const stored = (await listTimeBoxes(db)).filter((box) => !box.dismissed && !box.presetScheduleId && box.date >= input.startDate!);
  const schedule = { id: "candidate", startDate: input.startDate!, frequency: input.frequency!, weekdays };
  if (stored.some((box) => scheduleAppliesOnDate(schedule, box.date) && input.blocks.some((block) => (
    timeBoxesOverlap(box, { ...block, date: box.date })
    || (block.color !== null && block.color === box.color)
  )))) {
    throw new Error("Recurring preset conflicts with an existing time box.");
  }
}
