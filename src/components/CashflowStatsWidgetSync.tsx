import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/components/CurrencyProvider";
import { useAppTheme } from "@/components/AppTheme";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { publishCashflowStatsWidget } from "@/widgets/publishCashflowStatsWidget";

export function CashflowStatsWidgetSync() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { format, cashflowAmountsVisible, cashflowStatsPeriod } = useCurrency();
  const { isReady, stats, activeManagement } = useCashflowData();
  const periodLabel = t(`analytics.${cashflowStatsPeriod}`);
  const balanceLabel = t("analytics.balance");
  const incomeLabel = t("analytics.income");
  const expensesLabel = t("analytics.expenses");
  const emptyLabel = t("cashflow.empty.withoutDateHint");
  const quickEntryLabel = t("quickActions.newEntry");

  useEffect(() => {
    if (!isReady) return;
    void publishCashflowStatsWidget({
      walletName: activeManagement?.name ?? null,
      stats,
      period: cashflowStatsPeriod,
      amountsVisible: cashflowAmountsVisible,
      format,
      labels: {
        period: periodLabel,
        balance: balanceLabel,
        income: incomeLabel,
        expenses: expensesLabel,
        empty: emptyLabel,
        quickEntry: quickEntryLabel,
      },
      theme: {
        background: appTheme.colors.background,
        foreground: appTheme.colors.foreground,
        muted: appTheme.colors.muted,
        primary: appTheme.colors.primary,
        positive: appTheme.colors.positive,
        negative: appTheme.colors.negative,
        isDark: appTheme.isDark,
      },
    }).catch((error) => console.warn("Failed to update cashflow widget", error));
  }, [
    activeManagement?.name,
    appTheme.colors.background,
    appTheme.colors.foreground,
    appTheme.colors.muted,
    appTheme.colors.negative,
    appTheme.colors.positive,
    appTheme.colors.primary,
    appTheme.isDark,
    balanceLabel,
    cashflowAmountsVisible,
    cashflowStatsPeriod,
    emptyLabel,
    expensesLabel,
    format,
    incomeLabel,
    isReady,
    periodLabel,
    quickEntryLabel,
    stats,
  ]);

  return null;
}
