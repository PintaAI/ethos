import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import type { ActivityOverview } from "@/components/cashflow/ActivityHeatmap";
import type { CashflowEntry } from "@/components/cashflow/CashflowTable";
import type { CashflowStats } from "@/components/cashflow/CashflowStatsCard";
import { addDays, formatLocalizedDate, getWeekNumber, getWeekStartEnd, parseDateKey, toDateKey } from "@/lib/date";
import type {
  BudgetPeriod,
  CashflowAnalytics,
  CashflowCategory,
  CashflowManagement,
  CashflowManagementMember,
  CashflowOverallBudget,
  CashflowQuickFill,
  CashflowRecurringEntry,
  CreateCategoryInput,
  CreateEntryInput,
  CreateTransferInput,
  CreateManagementInput,
  CreateQuickFillInput,
  CreateRecurringEntryInput,
  ManagementImageTheme,
  RecurringFrequency,
  UpdateManagementInput,
} from "./types";
import type { CategoryHistoryItem } from "./categorySuggestions";
import { takeDueRecurringDates } from "./recurringMaterialization";

type ManagementRow = {
  id: string;
  remote_id: string | null;
  name: string;
  image: string | null;
  image_theme_json: string | null;
  created_at: string;
  updated_at: string;
  balance: number | null;
  entry_count: number;
  member_count: number;
};

type EntryRow = {
  id: string;
  name: string;
  nominal: number;
  original_nominal: number | null;
  original_currency: string | null;
  exchange_rate_to_idr: number | null;
  exchange_rate_at: string | null;
  category: string | null;
  category_color: string | null;
  category_icon: string | null;
  created_by: string | null;
  date: string;
  io: "Income" | "Expenses";
};

type ManagementMemberRow = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  role: string;
};

type CategoryRow = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  budget_daily: number | null;
  budget_weekly: number | null;
  budget_monthly: number | null;
  management_id: string;
};

type OverallBudgetRow = {
  id: string;
  management_id: string;
  period: BudgetPeriod;
  nominal: number;
};

type QuickFillRow = {
  id: string;
  label: string;
  amount: number | null;
  category_id: string | null;
  management_id: string;
};

type RecurringEntryRow = {
  id: string;
  name: string;
  nominal: number;
  category_id: string | null;
  management_id: string;
  io: "Income" | "Expenses";
  frequency: RecurringFrequency;
  next_date: string;
};

type EntryWriter = Pick<SQLiteDatabase, "getFirstAsync" | "runAsync">;
type RecurringEntryWriter = Pick<SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

export type MaterializedRecurringEntry = {
  recurringEntryId: string;
  managementId: string;
  name: string;
  date: string;
};

export const RECURRING_MATERIALIZATION_LIMIT = 50;

const EMPTY_STATS: CashflowStats = {
  totalIncome: 0,
  totalExpenses: 0,
  balance: 0,
  currentDay: { income: 0, expenses: 0 },
  currentWeek: { weekNumber: 0, range: "", income: 0, expenses: 0 },
  currentMonth: { label: "", income: 0, expenses: 0 },
  topExpenseCategories: [],
};

function nowIso() {
  return new Date().toISOString();
}

function parseManagementImageTheme(value: string | null): ManagementImageTheme | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ManagementImageTheme>;
    if (parsed.version !== 1 || !parsed.image || !parsed.themeSlug || !parsed.themeSet?.light || !parsed.themeSet.dark) return null;
    return parsed as ManagementImageTheme;
  } catch {
    return null;
  }
}

function createId(prefix: string) {
  const randomUuid = globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomUuid}`;
}

function mapManagement(row: ManagementRow): CashflowManagement {
  return {
    id: row.id,
    remoteId: row.remote_id,
    name: row.name,
    image: row.image,
    imageTheme: parseManagementImageTheme(row.image_theme_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    balance: row.balance ?? 0,
    entryCount: row.entry_count,
    memberCount: row.member_count,
  };
}

function mapEntry(row: EntryRow): CashflowEntry {
  return {
    id: row.id,
    name: row.name,
    nominal: row.nominal,
    originalNominal: row.original_nominal,
    originalCurrency: row.original_currency,
    exchangeRateToIdr: row.exchange_rate_to_idr,
    exchangeRateAt: row.exchange_rate_at,
    category: row.category,
    categoryColor: row.category_color,
    categoryIcon: row.category_icon,
    createdBy: row.created_by,
    date: row.date,
    io: row.io,
  };
}

function mapRecurringEntry(row: RecurringEntryRow): CashflowRecurringEntry {
  return {
    id: row.id,
    name: row.name,
    nominal: row.nominal,
    categoryId: row.category_id,
    managementId: row.management_id,
    io: row.io,
    frequency: row.frequency,
    nextDate: row.next_date,
  };
}

export async function getActiveManagementId(db: SQLiteDatabase) {
  const preference = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_preferences WHERE key = 'active_management_id'");
  if (preference?.value) {
    const activeManagement = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM managements WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      preference.value,
    );
    if (activeManagement) return activeManagement.id;
  }

  const firstManagement = await db.getFirstAsync<{ id: string }>("SELECT id FROM managements WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1");
  if (!firstManagement) return null;

  await setActiveManagementId(db, firstManagement.id);
  return firstManagement.id;
}

export async function setActiveManagementId(db: SQLiteDatabase, managementId: string) {
  await db.runAsync(
    `INSERT INTO app_preferences (key, value) VALUES ('active_management_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    managementId,
  );
}

export async function listManagements(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<ManagementRow>(`
    SELECT
      m.id,
      m.remote_id,
      m.name,
      m.image,
      m.image_theme_json,
      m.created_at,
      m.updated_at,
      COALESCE(e.balance, 0) AS balance,
      COALESCE(e.entry_count, 0) AS entry_count,
      MAX(COALESCE(m.member_count, 0), COALESCE(mm.member_count, 0)) AS member_count
    FROM managements m
    LEFT JOIN (
      SELECT
        management_id,
        SUM(CASE WHEN io = 'Income' THEN nominal ELSE -nominal END) AS balance,
        COUNT(id) AS entry_count
      FROM entries
      WHERE deleted_at IS NULL
      GROUP BY management_id
    ) e ON e.management_id = m.id
    LEFT JOIN (
      SELECT management_id, COUNT(id) AS member_count
      FROM management_members
      WHERE deleted_at IS NULL
      GROUP BY management_id
    ) mm ON mm.management_id = m.id
    WHERE m.deleted_at IS NULL
    ORDER BY m.created_at ASC
  `);
  return rows.map(mapManagement);
}

export async function listManagementMembers(db: SQLiteDatabase, managementId: string): Promise<CashflowManagementMember[]> {
  const rows = await db.getAllAsync<ManagementMemberRow>(
    `SELECT mm.id, u.name, u.email, u.image, mm.role
     FROM management_members mm
     INNER JOIN users u ON u.id = mm.user_id AND u.deleted_at IS NULL
     WHERE mm.management_id = ? AND mm.deleted_at IS NULL
     ORDER BY CASE mm.role WHEN 'owner' THEN 1 ELSE 2 END, u.name`,
    managementId,
  );

  return rows.map((row) => ({ id: row.id, name: row.name, email: row.email, image: row.image, role: row.role }));
}

export async function listCategories(db: SQLiteDatabase, managementId: string): Promise<CashflowCategory[]> {
  const rows = await db.getAllAsync<CategoryRow>(
    `SELECT id, name, color, icon, budget_daily, budget_weekly, budget_monthly, management_id
     FROM categories
     WHERE management_id = ? AND deleted_at IS NULL
     ORDER BY name`,
    managementId,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    budgetDaily: row.budget_daily,
    budgetWeekly: row.budget_weekly,
    budgetMonthly: row.budget_monthly,
    managementId: row.management_id,
  }));
}

export async function listOverallBudgets(db: SQLiteDatabase, managementId: string): Promise<CashflowOverallBudget[]> {
  const rows = await db.getAllAsync<OverallBudgetRow>(
    `SELECT id, management_id, period, nominal
     FROM overall_budgets
     WHERE management_id = ? AND deleted_at IS NULL AND period IN ('daily', 'weekly', 'monthly')
     ORDER BY CASE period WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2 ELSE 3 END`,
    managementId,
  );

  return rows.map((row) => ({ id: row.id, managementId: row.management_id, period: row.period, nominal: row.nominal }));
}

export async function listQuickFills(db: SQLiteDatabase, managementId: string): Promise<CashflowQuickFill[]> {
  const rows = await db.getAllAsync<QuickFillRow>(
    `SELECT id, label, amount, category_id, management_id
     FROM quick_fills
     WHERE management_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    managementId,
  );

  return rows.map((row) => ({ id: row.id, label: row.label, amount: row.amount, categoryId: row.category_id, managementId: row.management_id }));
}

export async function listRecurringEntries(db: SQLiteDatabase, managementId: string): Promise<CashflowRecurringEntry[]> {
  const rows = await db.getAllAsync<RecurringEntryRow>(
    `SELECT id, name, nominal, category_id, management_id, io, frequency, next_date
     FROM recurring_entries
     WHERE management_id = ? AND deleted_at IS NULL
     ORDER BY next_date ASC, created_at ASC`,
    managementId,
  );

  return rows.map(mapRecurringEntry);
}

type MaterializeRecurringOptions = {
  limit?: number;
  shouldCancel?: () => boolean;
};

async function materializeDueRecurringEntriesWithWriter(
  db: RecurringEntryWriter,
  managementId: string,
  options: MaterializeRecurringOptions = {},
) {
  const today = toDateKey(new Date());
  const rows = await db.getAllAsync<RecurringEntryRow>(
    `SELECT id, name, nominal, category_id, management_id, io, frequency, next_date
     FROM recurring_entries
     WHERE management_id = ? AND deleted_at IS NULL AND next_date <= ?
     ORDER BY next_date ASC, created_at ASC`,
    managementId,
    today,
  );
  const materialized: MaterializedRecurringEntry[] = [];
  const limit = Math.max(0, options.limit ?? RECURRING_MATERIALIZATION_LIMIT);

  for (const row of rows) {
    if (materialized.length >= limit || options.shouldCancel?.()) break;
    const batch = takeDueRecurringDates(row.next_date, row.frequency, today, limit - materialized.length);

    for (const entryDate of batch.dates) {
      if (options.shouldCancel?.()) throw new Error("Recurring entry materialization expired");
      await createEntry(db, managementId, {
        name: row.name,
        nominal: row.nominal,
        categoryId: row.category_id,
        date: entryDate,
        io: row.io,
      });
      materialized.push({
        recurringEntryId: row.id,
        managementId,
        name: row.name,
        date: entryDate,
      });
    }

    await db.runAsync(
      `UPDATE recurring_entries SET
         next_date = ?,
         updated_at = ?,
         sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'updated' END
       WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
      batch.nextDate,
      nowIso(),
      row.id,
      managementId,
    );
  }

  return materialized;
}

export async function materializeDueRecurringEntries(db: SQLiteDatabase, managementId: string) {
  if (Platform.OS === "web") {
    return materializeDueRecurringEntriesWithWriter(db, managementId);
  }

  let materialized: MaterializedRecurringEntry[] = [];
  await db.withExclusiveTransactionAsync(async (transaction) => {
    materialized = await materializeDueRecurringEntriesWithWriter(transaction, managementId);
  });
  return materialized;
}

export async function materializeAllDueRecurringEntries(
  db: SQLiteDatabase,
  options: MaterializeRecurringOptions = {},
) {
  const managements = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM managements WHERE deleted_at IS NULL",
  );
  const materialized: MaterializedRecurringEntry[] = [];
  const limit = Math.max(0, options.limit ?? RECURRING_MATERIALIZATION_LIMIT);

  for (const management of managements) {
    const remaining = Math.max(0, limit - materialized.length);
    if (remaining === 0 || options.shouldCancel?.()) break;
    if (Platform.OS === "web") {
      materialized.push(...await materializeDueRecurringEntriesWithWriter(db, management.id, {
        ...options,
        limit: remaining,
      }));
    } else {
      let batch: MaterializedRecurringEntry[] = [];
      await db.withExclusiveTransactionAsync(async (transaction) => {
        batch = await materializeDueRecurringEntriesWithWriter(transaction, management.id, {
          ...options,
          limit: remaining,
        });
      });
      materialized.push(...batch);
    }
  }

  return materialized;
}

export async function createQuickFill(db: SQLiteDatabase, managementId: string, input: CreateQuickFillInput) {
  const trimmedLabel = input.label.trim();
  if (!trimmedLabel) return;

  const createdAt = nowIso();

  await db.runAsync(
    `INSERT INTO quick_fills (id, label, amount, category_id, management_id, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    createId("quick-fill"),
    trimmedLabel,
    input.amount && input.amount > 0 ? input.amount : null,
    input.categoryId,
    managementId,
    createdAt,
    createdAt,
  );
}

export async function deleteQuickFill(db: SQLiteDatabase, managementId: string, quickFillId: string) {
  const updatedAt = nowIso();

  await db.runAsync(
    `UPDATE quick_fills SET
       deleted_at = ?,
       updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'deleted' END
     WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
    updatedAt,
    updatedAt,
    quickFillId,
    managementId,
  );
}

export async function createRecurringEntry(db: SQLiteDatabase, managementId: string, input: CreateRecurringEntryInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName || input.nominal <= 0) return;

  const createdAt = nowIso();

  await db.runAsync(
    `INSERT INTO recurring_entries (id, name, nominal, category_id, io, management_id, frequency, next_date, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    createId("recurring-entry"),
    trimmedName,
    input.nominal,
    input.categoryId,
    input.io,
    managementId,
    input.frequency,
    input.nextDate,
    createdAt,
    createdAt,
  );
}

export async function deleteRecurringEntry(db: SQLiteDatabase, managementId: string, recurringEntryId: string) {
  const updatedAt = nowIso();

  await db.runAsync(
    `UPDATE recurring_entries SET
       deleted_at = ?,
       updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'deleted' END
     WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
    updatedAt,
    updatedAt,
    recurringEntryId,
    managementId,
  );
}

export async function listEntries(db: SQLiteDatabase, managementId: string): Promise<CashflowEntry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT e.id, e.name, e.nominal, e.original_nominal, e.original_currency, e.exchange_rate_to_idr, e.exchange_rate_at, c.name AS category, c.color AS category_color, c.icon AS category_icon, u.name AS created_by, e.date, e.io
     FROM entries e
     LEFT JOIN categories c ON c.id = e.category_id AND c.deleted_at IS NULL
     LEFT JOIN users u ON u.id = e.created_by_id AND u.deleted_at IS NULL
     WHERE e.management_id = ? AND e.deleted_at IS NULL
     ORDER BY e.date DESC, e.created_at DESC, e.id DESC`,
    managementId,
  );

  return rows.map(mapEntry);
}

export async function listCategoryHistory(
  db: SQLiteDatabase,
  managementId: string,
  io: "Income" | "Expenses",
  authenticatedUserId?: string,
): Promise<CategoryHistoryItem[]> {
  const localUser = authenticatedUserId
    ? await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM users WHERE (id = ? OR remote_id = ?) AND deleted_at IS NULL LIMIT 1",
        authenticatedUserId,
        authenticatedUserId,
      )
    : null;
  const rows = await db.getAllAsync<{
    category_id: string;
    name: string;
    date: string;
    created_at: string;
    created_by_id: string | null;
  }>(
    `SELECT category_id, name, date, created_at, created_by_id
     FROM entries
     WHERE management_id = ? AND io = ? AND category_id IS NOT NULL AND deleted_at IS NULL`,
    managementId,
    io,
  );

  return rows.map((row) => ({
    categoryId: row.category_id,
    name: row.name,
    date: row.date,
    createdAt: row.created_at,
    personalWeight: localUser ? (row.created_by_id === localUser.id ? 1 : 0.25) : 1,
  }));
}

export async function createManagement(db: SQLiteDatabase, input: CreateManagementInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const createdAt = nowIso();
    const id = createId("management");
    const image = input.image?.trim() || null;
    const user = await txn.getFirstAsync<{ id: string }>("SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1");

    await txn.runAsync(
      "INSERT INTO managements (id, name, image, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'pending')",
      id,
      trimmedName,
      image,
      createdAt,
      createdAt,
    );

    if (user) {
      await txn.runAsync(
        "INSERT INTO management_members (id, management_id, user_id, role, created_at, updated_at, sync_status) VALUES (?, ?, ?, 'owner', ?, ?, 'pending')",
        createId("management-member"),
        id,
        user.id,
        createdAt,
        createdAt,
      );
    }

    await txn.runAsync(
      "INSERT INTO app_preferences (key, value) VALUES ('active_management_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      id,
    );
  });
}

export async function updateManagement(db: SQLiteDatabase, managementId: string, input: UpdateManagementInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) return;

  const updatedAt = nowIso();
  const image = input.image?.trim() || null;

  await db.runAsync(
    `UPDATE managements SET
       name = ?,
       image_theme_json = CASE WHEN image IS ? THEN image_theme_json ELSE NULL END,
       image = ?,
       updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'updated' END
     WHERE id = ? AND deleted_at IS NULL`,
    trimmedName,
    image,
    image,
    updatedAt,
    managementId,
  );
}

export async function deleteManagement(db: SQLiteDatabase, managementId: string) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const updatedAt = nowIso();

    await txn.runAsync(
      "UPDATE managements SET deleted_at = ?, updated_at = ?, sync_status = 'deleted' WHERE id = ? AND deleted_at IS NULL",
      updatedAt,
      updatedAt,
      managementId,
    );

    const activeRow = await txn.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_preferences WHERE key = 'active_management_id'",
    );
    if (activeRow?.value !== managementId) return;

    const nextManagement = await txn.getFirstAsync<{ id: string }>(
      "SELECT id FROM managements WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1",
    );

    if (nextManagement) {
      await txn.runAsync(
        "INSERT INTO app_preferences (key, value) VALUES ('active_management_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        nextManagement.id,
      );
    } else {
      await txn.runAsync("DELETE FROM app_preferences WHERE key = 'active_management_id'");
    }
  });
}

export async function updateManagementImageTheme(db: SQLiteDatabase, managementId: string, imageTheme: ManagementImageTheme) {
  await db.runAsync(
    `UPDATE managements SET image_theme_json = ? WHERE id = ? AND image = ? AND deleted_at IS NULL`,
    JSON.stringify(imageTheme),
    managementId,
    imageTheme.image,
  );
}

export async function setManagementImage(db: SQLiteDatabase, managementId: string, image: string, imageTheme: ManagementImageTheme | null) {
  await db.runAsync(
    `UPDATE managements SET image = ?, image_theme_json = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    image,
    imageTheme ? JSON.stringify(imageTheme) : null,
    nowIso(),
    managementId,
  );
}

export async function createCategory(db: SQLiteDatabase, managementId: string, input: CreateCategoryInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) return null;

  const createdAt = nowIso();
  const categoryId = createId("category");

  await db.runAsync(
    `INSERT INTO categories (id, name, color, icon, management_id, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(name, management_id) DO UPDATE SET
       color = excluded.color,
       icon = excluded.icon,
       updated_at = excluded.updated_at,
       deleted_at = NULL,
       sync_status = CASE WHEN categories.sync_status = 'pending' THEN 'pending' ELSE 'updated' END`,
    categoryId,
    trimmedName,
    input.color,
    input.icon,
    managementId,
    createdAt,
    createdAt,
  );

  const category = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM categories WHERE management_id = ? AND name = ? AND deleted_at IS NULL",
    managementId,
    trimmedName,
  );
  return category?.id ?? null;
}

export async function updateCategory(db: SQLiteDatabase, managementId: string, categoryId: string, input: CreateCategoryInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) return;

  const updatedAt = nowIso();

  await db.runAsync(
    `UPDATE categories SET
       name = ?,
       color = ?,
       icon = ?,
       updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'updated' END
     WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
    trimmedName,
    input.color,
    input.icon,
    updatedAt,
    categoryId,
    managementId,
  );
}

export async function deleteCategory(db: SQLiteDatabase, managementId: string, categoryId: string) {
  const updatedAt = nowIso();

  await db.runAsync(
    `UPDATE categories SET
       deleted_at = ?,
       updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'deleted' END
     WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
    updatedAt,
    updatedAt,
    categoryId,
    managementId,
  );
}

export async function updateOverallBudget(db: SQLiteDatabase, managementId: string, period: BudgetPeriod, nominal: number | null) {
  const updatedAt = nowIso();

  if (nominal === null || nominal <= 0) {
    await db.runAsync(
      `UPDATE overall_budgets SET
         deleted_at = ?,
         updated_at = ?,
         sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'deleted' END
       WHERE management_id = ? AND period = ? AND deleted_at IS NULL`,
      updatedAt,
      updatedAt,
      managementId,
      period,
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO overall_budgets (id, management_id, period, nominal, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(management_id, period) DO UPDATE SET
       nominal = excluded.nominal,
       updated_at = excluded.updated_at,
       deleted_at = NULL,
       sync_status = CASE WHEN overall_budgets.sync_status = 'pending' THEN 'pending' ELSE 'updated' END`,
    createId("overall-budget"),
    managementId,
    period,
    nominal,
    updatedAt,
    updatedAt,
  );
}

export async function updateCategoryBudget(db: SQLiteDatabase, managementId: string, categoryId: string, period: BudgetPeriod, nominal: number | null) {
  const updatedAt = nowIso();
  const columnByPeriod: Record<BudgetPeriod, string> = {
    daily: "budget_daily",
    weekly: "budget_weekly",
    monthly: "budget_monthly",
  };
  const column = columnByPeriod[period];

  await db.runAsync(
    `UPDATE categories SET
       ${column} = ?,
       updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'updated' END
     WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
    nominal && nominal > 0 ? nominal : null,
    updatedAt,
    categoryId,
    managementId,
  );
}

export async function updateEntry(db: SQLiteDatabase, managementId: string, entryId: string, input: CreateEntryInput) {
  const updatedAt = nowIso();

  await db.runAsync(
    `UPDATE entries SET
       name = ?,
       nominal = ?,
       original_nominal = COALESCE(?, original_nominal),
       original_currency = COALESCE(?, original_currency),
       exchange_rate_to_idr = COALESCE(?, exchange_rate_to_idr),
       exchange_rate_at = COALESCE(?, exchange_rate_at),
       category_id = ?,
       date = ?,
       io = ?,
       updated_at = ?,
       sync_status = 'updated'
     WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
    input.name.trim() || (input.io === "Income" ? "Income" : "Expense"),
    input.nominal,
    input.originalNominal ?? null,
    input.originalCurrency ?? null,
    input.exchangeRateToIdr ?? null,
    input.exchangeRateAt ?? null,
    input.categoryId,
    input.date,
    input.io,
    updatedAt,
    entryId,
    managementId,
  );
}

export async function moveEntries(db: SQLiteDatabase, sourceManagementId: string, targetManagementId: string, entryIds: string[]) {
  if (sourceManagementId === targetManagementId || entryIds.length === 0) return;

  await db.withTransactionAsync(async () => {
    const target = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM managements WHERE id = ? AND deleted_at IS NULL",
      targetManagementId,
    );
    if (!target) throw new Error("Destination wallet not found");

    for (const entryId of entryIds) {
      const updatedAt = nowIso();
      const result = await db.runAsync(
        `UPDATE entries SET
           category_id = (
             SELECT target.id
             FROM categories AS source
             JOIN categories AS target ON target.name = source.name
             WHERE source.id = entries.category_id
               AND target.management_id = ?
               AND target.deleted_at IS NULL
             LIMIT 1
           ),
           management_id = ?,
           updated_at = ?,
           sync_status = CASE WHEN sync_status = 'pending' THEN 'pending' ELSE 'updated' END
         WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
        targetManagementId,
        targetManagementId,
        updatedAt,
        entryId,
        sourceManagementId,
      );
      if (result.changes !== 1) throw new Error("Entry could not be moved");
    }
  });
}

export async function deleteEntry(db: SQLiteDatabase, managementId: string, entryId: string) {
  const updatedAt = nowIso();

  await db.runAsync(
    `UPDATE entries SET
       deleted_at = ?,
       updated_at = ?,
       sync_status = 'deleted'
     WHERE id = ? AND management_id = ? AND deleted_at IS NULL`,
    updatedAt,
    updatedAt,
    entryId,
    managementId,
  );
}

export async function deleteEntriesBulk(db: SQLiteDatabase, managementId: string, ids: string[]) {
  if (ids.length === 0) return;
  const updatedAt = nowIso();

  await db.withTransactionAsync(async () => {
    const MAX_IDS_PER_QUERY = 500;
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_QUERY) {
      const chunk = ids.slice(i, i + MAX_IDS_PER_QUERY);
      const placeholders = chunk.map(() => "?").join(",");
      await db.runAsync(
        `UPDATE entries SET deleted_at = ?, updated_at = ?, sync_status = 'deleted' WHERE id IN (${placeholders}) AND management_id = ? AND deleted_at IS NULL`,
        updatedAt,
        updatedAt,
        ...chunk,
        managementId,
      );
    }
  });
}

async function insertEntry(db: EntryWriter, managementId: string, input: CreateEntryInput, createdAt = nowIso()) {
  const user = await db.getFirstAsync<{ id: string }>("SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1");
  await db.runAsync(
    `INSERT INTO entries (
       id, name, nominal, original_nominal, original_currency, exchange_rate_to_idr, exchange_rate_at, category_id, date, io,
       management_id, created_by_id, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    createId("entry"),
    input.name.trim() || (input.io === "Income" ? "Income" : "Expense"),
    input.nominal,
    input.originalNominal ?? input.nominal,
    input.originalCurrency ?? "IDR",
    input.exchangeRateToIdr ?? 1,
    input.exchangeRateAt ?? createdAt,
    input.categoryId,
    input.date,
    input.io,
    managementId,
    user?.id ?? null,
    createdAt,
    createdAt,
  );
}

export async function createEntry(db: EntryWriter, managementId: string, input: CreateEntryInput) {
  await insertEntry(db, managementId, input);
}

export async function createTransfer(db: SQLiteDatabase, input: CreateTransferInput) {
  const note = input.note?.trim();
  if (!input.fromManagementId || !input.toManagementId) throw new Error("Choose both wallets before transferring.");
  if (input.fromManagementId === input.toManagementId) throw new Error("Choose a different destination wallet.");
  if (input.nominal <= 0) throw new Error("Enter an amount before transferring.");

  await db.withExclusiveTransactionAsync(async (txn) => {
    const rows = await txn.getAllAsync<Pick<ManagementRow, "id" | "name" | "balance">>(
      `SELECT
         m.id,
         m.name,
         COALESCE(SUM(CASE WHEN e.io = 'Income' THEN e.nominal ELSE -e.nominal END), 0) AS balance
       FROM managements m
       LEFT JOIN entries e ON e.management_id = m.id AND e.deleted_at IS NULL
       WHERE m.id IN (?, ?) AND m.deleted_at IS NULL
       GROUP BY m.id, m.name`,
      input.fromManagementId,
      input.toManagementId,
    );
    const fromManagement = rows.find((row) => row.id === input.fromManagementId);
    const toManagement = rows.find((row) => row.id === input.toManagementId);

    if (!fromManagement || !toManagement) throw new Error("Wallet not found.");
    if ((fromManagement.balance ?? 0) < input.nominal) throw new Error("Insufficient funds in the source wallet.");

    const createdAt = nowIso();
    const metadata = {
      originalNominal: input.originalNominal ?? input.nominal,
      originalCurrency: input.originalCurrency ?? "IDR",
      exchangeRateToIdr: input.exchangeRateToIdr ?? 1,
      exchangeRateAt: input.exchangeRateAt ?? createdAt,
    };
    const noteSuffix = note ? ` · ${note}` : "";

    await insertEntry(txn, input.fromManagementId, {
      name: `Transfer to ${toManagement.name}${noteSuffix}`,
      nominal: input.nominal,
      categoryId: null,
      date: input.date,
      io: "Expenses",
      ...metadata,
    }, createdAt);

    await insertEntry(txn, input.toManagementId, {
      name: `Transfer from ${fromManagement.name}${noteSuffix}`,
      nominal: input.nominal,
      categoryId: null,
      date: input.date,
      io: "Income",
      ...metadata,
    }, createdAt);
  });
}

export function buildActivity(entries: CashflowEntry[], daysBack = 182): ActivityOverview {
  const countByDate = new Map<string, number>();
  for (const entry of entries) {
    countByDate.set(entry.date, (countByDate.get(entry.date) ?? 0) + 1);
  }

  const today = new Date();
  const days = Array.from({ length: daysBack }, (_, index) => {
    const date = addDays(today, -(daysBack - index - 1));
    const dateKey = toDateKey(date);
    return { date: dateKey, count: countByDate.get(dateKey) ?? 0 };
  });

  let currentStreak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].count === 0) break;
    currentStreak += 1;
  }

  return {
    days,
    totalEntries: days.reduce((sum, day) => sum + day.count, 0),
    activeDays: days.filter((day) => day.count > 0).length,
    currentStreak,
  };
}

export function buildStats(entries: CashflowEntry[]): CashflowStats {
  if (entries.length === 0) return EMPTY_STATS;

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayKey = toDateKey(now);
  const week = getWeekStartEnd(now);
  const weekStart = toDateKey(week.start);
  const weekEnd = toDateKey(week.end);
  const categoryTotals = new Map<string, number>();
  let totalIncome = 0;
  let totalExpenses = 0;
  let dayIncome = 0;
  let dayExpenses = 0;
  let weekIncome = 0;
  let weekExpenses = 0;
  let monthIncome = 0;
  let monthExpenses = 0;

  for (const entry of entries) {
    const isIncome = entry.io === "Income";
    if (isIncome) totalIncome += entry.nominal;
    else {
      totalExpenses += entry.nominal;
      if (entry.category) categoryTotals.set(entry.category, (categoryTotals.get(entry.category) ?? 0) + entry.nominal);
    }

    if (entry.date === todayKey) {
      if (isIncome) dayIncome += entry.nominal;
      else dayExpenses += entry.nominal;
    }

    if (entry.date >= weekStart && entry.date <= weekEnd) {
      if (isIncome) weekIncome += entry.nominal;
      else weekExpenses += entry.nominal;
    }

    if (entry.date.startsWith(monthPrefix)) {
      if (isIncome) monthIncome += entry.nominal;
      else monthExpenses += entry.nominal;
    }
  }

  return {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    currentDay: {
      income: dayIncome,
      expenses: dayExpenses,
    },
    currentWeek: {
      weekNumber: getWeekNumber(now),
      range: `${formatLocalizedDate(week.start, "id-ID", { day: "numeric", month: "short" })} - ${formatLocalizedDate(week.end, "id-ID", { day: "numeric", month: "short" })}`,
      income: weekIncome,
      expenses: weekExpenses,
    },
    currentMonth: {
      label: formatLocalizedDate(now, "id-ID", { month: "long", year: "numeric" }),
      income: monthIncome,
      expenses: monthExpenses,
    },
    topExpenseCategories: Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, total]) => ({ category, total, percentage: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0 })),
  };
}

export function buildAnalytics(entries: CashflowEntry[], categories: CashflowCategory[]): CashflowAnalytics {
  const colorByCategory = new Map(categories.map((category) => [category.name, category.color ?? undefined]));
  const byCategory = new Map<string, { total: number; count: number }>();
  const byMonth = new Map<string, { income: number; expenses: number }>();
  const byCreator = new Map<string, { name: string | null; totalIncome: number; totalExpenses: number; entryCount: number }>();
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const monthTotals = byMonth.get(month) ?? { income: 0, expenses: 0 };
    const creatorKey = entry.createdBy ?? "__unknown__";
    const creatorTotals = byCreator.get(creatorKey) ?? { name: entry.createdBy, totalIncome: 0, totalExpenses: 0, entryCount: 0 };

    creatorTotals.entryCount += 1;
    if (entry.io === "Income") {
      totalIncome += entry.nominal;
      monthTotals.income += entry.nominal;
      creatorTotals.totalIncome += entry.nominal;
    } else {
      totalExpenses += entry.nominal;
      monthTotals.expenses += entry.nominal;
      creatorTotals.totalExpenses += entry.nominal;
      if (entry.category) {
        const current = byCategory.get(entry.category) ?? { total: 0, count: 0 };
        current.total += entry.nominal;
        current.count += 1;
        byCategory.set(entry.category, current);
      }
    }

    byMonth.set(month, monthTotals);
    byCreator.set(creatorKey, creatorTotals);
  }

  return {
    summary: { totalIncome, totalExpenses, balance: totalIncome - totalExpenses, entryCount: entries.length },
    byCategory: Array.from(byCategory.entries())
      .map(([category, value]) => ({
        category,
        color: colorByCategory.get(category),
        total: value.total,
        count: value.count,
        percentage: totalExpenses > 0 ? Math.round((value.total / totalExpenses) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total),
    byMonth: Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        monthLabel: parseDateKey(`${month}-01`).toLocaleDateString("id-ID", { month: "short", year: "numeric" }),
        income: value.income,
        expenses: value.expenses,
      })),
    byCreator: Array.from(byCreator.values()).sort((a, b) => b.entryCount - a.entryCount),
  };
}

export const emptyCashflowStats = EMPTY_STATS;
