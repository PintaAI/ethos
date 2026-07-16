import type { ActivityOverview } from "@/components/cashflow/ActivityHeatmap";
import type { CashflowEntry } from "@/components/cashflow/CashflowTable";
import type { CashflowStats } from "@/components/cashflow/CashflowStatsCard";
import type { ThemeSet } from "@/components/AppTheme";

export type SyncStatus = "synced" | "pending" | "updated" | "deleted" | "conflict";
export type BudgetPeriod = "daily" | "weekly" | "monthly";
export type RecurringFrequency = "daily" | "weekly" | "monthly";

export type CashflowManagement = {
  id: string;
  remoteId: string | null;
  name: string;
  image: string | null;
  imageTheme: ManagementImageTheme | null;
  createdAt: string;
  updatedAt: string;
  balance: number;
  entryCount: number;
  memberCount: number;
};

export type ManagementImageTheme = {
  version: 1;
  image: string;
  themeSlug: string;
  themeSet: ThemeSet;
};

export type CashflowManagementMember = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  role: string;
};

export type UpdateManagementInput = {
  name: string;
  image: string | null;
};

export type CreateManagementInput = UpdateManagementInput;

export type CashflowCategory = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  budgetDaily: number | null;
  budgetWeekly: number | null;
  budgetMonthly: number | null;
  managementId: string;
};

export type CashflowOverallBudget = {
  id: string;
  managementId: string;
  period: BudgetPeriod;
  nominal: number;
};

export type CashflowQuickFill = {
  id: string;
  label: string;
  amount: number | null;
  categoryId: string | null;
  managementId: string;
};

export type CashflowRecurringEntry = {
  id: string;
  name: string;
  nominal: number;
  categoryId: string | null;
  managementId: string;
  io: "Income" | "Expenses";
  frequency: RecurringFrequency;
  nextDate: string;
};

export type CreateEntryInput = {
  name: string;
  nominal: number;
  originalNominal?: number;
  originalCurrency?: string;
  exchangeRateToIdr?: number;
  exchangeRateAt?: string;
  categoryId: string | null;
  date: string;
  io: "Income" | "Expenses";
};

export type CreateTransferInput = {
  fromManagementId: string;
  toManagementId: string;
  nominal: number;
  originalNominal?: number;
  originalCurrency?: string;
  exchangeRateToIdr?: number;
  exchangeRateAt?: string;
  date: string;
  note?: string;
};

export type CreateCategoryInput = {
  name: string;
  color: string | null;
  icon: string | null;
};

export type UpdateCategoryInput = CreateCategoryInput;

export type CreateQuickFillInput = {
  label: string;
  amount: number | null;
  categoryId: string | null;
};

export type CreateRecurringEntryInput = {
  name: string;
  nominal: number;
  categoryId: string | null;
  io: "Income" | "Expenses";
  frequency: RecurringFrequency;
  nextDate: string;
};

export type CashflowAnalytics = {
  summary: { totalIncome: number; totalExpenses: number; balance: number; entryCount: number };
  byCategory: { category: string; color?: string; total: number; count: number; percentage: number }[];
  byMonth: { month: string; monthLabel: string; income: number; expenses: number }[];
  byCreator: { name: string | null; totalIncome: number; totalExpenses: number; entryCount: number }[];
};

export type CashflowDataState = {
  isReady: boolean;
  activeManagementId: string | null;
  activeManagement: CashflowManagement | null;
  managements: CashflowManagement[];
  categories: CashflowCategory[];
  overallBudgets: CashflowOverallBudget[];
  quickFills: CashflowQuickFill[];
  recurringEntries: CashflowRecurringEntry[];
  entries: CashflowEntry[];
  stats: CashflowStats;
  activity: ActivityOverview;
  analytics: CashflowAnalytics;
  setActiveManagementId: (managementId: string) => Promise<void>;
  setManagementImage: (managementId: string, image: string, imageTheme: ManagementImageTheme | null) => Promise<void>;
  updateManagementImageTheme: (managementId: string, imageTheme: ManagementImageTheme) => Promise<void>;
  createManagement: (input: CreateManagementInput) => Promise<void>;
  updateManagement: (managementId: string, input: UpdateManagementInput) => Promise<void>;
  deleteManagement: (managementId: string) => Promise<void>;
  listManagementMembers: (managementId: string) => Promise<CashflowManagementMember[]>;
  createCategory: (input: CreateCategoryInput) => Promise<void>;
  updateCategory: (categoryId: string, input: UpdateCategoryInput) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updateOverallBudget: (period: BudgetPeriod, nominal: number | null) => Promise<void>;
  updateCategoryBudget: (categoryId: string, period: BudgetPeriod, nominal: number | null) => Promise<void>;
  createQuickFill: (input: CreateQuickFillInput) => Promise<void>;
  deleteQuickFill: (id: string) => Promise<void>;
  createRecurringEntry: (input: CreateRecurringEntryInput) => Promise<void>;
  deleteRecurringEntry: (id: string) => Promise<void>;
  createEntry: (input: CreateEntryInput) => Promise<void>;
  updateEntry: (id: string, input: CreateEntryInput) => Promise<void>;
  moveEntries: (ids: string[], targetManagementId: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  deleteEntries: (ids: string[]) => Promise<void>;
  createTransfer: (input: CreateTransferInput) => Promise<void>;
  refresh: () => Promise<void>;
};
