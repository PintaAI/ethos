import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { type SFSymbol } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as RNText } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { useCurrency } from "@/components/CurrencyProvider";
import { alpha } from "@/lib/color";
import { localizeCategoryName } from "@/lib/categoryNames";
import { localeFromLanguage } from "@/lib/date";
import type { CashflowEntry } from "@/components/cashflow/CashflowTable";

type DayDetailPanelProps = {
  date: Date | null;
  entries: CashflowEntry[];
  onEntryPress?: (entry: CashflowEntry) => void;
};



function DetailSymbol({ name, color, size = 15 }: { name: SFSymbol; color: string; size?: number }) {
  return <AppSymbol name={name} size={size} tintColor={color} fallback={<RNText style={{ color }}>•</RNText>} />;
}

export function DayDetailPanel({ date, entries, onEntryPress }: DayDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;
  const { format } = useCurrency();
  const locale = localeFromLanguage(i18n.language);
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)";

  const total = useMemo(
    () => entries.reduce((sum, e) => sum + (e.io === "Income" ? e.nominal : -e.nominal), 0),
    [entries],
  );

  if (!date) {
    return (
      <View className="items-center justify-center rounded-2xl p-6" style={{ borderColor, borderWidth: 1 }}>
        <RNText className="text-sm" style={{ color: appTheme.colors.muted }}>{t('cashflow.selectDateHint')}</RNText>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View className="items-center justify-center rounded-2xl p-6" style={{ borderColor, borderWidth: 1 }}>
        <RNText className="text-sm" style={{ color: appTheme.colors.muted }}>
          {t('cashflow.noEntriesOnDate', { date: date.toLocaleDateString(locale, { day: "numeric", month: "long" }) })}
        </RNText>
      </View>
    );
  }

  return (
    <View className="overflow-hidden rounded-2xl" style={{ borderColor, borderWidth: 1 }}>
      <View className="flex-row items-center justify-between gap-3 border-b px-4 py-3" style={{ borderBottomColor: appTheme.isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)" }}>
        <View className="min-w-0">
          <RNText numberOfLines={1} className="text-sm font-medium" style={{ color: appTheme.colors.foreground }}>
            {date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
          </RNText>
          <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>
            {t('analytics.entries', { count: entries.length })}
          </RNText>
        </View>
        <View className="shrink-0 items-end">
          <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>{t('analytics.total')}</RNText>
          <RNText className="text-sm font-semibold" style={{ color: total >= 0 ? positive : negative }}>
            {format(total, { compact: true })}
          </RNText>
        </View>
      </View>
      <ScrollView bounces={false} className="max-h-60">
        {entries.map((entry) => {
          const isIncome = entry.io === "Income";
          return (
            <Pressable
              key={entry.id}
              onPress={() => onEntryPress?.(entry)}
              className="flex-row items-center justify-between gap-3 px-4 py-3"
              style={{ borderBottomColor: appTheme.isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.04)", borderBottomWidth: 1 }}
            >
              <View className="min-w-0 flex-1 gap-1">
                <RNText numberOfLines={1} className="text-sm font-medium" style={{ color: appTheme.colors.foreground }}>
                  {entry.name}
                </RNText>
                {entry.category ? (
                  <View className="self-start flex-row items-center gap-1 rounded-full px-1.5 py-0.5" style={{ backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)" }}>
                    <DetailSymbol name="tag.fill" color={appTheme.colors.muted} size={10} />
                    <RNText className="text-xs font-medium" style={{ color: appTheme.colors.muted }}>{localizeCategoryName(entry.category)}</RNText>
                  </View>
                ) : null}
              </View>
              <RNText className="shrink-0 text-sm font-semibold" style={{ color: isIncome ? positive : negative }}>
                {isIncome ? "+" : "-"}{format(entry.nominal, { compact: true })}
              </RNText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
