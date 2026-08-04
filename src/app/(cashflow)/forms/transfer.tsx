import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import ExpoDateTimePicker from "@expo/ui/community/datetime-picker";
import { router, Stack } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { type SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { useAppTheme } from "@/components/provider/AppTheme";
import { CashflowAmountInput } from "@/components/cashflow/AmountEntryControls";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import type { CashflowManagement } from "@/data/cashflow/types";
import { alpha } from "@/lib/color";
import { formatDateKey, toDateKey } from "@/lib/date";
import { walletImageToIcon } from "@/lib/categoryMapping";
import { getManagementImageSource } from "@/lib/protectedImage";

const DATE_OPTIONS = [
  { label: "Today", daysAgo: 0 },
  { label: "Yesterday", daysAgo: 1 },
  { label: "Date" },
];

function getDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function WalletChoice({ wallet, selected, disabled, onPress }: { wallet: CashflowManagement; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const appTheme = useAppTheme();
  const currency = useCurrency();
  const tint = wallet.balance < 0 ? appTheme.colors.negative : appTheme.colors.primary;
  const imageSource = getManagementImageSource(wallet.image);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      className="min-h-14 flex-row items-center gap-3 rounded-2xl px-3 py-2"
      onPress={onPress}
      style={{
        backgroundColor: selected ? alpha(tint, appTheme.isDark ? 0.2 : 0.1) : "transparent",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundColor: alpha(tint, 0.14) }}>
        {imageSource ? (
          <Image source={imageSource} contentFit="cover" style={{ height: "100%", width: "100%" }} />
        ) : (
          <AppSymbol name={walletImageToIcon(wallet.image)} size={16} tintColor={tint} fallback={<Text style={{ color: tint }}>•</Text>} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{wallet.name}</Text>
        <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{currency.format(wallet.balance, { compact: true })}</Text>
      </View>
      {selected ? <AppSymbol name="checkmark.circle.fill" size={19} tintColor={tint} fallback={<Text style={{ color: tint }}>✓</Text>} /> : null}
    </Pressable>
  );
}

function WalletRow({ label, wallet, afterBalance, active, activeLabel, changeLabel, onPress }: { label: string; wallet: CashflowManagement | null; afterBalance?: number; active?: boolean; activeLabel: string; changeLabel: string; onPress: () => void }) {
  const appTheme = useAppTheme();
  const currency = useCurrency();
  const imageSource = wallet ? getManagementImageSource(wallet.image) : null;
  const tint = active ? appTheme.colors.primary : appTheme.colors.muted;

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 rounded-3xl px-4 py-3"
      onPress={onPress}
      style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.045 : 0.035) }}
    >
      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundColor: alpha(tint, 0.14) }}>
        {wallet && imageSource ? (
          <Image source={imageSource} contentFit="cover" style={{ height: "100%", width: "100%" }} />
        ) : (
          <AppSymbol name={wallet ? walletImageToIcon(wallet.image) : "wallet.pass.fill"} size={17} tintColor={tint} fallback={<Text style={{ color: tint }}>•</Text>} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>{label}</Text>
          {active ? <Text className="text-xs font-bold" style={{ color: appTheme.colors.primary }}>{activeLabel}</Text> : null}
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-base font-bold" style={{ color: appTheme.colors.foreground }}>{wallet?.name ?? "-"}</Text>
        <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
          {wallet ? currency.format(wallet.balance) : "-"}
          {wallet && afterBalance !== undefined ? ` → ${currency.format(afterBalance)}` : ""}
        </Text>
      </View>
      <Text className="text-sm font-semibold" style={{ color: appTheme.colors.primary }}>{changeLabel}</Text>
    </Pressable>
  );
}

function DateChoice({ label, subtitle, selected, onPress }: { label: string; subtitle: string; selected: boolean; onPress: () => void }) {
  const appTheme = useAppTheme();
  const borderColor = selected ? alpha(appTheme.colors.primary, 0.45) : alpha(appTheme.colors.foreground, appTheme.isDark ? 0.1 : 0.08);

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-14 flex-1 items-center justify-center gap-1 rounded-2xl border px-2 py-2"
      onPress={onPress}
      style={{
        backgroundColor: selected ? alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.12) : (appTheme.isDark ? alpha(appTheme.colors.foreground, 0.035) : alpha(appTheme.colors.inverseForeground, 0.45)),
        borderColor,
      }}
    >
      <Text className="text-sm font-semibold" style={{ color: selected ? appTheme.colors.primary : appTheme.colors.foreground }}>
        {label}
      </Text>
      <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function Section({ title, icon, children }: { title: string; icon: SFSymbol; children: React.ReactNode }) {
  const appTheme = useAppTheme();

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 px-1">
        <AppSymbol name={icon} size={14} tintColor={appTheme.colors.muted} fallback={<Text style={{ color: appTheme.colors.muted }}>•</Text>} />
        <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export default function TransferFormSheet() {
  const appTheme = useAppTheme();
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const { activeManagementId, managements, createTransfer } = useCashflowData();
  const [fromManagementId, setFromManagementId] = useState(activeManagementId ?? managements[0]?.id ?? "");
  const [toManagementId, setToManagementId] = useState(managements.find((wallet) => wallet.id !== (activeManagementId ?? managements[0]?.id))?.id ?? "");
  const [amountText, setAmountText] = useState("");
  const [dateIndex, setDateIndex] = useState(0);
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectingWallet, setSelectingWallet] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    if (fromManagementId || managements.length === 0) return;
    const timeout = setTimeout(() => setFromManagementId(activeManagementId ?? managements[0]?.id ?? ""), 0);
    return () => clearTimeout(timeout);
  }, [activeManagementId, fromManagementId, managements]);

  useEffect(() => {
    if (toManagementId || managements.length < 2) return;
    const timeout = setTimeout(() => setToManagementId(managements.find((wallet) => wallet.id !== fromManagementId)?.id ?? ""), 0);
    return () => clearTimeout(timeout);
  }, [fromManagementId, managements, toManagementId]);

  const fromManagement = managements.find((wallet) => wallet.id === fromManagementId) ?? null;
  const toManagement = managements.find((wallet) => wallet.id === toManagementId) ?? null;
  const selectedDate = DATE_OPTIONS[dateIndex]?.daysAgo !== undefined
    ? getDateDaysAgo(DATE_OPTIONS[dateIndex].daysAgo)
    : customDate ?? new Date();
  const displayNominal = parseInt(amountText, 10) || 0;
  const nominal = Math.round(currency.toIdr(displayNominal));
  const canSubmit = Boolean(managements.length >= 2 && fromManagementId && toManagementId && fromManagementId !== toManagementId && nominal > 0 && !isSaving);
  const preview = fromManagement && toManagement && nominal > 0 ? {
    fromBalance: fromManagement.balance - nominal,
    toBalance: toManagement.balance + nominal,
  } : null;
  const activeSource = fromManagementId === activeManagementId;

  const handleSwapWallets = () => {
    if (!fromManagementId || !toManagementId) return;
    setFromManagementId(toManagementId);
    setToManagementId(fromManagementId);
    setSelectingWallet(null);
  };

  const handleSave = async () => {
    if (managements.length < 2) {
      Alert.alert(t("transfer.addWalletTitle"), t("transfer.addWalletMessage"));
      return;
    }
    if (!fromManagement || !toManagement || fromManagementId === toManagementId) {
      Alert.alert(t("transfer.chooseWalletTitle"), t("transfer.chooseWalletMessage"));
      return;
    }
    if (nominal <= 0) {
      Alert.alert(t("transfer.amountRequiredTitle"), t("transfer.amountRequiredMessage"));
      return;
    }
    if (fromManagement.balance < nominal) {
      Alert.alert(t("transfer.insufficientFundsTitle"), t("transfer.insufficientFundsMessage", { name: fromManagement.name, balance: currency.format(fromManagement.balance) }));
      return;
    }

    setIsSaving(true);
    try {
      await createTransfer({
        fromManagementId,
        toManagementId,
        nominal,
        originalNominal: displayNominal,
        originalCurrency: currency.currency,
        exchangeRateToIdr: currency.isIdr ? 1 : 1 / currency.rate,
        exchangeRateAt: new Date().toISOString(),
        date: toDateKey(selectedDate),
      });
      router.back();
    } catch (error) {
      Alert.alert(t("transfer.transferFailedTitle"), error instanceof Error ? error.message : t("transfer.transferFailedMessage"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t("sidebar.transfer"),
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("common.close")} onPress={() => router.back()} />
                  <AndroidFormFooterButton label={t("sidebar.transfer")} onPress={handleSave} primary disabled={!canSubmit} />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button icon={toolbarIcons.close} accessibilityLabel="Close" onPress={() => router.back()} />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button icon={toolbarIcons.check} disabled={!canSubmit} onPress={handleSave} variant="done">
              {t("sidebar.transfer")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : null}

      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-5 px-5 pb-10 pt-5"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === "android"}
      >
        <CashflowAmountInput amountText={amountText} currencySymbol={currency.option.symbol} onAmountTextChange={setAmountText} />

        <Section title={t("transfer.route")} icon="arrow.left.arrow.right.circle.fill">
          <View className="gap-2 rounded-[2rem] border p-2" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025), borderColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07) }}>
            <WalletRow label={t("transfer.fromWallet")} wallet={fromManagement} afterBalance={preview?.fromBalance} active={activeSource} activeLabel={t("transfer.active")} changeLabel={t("transfer.change")} onPress={() => setSelectingWallet(selectingWallet === "from" ? null : "from")} />

            <View className="h-9 flex-row items-center justify-center gap-3">
              <View className="h-px flex-1" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.08) }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("transfer.swapWallets")}
                disabled={!fromManagementId || !toManagementId}
                onPress={handleSwapWallets}
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: alpha(appTheme.colors.primary, 0.12), opacity: !fromManagementId || !toManagementId ? 0.45 : 1 }}
              >
                <AppSymbol name="arrow.up.arrow.down" size={17} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>⇅</Text>} />
              </Pressable>
              <View className="h-px flex-1" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.08) }} />
            </View>

            <WalletRow label={t("transfer.toWallet")} wallet={toManagement} afterBalance={preview?.toBalance} active={false} activeLabel={t("transfer.active")} changeLabel={t("transfer.change")} onPress={() => setSelectingWallet(selectingWallet === "to" ? null : "to")} />

            {selectingWallet ? (
              <View className="gap-1 rounded-3xl p-1" style={{ backgroundColor: appTheme.isDark ? alpha(appTheme.colors.foreground, 0.035) : alpha(appTheme.colors.inverseForeground, 0.55) }}>
                {managements.map((wallet) => (
                  <WalletChoice
                    key={wallet.id}
                    wallet={wallet}
                    selected={wallet.id === (selectingWallet === "from" ? fromManagementId : toManagementId)}
                    disabled={wallet.id === (selectingWallet === "from" ? toManagementId : fromManagementId)}
                    onPress={() => {
                      if (selectingWallet === "from") setFromManagementId(wallet.id);
                      else setToManagementId(wallet.id);
                      setSelectingWallet(null);
                    }}
                  />
                ))}
              </View>
            ) : null}

            {fromManagement ? (
              <Text className="px-1 text-xs" style={{ color: nominal > 0 && fromManagement.balance < nominal ? appTheme.colors.negative : appTheme.colors.muted }}>
                {nominal > 0 && fromManagement.balance < nominal
                  ? t("transfer.sourceBalanceLow", { balance: currency.format(fromManagement.balance) })
                  : t("transfer.sourceBalance", { balance: currency.format(fromManagement.balance) })}
              </Text>
            ) : null}
          </View>
        </Section>

        <Section title={t("transfer.transferDate")} icon="calendar">
          <View className="flex-row gap-2">
            {DATE_OPTIONS.map((option, index) => (
              <DateChoice
                key={index}
                label={index === 0 ? t("entry.dateOptions.today") : index === 1 ? t("entry.dateOptions.yesterday") : t("entry.dateOptions.date")}
                subtitle={option.daysAgo !== undefined ? formatDateKey(toDateKey(getDateDaysAgo(option.daysAgo)), { day: "numeric", month: "short" }, i18n.language === "id" ? "id-ID" : "en-US") : formatDateKey(toDateKey(customDate ?? new Date()), { day: "numeric", month: "short" }, i18n.language === "id" ? "id-ID" : "en-US")}
                selected={dateIndex === index}
                onPress={() => {
                  setDateIndex(index);
                  if (option.daysAgo === undefined) setShowDatePicker(true);
                }}
              />
            ))}
          </View>
        </Section>

        {managements.length < 2 ? (
          <View className="rounded-3xl border p-4" style={{ backgroundColor: alpha(appTheme.colors.negative, 0.1), borderColor: alpha(appTheme.colors.negative, 0.28) }}>
            <Text className="text-sm font-semibold" style={{ color: appTheme.colors.negative }}>
              {t("transfer.addWalletHint")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {showDatePicker ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <Pressable className="flex-1 justify-end px-4 pb-8" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setShowDatePicker(false)}>
            <Pressable
              className="rounded-3xl border p-4"
              style={{
                backgroundColor: appTheme.colors.background,
                borderColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.12 : 0.1),
              }}
            >
              <ExpoDateTimePicker
                value={customDate ?? new Date()}
                mode="date"
                presentation="inline"
                display="inline"
                accentColor={appTheme.colors.primary}
                onValueChange={(_event, date) => {
                  setCustomDate(date);
                  setDateIndex(2);
                  setShowDatePicker(false);
                }}
                onDismiss={() => setShowDatePicker(false)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
