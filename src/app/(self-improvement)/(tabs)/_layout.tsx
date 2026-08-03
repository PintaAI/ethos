import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useAppTheme } from "@/components/AppTheme";
import { alpha } from "@/lib/color";

export default function SelfImprovementTabsLayout() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const androidIndicatorColor = alpha(appTheme.colors.primary, appTheme.isDark ? 0.28 : 0.16);
  const androidRippleColor = alpha(appTheme.colors.primary, appTheme.isDark ? 0.36 : 0.24);

  return (
    <NativeTabs
      backgroundColor={appTheme.colors.background}
      tintColor={appTheme.colors.primary}
      iconColor={{ default: appTheme.colors.muted, selected: appTheme.colors.primary }}
      labelStyle={{ color: appTheme.colors.foreground }}
      indicatorColor={Platform.OS === "android" ? androidIndicatorColor : undefined}
      rippleColor={Platform.OS === "android" ? androidRippleColor : undefined}
    >
      <NativeTabs.Trigger name="overview">
        <NativeTabs.Trigger.Label>{t("tabs.home")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="journal">
        <NativeTabs.Trigger.Label>{t("tabs.notes")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "book.pages", selected: "book.pages.fill" }}
          md="menu_book"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="habits">
        <NativeTabs.Trigger.Label>{t("tabs.habits")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }}
          md="checklist"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <NativeTabs.Trigger.Label>{t("tabs.schedule")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
