import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { AppState } from "react-native";

import { addDaysToDateKey, toDateKey } from "@/lib/date";
import { reconcileTimeBoxNotificationsAsync } from "@/lib/timeBoxNotifications";
import { subscribeActiveManagement } from "@/lib/activeManagementEvents";
import { withDbLock } from "@/lib/sync/dbLock";
import { resolveTimeBoxesForDate, resolveTimeBoxesForRange } from "./recurrence";
import {
  applyDayPreset,
  createHabit as createHabitRecord,
  createDayPresetSchedule,
  createTimeBox as createTimeBoxRecord,
  clearTimeBoxesForDate as clearTimeBoxesForDateRecord,
  deleteHabit as deleteHabitRecord,
  deleteDayPreset,
  deleteTimeBox as deleteTimeBoxRecord,
  ensureAppCheckIn,
  ensureJournalHabit,
  listHabitLogs,
  listHabits,
  listDayPresets,
  listTimeBoxes,
  planHabit as planHabitRecord,
  recordJournalActivity as recordJournalActivityRecord,
  setHabitCompleted as setHabitCompletedRecord,
  setTimeBoxCompleted as setTimeBoxCompletedRecord,
  stopDayPresetRecurrence as stopDayPresetRecurrenceRecord,
  updateHabit as updateHabitRecord,
  updateDayPreset as updateDayPresetRecord,
  updateTimeBoxRange as updateTimeBoxRangeRecord,
  updateTimeBox as updateTimeBoxRecord,
} from "./repository";
import type { ApplyDayPresetResult, CreateDayPresetInput, CreateHabitInput, CreateTimeBoxInput, DayPreset, Habit, HabitLog, PlanHabitResult, TimeBox, UpdateDayPresetInput, UpdateHabitInput, UpdateTimeBoxInput } from "./types";

type LifeFlowContextValue = {
  today: string;
  habits: Habit[];
  habitLogs: HabitLog[];
  timeBoxes: TimeBox[];
  dayPresets: DayPreset[];
  getTimeBoxesForDate: (date: string) => TimeBox[];
  loading: boolean;
  createHabit: (input: CreateHabitInput) => Promise<void>;
  updateHabit: (id: string, input: UpdateHabitInput) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  setHabitCompleted: (habitId: string, date: string, completed: boolean) => Promise<void>;
  planHabit: (habitId: string, date: string) => Promise<PlanHabitResult>;
  recordJournalActivity: () => Promise<void>;
  createTimeBox: (input: CreateTimeBoxInput) => Promise<void>;
  clearTimeBoxesForDate: (date: string) => Promise<void>;
  createDayPreset: (input: CreateDayPresetInput) => Promise<void>;
  updateDayPreset: (presetId: string, input: UpdateDayPresetInput) => Promise<void>;
  applyDayPreset: (presetId: string, date: string) => Promise<ApplyDayPresetResult>;
  deleteDayPreset: (presetId: string) => Promise<void>;
  stopDayPresetRecurrence: (presetId: string) => Promise<void>;
  deleteTimeBox: (box: TimeBox) => Promise<void>;
  setTimeBoxCompleted: (box: TimeBox, completed: boolean) => Promise<void>;
  updateTimeBoxRange: (box: TimeBox, startTime: string, endTime: string) => Promise<void>;
  updateTimeBox: (box: TimeBox, input: UpdateTimeBoxInput) => Promise<void>;
};

const LifeFlowContext = createContext<LifeFlowContextValue | null>(null);

export function LifeFlowProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [today, setToday] = useState(() => toDateKey(new Date()));
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [timeBoxes, setTimeBoxes] = useState<TimeBox[]>([]);
  const [dayPresets, setDayPresets] = useState<DayPreset[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (reconcileNotifications = false) => withDbLock(async () => {
    const currentDate = toDateKey(new Date());
    setToday(currentDate);
    await ensureAppCheckIn(db, currentDate);
    await ensureJournalHabit(db);
    const historyStart = addDaysToDateKey(currentDate, -370);
    const [nextHabits, nextLogs, nextTimeBoxes, nextDayPresets] = await Promise.all([
      listHabits(db),
      listHabitLogs(db, historyStart),
      listTimeBoxes(db),
      listDayPresets(db),
    ]);
    setHabits(nextHabits);
    setHabitLogs(nextLogs);
    setTimeBoxes(nextTimeBoxes);
    setDayPresets(nextDayPresets);
    if (reconcileNotifications) {
      await reconcileTimeBoxNotificationsAsync(resolveTimeBoxesForRange(currentDate, 14, nextTimeBoxes, nextDayPresets)).catch((error) => {
        console.warn("Failed to reconcile time-box notifications", error);
      });
    }
  }), [db]);

  useEffect(() => {
    return subscribeActiveManagement(() => {
      setLoading(true);
      void refresh(true)
        .catch((error) => console.warn("Failed to switch LifeFlow wallet", error))
        .finally(() => setLoading(false));
    });
  }, [refresh]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void refresh(true)
        .catch((error) => console.warn("Failed to load lifeflow data", error))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void refresh().catch((error) => console.warn("Failed to refresh lifeflow data", error));
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = setTimeout(() => {
      void refresh(true).catch((error) => console.warn("Failed to refresh after date change", error));
    }, nextMidnight.getTime() - now.getTime() + 1000);
    return () => clearTimeout(timeout);
  }, [refresh, today]);

  const value: LifeFlowContextValue = {
    today,
    habits,
    habitLogs,
    timeBoxes,
    dayPresets,
    getTimeBoxesForDate: (date) => resolveTimeBoxesForDate(date, timeBoxes, dayPresets),
    loading,
    createHabit: async (input) => {
      await withDbLock(() => createHabitRecord(db, input));
      await refresh();
    },
    updateHabit: async (id, input) => {
      await withDbLock(() => updateHabitRecord(db, id, input));
      await refresh();
    },
    deleteHabit: async (id) => {
      await withDbLock(() => deleteHabitRecord(db, id));
      await refresh();
    },
    setHabitCompleted: async (habitId, date, completed) => {
      await withDbLock(() => setHabitCompletedRecord(db, habitId, date, completed));
      await refresh();
    },
    planHabit: async (habitId, date) => {
      const result = await withDbLock(() => planHabitRecord(db, habitId, date));
      if (result === "planned") await refresh(true);
      return result;
    },
    recordJournalActivity: async () => {
      const changed = await withDbLock(() => recordJournalActivityRecord(db, toDateKey(new Date())));
      if (changed) await refresh();
    },
    createTimeBox: async (input) => {
      await withDbLock(() => createTimeBoxRecord(db, input));
      await refresh(true);
    },
    clearTimeBoxesForDate: async (date) => {
      await withDbLock(() => clearTimeBoxesForDateRecord(db, date));
      await refresh(true);
    },
    createDayPreset: async (input) => {
      await withDbLock(() => createDayPresetSchedule(db, input));
      await refresh(true);
    },
    updateDayPreset: async (presetId, input) => {
      await withDbLock(() => updateDayPresetRecord(db, presetId, input));
      await refresh(true);
    },
    applyDayPreset: async (presetId, date) => {
      const result = await withDbLock(() => applyDayPreset(db, presetId, date));
      if (result === "applied") await refresh(true);
      return result;
    },
    deleteDayPreset: async (presetId) => {
      await withDbLock(() => deleteDayPreset(db, presetId));
      await refresh(true);
    },
    stopDayPresetRecurrence: async (presetId) => {
      await withDbLock(() => stopDayPresetRecurrenceRecord(db, presetId));
      await refresh(true);
    },
    deleteTimeBox: async (box) => {
      await withDbLock(() => deleteTimeBoxRecord(db, box));
      await refresh(true);
    },
    setTimeBoxCompleted: async (box, completed) => {
      await withDbLock(() => setTimeBoxCompletedRecord(db, box, completed));
      await refresh(true);
    },
    updateTimeBoxRange: async (box, startTime, endTime) => {
      await withDbLock(() => updateTimeBoxRangeRecord(db, box, startTime, endTime));
      await refresh(true);
    },
    updateTimeBox: async (box, input) => {
      await withDbLock(() => updateTimeBoxRecord(db, box, input));
      await refresh(true);
    },
  };

  return <LifeFlowContext value={value}>{children}</LifeFlowContext>;
}

export function useLifeFlow() {
  const value = use(LifeFlowContext);
  if (!value) throw new Error("useLifeFlow must be used within LifeFlowProvider");
  return value;
}
