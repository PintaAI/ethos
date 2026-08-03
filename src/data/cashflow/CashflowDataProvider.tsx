import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSQLiteContext } from "expo-sqlite";
import type { BudgetPeriod, CashflowDataState, CashflowCategory, CashflowManagement, CashflowOverallBudget, CashflowQuickFill, CashflowRecurringEntry, CreateCategoryInput, CreateEntryInput, CreateQuickFillInput, CreateRecurringEntryInput, ManagementImageTheme, UpdateCategoryInput, UpdateManagementInput } from "./types";
import {
  buildActivity,
  buildAnalytics,
  createCategory as insertCategory,
  createQuickFill as insertQuickFill,
  createRecurringEntry as insertRecurringEntry,
  buildStats,
  deleteRecurringEntry as softDeleteRecurringEntry,
  deleteQuickFill as softDeleteQuickFill,
  deleteCategory as softDeleteCategory,
  updateCategoryBudget as persistCategoryBudget,
  updateCategory as updateCategoryInRepo,
  createEntry as insertEntry,
  deleteEntriesBulk,
  deleteEntry as softDeleteEntry,
  createTransfer as insertTransfer,
  createManagement as insertManagement,
  deleteManagement as softDeleteManagement,
  emptyCashflowStats,
  getActiveManagementId,
  listCategories,
  listEntries,
  listManagementMembers as listManagementMembersFromRepo,
  listManagements,
  listOverallBudgets,
  listQuickFills,
  listRecurringEntries,
  materializeDueRecurringEntries,
  moveEntries as moveEntriesInRepo,
  setActiveManagementId as persistActiveManagementId,
  setManagementImage as persistManagementImage,
  updateOverallBudget as persistOverallBudget,
  updateEntry as updateEntryInRepo,
  updateManagementImageTheme as updateManagementImageThemeInRepo,
  updateManagement as updateManagementInRepo,
} from "./repository";
import type { CashflowEntry } from "@/components/cashflow/CashflowTable";
import { reconcileLocalRemindersAsync } from "@/lib/localReminders";
import {
  cancelLegacyAutomaticEntryRemindersAsync,
  notifyMaterializedAutomaticEntriesAsync,
  registerAutomaticEntryBackgroundTaskAsync,
} from "@/tasks/automaticEntries";
import { getDbLockGeneration, withDbLock } from "@/lib/sync/dbLock";

const emptyActivity = buildActivity([]);
const emptyAnalytics = buildAnalytics([], []);

const CashflowDataContext = createContext<CashflowDataState | null>(null);

export function CashflowDataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [isReady, setIsReady] = useState(false);
  const [isSwitchingManagement, setIsSwitchingManagement] = useState(false);
  const [activeManagementId, setActiveManagementIdState] = useState<string | null>(null);
  const [managements, setManagements] = useState<CashflowManagement[]>([]);
  const [categories, setCategories] = useState<CashflowCategory[]>([]);
  const [overallBudgets, setOverallBudgets] = useState<CashflowOverallBudget[]>([]);
  const [quickFills, setQuickFills] = useState<CashflowQuickFill[]>([]);
  const [recurringEntries, setRecurringEntries] = useState<CashflowRecurringEntry[]>([]);
  const [entries, setEntries] = useState<CashflowEntry[]>([]);
  const walletGenerationRef = useRef(0);
  const walletOperationRef = useRef<Promise<void>>(Promise.resolve());
  const isMountedRef = useRef(true);

  const enqueueWalletOperation = useCallback((operation: () => Promise<void>) => {
    const generation = getDbLockGeneration();
    const queued = walletOperationRef.current
      .catch(() => undefined)
      .then(() => withDbLock(operation, generation));
    walletOperationRef.current = queued;
    return queued;
  }, []);

  const loadActiveWalletData = useCallback(async (managementId: string, generation: number) => {
    const [nextCategories, nextOverallBudgets, nextQuickFills, nextRecurringEntries, nextEntries] = await Promise.all([
      listCategories(db, managementId),
      listOverallBudgets(db, managementId),
      listQuickFills(db, managementId),
      listRecurringEntries(db, managementId),
      listEntries(db, managementId),
    ]);

    if (!isMountedRef.current || generation !== walletGenerationRef.current) return;

    setCategories(nextCategories);
    setOverallBudgets(nextOverallBudgets);
    setQuickFills(nextQuickFills);
    setRecurringEntries(nextRecurringEntries);
    setEntries(nextEntries);
  }, [db]);

  const refreshEntries = useCallback(() => withDbLock(async () => {
    if (!activeManagementId) return;
    const currentGeneration = walletGenerationRef.current;
    const [nextManagements, nextEntries] = await Promise.all([
      listManagements(db),
      listEntries(db, activeManagementId),
    ]);
    if (currentGeneration !== walletGenerationRef.current) return;
    setManagements(nextManagements);
    setEntries(nextEntries);
  }), [db, activeManagementId]);

  const refresh = useCallback(() => enqueueWalletOperation(async () => {
    const generation = ++walletGenerationRef.current;
    const [nextManagements, storedManagementId] = await Promise.all([listManagements(db), getActiveManagementId(db)]);
    if (!isMountedRef.current || generation !== walletGenerationRef.current) return;

    const storedStillExists = storedManagementId
      ? nextManagements.some((management) => management.id === storedManagementId)
      : false;
    const fallbackManagementId = storedStillExists ? storedManagementId : (nextManagements[0]?.id ?? null);

    setManagements(nextManagements);
    setActiveManagementIdState(fallbackManagementId);

    if (!fallbackManagementId) {
      setCategories([]);
      setOverallBudgets([]);
      setQuickFills([]);
      setRecurringEntries([]);
      setEntries([]);
      setIsReady(true);
      return;
    }

    const materialized = await materializeDueRecurringEntries(db, fallbackManagementId);
    await notifyMaterializedAutomaticEntriesAsync(materialized);
    await loadActiveWalletData(fallbackManagementId, generation);
    if (isMountedRef.current && generation === walletGenerationRef.current) setIsReady(true);
  }), [db, enqueueWalletOperation, loadActiveWalletData]);

  const selectActiveManagement = useCallback((managementId: string) => {
    setIsSwitchingManagement(true);
    return enqueueWalletOperation(async () => {
      try {
        const management = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM managements WHERE id = ? AND deleted_at IS NULL",
          managementId,
        );
        if (!management) throw new Error("Wallet not found");

        const generation = ++walletGenerationRef.current;
        await persistActiveManagementId(db, managementId);
        if (!isMountedRef.current || generation !== walletGenerationRef.current) return;
        setActiveManagementIdState(managementId);
        await loadActiveWalletData(managementId, generation);
      } finally {
        if (isMountedRef.current) setIsSwitchingManagement(false);
      }
    });
  }, [db, enqueueWalletOperation, loadActiveWalletData]);

  useEffect(() => {
    isMountedRef.current = true;

    async function load() {
      await refresh();
    }

    load().catch((error) => {
      console.error("Failed to load cashflow data", error);
      if (isMountedRef.current) setIsReady(true);
    });

    return () => {
      isMountedRef.current = false;
      walletGenerationRef.current += 1;
    };
  }, [db, refresh]);

  useEffect(() => {
    if (!isReady) return;

    registerAutomaticEntryBackgroundTaskAsync()
      .then(() => cancelLegacyAutomaticEntryRemindersAsync())
      .catch((error) => console.error("Failed to prepare automatic entries", error));
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    withDbLock(() => reconcileLocalRemindersAsync(db))
      .catch((error) => console.error("Failed to reconcile local reminders", error));
  }, [categories, db, entries, isReady, overallBudgets]);

  const activeManagement = useMemo(
    () => managements.find((management) => management.id === activeManagementId) ?? null,
    [activeManagementId, managements],
  );
  const stats = useMemo(() => buildStats(entries), [entries]);
  const activity = useMemo(() => buildActivity(entries), [entries]);
  const analytics = useMemo(() => buildAnalytics(entries, categories), [entries, categories]);

  const value: CashflowDataState = useMemo(() => ({
    isReady,
    isSwitchingManagement,
    activeManagementId,
    activeManagement,
    managements,
    categories,
    overallBudgets,
    quickFills,
    recurringEntries,
    entries,
    stats: entries.length > 0 ? stats : emptyCashflowStats,
    activity: entries.length > 0 ? activity : emptyActivity,
    analytics: entries.length > 0 ? analytics : emptyAnalytics,
    setActiveManagementId: selectActiveManagement,
    setManagementImage: async (managementId: string, image: string, imageTheme: ManagementImageTheme | null) => {
      await withDbLock(() => persistManagementImage(db, managementId, image, imageTheme));
      await refresh();
    },
    updateManagementImageTheme: async (managementId: string, imageTheme: ManagementImageTheme) => {
      await withDbLock(() => updateManagementImageThemeInRepo(db, managementId, imageTheme));
      await refresh();
    },
    createManagement: async (input) => {
      await withDbLock(() => insertManagement(db, input));
      await refresh();
    },
    updateManagement: async (managementId: string, input: UpdateManagementInput) => {
      await withDbLock(() => updateManagementInRepo(db, managementId, input));
      await refresh();
    },
    deleteManagement: async (managementId: string) => {
      await withDbLock(() => softDeleteManagement(db, managementId));
      await refresh();
    },
    listManagementMembers: (managementId: string) => withDbLock(() => listManagementMembersFromRepo(db, managementId)),
    createCategory: async (input: CreateCategoryInput) => {
      if (!activeManagementId) return null;
      const categoryId = await withDbLock(() => insertCategory(db, activeManagementId, input));
      await refresh();
      return categoryId;
    },
    updateCategory: async (categoryId: string, input: UpdateCategoryInput) => {
      if (!activeManagementId) return;
      await withDbLock(() => updateCategoryInRepo(db, activeManagementId, categoryId, input));
      await refresh();
    },
    deleteCategory: async (id: string) => {
      if (!activeManagementId) return;
      await withDbLock(() => softDeleteCategory(db, activeManagementId, id));
      await refresh();
    },
    updateOverallBudget: async (period: BudgetPeriod, nominal: number | null) => {
      if (!activeManagementId) return;
      await withDbLock(() => persistOverallBudget(db, activeManagementId, period, nominal));
      await refresh();
    },
    updateCategoryBudget: async (categoryId: string, period: BudgetPeriod, nominal: number | null) => {
      if (!activeManagementId) return;
      await withDbLock(() => persistCategoryBudget(db, activeManagementId, categoryId, period, nominal));
      await refresh();
    },
    createQuickFill: async (input: CreateQuickFillInput) => {
      if (!activeManagementId) return;
      await withDbLock(() => insertQuickFill(db, activeManagementId, input));
      await refresh();
    },
    deleteQuickFill: async (id: string) => {
      if (!activeManagementId) return;
      await withDbLock(() => softDeleteQuickFill(db, activeManagementId, id));
      await refresh();
    },
    createRecurringEntry: async (input: CreateRecurringEntryInput) => {
      if (!activeManagementId) return;
      const materialized = await withDbLock(async () => {
        await insertRecurringEntry(db, activeManagementId, input);
        return materializeDueRecurringEntries(db, activeManagementId);
      });
      await notifyMaterializedAutomaticEntriesAsync(materialized);
      await refresh();
    },
    deleteRecurringEntry: async (id: string) => {
      if (!activeManagementId) return;
      await withDbLock(() => softDeleteRecurringEntry(db, activeManagementId, id));
      await refresh();
    },
    createEntry: async (input: CreateEntryInput) => {
      if (!activeManagementId) return;
      await withDbLock(() => insertEntry(db, activeManagementId, input));
      await refreshEntries();
    },
    updateEntry: async (id: string, input: CreateEntryInput) => {
      if (!activeManagementId) return;
      await withDbLock(() => updateEntryInRepo(db, activeManagementId, id, input));
      await refreshEntries();
    },
    moveEntries: async (ids: string[], targetManagementId: string) => {
      if (!activeManagementId) return;
      await withDbLock(() => moveEntriesInRepo(db, activeManagementId, targetManagementId, ids));
      await refreshEntries();
    },
    deleteEntry: async (id: string) => {
      if (!activeManagementId) return;
      await withDbLock(() => softDeleteEntry(db, activeManagementId, id));
      await refreshEntries();
    },
    deleteEntries: async (ids: string[]) => {
      if (!activeManagementId) return;
      await withDbLock(() => deleteEntriesBulk(db, activeManagementId, ids));
      await refreshEntries();
    },
    createTransfer: async (input) => {
      await withDbLock(() => insertTransfer(db, input));
      await refresh();
    },
    refresh,
  }), [isReady, isSwitchingManagement, activeManagementId, activeManagement, managements, categories, overallBudgets, quickFills, recurringEntries, entries, stats, activity, analytics, db, refresh, refreshEntries, selectActiveManagement]);

  return <CashflowDataContext.Provider value={value}>{children}</CashflowDataContext.Provider>;
}

export function useCashflowData() {
  const value = useContext(CashflowDataContext);
  if (!value) {
    throw new Error("useCashflowData must be used within CashflowDataProvider");
  }
  return value;
}
