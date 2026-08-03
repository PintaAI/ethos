import { useMemo, useState } from "react";
import { Platform, Pressable, RefreshControl, View } from "react-native";
import { AppText as RNText } from "@/components/AppText";
import { router, Stack, type Href } from "expo-router";
import { AppSymbol } from "@/components/AppSymbol";
import { GlassBox } from "@/components/GlassBox";
import { useTranslation } from "react-i18next";

import { useDrawer } from "@/components/DrawerContext";
import { useAppTheme } from "@/components/AppTheme";
import { toolbarIcons } from "@/config/toolbarIcons";
import { alpha } from "@/lib/color";
import { ActivityHeatmap } from "@/components/cashflow/ActivityHeatmap";
import { CashflowTable } from "@/components/cashflow/CashflowTable";
import { CashflowStatsCard } from "@/components/cashflow/CashflowStatsCard";
import { useSyncStatus } from "@/components/SyncProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { toDateKey } from "@/lib/date";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const appTheme = useAppTheme();
  const sync = useSyncStatus();
  const { activity, entries, stats, activeManagement, isSwitchingManagement } = useCashflowData();
  const latestDate = activity.days.at(-1)?.date ?? toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(latestDate);
  const effectiveSelectedDate = activity.days.some((day) => day.date === selectedDate) ? selectedDate : latestDate;

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === effectiveSelectedDate),
    [effectiveSelectedDate, entries],
  );

  const homeHeader = useMemo(() => (
    <View>
      <CashflowStatsCard stats={stats} managementName={activeManagement?.name} loading={isSwitchingManagement} />
      <ActivityHeatmap activity={activity} selectedDate={effectiveSelectedDate} onDateSelect={setSelectedDate} />
      <View className="mt-5" />
    </View>
  ), [stats, activeManagement?.name, activity, effectiveSelectedDate, isSwitchingManagement]);

  return (
    <>
      <Stack.Screen options={{ title: t('tabs.home') }} />

      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={toolbarIcons.menu}
          accessibilityLabel="Open menu"
          onPress={open}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View hidesSharedBackground>
          {Platform.OS === "ios" ? (
            <GlassBox
              isInteractive
              tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 1 : 0.72)}
              glassEffectStyle="clear"
              style={{ borderRadius: 9999 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('entry.catat')}
                className="flex-row items-center gap-1.5 px-5 py-3"
                onPress={() => router.push(`/forms/entry-form?date=${effectiveSelectedDate}` as Href)}
              >
                <AppSymbol name="plus" size={16} tintColor={appTheme.colors.background} fallback={<RNText className="text-base" style={{ color: appTheme.colors.background }}>+</RNText>} />
                <RNText className="font-bold text-base" style={{ color: appTheme.colors.background }}>
                  {t('entry.catat')}
                </RNText>
              </Pressable>
            </GlassBox>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("entry.catat")}
              className="h-10 w-28 flex-row items-center justify-center gap-1.5 rounded-full px-3"
              onPress={() => router.push(`/forms/entry-form?date=${effectiveSelectedDate}` as Href)}
              style={{ backgroundColor: appTheme.colors.primary }}
            >
              <AppSymbol name="plus" size={16} tintColor={appTheme.colors.inverseForeground} />
              <RNText className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                {t("entry.catat")}
              </RNText>
            </Pressable>
          )}
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <View className="bg-[--app-color-background] flex-1">
        <CashflowTable
          entries={dayEntries}
          dateFilter={effectiveSelectedDate}
          onDateFilterChange={setSelectedDate}
          hideTanggal
          ListHeaderComponent={homeHeader}
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
    </>
  );
}
