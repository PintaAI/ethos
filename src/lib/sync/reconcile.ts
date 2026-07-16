import type { SQLiteDatabase } from "expo-sqlite";
import {
  type BudgetPeriod,
  type CreateEntryBody,
  type Io,
  type RecurringFrequency,
  type ServerCategory,
  type ServerEntry,
  type ServerManagement,
  type ServerOverallBudget,
  type ServerQuickFill,
  type ServerRecurringEntry,
  type UpdateEntryBody,
} from "@/lib/api/types";
import {
  localCategoryColorToServer,
  localCategoryIconToServer,
  serverCategoryColorToLocal,
  serverCategoryIconToLocal,
} from "@/lib/categoryMapping";

function createId(prefix: string) {
  const randomUuid = globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomUuid}`;
}

export type EntryRow = {
  id: string;
  remote_id: string | null;
  name: string;
  nominal: number;
  original_nominal: number | null;
  original_currency: string | null;
  exchange_rate_to_idr: number | null;
  exchange_rate_at: string | null;
  category_id: string | null;
  date: string;
  io: "Income" | "Expenses";
  management_id: string;
  created_by_id: string | null;
  is_reconciliation: number;
  created_at: string;
  updated_at: string;
  sync_status: string;
};

export type EntryUpsertFields = {
  id: string;
  remote_id: string;
  name: string;
  nominal: number;
  original_nominal: number | null;
  original_currency: string | null;
  exchange_rate_to_idr: number | null;
  exchange_rate_at: string | null;
  category_id: string | null;
  date: string;
  io: "Income" | "Expenses";
  management_id: string;
  created_by_id: string | null;
  is_reconciliation: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_synced_at: string;
};

export async function resolveCategoryIdByName(
  db: SQLiteDatabase,
  managementId: string,
  categoryName: string | null,
): Promise<string | null> {
  if (!categoryName) return null;
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM categories WHERE management_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1`,
    managementId,
    categoryName,
  );
  return row?.id ?? null;
}

export function serverEntryToLocal(
  server: ServerEntry,
  managementId: string,
  nowIso: string,
): EntryUpsertFields {
  if (!server.io) throw new Error("Server entry is missing io");

  return {
    id: createId("entry"),
    remote_id: server.id,
    name: server.name,
    nominal: server.nominal,
    original_nominal: server.originalNominal ?? null,
    original_currency: server.originalCurrency ?? null,
    exchange_rate_to_idr: server.exchangeRateToIdr ?? null,
    exchange_rate_at: server.exchangeRateAt ?? null,
    category_id: null,
    date: server.date ?? "",
    io: server.io,
    management_id: managementId,
    created_by_id: null,
    is_reconciliation: 0,
    created_at: server.createdAt ?? nowIso,
    updated_at: server.updatedAt ?? nowIso,
    deleted_at: null,
    last_synced_at: nowIso,
  };
}

export async function localEntryToCreate(
  db: SQLiteDatabase,
  local: EntryRow,
): Promise<CreateEntryBody | null> {
  const managementId = await getManagementRemoteId(db, local.management_id);
  if (!managementId) return null;

  let categoryName: string | undefined;
  if (local.category_id) {
    const row = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      local.category_id,
    );
    if (row?.name) categoryName = row.name;
  }

  const body: CreateEntryBody = {
    name: local.name,
    nominal: local.nominal,
    io: local.io,
    date: local.date || undefined,
    managementId,
  };
  if (categoryName) body.category = categoryName;
  if (local.original_nominal != null) body.originalNominal = local.original_nominal;
  if (local.original_currency) body.originalCurrency = local.original_currency;
  if (local.exchange_rate_to_idr != null) body.exchangeRateToIdr = local.exchange_rate_to_idr;
  if (local.exchange_rate_at) body.exchangeRateAt = local.exchange_rate_at;
  return body;
}

export async function localEntryToUpdate(
  db: SQLiteDatabase,
  local: EntryRow,
): Promise<UpdateEntryBody | null> {
  return localEntryToCreate(db, local);
}

export function lwwNewer(
  serverUpdatedAt: string | null | undefined,
  localUpdatedAt: string,
): boolean {
  if (!serverUpdatedAt) return false;
  const serverTime = new Date(serverUpdatedAt).getTime();
  const localTime = new Date(localUpdatedAt).getTime();
  if (Number.isNaN(serverTime) || Number.isNaN(localTime)) return false;
  return serverTime > localTime;
}

// ---------------------------------------------------------------------------
// Management lookups (server remote_id <-> local id)
// ---------------------------------------------------------------------------

export type ManagementLite = { id: string; remote_id: string };

export async function listLocalManagementsWithRemoteId(
  db: SQLiteDatabase,
): Promise<ManagementLite[]> {
  const rows = await db.getAllAsync<{ id: string; remote_id: string }>(
    `SELECT id, remote_id FROM managements WHERE remote_id IS NOT NULL AND deleted_at IS NULL`,
  );
  return rows.map((row) => ({ id: row.id, remote_id: row.remote_id }));
}

export async function getManagementRemoteId(db: SQLiteDatabase, localManagementId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ remote_id: string }>(
    `SELECT remote_id FROM managements WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    localManagementId,
  );
  return row?.remote_id ?? null;
}

export async function getManagementLocalIdByRemoteId(db: SQLiteDatabase, remoteId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM managements WHERE remote_id = ? AND deleted_at IS NULL LIMIT 1`,
    remoteId,
  );
  return row?.id ?? null;
}

export async function getLocalCategoryIdByRemoteId(
  db: SQLiteDatabase,
  remoteId: string | null,
): Promise<string | null> {
  if (!remoteId) return null;
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM categories WHERE remote_id = ? AND deleted_at IS NULL LIMIT 1`,
    remoteId,
  );
  return row?.id ?? null;
}

export async function getLocalCategoryRemoteIdByLocalId(
  db: SQLiteDatabase,
  localCategoryId: string | null,
): Promise<string | null> {
  if (!localCategoryId) return null;
  const row = await db.getFirstAsync<{ remote_id: string }>(
    `SELECT remote_id FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    localCategoryId,
  );
  return row?.remote_id ?? null;
}

export async function adoptLocalCategoryByMgmtAndName(
  db: SQLiteDatabase,
  remoteId: string,
  localManagementId: string,
  name: string,
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM categories WHERE management_id = ? AND name = ? AND remote_id IS NULL AND deleted_at IS NULL LIMIT 1`,
    localManagementId,
    name,
  );
  if (existing) {
    await db.runAsync(
      `UPDATE categories SET remote_id = ?, deleted_at = NULL WHERE id = ?`,
      remoteId,
      existing.id,
    );
  }
}

export async function adoptLocalOverallBudgetByMgmtAndPeriod(
  db: SQLiteDatabase,
  remoteId: string,
  localManagementId: string,
  period: string,
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM overall_budgets WHERE management_id = ? AND period = ? AND remote_id IS NULL AND deleted_at IS NULL LIMIT 1`,
    localManagementId,
    period,
  );
  if (existing) {
    await db.runAsync(
      `UPDATE overall_budgets SET remote_id = ?, deleted_at = NULL WHERE id = ?`,
      remoteId,
      existing.id,
    );
  }
}

// ---------------------------------------------------------------------------
// Managements
// ---------------------------------------------------------------------------

export type ManagementRow = {
  id: string;
  remote_id: string | null;
  name: string;
  image: string | null;
  image_theme_json: string | null;
  created_at: string;
  updated_at: string;
  sync_status: string;
};

export type ManagementUpsertFields = {
  id: string;
  remote_id: string;
  name: string;
  image: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_synced_at: string;
};

export function serverManagementToLocal(
  server: ServerManagement,
  nowIso: string,
): ManagementUpsertFields {
  return {
    id: createId("management"),
    remote_id: server.id,
    name: server.name,
    image: server.image ?? null,
    member_count: server.memberCount ?? 0,
    created_at: server.createdAt ?? nowIso,
    updated_at: server.updatedAt ?? nowIso,
    deleted_at: null,
    last_synced_at: nowIso,
  };
}

export function localManagementToCreate(local: ManagementRow): { name: string } {
  return { name: local.name };
}

export function localManagementToUpdate(local: ManagementRow): { name: string } {
  return { name: local.name };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategoryRow = {
  id: string;
  remote_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  budget_daily: number | null;
  budget_weekly: number | null;
  budget_monthly: number | null;
  budget_yearly: number | null;
  management_id: string;
  created_at: string;
  updated_at: string;
  sync_status: string;
};

export type CategoryUpsertFields = {
  id: string;
  remote_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  budget_daily: number | null;
  budget_weekly: number | null;
  budget_monthly: number | null;
  budget_yearly: number | null;
  management_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_synced_at: string;
};

export type CategoryBudgetsBody = Record<string, number>;

export type CategoryCreateBody = {
  name: string;
  color?: string;
  icon?: string;
  budgets?: CategoryBudgetsBody;
  managementId: string;
};

export type CategoryUpdateBody = CategoryCreateBody;

export function serverCategoryToLocal(
  server: ServerCategory,
  localManagementId: string,
  nowIso: string,
): CategoryUpsertFields {
  return {
    id: createId("category"),
    remote_id: server.id,
    name: server.name,
    color: serverCategoryColorToLocal(server.color),
    icon: serverCategoryIconToLocal(server.icon),
    budget_daily: server.budgetDaily ?? null,
    budget_weekly: server.budgetWeekly ?? null,
    budget_monthly: server.budgetMonthly ?? null,
    budget_yearly: server.budgetYearly ?? null,
    management_id: localManagementId,
    created_at: server.createdAt ?? nowIso,
    updated_at: server.updatedAt ?? nowIso,
    deleted_at: null,
    last_synced_at: nowIso,
  };
}

function categoryBudgetsBody(local: CategoryRow): CategoryBudgetsBody | undefined {
  const entries: [string, number][] = [];
  if (local.budget_daily != null) entries.push(["budgetDaily", local.budget_daily]);
  if (local.budget_weekly != null) entries.push(["budgetWeekly", local.budget_weekly]);
  if (local.budget_monthly != null) entries.push(["budgetMonthly", local.budget_monthly]);
  if (local.budget_yearly != null) entries.push(["budgetYearly", local.budget_yearly]);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

export async function localCategoryToCreate(
  db: SQLiteDatabase,
  local: CategoryRow,
): Promise<CategoryCreateBody | null> {
  const managementId = await getManagementRemoteId(db, local.management_id);
  if (!managementId) return null;
  const body: CategoryCreateBody = { name: local.name, managementId };
  const serverColor = localCategoryColorToServer(local.color);
  const serverIcon = localCategoryIconToServer(local.icon);
  if (serverColor) body.color = serverColor;
  if (serverIcon) body.icon = serverIcon;
  const budgets = categoryBudgetsBody(local);
  if (budgets) body.budgets = budgets;
  return body;
}

export async function localCategoryToUpdate(
  db: SQLiteDatabase,
  local: CategoryRow,
): Promise<CategoryUpdateBody | null> {
  return localCategoryToCreate(db, local);
}

// ---------------------------------------------------------------------------
// Quick fills
// ---------------------------------------------------------------------------

export type QuickFillRow = {
  id: string;
  remote_id: string | null;
  label: string;
  amount: number | null;
  category_id: string | null;
  management_id: string;
  created_at: string;
  updated_at: string;
  sync_status: string;
};

export type QuickFillUpsertFields = {
  id: string;
  remote_id: string;
  label: string;
  amount: number | null;
  category_id: string | null;
  management_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_synced_at: string;
};

export type QuickFillCreateBody = {
  name: string;
  nominal: number;
  managementId: string;
  categoryId?: string;
};

export type QuickFillUpdateBody = QuickFillCreateBody;

export function serverQuickFillToLocal(
  server: ServerQuickFill,
  localManagementId: string,
  localCategoryId: string | null,
  nowIso: string,
): QuickFillUpsertFields {
  return {
    id: createId("quick-fill"),
    remote_id: server.id,
    label: server.name,
    amount: server.nominal ?? null,
    category_id: localCategoryId,
    management_id: localManagementId,
    created_at: server.createdAt ?? nowIso,
    updated_at: server.updatedAt ?? nowIso,
    deleted_at: null,
    last_synced_at: nowIso,
  };
}

async function quickFillBody(
  db: SQLiteDatabase,
  local: QuickFillRow,
): Promise<QuickFillCreateBody | null> {
  const managementId = await getManagementRemoteId(db, local.management_id);
  if (!managementId) return null;
  const body: QuickFillCreateBody = {
    name: local.label,
    nominal: local.amount ?? 0,
    managementId,
  };
  if (local.category_id) {
    const catRemote = await getLocalCategoryRemoteIdByLocalId(db, local.category_id);
    if (catRemote) body.categoryId = catRemote;
  }
  return body;
}

export function localQuickFillToCreate(db: SQLiteDatabase, local: QuickFillRow): Promise<QuickFillCreateBody | null> {
  return quickFillBody(db, local);
}

export function localQuickFillToUpdate(db: SQLiteDatabase, local: QuickFillRow): Promise<QuickFillUpdateBody | null> {
  return quickFillBody(db, local);
}

// ---------------------------------------------------------------------------
// Overall budgets
// ---------------------------------------------------------------------------

export type OverallBudgetRow = {
  id: string;
  remote_id: string | null;
  management_id: string;
  period: BudgetPeriod;
  nominal: number;
  created_at: string;
  updated_at: string;
  sync_status: string;
};

export type OverallBudgetUpsertFields = {
  id: string;
  remote_id: string;
  management_id: string;
  period: BudgetPeriod;
  nominal: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_synced_at: string;
};

export type OverallBudgetUpsertBody = {
  period: BudgetPeriod;
  amount: number;
  managementId: string;
};

export function serverOverallBudgetToLocal(
  server: ServerOverallBudget,
  localManagementId: string,
  nowIso: string,
): OverallBudgetUpsertFields {
  return {
    id: createId("overall-budget"),
    remote_id: server.id,
    management_id: localManagementId,
    period: server.period,
    nominal: server.amount,
    created_at: server.createdAt ?? nowIso,
    updated_at: server.updatedAt ?? nowIso,
    deleted_at: null,
    last_synced_at: nowIso,
  };
}

export async function localOverallBudgetToUpsert(
  db: SQLiteDatabase,
  local: OverallBudgetRow,
): Promise<OverallBudgetUpsertBody | null> {
  const managementId = await getManagementRemoteId(db, local.management_id);
  if (!managementId) return null;
  return { period: local.period, amount: local.nominal, managementId };
}

// ---------------------------------------------------------------------------
// Recurring entries
// ---------------------------------------------------------------------------

export type RecurringEntryRow = {
  id: string;
  remote_id: string | null;
  name: string;
  nominal: number;
  category_id: string | null;
  io: Io;
  management_id: string;
  frequency: RecurringFrequency;
  next_date: string;
  created_at: string;
  updated_at: string;
  sync_status: string;
};

export type RecurringEntryUpsertFields = {
  id: string;
  remote_id: string;
  name: string;
  nominal: number;
  category_id: string | null;
  io: Io;
  management_id: string;
  frequency: RecurringFrequency;
  next_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_synced_at: string;
};

export type RecurringEntryCreateBody = {
  name: string;
  nominal: number;
  io: Io;
  frequency: RecurringFrequency;
  startDate: string;
  managementId: string;
  categoryId?: string;
};

export type RecurringEntryUpdateBody = RecurringEntryCreateBody;

function todayDateKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function serverRecurringToLocal(
  server: ServerRecurringEntry,
  localManagementId: string,
  localCategoryId: string | null,
  nowIso: string,
): RecurringEntryUpsertFields {
  return {
    id: createId("recurring-entry"),
    remote_id: server.id,
    name: server.name,
    nominal: server.nominal,
    category_id: localCategoryId,
    io: server.io,
    management_id: localManagementId,
    frequency: server.frequency,
    next_date: server.lastGenerated ?? server.startDate,
    created_at: server.createdAt ?? nowIso,
    updated_at: server.updatedAt ?? nowIso,
    deleted_at: null,
    last_synced_at: nowIso,
  };
}

async function recurringBody(
  db: SQLiteDatabase,
  local: RecurringEntryRow,
): Promise<RecurringEntryCreateBody | null> {
  const managementId = await getManagementRemoteId(db, local.management_id);
  if (!managementId) return null;
  const body: RecurringEntryCreateBody = {
    name: local.name,
    nominal: local.nominal,
    io: local.io,
    frequency: local.frequency,
    startDate: local.next_date || todayDateKey(),
    managementId,
  };
  if (local.category_id) {
    const catRemote = await getLocalCategoryRemoteIdByLocalId(db, local.category_id);
    if (catRemote) body.categoryId = catRemote;
  }
  return body;
}

export function localRecurringToCreate(db: SQLiteDatabase, local: RecurringEntryRow): Promise<RecurringEntryCreateBody | null> {
  return recurringBody(db, local);
}

export function localRecurringToUpdate(db: SQLiteDatabase, local: RecurringEntryRow): Promise<RecurringEntryUpdateBody | null> {
  return recurringBody(db, local);
}
