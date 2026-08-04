import { useEffect, useState, type ReactNode } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { router, Stack, type Href } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { type SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "@/components/AppText";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { useAppTheme } from "@/components/provider/AppTheme";
import { CashflowAmountInput, QuickAmountStrip } from "@/components/cashflow/AmountEntryControls";
import { CategorySlider } from "@/components/cashflow/CategorySlider";
import { loadCategorySliderFeedback, playCategorySliderFeedback } from "@/components/cashflow/categorySliderFeedback";
import { useCashflowCategorySlider } from "@/components/cashflow/useCashflowCategorySlider";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import type { RecurringFrequency } from "@/data/cashflow/types";
import { alpha } from "@/lib/color";
import { formatDateKey, toDateKey } from "@/lib/date";

const FREQUENCIES = [
  { value: "daily", icon: "sun.max.fill" },
  { value: "weekly", icon: "calendar.badge.clock" },
  { value: "monthly", icon: "calendar" },
] as const satisfies readonly { value: RecurringFrequency; icon: SFSymbol }[];

function getDateDaysAhead(daysAhead: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysAhead);
  return date;
}

function parseAmountInput(value: string) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function Section({ title, icon, children }: { title: string; icon: SFSymbol; children: ReactNode }) {
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

function TypeChoice({ label, icon, selected, tint, onPress }: { label: string; icon: SFSymbol; selected: boolean; tint: string; onPress: () => void }) {
  const appTheme = useAppTheme();
  const borderColor = selected ? alpha(tint, 0.42) : alpha(appTheme.colors.foreground, appTheme.isDark ? 0.1 : 0.08);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="min-h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl border px-3"
      onPress={onPress}
      style={{
        backgroundColor: selected ? alpha(tint, appTheme.isDark ? 0.2 : 0.12) : alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025),
        borderColor,
      }}
    >
      <AppSymbol name={icon} size={16} tintColor={selected ? tint : appTheme.colors.muted} fallback={<Text style={{ color: selected ? tint : appTheme.colors.muted }}>•</Text>} />
      <Text className="text-sm font-bold" style={{ color: selected ? tint : appTheme.colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FrequencyChoice({ label, icon, selected, onPress }: { label: string; icon: SFSymbol; selected: boolean; onPress: () => void }) {
  const appTheme = useAppTheme();
  const borderColor = selected ? alpha(appTheme.colors.primary, 0.45) : alpha(appTheme.colors.foreground, appTheme.isDark ? 0.1 : 0.08);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="min-h-16 flex-1 items-center justify-center gap-1 rounded-2xl border px-2 py-2"
      onPress={onPress}
      style={{
        backgroundColor: selected ? alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.12) : alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025),
        borderColor,
      }}
    >
      <AppSymbol name={icon} size={17} tintColor={selected ? appTheme.colors.primary : appTheme.colors.muted} fallback={<Text style={{ color: appTheme.colors.muted }}>•</Text>} />
      <Text className="text-sm font-semibold" style={{ color: selected ? appTheme.colors.primary : appTheme.colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AutomaticEntryFormSheet() {
  const appTheme = useAppTheme();
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const { categories, recurringEntries, createRecurringEntry, deleteRecurringEntry } = useCashflowData();
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [ioIndex, setIoIndex] = useState(1);
  const [frequencyIndex, setFrequencyIndex] = useState(1);
  const [nextDate, setNextDate] = useState(() => toDateKey(getDateDaysAhead(1)));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07);
  const surface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025);
  const rowSurface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.045 : 0.035);
  const displayAmount = parseAmountInput(amountText);
  const nominal = Math.round(currency.toIdr(displayAmount));
  const canSubmit = Boolean(name.trim() && nominal > 0 && !isSaving);

  const {
    categoryIndex,
    categoryOptions,
    handleCategoryChange,
    resetCategoryIndex,
    selectedCategory,
    sliderRef,
  } = useCashflowCategorySlider({
    categories,
    primaryColor: appTheme.colors.primary,
    preferenceKey: "cashflowCategoryIndex",
  });
  const categoryId = selectedCategory?.id ?? null;

  const addQuickAmount = (value: number) => {
    setAmountText((prev) => String((parseInt(prev, 10) || 0) + value));
  };

  useEffect(() => {
    loadCategorySliderFeedback();
  }, []);

  const resetForm = () => {
    setName("");
    setAmountText("");
    setIoIndex(1);
    setFrequencyIndex(1);
    setNextDate(toDateKey(getDateDaysAhead(1)));
    resetCategoryIndex();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();

    if (!trimmed) {
      Alert.alert(t("autoEntry.nameRequiredTitle"), t("autoEntry.nameRequiredMessage"));
      return;
    }

    if (nominal <= 0) {
      Alert.alert(t("autoEntry.amountRequiredTitle"), t("autoEntry.amountRequiredMessage"));
      return;
    }

    setIsSaving(true);
    try {
      await createRecurringEntry({
        name: trimmed,
        nominal,
        categoryId,
        io: ioIndex === 0 ? "Income" : "Expenses",
        frequency: FREQUENCIES[frequencyIndex].value,
        nextDate,
      });
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (id: string, entryName: string) => {
    Alert.alert(t("autoEntry.removeTitle"), t("autoEntry.removeMessage", { name: entryName }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => deleteRecurringEntry(id).catch(console.error) },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Auto Entry",
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("common.close")} onPress={() => router.back()} />
                  <AndroidFormFooterButton label={t("autoEntry.newEntry")} onPress={handleCreate} primary disabled={!canSubmit} />
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
            <Stack.Toolbar.Button icon={toolbarIcons.check} disabled={!canSubmit} onPress={handleCreate} variant="done">
              {t("autoEntry.newEntry")}
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
        <QuickAmountStrip hidden denominations={currency.denominations} onAmount={addQuickAmount} />

        <Section title={t("autoEntry.newEntry")} icon="repeat.circle.fill">
          <View className="gap-3 rounded-[2rem] border p-2" style={{ backgroundColor: surface, borderColor }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("autoEntry.entryNamePlaceholder")}
              placeholderTextColor={appTheme.colors.muted}
              selectionColor={appTheme.colors.primary}
              className="rounded-3xl px-4 py-3 text-base"
              style={{ color: appTheme.colors.foreground, backgroundColor: rowSurface, borderColor, borderWidth: 1 }}
            />

            <View className="flex-row gap-2">
              <TypeChoice label={t("entry.income")} icon="arrow.down.circle.fill" selected={ioIndex === 0} tint={appTheme.colors.positive} onPress={() => setIoIndex(0)} />
              <TypeChoice label={t("entry.expense")} icon="arrow.up.circle.fill" selected={ioIndex === 1} tint={appTheme.colors.negative} onPress={() => setIoIndex(1)} />
            </View>
          </View>
        </Section>

        <Section title={t("autoEntry.nextRun")} icon="calendar">
          <View className="gap-2 rounded-[2rem] border p-2" style={{ backgroundColor: surface, borderColor }}>
            <View className="flex-row gap-2">
              {FREQUENCIES.map((frequency, index) => (
                <FrequencyChoice
                  key={frequency.value}
                  label={t(`autoEntry.${frequency.value}`)}
                  icon={frequency.icon}
                  selected={frequencyIndex === index}
                  onPress={() => setFrequencyIndex(index)}
                />
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => setShowDatePicker(true)}
              className="min-h-14 flex-row items-center gap-3 rounded-3xl px-4 py-3"
              style={{ backgroundColor: rowSurface }}
            >
              <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
                <AppSymbol name="calendar.badge.clock" size={17} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>•</Text>} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
                  {t("autoEntry.nextRun")}
                </Text>
                <Text className="mt-0.5 text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                  {formatDateKey(nextDate, { day: "2-digit", month: "short", year: "numeric" }, i18n.language === "id" ? "id-ID" : "en-US")}
                </Text>
              </View>
              <Text className="text-sm font-semibold" style={{ color: appTheme.colors.primary }}>
                {t("transfer.change")}
              </Text>
            </Pressable>

          </View>
        </Section>

        {categoryOptions.length > 0 ? (
          <Section title={t("categories.categories")} icon="tag.fill">
            <CategorySlider
              ref={sliderRef}
              categories={categoryOptions}
              selectedIndex={categoryIndex}
              onChangeIndex={handleCategoryChange}
              showAddButton
              onAddPress={() => router.push("/forms/categories" as Href)}
              onFeedback={() => playCategorySliderFeedback("selection")}
            />
          </Section>
        ) : null}

        <View className="gap-3">
          {recurringEntries.map((entry) => {
            const category = categories.find((item) => item.id === entry.categoryId) ?? null;
            const color = entry.io === "Income" ? appTheme.colors.positive : (category?.color ?? appTheme.colors.negative);
            const frequencyLabel = t(`autoEntry.${entry.frequency}`);
            const ioLabel = entry.io === "Income" ? t("entry.income") : t("entry.expense");

            return (
              <View key={entry.id} className="rounded-3xl border p-4" style={{ borderColor, backgroundColor: surface }}>
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(color, 0.16) }}>
                    <AppSymbol name={(category?.icon ?? "repeat.circle.fill") as SFSymbol} size={21} tintColor={color} fallback={<Text style={{ color }}>•</Text>} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                      {entry.name}
                    </Text>
                    <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                      {[currency.format(entry.nominal, { compact: true }), ioLabel, frequencyLabel, category?.name ?? t("autoEntry.noCategory")].join(" · ")}
                    </Text>
                    <Text className="mt-1 text-xs font-semibold" style={{ color: appTheme.colors.primary }}>
                      {t("autoEntry.nextLabel", { date: formatDateKey(entry.nextDate, { day: "2-digit", month: "short", year: "numeric" }, i18n.language === "id" ? "id-ID" : "en-US") })}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("autoEntry.removeMessage", { name: entry.name }).replace(/\.+$/, "")}
                    onPress={() => confirmDelete(entry.id, entry.name)}
                    className="h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: alpha(appTheme.colors.negative, appTheme.isDark ? 0.18 : 0.1) }}
                  >
                    <AppSymbol name="trash.fill" size={16} tintColor={appTheme.colors.negative} fallback={<Text style={{ color: appTheme.colors.negative }}>×</Text>} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
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
              <DateTimePicker
                value={new Date(`${nextDate}T12:00:00`)}
                mode="date"
                presentation="inline"
                display="inline"
                accentColor={appTheme.colors.primary}
                onValueChange={(_event, date) => {
                  if (date) setNextDate(toDateKey(date));
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
