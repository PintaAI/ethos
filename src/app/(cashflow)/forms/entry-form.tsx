import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, TextInput as RNTextInput, View, useWindowDimensions } from "react-native";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { AppText as Text } from "@/components/AppText";
import { AppSegmentedControl } from "@/components/AppSegmentedControl";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { type SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { GlassBox } from "@/components/GlassBox";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useAppTheme } from "@/components/provider/AppTheme";
import { CashflowAmountInput, QuickAmountStrip } from "@/components/cashflow/AmountEntryControls";
import { CategorySlider } from "@/components/cashflow/CategorySlider";
import { loadCategorySliderFeedback, playCategorySliderFeedback } from "@/components/cashflow/categorySliderFeedback";
import { useCashflowCategorySlider } from "@/components/cashflow/useCashflowCategorySlider";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { rankCategories, suggestCategoryFromNote, type CategoryHistoryItem } from "@/data/cashflow/categorySuggestions";
import { listCategoryHistory } from "@/data/cashflow/repository";
import { withDbLock } from "@/lib/sync/dbLock";
import { useAuth } from "@/components/provider/AuthProvider";
import { useSQLiteContext } from "expo-sqlite";
import { alpha } from "@/lib/color";
import { toDateKey, parseDateKey } from "@/lib/date";
import { useIslandToast } from "@/components/provider/IslandToast";

function FormSymbol({ name, color, size = 16 }: { name: SFSymbol; color: string; size?: number }) {
  return <AppSymbol name={name} size={size} tintColor={color} fallback={<Text style={{ color }}>•</Text>} />;
}

function getDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

const DATE_PRESETS = [
  { key: "yesterday", daysAgo: 1 },
  { key: "today", daysAgo: 0 },
  { key: "date", daysAgo: null },
] as const;

type DatePresetKey = (typeof DATE_PRESETS)[number]["key"];

function getDatePresetIndex(key: DatePresetKey) {
  return DATE_PRESETS.findIndex((preset) => preset.key === key);
}

function resolveDateSelection(dateKey: string) {
  const presetIndex = DATE_PRESETS.findIndex(
    (preset) => preset.daysAgo !== null && dateKey === toDateKey(getDateDaysAgo(preset.daysAgo)),
  );

  if (presetIndex >= 0) return { dateIndex: presetIndex, customDate: null };

  return {
    dateIndex: getDatePresetIndex("date"),
    customDate: parseDateKey(dateKey),
  };
}

function formatCompactDate(date: Date) {
  const lng = i18n.language === "id" ? "id-ID" : "en-US";
  const weekday = date.toLocaleDateString(lng, { weekday: "short" });
  const month = date.toLocaleDateString(lng, { month: "short" });
  return `${weekday}, ${date.getDate()} ${month}`;
}

function QuickFillChip({ label, onPress }: { label: string; onPress: () => void }) {
  const appTheme = useAppTheme();
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-9 flex-row items-center gap-1.5 rounded-full border px-3"
      style={{
        backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.45)",
        borderColor,
      }}
    >
      <FormSymbol name="plus" color={appTheme.colors.muted} size={11} />
      <Text className="text-sm font-medium" style={{ color: appTheme.colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

function DateChoice({ label, subtitle, selected, onPress }: { label: string; subtitle: ReactNode; selected: boolean; onPress: () => void }) {
  const appTheme = useAppTheme();
  const borderColor = selected ? alpha(appTheme.colors.primary, 0.45) : (appTheme.isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)");

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-14 flex-1 items-center justify-center gap-1 rounded-2xl border px-2 mb-10 py-2"
      onPress={onPress}
      style={{
        backgroundColor: selected ? alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.12) : (appTheme.isDark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.45)"),
        borderColor,
      }}
    >
      <View className="flex-row items-center gap-1.5">
        <FormSymbol name="calendar" color={selected ? appTheme.colors.primary : appTheme.colors.muted} size={14} />
        <Text className="text-sm font-semibold" style={{ color: selected ? appTheme.colors.primary : appTheme.colors.foreground }}>
          {label}
        </Text>
      </View>
      <View className="min-h-5 items-center justify-center">{subtitle}</View>
    </Pressable>
  );
}

function Section({ title, overflowVisible, borderless, children }: { title?: string; overflowVisible?: boolean; borderless?: boolean; children: ReactNode }) {
  const appTheme = useAppTheme();

  return (
    <View className="gap-2" style={{ overflow: overflowVisible ? "visible" : "hidden" }}>
      {title ? (
        <Text className="px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
          {title}
        </Text>
      ) : null}
      <View
        className={borderless ? "" : "rounded-3xl border"}
        style={{
          backgroundColor: borderless ? "transparent" : (appTheme.isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.78)"),
          borderColor: borderless ? "transparent" : (appTheme.isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)"),
          overflow: overflowVisible ? "visible" : "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function EntryForm() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const currency = useCurrency();
  const db = useSQLiteContext();
  const { user } = useAuth();
  const { showIslandToast } = useIslandToast();
  const { id, date, sharedDraft, draftName, draftAmount, draftCategory, draftIo } = useLocalSearchParams<{
    id?: string;
    date?: string;
    sharedDraft?: string;
    draftName?: string;
    draftAmount?: string;
    draftCategory?: string;
    draftIo?: "Income" | "Expenses";
  }>();
  const isEditing = !!id;
  const { activeManagementId, categories, quickFills, entries, createEntry, updateEntry } = useCashflowData();
  const editingEntry = useMemo(
    () => (id ? entries.find((e) => e.id === id) ?? null : null),
    [id, entries],
  );
  const fallbackQuickFillItems = useMemo(() => {
    const labels = i18n.language === "id"
      ? ["Kopi", "Makan siang", "Parkir", "Grab", "Token listrik"]
      : ["Coffee", "Lunch", "Parking", "Grab", "Electric token"];
    return labels.map((label) => ({ id: label, label, amount: null as number | null, categoryId: null as string | null }));
  }, [i18n.language]);
  const DATE_OPTIONS = useMemo(() => DATE_PRESETS.map((preset) => ({
    ...preset,
    label: t(`entry.dateOptions.${preset.key}`),
  })), [t]);
  const [ioIndex, setIoIndex] = useState(1);
  const [dateIndex, setDateIndex] = useState(() => getDatePresetIndex("today"));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [amountText, setAmountText] = useState("");
  const [initialAmountText, setInitialAmountText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [categoryHistoryScope, setCategoryHistoryScope] = useState<{
    key: string;
    history: CategoryHistoryItem[];
  } | null>(null);
  const [suggestedFromHistory, setSuggestedFromHistory] = useState(false);
  const automaticOverrideBlockedRef = useRef(isEditing || Boolean(sharedDraft && draftCategory));
  const initializedEditingEntryRef = useRef<string | null>(null);
  const appliedShareDraftRef = useRef<string | null>(null);
  const appliedShareCategoryRef = useRef<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const io = ioIndex === 0 ? "Income" : "Expenses";
  const categoryHistoryKey = activeManagementId ? `${activeManagementId}\u0000${io}` : null;
  const categoryHistory = categoryHistoryScope?.key === categoryHistoryKey
    ? categoryHistoryScope.history
    : null;
  const rankedCategories = useMemo(
    () => categoryHistory
      ? rankCategories(categories, categoryHistory, toDateKey(new Date()))
      : categories,
    [categories, categoryHistory],
  );
  const {
    categoryIndex,
    categoryOptions,
    handleCategoryChange,
    resetCategoryIndex,
    restoreCategoryIndex,
    selectCategoryIndex,
    selectedCategory,
    sliderRef,
  } = useCashflowCategorySlider({
    categories: rankedCategories,
    primaryColor: appTheme.colors.primary,
    preferenceKey: "cashflowCategoryIndex",
    restoreEnabled: false,
    initialIndex: 0,
  });

  useEffect(() => {
    if (!activeManagementId || !categoryHistoryKey) return;
    let cancelled = false;
    withDbLock(() => listCategoryHistory(db, activeManagementId, io, user?.id)).then((history) => {
      if (!cancelled) setCategoryHistoryScope({ key: categoryHistoryKey, history });
    }).catch((error) => console.error("Failed to load category history", error));
    return () => { cancelled = true; };
  }, [activeManagementId, categoryHistoryKey, db, io, user?.id]);

  useEffect(() => {
    if (isEditing || automaticOverrideBlockedRef.current || categoryOptions.length === 0) return;
    const frame = requestAnimationFrame(() => restoreCategoryIndex(0, false));
    return () => cancelAnimationFrame(frame);
  }, [categoryOptions, isEditing, restoreCategoryIndex]);

  useEffect(() => {
    if (isEditing || automaticOverrideBlockedRef.current || !noteText.trim() || !categoryHistory) {
      return;
    }
    const timeout = setTimeout(() => {
      const categoryId = suggestCategoryFromNote(noteText, categoryHistory, toDateKey(new Date()));
      if (!categoryId || automaticOverrideBlockedRef.current) return;
      const index = categoryOptions.findIndex((category) => category.id === categoryId);
      if (index >= 0 && categoryOptions[index]?.id !== selectedCategory?.id) {
        selectCategoryIndex(index);
        setSuggestedFromHistory(true);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [categoryHistory, categoryOptions, isEditing, noteText, selectCategoryIndex, selectedCategory?.id]);

  useEffect(() => {
    loadCategorySliderFeedback();
  }, []);

  useEffect(() => {
    if (
      !editingEntry ||
      categoryOptions.length === 0 ||
      initializedEditingEntryRef.current === editingEntry.id
    ) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      initializedEditingEntryRef.current = editingEntry.id;
      const displayNominal = editingEntry.originalCurrency === currency.currency && editingEntry.originalNominal !== null
        ? editingEntry.originalNominal
        : currency.toDisplay(editingEntry.nominal);
      const nextAmountText = String(Math.round(displayNominal));

      setIoIndex(editingEntry.io === "Income" ? 0 : 1);
      setAmountText(nextAmountText);
      setInitialAmountText(nextAmountText);
      setNoteText(editingEntry.name);

      const dateSelection = resolveDateSelection(editingEntry.date);
      setDateIndex(dateSelection.dateIndex);
      setCustomDate(dateSelection.customDate);

      if (editingEntry.category) {
        const normalizedCategory = editingEntry.category.trim().toLowerCase();
        const idx = categoryOptions.findIndex((c) => c.name.trim().toLowerCase() === normalizedCategory);
        if (idx >= 0) {
          requestAnimationFrame(() => restoreCategoryIndex(idx, false));
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currency, editingEntry, categoryOptions, restoreCategoryIndex]);

  useEffect(() => {
    if (isEditing || !date) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      const dateSelection = resolveDateSelection(date);
      if (dateSelection.customDate && Number.isNaN(dateSelection.customDate.getTime())) return;
      setDateIndex(dateSelection.dateIndex);
      setCustomDate(dateSelection.customDate);
    });

    return () => {
      cancelled = true;
    };
  }, [date, isEditing]);

  useEffect(() => {
    if (isEditing || !sharedDraft || appliedShareDraftRef.current === sharedDraft) return;
    appliedShareDraftRef.current = sharedDraft;

    queueMicrotask(() => {
      if (draftName) setNoteText(draftName);
      if (draftAmount && Number(draftAmount) > 0) setAmountText(String(Math.round(Number(draftAmount))));
      if (draftIo) setIoIndex(draftIo === "Income" ? 0 : 1);
    });
  }, [draftAmount, draftIo, draftName, isEditing, sharedDraft]);

  useEffect(() => {
    if (
      isEditing ||
      !sharedDraft ||
      !draftCategory ||
      categoryOptions.length === 0 ||
      appliedShareCategoryRef.current === sharedDraft
    ) return;

    const normalizedCategory = draftCategory.trim().toLowerCase();
    const index = categoryOptions.findIndex(
      (category) => category.name.trim().toLowerCase() === normalizedCategory,
    );
    appliedShareCategoryRef.current = sharedDraft;
    if (index >= 0) requestAnimationFrame(() => restoreCategoryIndex(index, false));
    if (index >= 0) automaticOverrideBlockedRef.current = true;
  }, [categoryOptions, draftCategory, isEditing, restoreCategoryIndex, sharedDraft]);

  const addQuickAmount = (value: number) => {
    setAmountText((prev) => String((parseInt(prev, 10) || 0) + value));
  };

  const clearForm = () => {
    if (editingEntry) {
      const displayNominal = editingEntry.originalCurrency === currency.currency && editingEntry.originalNominal !== null
        ? editingEntry.originalNominal
        : currency.toDisplay(editingEntry.nominal);
      const nextAmountText = String(Math.round(displayNominal));

      setIoIndex(editingEntry.io === "Income" ? 0 : 1);
      setAmountText(nextAmountText);
      setInitialAmountText(nextAmountText);
      setNoteText(editingEntry.name);

      const dateSelection = resolveDateSelection(editingEntry.date);
      setDateIndex(dateSelection.dateIndex);
      setCustomDate(dateSelection.customDate);

      if (editingEntry.category) {
        const idx = categoryOptions.findIndex((c) => c.name === editingEntry.category);
        if (idx >= 0) {
          restoreCategoryIndex(idx, true);
        }
      }
      return;
    }

    setDateIndex(getDatePresetIndex("today"));
    setCustomDate(null);
    setAmountText("");
    setInitialAmountText("");
    setNoteText("");
    automaticOverrideBlockedRef.current = false;
    setSuggestedFromHistory(false);
    resetCategoryIndex(true);
  };

  const handleSave = async () => {
    if (isSaving) return;

    const displayNominal = parseInt(amountText, 10) || 0;
    if (displayNominal <= 0) {
      Alert.alert(t("entry.amountRequiredTitle"), t("entry.amountRequiredMessage"));
      return;
    }

    const nominal = Math.round(currency.toIdr(displayNominal));
    const exchangeRateToIdr = currency.isIdr ? 1 : 1 / currency.rate;

    const entryType = ioIndex === 0 ? t("entry.income") : t("entry.expense");
    const entryCategory = selectedCategory ?? categoryOptions[categoryIndex] ?? null;
    const selectedDateOption = DATE_OPTIONS[dateIndex];
    const entryDate = selectedDateOption?.daysAgo != null
      ? toDateKey(getDateDaysAgo(selectedDateOption.daysAgo))
      : toDateKey(customDate ?? new Date());

    const io: "Income" | "Expenses" = ioIndex === 0 ? "Income" : "Expenses";
    const payload = {
      name: noteText.trim() || entryCategory?.name || entryType,
      nominal,
      categoryId: entryCategory?.id ?? null,
      date: entryDate,
      io,
    };

    setIsSaving(true);
    try {
      if (isEditing && id) {
        if (amountText !== initialAmountText) {
          Object.assign(payload, {
            originalNominal: displayNominal,
            originalCurrency: currency.currency,
            exchangeRateToIdr,
            exchangeRateAt: new Date().toISOString(),
          });
        }
        await updateEntry(id, payload);
      } else {
        await createEntry({
          ...payload,
          originalNominal: displayNominal,
          originalCurrency: currency.currency,
          exchangeRateToIdr,
          exchangeRateAt: new Date().toISOString(),
        });
      }

      showIslandToast({
        icon: "checkmark.circle.fill",
        label: isEditing ? t("entry.changesSaved") : t("entry.transactionSaved"),
      });
      clearForm();
      router.back();
    } catch (error) {
      Alert.alert(t("entry.amountRequiredTitle"), error instanceof Error ? error.message : t("entry.amountRequiredMessage"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? t("entry.edit") : "",
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("entry.clear")} onPress={clearForm} />
                  <AndroidFormFooterButton label={t("entry.save")} onPress={handleSave} primary />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.View hidesSharedBackground>
              <AppSegmentedControl
                values={[t("entry.income"), t("entry.expense")]}
                selectedIndex={ioIndex}
                onIndexChange={(index) => {
                  setIoIndex(index);
                  automaticOverrideBlockedRef.current = false;
                  setSuggestedFromHistory(false);
                }}
                style={{ width: 180 }}
              />
            </Stack.Toolbar.View>
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button icon={toolbarIcons.clear} accessibilityLabel={t("entry.clear")} onPress={clearForm} />
            <Stack.Toolbar.Button icon={toolbarIcons.check} onPress={handleSave} variant="done">
              {t("entry.save")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : null}
      <ScrollView
        className="bg-[--app-color-background] flex-1"
        contentContainerClassName="gap-4 px-4 pb-20 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === "android"}
      >
        {Platform.OS === "android" ? (
          <View className="gap-3 pb-1">
            <AppSegmentedControl
              values={[t("entry.income"), t("entry.expense")]}
              selectedIndex={ioIndex}
              onIndexChange={(index) => {
                setIoIndex(index);
                automaticOverrideBlockedRef.current = false;
                setSuggestedFromHistory(false);
              }}
              style={{ width: "100%" }}
            />
            <RNTextInput
              value={noteText}
              onChangeText={(value) => {
                setNoteText(value);
                setSuggestedFromHistory(false);
              }}
              placeholder={t("entry.placeholder.spendingToday")}
              placeholderTextColor={appTheme.colors.muted}
              selectionColor={appTheme.colors.primary}
              className="h-12 rounded-2xl border px-4"
              style={{
                backgroundColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.14 : 0.07),
                borderColor: alpha(appTheme.colors.muted, 0.2),
                color: appTheme.colors.foreground,
                fontSize: 16,
              }}
            />
          </View>
        ) : null}
        <View className="items-center gap-2 pb-1">
          <View className="h-28 w-full items-center justify-center">
            <CashflowAmountInput amountText={amountText} currencySymbol={currency.option.symbol} onAmountTextChange={setAmountText} />
          </View>
          {Platform.OS === "ios" ? (
            <GlassBox
              isInteractive
              tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.35 : 0.18)}
              glassEffectStyle="clear"
              style={{
                borderRadius: 9999,
                height: 40,
                width: Math.max(220, screenWidth - 32),
              }}
            >
              {noteText.length === 0 ? (
                <View pointerEvents="none" className="absolute inset-0 justify-center px-3.5">
                  <Text className="text-base" style={{ color: appTheme.colors.muted }}>
                    {t("entry.placeholder.spendingToday")}
                  </Text>
                </View>
              ) : null}
              <RNTextInput
                value={noteText}
                onChangeText={(value) => {
                  setNoteText(value);
                  setSuggestedFromHistory(false);
                }}
                selectionColor={appTheme.colors.primary}
                style={{
                  color: appTheme.colors.foreground,
                  fontSize: 16,
                  height: 40,
                  includeFontPadding: false,
                  paddingHorizontal: 14,
                  paddingVertical: 0,
                  textAlignVertical: "center",
                }}
              />
            </GlassBox>
          ) : null}
        </View>

        <Section overflowVisible borderless>
          <View className="gap-3 px-4 pt-3 pb-3">
            <QuickAmountStrip denominations={currency.denominations} onAmount={addQuickAmount} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ overflow: "visible" }} contentContainerStyle={{ gap: 8 }}>
              {(quickFills.length > 0 ? quickFills : fallbackQuickFillItems).map((quickFill) => (
                <QuickFillChip
                  key={quickFill.id}
                  label={quickFill.label}
                  onPress={() => {
                    if (quickFill.amount) setAmountText(String(Math.round(currency.toDisplay(quickFill.amount))));
                    setNoteText(quickFill.label);
                    const nextCategoryIndex = categoryOptions.findIndex((category) => category.id === quickFill.categoryId);
                    if (nextCategoryIndex >= 0) {
                      automaticOverrideBlockedRef.current = true;
                      setSuggestedFromHistory(false);
                      selectCategoryIndex(nextCategoryIndex);
                    }
                  }}
                />
              ))}
              <QuickFillChip label={t("entry.tambah")} onPress={() => router.push("/forms/quick-fill" as Href)} />
            </ScrollView>
          </View>
          <View className="h-px" style={{ backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)" }} />
          <View className="py-4" style={{ overflow: "visible" }}>
            <CategorySlider
              ref={sliderRef}
              categories={categoryOptions}
              selectedIndex={categoryIndex}
              onChangeIndex={handleCategoryChange}
              onUserInteraction={() => {
                automaticOverrideBlockedRef.current = true;
                setSuggestedFromHistory(false);
              }}
              showAddButton
              onAddPress={() => router.push("/forms/categories/detail" as Href)}
              onFeedback={() => playCategorySliderFeedback("selection")}
            />
            {suggestedFromHistory ? (
              <Text className="pt-1 text-center text-xs" style={{ color: appTheme.colors.muted }}>
                {t("entry.suggestedFromHistory")}
              </Text>
            ) : null}
          </View>
        </Section>

        <View className="flex-row gap-2">
          {(DATE_OPTIONS).map((option, index) => (
            <DateChoice
              key={option.key}
              label={option.label}
              subtitle={option.daysAgo !== null ? (
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                  {formatCompactDate(getDateDaysAgo(option.daysAgo))}
                </Text>
              ) : (
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                  {customDate ? formatCompactDate(customDate) : t("entry.tapToPick")}
                </Text>
              )}
              selected={dateIndex === index}
              onPress={() => {
                if (dateIndex !== index) {
                  playCategorySliderFeedback("selection");
                }
                setDateIndex(index);
                if (option.daysAgo === null) {
                  setShowDatePicker(true);
                }
              }}
            />
          ))}
        </View>

      </ScrollView>
      {showDatePicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <Pressable className="flex-1 justify-end px-4 pb-8" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setShowDatePicker(false)}>
            <Pressable
              className="rounded-3xl border p-4"
              style={{
                backgroundColor: appTheme.colors.background,
                borderColor: appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
              }}
            >
              <DateTimePicker
                value={customDate ?? new Date()}
                mode="date"
                presentation="inline"
                display="inline"
                accentColor={appTheme.colors.primary}
                onValueChange={(_event, date) => {
                  setCustomDate(date);
                  setDateIndex(getDatePresetIndex("date"));
                  setShowDatePicker(false);
                }}
                onDismiss={() => setShowDatePicker(false)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}
