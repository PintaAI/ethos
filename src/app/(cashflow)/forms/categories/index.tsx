import { Platform, Pressable, ScrollView, View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { type SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { AndroidFormFooter, AndroidFormFooterButton } from "@/components/AndroidFormFooter";
import { useAppTheme } from "@/components/AppTheme";
import { useCurrency } from "@/components/CurrencyProvider";
import { BudgetField } from "@/components/cashflow/CategoryBudgetField";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import type { BudgetPeriod, CashflowCategory } from "@/data/cashflow/types";
import { alpha } from "@/lib/color";

const BUDGET_PERIODS = [
  { key: "daily", labelKey: "categories.daily" },
  { key: "weekly", labelKey: "categories.weekly" },
  { key: "monthly", labelKey: "categories.monthly" },
] as const satisfies readonly { key: BudgetPeriod; labelKey: string }[];

function categoryBudgetValue(category: CashflowCategory, period: BudgetPeriod) {
  if (period === "daily") return category.budgetDaily;
  if (period === "weekly") return category.budgetWeekly;
  return category.budgetMonthly;
}

function budgetSummary(category: CashflowCategory, format: ReturnType<typeof useCurrency>["format"], fallback: string) {
  const monthly = categoryBudgetValue(category, "monthly");
  const weekly = categoryBudgetValue(category, "weekly");
  const daily = categoryBudgetValue(category, "daily");
  const value = monthly ?? weekly ?? daily;
  if (!value) return fallback;
  return format(value, { compact: true });
}

export default function CategoriesFormSheet() {
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { format } = useCurrency();
  const { activeManagement, categories, overallBudgets, updateOverallBudget } = useCashflowData();
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const surface = appTheme.isDark ? "rgba(255,255,255,0.055)" : "rgba(15,23,42,0.035)";
  const overallBudgetByPeriod = new Map(overallBudgets.map((budget) => [budget.period, budget.nominal]));

  return (
    <>
      <Stack.Screen
        options={{
          title: t("sidebar.categoriesBudget"),
          unstable_sheetFooter: Platform.OS === "android"
            ? () => (
                <AndroidFormFooter>
                  <AndroidFormFooterButton label={t("common.close")} onPress={() => router.back()} />
                  <AndroidFormFooterButton label={t("categories.newCategory")} onPress={() => router.push("/forms/categories/detail" as Href)} primary />
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
            <Stack.Toolbar.Button icon={toolbarIcons.add} onPress={() => router.push("/forms/categories/detail" as Href)}>
              {t("categories.newCategory")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : null}

      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName={`gap-5 px-5 pt-5 ${Platform.OS === "android" ? "pb-24" : "pb-10"}`}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === "android"}
      >
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
            {activeManagement?.name ?? "Wallet"}
          </Text>
          <Text className="text-3xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
            {t("categories.heading")}
          </Text>
          <Text className="text-sm leading-5" style={{ color: appTheme.colors.muted }}>
            {t("categories.overviewDescription")}
          </Text>
        </View>

        <View className="gap-4 rounded-3xl border p-4" style={{ borderColor, backgroundColor: surface }}>
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.14) }}>
              <AppSymbol name="chart.pie.fill" size={20} tintColor={appTheme.colors.primary} fallback={<Text style={{ color: appTheme.colors.primary }}>•</Text>} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                {t("categories.overallBudget")}
              </Text>
              <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                {t("categories.overallBudgetDescription")}
              </Text>
            </View>
          </View>
          {BUDGET_PERIODS.map((period) => (
            <BudgetField key={`overall-${period.key}-${overallBudgetByPeriod.get(period.key) ?? 0}`} label={t(period.labelKey)} value={overallBudgetByPeriod.get(period.key) ?? null} onSave={(nextValue) => updateOverallBudget(period.key, nextValue)} />
          ))}
        </View>

        <View className="gap-3">
          <View className="flex-row items-end justify-between px-1">
            <Text className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>
              {t("categories.categories")}
            </Text>
            <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
              {t("categories.categoryCount", { count: categories.length })}
            </Text>
          </View>
          {categories.map((category) => {
            const categoryColor = category.color ?? appTheme.colors.primary;
            const categoryIcon = (category.icon ?? "tag.fill") as SFSymbol;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/forms/categories/detail", params: { id: category.id } } as Href)}
                className="rounded-3xl border p-4"
                style={{ borderColor, backgroundColor: surface }}
              >
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(categoryColor, 0.16) }}>
                    <AppSymbol name={categoryIcon} size={20} tintColor={categoryColor} fallback={<Text style={{ color: categoryColor }}>•</Text>} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                      {category.name}
                    </Text>
                    <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                      {t("categories.budgetSummary", { value: budgetSummary(category, format, t("categories.noBudget")) })}
                    </Text>
                  </View>
                  <AppSymbol name="chevron.right" size={15} tintColor={appTheme.colors.muted} fallback={<Text style={{ color: appTheme.colors.muted }}>›</Text>} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}
