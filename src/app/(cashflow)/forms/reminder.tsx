import { useEffect, useState } from "react";
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Stack } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { toolbarIcons } from "@/config/toolbarIcons";
import { alpha } from "@/lib/color";
import {
  DEFAULT_LOCAL_REMINDER_SETTINGS,
  getLocalReminderSettingsAsync,
  saveLocalReminderSettingsAsync,
  type LocalReminderSettings,
} from "@/lib/localReminders";
import { requestNotificationPermissionsAsync } from "@/lib/notifications";

const BUDGET_THRESHOLDS = [50, 80, 90, 100] as const;

function timeToDate(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

export default function ReminderFormSheet() {
  const appTheme = useAppTheme();
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<LocalReminderSettings>(DEFAULT_LOCAL_REMINDER_SETTINGS);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07);
  const surface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025);
  const rowSurface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.045 : 0.035);

  useEffect(() => {
    getLocalReminderSettingsAsync(db)
      .then(setSettings)
      .catch((error) => Alert.alert(t("reminder.loadFailed"), error instanceof Error ? error.message : t("reminder.tryAgain")))
      .finally(() => setIsLoading(false));
  }, [db, t]);

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (settings.noEntryEnabled || settings.budgetAlertEnabled || settings.monthlyReviewEnabled) {
        const allowed = await requestNotificationPermissionsAsync();
        if (!allowed) {
          Alert.alert(t("reminder.notificationsOffTitle"), t("reminder.notificationsOffMessage"));
        }
      }
      await saveLocalReminderSettingsAsync(db, settings);
      Alert.alert(t("reminder.savedTitle"), t("reminder.savedMessage"));
    } catch (error) {
      Alert.alert(t("reminder.saveFailed"), error instanceof Error ? error.message : t("reminder.tryAgain"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t("reminder.title"),
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton
                    label={isSaving ? t("reminder.saving") : t("reminder.save")}
                    onPress={() => void save()}
                    primary
                    disabled={isLoading || isSaving}
                  />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={toolbarIcons.check} onPress={() => void save()} variant="done" disabled={isLoading || isSaving}>
            {isSaving ? t("reminder.saving") : t("reminder.save")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}

      <ScrollView
        className="bg-[--app-color-background] flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-5 px-5 pb-10 pt-5"
        nestedScrollEnabled={Platform.OS === "android"}
      >
        <View className="gap-4 rounded-[32px] border p-4" style={{ backgroundColor: surface, borderColor }}>
          <View className="flex-row items-center justify-between gap-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                <AppSymbol name="calendar.badge.exclamationmark" size={20} tintColor={appTheme.colors.primary} fallback={<Text>!</Text>} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{t("reminder.noEntryTitle")}</Text>
                <Text className="mt-1 text-xs leading-4" style={{ color: appTheme.colors.muted }}>{t("reminder.noEntryDescription")}</Text>
              </View>
            </View>
            <Switch
              disabled={isLoading}
              value={settings.noEntryEnabled}
              onValueChange={(noEntryEnabled) => setSettings((current) => ({ ...current, noEntryEnabled }))}
              trackColor={{ true: appTheme.colors.primary }}
            />
          </View>

          {settings.noEntryEnabled ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-12 flex-row items-center justify-between rounded-2xl px-4"
              style={{ backgroundColor: rowSurface }}
              onPress={() => setShowTimePicker(true)}
            >
              <Text className="font-semibold" style={{ color: appTheme.colors.foreground }}>{t("reminder.time")}</Text>
              <Text className="font-bold" style={{ color: appTheme.colors.primary }}>
                {timeToDate(settings.noEntryTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View className="gap-4 rounded-[32px] border p-4" style={{ backgroundColor: surface, borderColor }}>
          <View className="flex-row items-center justify-between gap-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                <AppSymbol name="chart.line.uptrend.xyaxis" size={20} tintColor={appTheme.colors.primary} fallback={<Text>!</Text>} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{t("reminder.budgetTitle")}</Text>
                <Text className="mt-1 text-xs leading-4" style={{ color: appTheme.colors.muted }}>{t("reminder.budgetDescription")}</Text>
              </View>
            </View>
            <Switch
              disabled={isLoading}
              value={settings.budgetAlertEnabled}
              onValueChange={(budgetAlertEnabled) => setSettings((current) => ({ ...current, budgetAlertEnabled }))}
              trackColor={{ true: appTheme.colors.primary }}
            />
          </View>

          {settings.budgetAlertEnabled ? (
            <View className="gap-2">
              <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>{t("reminder.alertAt")}</Text>
              <View className="flex-row gap-2">
                {BUDGET_THRESHOLDS.map((threshold) => {
                  const selected = settings.budgetThreshold === threshold;
                  return (
                    <Pressable
                      key={threshold}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className="min-h-11 flex-1 items-center justify-center rounded-2xl border"
                      style={{
                        backgroundColor: selected ? alpha(appTheme.colors.primary, 0.16) : appTheme.colors.background,
                        borderColor: selected ? appTheme.colors.primary : borderColor,
                      }}
                      onPress={() => setSettings((current) => ({ ...current, budgetThreshold: threshold }))}
                    >
                      <Text className="font-bold" style={{ color: selected ? appTheme.colors.primary : appTheme.colors.foreground }}>{threshold}%</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        <View className="gap-4 rounded-[32px] border p-4" style={{ backgroundColor: surface, borderColor }}>
          <View className="flex-row items-center justify-between gap-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                <AppSymbol name="calendar.badge.clock" size={20} tintColor={appTheme.colors.primary} fallback={<Text>!</Text>} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{t("reminder.monthlyReviewTitle")}</Text>
                <Text className="mt-1 text-xs leading-4" style={{ color: appTheme.colors.muted }}>{t("reminder.monthlyReviewDescription")}</Text>
              </View>
            </View>
            <Switch
              disabled={isLoading}
              value={settings.monthlyReviewEnabled}
              onValueChange={(monthlyReviewEnabled) => setSettings((current) => ({ ...current, monthlyReviewEnabled }))}
              trackColor={{ true: appTheme.colors.primary }}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          className="min-h-16 flex-row items-center gap-3 rounded-3xl border p-3"
          style={{ backgroundColor: surface, borderColor }}
          onPress={() => void Linking.openSettings()}
        >
          <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
            <AppSymbol name="bell.badge" size={20} tintColor={appTheme.colors.primary} fallback={<Text>!</Text>} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{t("reminder.deviceSettings")}</Text>
            <Text className="mt-0.5 text-xs" style={{ color: appTheme.colors.muted }}>{t("reminder.deviceSettingsDetail")}</Text>
          </View>
          <AppSymbol name="arrow.up.right" size={15} tintColor={appTheme.colors.muted} fallback={<Text>›</Text>} />
        </Pressable>
      </ScrollView>

      {showTimePicker ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
          <Pressable className="flex-1 justify-end px-4 pb-8" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setShowTimePicker(false)}>
            <Pressable className="rounded-3xl border p-4" style={{ backgroundColor: appTheme.colors.background, borderColor }}>
              <DateTimePicker
                value={timeToDate(settings.noEntryTime)}
                mode="time"
                presentation="inline"
                display="spinner"
                accentColor={appTheme.colors.primary}
                onValueChange={(_event, date) => {
                  if (date) {
                    setSettings((current) => ({
                      ...current,
                      noEntryTime: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
                    }));
                  }
                  setShowTimePicker(false);
                }}
                onDismiss={() => setShowTimePicker(false)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
