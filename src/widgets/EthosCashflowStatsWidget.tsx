import { Text } from "@expo/ui/swift-ui";
import { createWidget } from "expo-widgets";

export type CashflowStatsWidgetProps = {
  walletName: string;
  periodLabel: string;
  balanceLabel: string;
  incomeLabel: string;
  expensesLabel: string;
  quickEntryLabel: string;
  balance: string;
  income: string;
  expenses: string;
  balanceTone: "positive" | "negative" | "neutral";
  amountsHidden: boolean;
  emptyMessage: string;
  isEmpty: boolean;
  backgroundColor: string;
  foregroundColor: string;
  mutedColor: string;
  primaryColor: string;
  positiveColor: string;
  negativeColor: string;
  isDark: boolean;
};

function CashflowStatsWidgetBridge() {
  "widget";
  // The config plugin replaces this widget's generated entry view with native SwiftUI.
  return <Text>Cashflow Stats</Text>;
}

export default createWidget<CashflowStatsWidgetProps>(
  "EthosCashflowStatsWidget",
  CashflowStatsWidgetBridge,
);
