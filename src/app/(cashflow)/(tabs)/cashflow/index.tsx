import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useDrawer } from "@/components/provider/DrawerContext";
import { CashflowTable } from "@/components/cashflow/CashflowTable";
import { CashflowCalendar } from "@/components/cashflow/CashflowCalendar";
import { useSyncStatus } from "@/components/provider/SyncProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { AppSegmentedControl } from "@/components/AppSegmentedControl";
import { getPreference, setPreference } from "@/lib/preferences";

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
    }).catch((error) => console.warn("Failed to load cashflow view", error));
  }, []);

  const handleViewChange = (index: number) => {
    const next = index === 0 ? "list" : "calendar";
    setView(next);
    void setPreference("cashflowView", next)
      .catch((error) => console.warn("Failed to save cashflow view", error));
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
            selectedIndex={view === "calendar" ? 1 : 0}
            onIndexChange={handleViewChange}
            style={{ width: 180 }}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      {view === "list" ? (
        <View className="bg-[--app-color-background] flex-1">
          <CashflowTable
            entries={entries}
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
