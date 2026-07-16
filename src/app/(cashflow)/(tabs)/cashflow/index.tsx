import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { AppText as RNText } from "@/components/AppText";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useAppTheme } from "@/components/AppTheme";
import { useDrawer } from "@/components/DrawerContext";
import { CashflowTable } from "@/components/cashflow/CashflowTable";
import { CashflowCalendar } from "@/components/cashflow/CashflowCalendar";
import { useSyncStatus } from "@/components/SyncProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { AppSegmentedControl } from "@/components/AppSegmentedControl";
import { getPreference, setPreference } from "@/lib/preferences";

function CashflowSummaryHeader({ entries }: { entries: ReturnType<typeof useCashflowData>["entries"] }) {
  const appTheme = useAppTheme();
  const { format } = useCurrency();
  const { t } = useTranslation();
  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;

  const monthlyTotals = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let income = 0;
    let expenses = 0;

    for (const entry of entries) {
      if (!entry.date?.startsWith(prefix)) continue;
      if (entry.io === "Income") income += entry.nominal;
      else expenses += entry.nominal;
    }

    return { income, expenses, net: income - expenses };
  }, [entries]);

  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>
        <RNText style={{ color: appTheme.colors.muted }}>{t('cashflow.net')} </RNText>
        <RNText className="font-medium" style={{ color: appTheme.colors.foreground }}>
          {format(monthlyTotals.net, { compact: true })}
        </RNText>
      </RNText>
      <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>
        <RNText style={{ color: appTheme.colors.muted }}>{t('cashflow.income')} </RNText>
        <RNText className="font-medium" style={{ color: positive }}>
          +{format(monthlyTotals.income, { compact: true })}
        </RNText>
      </RNText>
      <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>
        <RNText style={{ color: appTheme.colors.muted }}>{t('cashflow.expenses')} </RNText>
        <RNText className="font-medium" style={{ color: negative }}>
          -{format(monthlyTotals.expenses, { compact: true })}
        </RNText>
      </RNText>
    </View>
  );
}

export default function CashflowScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const appTheme = useAppTheme();
  const sync = useSyncStatus();
  const { entries } = useCashflowData();
  const [view, setView] = useState<"list" | "calendar">("list");

  useEffect(() => {
    getPreference("cashflowView").then((saved) => {
      if (saved === "list" || saved === "calendar") setView(saved);
    });
  }, []);

  const handleViewChange = (index: number) => {
    const next = index === 0 ? "list" : "calendar";
    setView(next);
    setPreference("cashflowView", next);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('tabs.cashflow') }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel="Open menu" onPress={open} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View hidesSharedBackground>
          <AppSegmentedControl
            values={[t('cashflow.list'), t('cashflow.kalender')]}
            selectedIndex={view === "list" ? 0 : 1}
            onIndexChange={handleViewChange}
            style={{ width: 180 }}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      {view === "list" ? (
        <View className="bg-[--app-color-background] flex-1">
          <CashflowTable
            entries={entries}
            ListHeaderComponent={
              <View className="gap-4">
                <CashflowSummaryHeader entries={entries} />
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={sync.status === "syncing"}
                onRefresh={() => void sync.syncNow()}
                tintColor={appTheme.colors.primary}
                colors={[appTheme.colors.primary]}
                progressBackgroundColor={appTheme.colors.background}
              />
            }
          />
        </View>
      ) : (
        <ScrollView
          className="bg-[--app-color-background] flex-1"
          contentContainerClassName="px-5 pb-10 pt-5"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={sync.status === "syncing"}
              onRefresh={() => void sync.syncNow()}
              tintColor={appTheme.colors.primary}
              colors={[appTheme.colors.primary]}
              progressBackgroundColor={appTheme.colors.background}
            />
          }
        >
          <CashflowCalendar entries={entries} />
        </ScrollView>
      )}
    </>
  );
}
