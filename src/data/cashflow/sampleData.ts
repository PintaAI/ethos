import type { ActivityOverview } from "@/components/cashflow/ActivityHeatmap";
import type { CashflowEntry } from "@/components/cashflow/CashflowTable";
import type { CashflowStats } from "@/components/cashflow/CashflowStatsCard";
import type { CashflowAnalytics, CashflowCategory, CashflowManagement } from "./types";
import { buildActivity, buildAnalytics, buildStats } from "./repository";
import { addDays, toDateKey } from "@/lib/date";

const CATEGORY_DEFS = [
  { name: "Salary", color: "#16a34a", icon: "banknote.fill" },
  { name: "Freelance", color: "#16a34a", icon: "briefcase.fill" },
  { name: "Groceries", color: "#dc2626", icon: "basket.fill" },
  { name: "Transport", color: "#ea580c", icon: "car.fill" },
  { name: "Coffee & meals", color: "#ca8a04", icon: "cup.and.saucer.fill" },
  { name: "Utilities", color: "#2563eb", icon: "bolt.fill" },
  { name: "Subscriptions", color: "#9333ea", icon: "play.rectangle.fill" },
] as const;

export const sampleCategories: CashflowCategory[] = CATEGORY_DEFS.map((category, index) => ({
  id: `cat-${index}`,
  name: category.name,
  color: category.color,
  icon: category.icon,
  budgetDaily: null,
  budgetWeekly: null,
  budgetMonthly: null,
  managementId: "mgmt-sample",
}));

function sampleEntry(
  id: string,
  dayOffset: number,
  name: string,
  nominal: number,
  io: "Income" | "Expenses",
  categoryIndex: number,
  createdBy = "You",
): CashflowEntry {
  const category = CATEGORY_DEFS[categoryIndex];
  return {
    id,
    name,
    nominal,
    originalNominal: null,
    originalCurrency: null,
    exchangeRateToIdr: null,
    exchangeRateAt: null,
    category: category.name,
    categoryColor: category.color,
    categoryIcon: category.icon,
    createdBy,
    date: toDateKey(addDays(new Date(), dayOffset)),
    io,
  };
}

export const sampleEntries: CashflowEntry[] = [
  sampleEntry("e1", 0, "Grocery run", 185000, "Expenses", 2),
  sampleEntry("e2", 0, "Morning coffee", 38000, "Expenses", 4),
  sampleEntry("e3", 0, "Taxi to office", 24000, "Expenses", 3),
  sampleEntry("e4", 0, "Afternoon snack", 15000, "Expenses", 4),
  sampleEntry("e5", -1, "Monthly salary", 8500000, "Income", 0),
  sampleEntry("e6", -1, "Freelance project", 2200000, "Income", 1, "Nadia"),
  sampleEntry("e7", -2, "Electric bill", 320000, "Expenses", 5),
  sampleEntry("e8", -3, "Streaming", 45000, "Expenses", 6),
  sampleEntry("e9", -3, "Lunch with team", 76000, "Expenses", 4, "Raka"),
  sampleEntry("e10", -5, "Fuel", 60000, "Expenses", 3),
  sampleEntry("e11", -6, "Weekly groceries", 245000, "Expenses", 2),
  sampleEntry("e12", -8, "Side gig", 1250000, "Income", 1),
  sampleEntry("e13", -12, "Internet bill", 280000, "Expenses", 5),
  sampleEntry("e14", -15, "Birthday dinner", 180000, "Expenses", 4, "Dimas"),
  sampleEntry("e15", -22, "Music subscription", 49000, "Expenses", 6),
  sampleEntry("e16", -28, "Bus tickets", 18000, "Expenses", 3),
  sampleEntry("e17", -40, "Salary", 8500000, "Income", 0),
  sampleEntry("e18", -42, "Groceries", 210000, "Expenses", 2),
  sampleEntry("e19", -48, "Utilities", 300000, "Expenses", 5),
  sampleEntry("e20", -65, "Freelance payout", 1750000, "Income", 1, "Nadia"),
  sampleEntry("e21", -70, "Groceries", 198000, "Expenses", 2),
  sampleEntry("e22", -88, "Salary", 8500000, "Income", 0),
  sampleEntry("e23", -95, "Transport pass", 145000, "Expenses", 3),
  sampleEntry("e24", -100, "Cafe visits", 96000, "Expenses", 4),
  sampleEntry("e25", -118, "Salary", 8200000, "Income", 0),
  sampleEntry("e26", -125, "App subscription", 47000, "Expenses", 6),
  sampleEntry("e27", -140, "Groceries", 230000, "Expenses", 2),
  sampleEntry("e28", -160, "Utilities", 290000, "Expenses", 5),
];

export const sampleStats: CashflowStats = buildStats(sampleEntries);
export const sampleActivity: ActivityOverview = buildActivity(sampleEntries);
export const sampleAnalytics: CashflowAnalytics = buildAnalytics(sampleEntries, sampleCategories);
export const sampleSelectedDate: string = sampleEntries[0]?.date ?? toDateKey(new Date());
export const sampleDayEntries: CashflowEntry[] = sampleEntries.filter(
  (entry) => entry.date === sampleSelectedDate,
);

export const sampleManagement: CashflowManagement = {
  id: "mgmt-sample",
  remoteId: null,
  name: "Personal",
  category: null,
  image: null,
  imageTheme: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  balance: sampleStats.balance,
  entryCount: sampleEntries.length,
  memberCount: 1,
};
