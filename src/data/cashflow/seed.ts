import type { SQLiteDatabase } from "expo-sqlite";
import { toDateKey } from "@/lib/date";

const USER_ID = "local-user-demo";
const MANAGEMENTS = [
  { id: "wallet-personal", name: "Personal Wallet" },
  { id: "wallet-household", name: "Household Wallet" },
  { id: "wallet-business", name: "Business Wallet" },
] as const;

const CATEGORIES = [
  { name: "Gaji", color: "#22c55e", icon: "wallet.pass.fill", io: "Income" },
  { name: "Freelance", color: "#3b82f6", icon: "briefcase.fill", io: "Income" },
  { name: "Makanan", color: "#ef4444", icon: "birthday.cake.fill", io: "Expenses" },
  { name: "Transportasi", color: "#f97316", icon: "bus.fill", io: "Expenses" },
  { name: "Belanja", color: "#eab308", icon: "basket.fill", io: "Expenses" },
  { name: "Tagihan", color: "#22c55e", icon: "receipt.fill", io: "Expenses" },
  { name: "Hiburan", color: "#a855f7", icon: "gamecontroller.fill", io: "Expenses" },
] as const;

const ENTRY_TEMPLATES = [
  { name: "Monthly salary", category: "Gaji", io: "Income", nominal: 7250000 },
  { name: "Product sprint invoice", category: "Freelance", io: "Income", nominal: 1850000 },
  { name: "Lunch and coffee", category: "Makanan", io: "Expenses", nominal: 96000 },
  { name: "MRT and ride share", category: "Transportasi", io: "Expenses", nominal: 76000 },
  { name: "Weekly groceries", category: "Belanja", io: "Expenses", nominal: 284000 },
  { name: "Electricity token", category: "Tagihan", io: "Expenses", nominal: 350000 },
  { name: "Movie night", category: "Hiburan", io: "Expenses", nominal: 85000 },
] as const;

type SeedTransaction = Pick<SQLiteDatabase, "runAsync">;
type DemoManagement = (typeof MANAGEMENTS)[number];

function nowIso() {
  return new Date().toISOString();
}

function dateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return toDateKey(date);
}

function monthDayFromDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.getDate();
}

function entriesForDay(daysAgo: number) {
  const dayOfMonth = monthDayFromDaysAgo(daysAgo);
  const dailyTemplates = [ENTRY_TEMPLATES[2 + (daysAgo % 4)]];

  if (dayOfMonth === 1) dailyTemplates.push(ENTRY_TEMPLATES[0]);
  if (dayOfMonth === 10 || dayOfMonth === 24) dailyTemplates.push(ENTRY_TEMPLATES[1]);
  if (dayOfMonth === 7 || dayOfMonth === 21) dailyTemplates.push(ENTRY_TEMPLATES[4]);
  if (dayOfMonth === 15) dailyTemplates.push(ENTRY_TEMPLATES[5]);
  if (dayOfMonth === 18) dailyTemplates.push(ENTRY_TEMPLATES[6]);

  return dailyTemplates;
}

async function seedEntriesForManagement(txn: SeedTransaction, management: DemoManagement, createdAt: string) {
  let entryIndex = 0;

  for (let daysAgo = 0; daysAgo <= 365; daysAgo += 1) {
    for (const template of entriesForDay(daysAgo)) {
      const categoryId = `${management.id}-category-${template.category.toLowerCase().replace(/\s+/g, "-")}`;
      const walletMultiplier = management.id === "wallet-household" ? 1.35 : management.id === "wallet-business" ? 2.1 : 1;
      const variance = 1 + ((daysAgo + entryIndex) % 5) * 0.06;

      await txn.runAsync(
        `INSERT INTO entries (
           id, name, nominal, original_nominal, original_currency, category_id, date, io,
           management_id, created_by_id, created_at, updated_at, sync_status
         ) VALUES (?, ?, ?, ?, 'IDR', ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        `${management.id}-entry-${entryIndex}`,
        template.name,
        Math.round(template.nominal * walletMultiplier * variance),
        Math.round(template.nominal * walletMultiplier * variance),
        categoryId,
        dateDaysAgo(daysAgo),
        template.io,
        management.id,
        USER_ID,
        createdAt,
        createdAt,
      );
      entryIndex += 1;
    }
  }
}

export async function seedCashflowDatabase(db: SQLiteDatabase) {
  const existing = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM managements");
  if ((existing?.count ?? 0) > 0) return;

  const createdAt = nowIso();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO users (id, name, email, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, 'synced')`,
      USER_ID,
      "Demo User",
      "demo@local.test",
      createdAt,
      createdAt,
    );

    for (const management of MANAGEMENTS) {
      await txn.runAsync(
        `INSERT INTO managements (id, name, created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, 'pending')`,
        management.id,
        management.name,
        createdAt,
        createdAt,
      );
      await txn.runAsync(
        `INSERT INTO management_members (id, management_id, user_id, role, created_at, updated_at, sync_status)
         VALUES (?, ?, ?, 'owner', ?, ?, 'pending')`,
        `${management.id}-member-owner`,
        management.id,
        USER_ID,
        createdAt,
        createdAt,
      );

      for (const category of CATEGORIES) {
        await txn.runAsync(
          `INSERT INTO categories (id, name, color, icon, management_id, created_at, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          `${management.id}-category-${category.name.toLowerCase().replace(/\s+/g, "-")}`,
          category.name,
          category.color,
          category.icon,
          management.id,
          createdAt,
          createdAt,
        );
      }

      await seedEntriesForManagement(txn, management, createdAt);

      for (const label of ["Kopi", "Makan siang", "Parkir", "Grab", "Token listrik"]) {
        const category = label === "Token listrik" ? "Tagihan" : label === "Grab" || label === "Parkir" ? "Transportasi" : "Makanan";
        await txn.runAsync(
          `INSERT INTO quick_fills (id, label, amount, category_id, management_id, created_at, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          `${management.id}-quick-${label.toLowerCase().replace(/\s+/g, "-")}`,
          label,
          label === "Token listrik" ? 350000 : label === "Grab" ? 50000 : label === "Parkir" ? 10000 : 25000,
          `${management.id}-category-${category.toLowerCase().replace(/\s+/g, "-")}`,
          management.id,
          createdAt,
          createdAt,
        );
      }

      await txn.runAsync(
        `INSERT INTO overall_budgets (id, management_id, period, nominal, created_at, updated_at, sync_status)
         VALUES (?, ?, 'monthly', ?, ?, ?, 'pending')`,
        `${management.id}-budget-monthly`,
        management.id,
        management.id === "wallet-business" ? 12000000 : 6000000,
        createdAt,
        createdAt,
      );
    }

    await txn.runAsync(
      "INSERT INTO app_preferences (key, value) VALUES ('active_management_id', ?)",
      MANAGEMENTS[0].id,
    );
  });
}

export async function reseedDemoCashflowEntries(db: SQLiteDatabase) {
  const demoManagementCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM managements WHERE id IN (${MANAGEMENTS.map(() => "?").join(", ")})`,
    ...MANAGEMENTS.map((management) => management.id),
  );
  if ((demoManagementCount?.count ?? 0) !== MANAGEMENTS.length) return;

  const createdAt = nowIso();

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const management of MANAGEMENTS) {
      await txn.runAsync("DELETE FROM entries WHERE management_id = ? AND id LIKE ?", management.id, `${management.id}-entry-%`);
      await seedEntriesForManagement(txn, management, createdAt);
    }
  });
}
