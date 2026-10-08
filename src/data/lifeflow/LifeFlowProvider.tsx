import { notifySyncMutation, withSyncMutation } from "@/lib/sync/syncEvents";
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { AppState } from "react-native";

import { addDaysToDateKey, toDateKey } from "@/lib/date";
import { reconcileItemOccurrenceNotificationsAsync } from "@/lib/timeBoxNotifications";
import { withDbLock } from "@/lib/sync/dbLock";
import {
  cancelEventOccurrence as cancelOccurrenceRecord, createItem as createItemRecord,
  deleteItem as deleteItemRecord, ensureAppCheckInItem, listItemExceptions, listItems,
  listUnifiedHabitLogs, overrideEventOccurrence as overrideOccurrenceRecord,
  recordUnifiedJournalActivity, restoreEventOccurrence as restoreOccurrenceRecord,
  setJournalItemEnabled as setJournalEnabledRecord, setUnifiedHabitCompleted,
  updateItem as updateItemRecord,
} from "./unifiedRepository";
import { resolveItemOccurrences } from "./itemRecurrence";
import type { CreateItemInput, Item, ItemException, ItemOccurrence, OverrideOccurrenceInput, UnifiedHabitLog, UpdateItemInput } from "./types";

export type LifeFlowContextValue = {
  today: string;
  items: Item[];
  habitLogs: UnifiedHabitLog[];
  exceptions: ItemException[];
  getOccurrencesForDate: (date: string) => ItemOccurrence[];
  getOccurrencesForRange: (startDate: string, days: number) => ItemOccurrence[];
  loading: boolean;
  refresh: () => Promise<void>;
  createItem: (input: CreateItemInput) => Promise<Item>;
  updateItem: (id: string, input: UpdateItemInput, resetHistory?: boolean) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  setHabitCompleted: (itemId: string, date: string, completed: boolean) => Promise<void>;
  recordJournalActivity: () => Promise<void>;
  recordAppCheckIn: () => Promise<void>;
  setJournalItemEnabled: (enabled: boolean) => Promise<void>;
  overrideEventOccurrence: (input: OverrideOccurrenceInput) => Promise<void>;
  cancelEventOccurrence: (itemId: string, originalDate: string) => Promise<void>;
  restoreEventOccurrence: (itemId: string, originalDate: string) => Promise<void>;
};

const LifeFlowContext = createContext<LifeFlowContextValue | null>(null);

export function LifeFlowProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [today, setToday] = useState(() => toDateKey(new Date()));
  const [items, setItems] = useState<Item[]>([]);
  const [habitLogs, setHabitLogs] = useState<UnifiedHabitLog[]>([]);
  const [exceptions, setExceptions] = useState<ItemException[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (reconcileNotifications = false) => {
    const recordedCheckIn = await withDbLock(async () => {
      const currentDate = toDateKey(new Date());
      setToday(currentDate);
      const recordedCheckIn = await ensureAppCheckInItem(db, currentDate);
      const historyStart = addDaysToDateKey(currentDate, -370);
      const [nextItems, nextLogs, nextExceptions] = await Promise.all([
        listItems(db), listUnifiedHabitLogs(db, historyStart), listItemExceptions(db),
      ]);
      setItems(nextItems);
      setHabitLogs(nextLogs);
      setExceptions(nextExceptions);
      if (reconcileNotifications) {
        await reconcileItemOccurrenceNotificationsAsync(resolveItemOccurrences(currentDate, 14, nextItems, nextExceptions, nextLogs)).catch((error) => {
          console.warn("Failed to reconcile item notifications", error);
        });
      }
      return recordedCheckIn;
    });
    if (recordedCheckIn) notifySyncMutation();
  }, [db]);

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

  const refreshFromSync = useCallback(() => refresh(true), [refresh]);

  const value: LifeFlowContextValue = {
    today,
    items,
    habitLogs,
    exceptions,
    getOccurrencesForDate: (date) => resolveItemOccurrences(date, 1, items, exceptions, habitLogs),
    getOccurrencesForRange: (startDate, days) => resolveItemOccurrences(startDate, days, items, exceptions, habitLogs),
    loading,
    refresh: refreshFromSync,
    createItem: async (input) => {
      const created = await withSyncMutation(() => createItemRecord(db, input));
      await refresh();
      return created;
    },
    updateItem: async (id, input, resetHistory) => { await withSyncMutation(() => updateItemRecord(db, id, input, resetHistory)); await refresh(true); },
    deleteItem: async (id) => { await withSyncMutation(() => deleteItemRecord(db, id)); await refresh(true); },
    setHabitCompleted: async (itemId, date, completed) => {
      const now = new Date().toISOString();
      setHabitLogs((current) => {
        const remaining = current.filter((log) => log.itemId !== itemId || log.date !== date);
        return completed
          ? [...remaining, { itemId, date, completedAt: now, updatedAt: now }]
          : remaining;
      });

      try {
        await withSyncMutation(() => setUnifiedHabitCompleted(db, itemId, date, completed));
      } catch (error) {
        await refresh().catch((refreshError) => console.warn("Failed to roll back optimistic habit update", refreshError));
        throw error;
      }
    },
    recordJournalActivity: async () => {
      await withSyncMutation(() => recordUnifiedJournalActivity(db, toDateKey(new Date())));
      await refresh();
    },
    recordAppCheckIn: async () => { await withSyncMutation(() => ensureAppCheckInItem(db, toDateKey(new Date()))); await refresh(); },
    setJournalItemEnabled: async (enabled) => { await withSyncMutation(() => setJournalEnabledRecord(db, enabled, toDateKey(new Date()))); await refresh(); },
    overrideEventOccurrence: async (input) => { await withSyncMutation(() => overrideOccurrenceRecord(db, input)); await refresh(true); },
    cancelEventOccurrence: async (id, date) => { await withSyncMutation(() => cancelOccurrenceRecord(db, id, date)); await refresh(true); },
    restoreEventOccurrence: async (id, date) => { await withSyncMutation(() => restoreOccurrenceRecord(db, id, date)); await refresh(true); },
  };

  return <LifeFlowContext value={value}>{children}</LifeFlowContext>;
}

export function useLifeFlow() {
  const value = use(LifeFlowContext);
  if (!value) throw new Error("useLifeFlow must be used within LifeFlowProvider");
  return value;
}
