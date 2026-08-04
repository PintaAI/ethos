import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "@/components/AppText";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { useSyncStatus } from "@/components/provider/SyncProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { alpha } from "@/lib/color";
import { getAuditBalance, getLatestAudit, performAudit, type AuditSnapshot } from "@/lib/api/audit";

export default function AuditFormSheet() {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const currency = useCurrency();
  const sync = useSyncStatus();
  const { activeManagement, refresh } = useCashflowData();
  const managementId = activeManagement?.remoteId ?? undefined;
  const [expectedBalance, setExpectedBalance] = useState<number | null>(null);
  const [latestAudit, setLatestAudit] = useState<AuditSnapshot | null>(null);
  const [actualInput, setActualInput] = useState("");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAuditBalance(managementId), getLatestAudit(managementId)])
      .then(([balance, latest]) => {
        if (cancelled) return;
        setExpectedBalance(balance);
        setLatestAudit(latest);
      })
      .catch(() => {
        if (!cancelled) Alert.alert(t("audit.title"), t("audit.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managementId, t]);

  const parsedActual = Number(actualInput.replace(",", "."));
  const actualBalance = actualInput.trim() && Number.isFinite(parsedActual)
    ? Math.round(currency.toIdr(parsedActual))
    : null;
  const difference = actualBalance !== null && expectedBalance !== null ? actualBalance - expectedBalance : null;
  const matches = difference !== null && Math.abs(difference) < 0.01;
  const hasDifference = difference !== null && !matches;
  const canSubmit = actualBalance !== null && !isSaving && !isLoading;

  const save = async (autoAdjust: boolean) => {
    if (actualBalance === null) return;
    setIsSaving(true);
    try {
      await performAudit({
        managementId,
        actualBalance,
        note: note.trim() || undefined,
        autoAdjust,
      });
      if (autoAdjust) {
        await sync.syncNow();
        await refresh();
      }
      router.back();
    } catch (error) {
      Alert.alert(t("audit.title"), error instanceof Error ? error.message : t("audit.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.12 : 0.09);
  const inputBackground = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035);
  const statusColor = matches ? appTheme.colors.positive : appTheme.colors.negative;

  return (
    <>
      <Stack.Screen
        options={{
          title: t("audit.title"),
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("common.close")} onPress={() => router.back()} />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon={toolbarIcons.close} accessibilityLabel="Close" onPress={() => router.back()} />
        </Stack.Toolbar>
      ) : null}

      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-5 px-5 pb-10 pt-5"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === "android"}
      >
        <Text className="text-sm leading-5" style={{ color: appTheme.colors.muted }}>{t("audit.description")}</Text>

        <View className="rounded-3xl border p-4" style={{ borderColor, backgroundColor: inputBackground }}>
          <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
            {t("audit.recordedBalance")}
          </Text>
          {isLoading ? (
            <ActivityIndicator className="mt-3 self-start" color={appTheme.colors.primary} />
          ) : (
            <Text className="mt-2 text-3xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
              {currency.format(expectedBalance ?? 0)}
            </Text>
          )}
        </View>

        <View className="gap-2">
          <Text className="px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
            {t("audit.actualBalance")}
          </Text>
          <View className="flex-row items-center rounded-3xl border px-4" style={{ borderColor, backgroundColor: inputBackground }}>
            <Text className="mr-3 text-base font-bold" style={{ color: appTheme.colors.muted }}>{currency.option.symbol}</Text>
            <TextInput
              value={actualInput}
              onChangeText={setActualInput}
              editable={!isSaving}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={appTheme.colors.muted}
              className="h-14 flex-1 text-xl font-bold"
              style={{ color: appTheme.colors.foreground }}
            />
          </View>
        </View>

        <View className="gap-2">
          <Text className="px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>{t("audit.note")}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            editable={!isSaving}
            placeholder={t("audit.notePlaceholder")}
            placeholderTextColor={appTheme.colors.muted}
            className="min-h-14 rounded-3xl border px-4 py-3 text-base"
            style={{ color: appTheme.colors.foreground, borderColor, backgroundColor: inputBackground }}
          />
        </View>

        {difference !== null ? (
          <View className="rounded-3xl border p-4" style={{ borderColor: alpha(statusColor, 0.35), backgroundColor: alpha(statusColor, 0.1) }}>
            <View className="flex-row items-center gap-2">
              <AppSymbol name={matches ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"} size={18} tintColor={statusColor} fallback={<Text style={{ color: statusColor }}>•</Text>} />
              <Text className="text-base font-bold" style={{ color: statusColor }}>
                {matches ? t("audit.matches") : t("audit.difference", { amount: currency.format(difference) })}
              </Text>
            </View>
            {hasDifference ? <Text className="mt-1 text-xs" style={{ color: statusColor }}>{difference > 0 ? t("audit.actualHigher") : t("audit.recordedHigher")}</Text> : null}
          </View>
        ) : null}

        {latestAudit ? (
          <Text className="px-1 text-xs" style={{ color: appTheme.colors.muted }}>
            {t("audit.lastAudit", { date: new Date(latestAudit.date).toLocaleDateString(i18n.language === "id" ? "id-ID" : "en-US", { day: "numeric", month: "long", year: "numeric" }) })}
            {Math.abs(latestAudit.difference) < 0.01 ? ` · ${t("audit.matches")}` : latestAudit.adjusted ? ` · ${t("audit.adjusted")}` : ` · ${t("audit.mismatch")}`}
          </Text>
        ) : null}

        <View className="flex-row gap-3">
          <Pressable
            disabled={!canSubmit}
            onPress={() => void save(false)}
            className="min-h-12 flex-1 items-center justify-center rounded-full border px-4"
            style={{ borderColor, opacity: canSubmit ? 1 : 0.45 }}
          >
            <Text className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{t("audit.save")}</Text>
          </Pressable>
          {hasDifference ? (
            <Pressable
              disabled={!canSubmit}
              onPress={() => void save(true)}
              className="min-h-12 flex-1 items-center justify-center rounded-full px-4"
              style={{ backgroundColor: appTheme.colors.primary, opacity: canSubmit ? 1 : 0.45 }}
            >
              <Text className="text-center text-sm font-bold" style={{ color: appTheme.colors.inverseForeground }}>{t("audit.saveAndAdjust")}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
