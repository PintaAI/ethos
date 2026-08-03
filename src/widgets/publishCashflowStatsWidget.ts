import type { CashflowStatsPeriod } from "@/lib/preferences";

type PublishInput = {
  walletName: string | null;
  stats: unknown;
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

export async function publishCashflowStatsWidget(_input: PublishInput) {}
type ClearLabels = Omit<PublishInput["labels"], "quickEntry"> & { quickEntry?: string };

export async function clearCashflowStatsWidget(_labels: ClearLabels) {}
