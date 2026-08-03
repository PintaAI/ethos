import type { CashflowStats } from "@/components/cashflow/CashflowStatsCard";
import type { CashflowStatsPeriod } from "@/lib/preferences";
import EthosCashflowStatsWidget, { type CashflowStatsWidgetProps } from "./EthosCashflowStatsWidget";

type PublishInput = {
  walletName: string | null;
  stats: CashflowStats;
  period: CashflowStatsPeriod;
  amountsVisible: boolean;
  format: (amount: number, options?: { compact?: boolean }) => string;
  labels: {
    period: string;
    balance: string;
    income: string;
    expenses: string;
    empty: string;
    quickEntry: string;
  };
  theme: {
    background: string;
    foreground: string;
    muted: string;
    primary: string;
    positive: string;
    negative: string;
    isDark: boolean;
  };
};

type ClearLabels = Omit<PublishInput["labels"], "quickEntry"> & { quickEntry?: string };

function themeProps(input: PublishInput) {
  return {
    backgroundColor: input.theme.background,
    foregroundColor: input.theme.foreground,
    mutedColor: input.theme.muted,
    primaryColor: input.theme.primary,
    positiveColor: input.theme.positive,
    negativeColor: input.theme.negative,
    isDark: input.theme.isDark,
  };
}

function emptyProps(input: PublishInput): CashflowStatsWidgetProps {
  return {
    walletName: "Ethos",
    periodLabel: input.labels.period,
    balanceLabel: input.labels.balance,
    incomeLabel: input.labels.income,
    expensesLabel: input.labels.expenses,
    quickEntryLabel: input.labels.quickEntry,
    balance: "-",
    income: "-",
    expenses: "-",
    balanceTone: "neutral",
    amountsHidden: true,
    emptyMessage: input.labels.empty,
    isEmpty: true,
    ...themeProps(input),
  };
}

export async function publishCashflowStatsWidget(input: PublishInput) {
  if (!input.walletName) {
    EthosCashflowStatsWidget.updateSnapshot(emptyProps(input));
    return;
  }

  const periodStats = input.period === "daily"
    ? input.stats.currentDay
    : input.period === "weekly"
      ? input.stats.currentWeek
      : input.period === "monthly"
        ? input.stats.currentMonth
        : { income: input.stats.totalIncome, expenses: input.stats.totalExpenses };
  const periodBalance = periodStats.income - periodStats.expenses;

  EthosCashflowStatsWidget.updateSnapshot({
    walletName: input.walletName,
    periodLabel: input.labels.period,
    balanceLabel: input.labels.balance,
    incomeLabel: input.labels.income,
    expensesLabel: input.labels.expenses,
    quickEntryLabel: input.labels.quickEntry,
    balance: input.format(periodBalance, { compact: true }),
    income: input.format(periodStats.income, { compact: true }),
    expenses: input.format(periodStats.expenses, { compact: true }),
    balanceTone: periodBalance > 0 ? "positive" : periodBalance < 0 ? "negative" : "neutral",
    amountsHidden: !input.amountsVisible,
    emptyMessage: "",
    isEmpty: false,
    ...themeProps(input),
  });
}

export async function clearCashflowStatsWidget(labels: ClearLabels) {
  EthosCashflowStatsWidget.updateSnapshot(emptyProps({
    walletName: null,
    stats: {} as CashflowStats,
    period: "allTime",
    amountsVisible: false,
    format: () => "-",
    labels: { ...labels, quickEntry: labels.quickEntry ?? "New entry" },
    theme: {
      background: "#F7FDF9",
      foreground: "#000000",
      muted: "#64748B",
      primary: "#2E3F55",
      positive: "#16845B",
      negative: "#C43D48",
      isDark: false,
    },
  }));
}
