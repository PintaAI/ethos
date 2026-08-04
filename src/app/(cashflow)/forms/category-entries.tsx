import { useMemo } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { type SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { CashflowTable } from "@/components/cashflow/CashflowTable";
import { useCurrency } from "@/components/CurrencyProvider";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { alpha } from "@/lib/color";
import { localizeCategoryName } from "@/lib/categoryNames";

function EntrySymbol({ name, color }: { name: SFSymbol; color: string }) {
  return <AppSymbol name={name} size={16} tintColor={color} fallback={<Text style={{ color }}>•</Text>} />;
}

export default function CategoryEntriesFormSheet() {
  const { category = "", from = "", to = "" } = useLocalSearchParams<{ category?: string; from?: string; to?: string }>();
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { format } = useCurrency();
  const { entries, categories } = useCashflowData();
  const categoryDetails = categories.find((item) => item.name === category);
  const categoryColor = categoryDetails?.color ?? appTheme.colors.negative;
  const categoryIcon = (categoryDetails?.icon ?? "tag.fill") as SFSymbol;

  const categoryEntries = useMemo(
    () => entries
      .filter((entry) => entry.category === category && entry.io === "Expenses")
      .filter((entry) => !from || entry.date >= from)
      .filter((entry) => !to || entry.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [category, entries, from, to],
  );
  const total = categoryEntries.reduce((sum, entry) => sum + entry.nominal, 0);

  return (
    <>
      <Stack.Screen options={{ title: t("analytics.categoryEntries", { category: localizeCategoryName(category) }) }} />
      <View className="flex-1 bg-[--app-color-background]">
        <CashflowTable
          entries={categoryEntries}
          ListHeaderComponent={
            <View className="flex-row items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: alpha(categoryColor, 0.1), borderColor: alpha(categoryColor, 0.22), borderWidth: 1 }}>
              <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(categoryColor, 0.16) }}>
                <EntrySymbol name={categoryIcon} color={categoryColor} />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>{localizeCategoryName(category)}</Text>
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{t("analytics.entries", { count: categoryEntries.length })}</Text>
              </View>
              <Text className="text-base font-bold" style={{ color: categoryColor }}>{format(total, { compact: true })}</Text>
            </View>
          }
        />
      </View>
    </>
  );
}
