import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { type SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { useAppTheme } from "@/components/AppTheme";
import { BudgetField } from "@/components/cashflow/CategoryBudgetField";
import { IconSelector } from "@/components/IconSelector";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import type { BudgetPeriod, CashflowCategory } from "@/data/cashflow/types";
import { CATEGORY_COLOR_OPTIONS, CATEGORY_ICON_OPTIONS } from "@/lib/categoryMapping";
import { localizeCategoryName } from "@/lib/categoryNames";
import { alpha } from "@/lib/color";

const BUDGET_PERIODS = [
  { key: "daily", labelKey: "categories.daily" },
  { key: "weekly", labelKey: "categories.weekly" },
  { key: "monthly", labelKey: "categories.monthly" },
] as const satisfies readonly { key: BudgetPeriod; labelKey: string }[];

const EMPTY_BUDGETS: Record<BudgetPeriod, number | null> = {
  daily: null,
  weekly: null,
  monthly: null,
};

function categoryBudgetValue(category: CashflowCategory, period: BudgetPeriod) {
  if (period === "daily") return category.budgetDaily;
  if (period === "weekly") return category.budgetWeekly;
  return category.budgetMonthly;
}

function alertCategoryError(error: unknown) {
  Alert.alert(
    "Error",
    error instanceof Error ? error.message : "Could not save the category right now.",
  );
}

export default function CategoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { categories, createCategory, updateCategory, deleteCategory, updateCategoryBudget } = useCashflowData();
  const isNewCategory = !id;
  const category = categories.find((item) => item.id === id) ?? null;
  const categoryStateKey = category?.id ?? (isNewCategory ? "new" : "missing");
  const [loadedCategoryKey, setLoadedCategoryKey] = useState(categoryStateKey);
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState((category?.icon ?? CATEGORY_ICON_OPTIONS[0]) as SFSymbol);
  const [draftBudgets, setDraftBudgets] = useState<Record<BudgetPeriod, number | null>>(() => ({ ...EMPTY_BUDGETS }));
  const [isSaving, setIsSaving] = useState(false);
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const surface = appTheme.isDark ? "rgba(255,255,255,0.055)" : "rgba(15,23,42,0.035)";

  if (loadedCategoryKey !== categoryStateKey) {
    setLoadedCategoryKey(categoryStateKey);
    setName(category?.name ?? "");
    setColor(category?.color ?? CATEGORY_COLOR_OPTIONS[0]);
    setIcon((category?.icon ?? CATEGORY_ICON_OPTIONS[0]) as SFSymbol);
    setDraftBudgets({ ...EMPTY_BUDGETS });
  }

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      if (isNewCategory) {
        const categoryId = await createCategory({ name: trimmed, color, icon });
        if (!categoryId) throw new Error("Could not create the category right now.");
        for (const period of BUDGET_PERIODS) {
          const value = draftBudgets[period.key];
          if (value) await updateCategoryBudget(categoryId, period.key, value);
        }
      } else if (category) {
        await updateCategory(category.id, { name: trimmed, color, icon });
      }
      router.back();
    } catch (error) {
      alertCategoryError(error);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!category) return;
    Alert.alert(t("categories.removeCategoryTitle"), t("categories.removeCategoryMessage", { name: localizeCategoryName(category.name) }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.remove"), style: "destructive", onPress: () => deleteCategory(category.id).then(() => router.back()).catch(alertCategoryError) },
    ]);
  };

  if (!isNewCategory && !category) {
    return (
      <View className="flex-1 items-center justify-center bg-[--app-color-background] px-6">
        <Stack.Screen options={{ title: t("categories.categoryDetail") }} />
        <Text className="text-center text-base font-semibold" style={{ color: appTheme.colors.foreground }}>
          {t("categories.categoryNotFound")}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: isNewCategory ? t("categories.newCategory") : localizeCategoryName(category?.name) ?? undefined,
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("common.save")} onPress={handleSave} primary />
                </AndroidFormFooter>
              )
            : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={toolbarIcons.check} onPress={handleSave} variant="done">
            {t("common.save")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}

      <ScrollView className="flex-1 bg-[--app-color-background]" contentContainerClassName="gap-4 px-4 pb-12 pt-4" contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" nestedScrollEnabled={Platform.OS === "android"}>
        <View className="gap-4 rounded-[32px] border p-4" style={{ borderColor, backgroundColor: surface }}>
          <View className="flex-row items-center gap-4">
            <View className="h-24 w-24 items-center justify-center rounded-[30px]" style={{ backgroundColor: alpha(color, 0.16) }}>
              <AppSymbol name={icon} size={38} tintColor={color} fallback={<Text style={{ color }}>•</Text>} />
            </View>
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
                {isNewCategory ? t("categories.newCategory") : t("categories.categoryDetail")}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("categories.categoryNamePlaceholder")}
                placeholderTextColor={appTheme.colors.muted}
                selectionColor={appTheme.colors.primary}
                className="text-4xl font-bold tracking-tight"
                style={{ color: appTheme.colors.foreground, minHeight: 48, padding: 0 }}
              />
            </View>
          </View>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center gap-2 px-1">
            <AppSymbol name="paintpalette.fill" size={14} tintColor={appTheme.colors.muted} fallback={<Text style={{ color: appTheme.colors.muted }}>•</Text>} />
            <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
              {t("categories.appearance")}
            </Text>
          </View>
          <View className="gap-4 rounded-[2rem] border p-4" style={{ borderColor, backgroundColor: surface }}>
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
                {t("categories.color")}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerClassName="gap-2 px-0.5 py-1">
                {CATEGORY_COLOR_OPTIONS.map((option, index) => {
                  const selected = color === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityLabel={`${t("categories.color")} ${index + 1}`}
                      accessibilityState={{ selected }}
                      onPress={() => setColor(option)}
                      className="h-11 w-11 items-center justify-center rounded-full"
                      style={{ backgroundColor: option, borderColor: selected ? appTheme.colors.foreground : alpha(appTheme.colors.foreground, 0.12), borderWidth: selected ? 3 : 1 }}
                    >
                      {selected ? <AppSymbol name="checkmark" size={14} tintColor="#fff" fallback={<Text style={{ color: "#fff" }}>✓</Text>} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
                {t("categories.icon")}
              </Text>
              <IconSelector horizontal options={CATEGORY_ICON_OPTIONS} value={icon} tintColor={color} onChange={setIcon} />
            </View>
          </View>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center gap-2 px-1">
            <AppSymbol name="chart.pie.fill" size={14} tintColor={appTheme.colors.muted} fallback={<Text style={{ color: appTheme.colors.muted }}>•</Text>} />
            <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
              {t("categories.budgetLimits")}
            </Text>
          </View>
          <View className="overflow-hidden rounded-[2rem] border px-2" style={{ borderColor, backgroundColor: surface }}>
            {BUDGET_PERIODS.map((period, index) => {
              const value = category ? categoryBudgetValue(category, period.key) : draftBudgets[period.key];
              return (
                <View key={period.key} style={index < BUDGET_PERIODS.length - 1 ? { borderBottomColor: borderColor, borderBottomWidth: 1 } : undefined}>
                  <BudgetField
                    compact
                    key={category ? `${category.id}-${period.key}-${value ?? 0}` : `new-${period.key}`}
                    label={t(period.labelKey)}
                    value={value}
                    onSave={category ? (nextValue) => updateCategoryBudget(category.id, period.key, nextValue) : undefined}
                    onValueChange={category ? undefined : (nextValue) => setDraftBudgets((current) => ({ ...current, [period.key]: nextValue }))}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {category ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("categories.removeAccessibility", { name: localizeCategoryName(category.name) })} onPress={confirmDelete} className="min-h-12 items-center justify-center rounded-2xl border" style={{ borderColor: alpha(appTheme.colors.negative, 0.4), backgroundColor: alpha(appTheme.colors.negative, appTheme.isDark ? 0.16 : 0.08) }}>
            <Text className="text-sm font-bold" style={{ color: appTheme.colors.negative }}>
              {t("common.remove")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}
