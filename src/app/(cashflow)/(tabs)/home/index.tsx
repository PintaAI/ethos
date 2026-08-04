import { useState } from "react";
import { Platform, Pressable } from "react-native";
import { AppText as RNText } from "@/components/AppText";
import { router, Stack, type Href } from "expo-router";
import { AppSymbol } from "@/components/AppSymbol";
import { GlassBox } from "@/components/GlassBox";
import { useTranslation } from "react-i18next";

import { CashflowHomeContent } from "@/components/cashflow/CashflowHomeContent";
import { useDrawer } from "@/components/provider/DrawerContext";
import { useAppTheme } from "@/components/provider/AppTheme";
import { toolbarIcons } from "@/config/toolbarIcons";
import { alpha } from "@/lib/color";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { toDateKey } from "@/lib/date";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const appTheme = useAppTheme();
  const { activity, entries, stats, activeManagement, isSwitchingManagement } = useCashflowData();
  const latestDate = activity.days.at(-1)?.date ?? toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(latestDate);
  const effectiveSelectedDate = activity.days.some((day) => day.date === selectedDate) ? selectedDate : latestDate;

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
      <CashflowHomeContent
        entries={entries}
        activity={activity}
        stats={stats}
        activeManagementName={activeManagement?.name ?? undefined}
        isSwitchingManagement={isSwitchingManagement}
        selectedDate={effectiveSelectedDate}
        onDateFilterChange={setSelectedDate}
      />
    </>
  );
}
