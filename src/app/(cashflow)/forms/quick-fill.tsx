import { Alert, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { type SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { GlassBox } from "@/components/GlassBox";
import { useEffect, useState } from "react";
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
import { alpha } from "@/lib/color";

function parseAmountInput(value: string) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function QuickFillFormSheet() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const currency = useCurrency();
  const { activeManagement, categories, quickFills, createQuickFill, deleteQuickFill } = useCashflowData();
  const [label, setLabel] = useState("");
  const [amountText, setAmountText] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07);
  const surface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025);
  const rowSurface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.045 : 0.035);

  const {
    categoryIndex,
    categoryOptions,
    handleCategoryChange,
    selectedCategory,
    sliderRef,
  } = useCashflowCategorySlider({
    categories,
    primaryColor: appTheme.colors.primary,
    preferenceKey: "cashflowQuickFillCategoryIndex",
    restoreEnabled: showForm,
  });
  const categoryId = selectedCategory?.id ?? null;

  const addQuickAmount = (value: number) => {
    setAmountText((prev) => String((parseInt(prev, 10) || 0) + value));
  };

  useEffect(() => {
    loadCategorySliderFeedback();
  }, []);

  const handleCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed || isSaving) return;

    const displayAmount = parseAmountInput(amountText);
    const amount = displayAmount === null ? null : Math.round(currency.toIdr(displayAmount));

    setIsSaving(true);
    try {
      await createQuickFill({ label: trimmed, amount, categoryId });
      setLabel("");
      setAmountText("");
    } catch (error) {
      Alert.alert(
        t("quickFill.title"),
        error instanceof Error ? error.message : t("transfer.transferFailedMessage"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (id: string, quickFillLabel: string) => {
    Alert.alert(t("quickFill.removeAlert.title"), t("quickFill.removeAlert.message", { label: quickFillLabel }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("quickFill.removeAlert.remove"), style: "destructive", onPress: () => deleteQuickFill(id).catch(console.error) },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: activeManagement?.name ?? t("quickFill.wallet"),
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("common.close")} onPress={() => router.back()} />
                  <AndroidFormFooterButton label={t("entry.tambah")} onPress={() => setShowForm(true)} primary />
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
            <Stack.Toolbar.View hidesSharedBackground>
              <GlassBox
                isInteractive
                tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 1 : 0.72)}
                glassEffectStyle="clear"
                style={{ borderRadius: 9999 }}
              >
                <Pressable
                  accessibilityRole="button"
                  className="flex-row items-center gap-1.5 px-6 py-3"
                  onPress={() => {
                    setShowForm(true);
                  }}
                >
                  <AppSymbol name="plus" size={16} tintColor={appTheme.colors.background} fallback={<Text className="text-base" style={{ color: appTheme.colors.background }}>+</Text>} />
                  <Text className="font-bold text-base" style={{ color: appTheme.colors.background }}>
                    {t("entry.tambah")}
                  </Text>
                </Pressable>
              </GlassBox>
            </Stack.Toolbar.View>
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
        <View className="gap-1">
          <Text className="text-3xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
            {t("quickFill.title")}
          </Text>
          <Text className="text-sm leading-5" style={{ color: appTheme.colors.muted }}>
            {t("quickFill.description")}
          </Text>
        </View>

        {showForm ? (
          <>
            <CashflowAmountInput amountText={amountText} currencySymbol={currency.option.symbol} onAmountTextChange={setAmountText} />
            <QuickAmountStrip hidden denominations={currency.denominations} onAmount={addQuickAmount} />

            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder={t("quickFill.shortcutLabel")}
              placeholderTextColor={appTheme.colors.muted}
              selectionColor={appTheme.colors.primary}
              className="rounded-2xl px-4 py-3 text-base"
              style={{ color: appTheme.colors.foreground, backgroundColor: rowSurface, borderColor, borderWidth: 1 }}
            />

            {categoryOptions.length > 0 ? (
              <CategorySlider
                ref={sliderRef}
                categories={categoryOptions}
                selectedIndex={categoryIndex}
                onChangeIndex={handleCategoryChange}
                showAddButton
                onAddPress={() => router.push("/forms/categories" as Href)}
                onFeedback={() => playCategorySliderFeedback("selection")}
              />
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={handleCreate}
              className="min-h-12 items-center justify-center rounded-2xl px-4"
              style={{ backgroundColor: label.trim() ? appTheme.colors.primary : alpha(appTheme.colors.primary, 0.28) }}
            >
              <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
                {t("quickFill.create")}
              </Text>
            </Pressable>
          </>
        ) : null}

        <View className="gap-3">
          {quickFills.map((quickFill) => {
            const category = categories.find((item) => item.id === quickFill.categoryId) ?? null;
            const color = category?.color ?? appTheme.colors.primary;

            return (
              <View key={quickFill.id} className="rounded-3xl border p-4" style={{ borderColor, backgroundColor: surface }}>
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(color, 0.16) }}>
                    <AppSymbol name={(category?.icon ?? "bolt.fill") as SFSymbol} size={20} tintColor={color} fallback={<Text style={{ color }}>•</Text>} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                      {quickFill.label}
                    </Text>
                    <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                      {[quickFill.amount ? currency.format(quickFill.amount, { compact: true }) : null, category?.name ?? t("quickFill.noCategory")].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("quickFill.removeLabel", { label: quickFill.label })}
                    onPress={() => confirmDelete(quickFill.id, quickFill.label)}
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
    </>
  );
}
