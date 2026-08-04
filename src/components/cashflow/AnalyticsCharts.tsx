import { useRef, useState, useMemo } from "react";
import type React from "react";
import { Pressable, ScrollView, View, type ScrollView as ScrollViewType } from "react-native";
import type { SFSymbol } from "expo-symbols";
import Svg, { Circle, G } from "react-native-svg";
import { AppText as RNText } from "@/components/AppText";
import { AppSymbol } from "@/components/AppSymbol";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { AppSegmentedControl } from "@/components/AppSegmentedControl";

import { alpha } from "@/lib/color";
import { localizeCategoryName } from "@/lib/categoryNames";
import { localeFromLanguage, toDateKey } from "@/lib/date";
import type { CashflowAnalytics } from "@/data/cashflow/types";

// ─── Types ───────────────────────────────────────────────

export type DatePeriod = { key: string; label: string; from?: string; to?: string; allTime?: boolean };

type Filters = {
  from?: string;
  to?: string;
  allTime?: boolean;
};

type CategoryAnalytics = { category: string; color?: string; total: number; count: number; percentage: number };
type MonthlyAnalytics = { month: string; monthLabel: string; income: number; expenses: number };
type CreatorAnalytics = { name: string | null; totalIncome: number; totalExpenses: number; entryCount: number };
type AnalyticsData = CashflowAnalytics;
type MonthHighlight = "all" | string[];

type AnalyticsChartsProps = {
  header?: React.ReactNode;
  hideStats?: boolean;
  data?: AnalyticsData;
  monthlyTrendData?: MonthlyAnalytics[];
  datePeriod?: DatePeriod;
  onDatePeriodChange?: (period: DatePeriod) => void;
  selectedMonth?: Date;
  onSelectedMonthChange?: (month: Date) => void;
  onCategoryPress?: (category: string) => void;
};

type MockAnalyticsData = {
  summary: { totalIncome: number; totalExpenses: number; balance: number; entryCount: number };
  byCategory: CategoryAnalytics[];
  byMonth: MonthlyAnalytics[];
  byCreator: CreatorAnalytics[];
};

// ─── Helpers ──────────────────────────────────────────────

function ChartSymbol({ name, color, size = 14 }: { name: SFSymbol; color: string; size?: number }) {
  return <AppSymbol name={name} size={size} tintColor={color} fallback={<RNText style={{ color }}>•</RNText>} />;
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function recentMonthKeys(anchor: Date, count: number) {
  return Array.from({ length: count }, (_, index) => monthKeyFromDate(new Date(anchor.getFullYear(), anchor.getMonth() - index, 1))).reverse();
}

// ─── Mock Data ────────────────────────────────────────────

function createMockAnalytics(filters: Filters, locale: string): MockAnalyticsData {
  const allMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(2026, 0 + i, 1);
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, monthLabel: d.toLocaleDateString(locale, { month: "short", year: "numeric" }) };
  });

  const allCategories: CategoryAnalytics[] = [
    { category: "Makanan", color: "#dc2626", total: 2840000, count: 42, percentage: 0 },
    { category: "Transportasi", color: "#ea580c", total: 1520000, count: 28, percentage: 0 },
    { category: "Belanja", color: "#ca8a04", total: 1960000, count: 19, percentage: 0 },
    { category: "Tagihan", color: "#2563eb", total: 2250000, count: 12, percentage: 0 },
    { category: "Hiburan", color: "#9333ea", total: 890000, count: 8, percentage: 0 },
    { category: "Lainnya", color: "#64748b", total: 440000, count: 5, percentage: 0 },
  ];
  const totalExpenses = allCategories.reduce((s, c) => s + c.total, 0);
  allCategories.forEach((c) => { c.percentage = Math.round((c.total / totalExpenses) * 100); });

  const totalIncome = 47500000;
  const entryCount = 160;

  const creators: CreatorAnalytics[] = [
    { name: "Nadia", totalIncome: 22000000, totalExpenses: 4200000, entryCount: 65 },
    { name: "Raka", totalIncome: 18500000, totalExpenses: 3100000, entryCount: 48 },
    { name: "Dimas", totalIncome: 7000000, totalExpenses: 1950000, entryCount: 30 },
    { name: null, totalIncome: 0, totalExpenses: 1250000, entryCount: 17 },
  ];

  return {
    summary: { totalIncome, totalExpenses: totalExpenses, balance: totalIncome - totalExpenses, entryCount },
    byCategory: allCategories,
    byMonth: allMonths.map((m, i) => ({
      ...m,
      income: totalIncome / 6 + Math.round((Math.sin(i * 1.2) * 1500000)),
      expenses: totalExpenses / 6 + Math.round((Math.cos(i * 1.5) * 400000)),
    })),
    byCreator: creators,
  };
}

// ─── Period Navigation ────────────────────────────────────

function PeriodNav({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const appTheme = useAppTheme();
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Pressable onPress={onPrev} className="h-9 w-9 items-center justify-center rounded-full">
        <ChartSymbol name="arrow.left" color={appTheme.colors.foreground} />
      </Pressable>
      <RNText className="flex-1 text-center text-sm font-semibold capitalize" style={{ color: appTheme.colors.foreground }}>
        {label}
      </RNText>
      <Pressable onPress={onNext} className="h-9 w-9 items-center justify-center rounded-full">
        <ChartSymbol name="arrow.right" color={appTheme.colors.foreground} />
      </Pressable>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const appTheme = useAppTheme();
  const bc = appTheme.isDark ? "rgba(255,255,255,0.13)" : "rgba(15,23,42,0.12)";
  return (
    <Pressable onPress={onPress} className="rounded-full px-3 py-1.5" style={{ backgroundColor: active ? appTheme.colors.primary : "transparent", borderColor: bc, borderWidth: 1 }}>
      <RNText className="text-xs font-semibold" style={{ color: active ? appTheme.colors.inverseForeground : appTheme.colors.muted }}>{label}</RNText>
    </Pressable>
  );
}

export const DATE_PRESETS: DatePeriod[] = [
  { key: "allTime", label: "All time", allTime: true },
  { key: "today", label: "Today", from: toDateKey(new Date()), to: toDateKey(new Date()) },
  { key: "7days", label: "7 days", from: toDateKey(new Date(Date.now() - 6 * 86400000)), to: toDateKey(new Date()) },
  { key: "thisMonth", label: "This month", from: toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: toDateKey(new Date()) },
  { key: "lastMonth", label: "Last month", from: toDateKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)), to: toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) },
  { key: "3months", label: "3 months", from: toDateKey(new Date(Date.now() - 90 * 86400000)), to: toDateKey(new Date()) },
  { key: "thisYear", label: "This year", from: toDateKey(new Date(new Date().getFullYear(), 0, 1)), to: toDateKey(new Date()) },
];

// ─── Monthly Trend Bar Chart ──────────────────────────────

function BarChart({ data, highlightedMonths, onMonthPress }: { data: MonthlyAnalytics[]; highlightedMonths?: MonthHighlight; onMonthPress?: (month: string) => void }) {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const { format } = useCurrency();
  const scrollViewRef = useRef<ScrollViewType>(null);
  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;
  const months = data.slice(-12);
  const maxVal = Math.max(...months.flatMap((d) => [d.income, d.expenses]), 1);
  const chartColumnWidth = 58;
  const chartHalfHeight = 90;
  const chartSplitHeight = 28;
  const barWidth = 24;
  const barHeight = (value: number) => Math.max(4, (value / maxVal) * chartHalfHeight);

  return (
    <View className="gap-3">
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="items-center gap-3 pr-1"
        style={{ height: 250 }}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
      >
        {months.map((d) => {
          const isSelected = highlightedMonths === "all" || Boolean(highlightedMonths?.includes(d.month));
          const labelColor = isSelected ? appTheme.colors.primary : appTheme.colors.muted;
          const incomeHeight = barHeight(d.income);
          const expenseHeight = barHeight(d.expenses);
          const [y, m] = d.month.split("-").map(Number);
          const monthOnly = new Date(y, m - 1, 1).toLocaleDateString(i18n.language === "id" ? "id-ID" : "en-US", { month: "short" });

          return (
          <Pressable key={d.month} onPress={() => onMonthPress?.(d.month)} className="items-center" style={{ width: chartColumnWidth }}>
            <View style={{ width: chartColumnWidth, height: chartHalfHeight * 2 + chartSplitHeight, marginVertical: 16 }}>
              <RNText className="absolute text-center" style={{ color: labelColor, fontSize: 11, fontWeight: "700", bottom: chartHalfHeight * 2 + chartSplitHeight + 4, width: chartColumnWidth }}>
                {format(d.income, { compact: true })}
              </RNText>
              <View className="items-center justify-end" style={{ height: chartHalfHeight }}>
                <View style={{ width: barWidth, height: incomeHeight, backgroundColor: positive, opacity: isSelected ? 1 : 0.45, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 50, borderBottomRightRadius: 50 }} />
              </View>
              <View className="items-center justify-center" style={{ height: chartSplitHeight }}>
                <View className="items-center rounded-full px-1.5 py-0.5" style={{ width: chartColumnWidth, backgroundColor: isSelected ? alpha(appTheme.colors.primary, 0.12) : "transparent" }}>
                  <RNText numberOfLines={1} className="text-xs text-center" style={{ color: labelColor, fontWeight: isSelected ? "700" : "400" }}>{monthOnly}</RNText>
                </View>
              </View>
              <View className="items-center" style={{ height: chartHalfHeight }}>
                <View style={{ width: barWidth, height: expenseHeight, backgroundColor: negative, opacity: isSelected ? 1 : 0.45, borderTopLeftRadius: 50, borderTopRightRadius: 50, borderBottomLeftRadius: 999, borderBottomRightRadius: 999 }} />
              </View>
              <RNText className="absolute text-center" style={{ color: labelColor, fontSize: 11, fontWeight: "700", top: chartHalfHeight * 2 + chartSplitHeight + 4, width: chartColumnWidth }}>
                {format(d.expenses, { compact: true })}
              </RNText>
            </View>
          </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Category Breakdown ───────────────────────────────────

function CategoryDonut({ data }: { data: CategoryAnalytics[] }) {
  const appTheme = useAppTheme();
  const { format } = useCurrency();
  const size = 176;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentGap = 5;
  const trackColor = appTheme.isDark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.06)";
  const centerColor = appTheme.isDark ? "rgba(255,255,255,0.045)" : "rgba(15,23,42,0.035)";
  const total = data.reduce((sum, category) => sum + category.total, 0);
  const segments = data.reduce<{
    progress: number;
    items: { category: CategoryAnalytics; dash: number; strokeDashoffset: number }[];
  }>((acc, category) => {
    const share = total > 0 ? category.total / total : 0;
    const dash = Math.max(0, share * circumference - segmentGap);

    return {
      progress: acc.progress + share,
      items: [...acc.items, { category, dash, strokeDashoffset: -acc.progress * circumference }],
    };
  }, { progress: 0, items: [] }).items;

  return (
    <View className="items-center gap-5">
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <G rotation="-90" origin={`${center}, ${center}`}>
            {segments.map(({ category, dash, strokeDashoffset }) => (
                <Circle
                  key={category.category}
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={category.color ?? appTheme.colors.primary}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="butt"
                  fill="transparent"
                />
            ))}
          </G>
        </Svg>
        <View className="absolute h-[104px] w-[104px] items-center justify-center rounded-full" style={{ backgroundColor: centerColor }}>
          <RNText className="text-xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>{format(total, { compact: true })}</RNText>
        </View>
      </View>

      <View className="w-full gap-2.5">
        {data.map((category) => (
          <View key={category.category} className="flex-row items-center gap-2.5">
            <View className="h-1.5 w-5 rounded-full" style={{ backgroundColor: category.color ?? appTheme.colors.primary }} />
            <RNText numberOfLines={1} className="flex-1 text-xs font-medium" style={{ color: appTheme.colors.foreground }}>{localizeCategoryName(category.category)}</RNText>
            <RNText className="w-10 text-right text-xs font-semibold" style={{ color: appTheme.colors.muted }}>{category.percentage}%</RNText>
            <RNText className="w-[72px] text-right text-xs font-semibold" style={{ color: appTheme.colors.foreground }}>{format(category.total, { compact: true })}</RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

function CategoryBreakdown({ data, onCategoryPress }: { data: CategoryAnalytics[]; onCategoryPress?: (category: string) => void }) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { format } = useCurrency();
  const [showDetail, setShowDetail] = useState(false);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <RNText className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{t('analytics.categoryBreakdown')}</RNText>
        <AppSegmentedControl
          values={[t('analytics.chart'), t('analytics.details')]}
          selectedIndex={showDetail ? 1 : 0}
          onIndexChange={(index) => setShowDetail(index === 1)}
          style={{ width: 150 }}
        />
      </View>

      {!showDetail ? (
        <CategoryDonut data={data} />
      ) : (
        <View className="gap-2">
          {data.map((cat) => {
            const color = cat.color ?? appTheme.colors.primary;

            return (
              <Pressable
                key={cat.category}
                onPress={() => onCategoryPress?.(cat.category)}
                accessibilityRole="button"
                accessibilityLabel={`${localizeCategoryName(cat.category)}, ${format(cat.total)}, ${t('analytics.entries', { count: cat.count })}`}
                className="min-h-16 flex-row items-center gap-3 rounded-[28px] px-3 py-3"
                style={{
                  backgroundColor: alpha(color, appTheme.isDark ? 0.1 : 0.055),
                  borderColor: alpha(color, appTheme.isDark ? 0.2 : 0.12),
                  borderWidth: 1,
                }}
              >
                <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: alpha(color, 0.13) }}>
                  <ChartSymbol name="tag.fill" color={color} size={16} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <RNText numberOfLines={1} className="text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>{localizeCategoryName(cat.category)}</RNText>
                  <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>{t('analytics.entries', { count: cat.count })}</RNText>
                </View>
                <View className="shrink-0 items-end gap-0.5">
                  <RNText numberOfLines={1} className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{format(cat.total, { compact: true })}</RNText>
                  <RNText className="text-xs font-semibold" style={{ color }}>{cat.percentage}%</RNText>
                </View>
                <ChartSymbol name="chevron.right" color={appTheme.colors.muted} size={11} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Creator Breakdown ────────────────────────────────────

function CreatorBreakdown({ data }: { data: CreatorAnalytics[] }) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { format } = useCurrency();
  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;
  const maxExpense = Math.max(...data.map((c) => c.totalExpenses), 1);

  return (
    <View className="gap-3">
      {data.map((creator) => {
        const label = creator.name ?? t('analytics.unknown');
        const initials = label.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

        return (
          <View key={creator.name ?? "unknown"} className="gap-2">
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.13) }}>
                <RNText className="text-xs font-bold" style={{ color: appTheme.colors.primary }}>{initials}</RNText>
              </View>
              <View className="min-w-0 flex-1">
                <RNText numberOfLines={1} className="text-sm font-medium" style={{ color: appTheme.colors.foreground }}>{label}</RNText>
                <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>{t('analytics.entries', { count: creator.entryCount })}</RNText>
              </View>
              <View className="items-end shrink-0">
                {creator.totalIncome > 0 ? (
                  <RNText className="text-xs font-semibold" style={{ color: positive }}>+{format(creator.totalIncome, { compact: true })}</RNText>
                ) : null}
                {creator.totalExpenses > 0 ? (
                  <RNText className="text-xs font-semibold" style={{ color: negative }}>-{format(creator.totalExpenses, { compact: true })}</RNText>
                ) : null}
              </View>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.07)" }}>
              <View className="h-full rounded-full" style={{ width: `${(creator.totalExpenses / maxExpense) * 100}%`, backgroundColor: negative, opacity: 0.6 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────

export function AnalyticsCharts({ header, hideStats = false, data: providedData, monthlyTrendData, datePeriod: controlledDatePeriod, onDatePeriodChange, selectedMonth: controlledSelectedMonth, onSelectedMonthChange, onCategoryPress }: AnalyticsChartsProps) {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const { format } = useCurrency();
  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;
  const [showBalance, setShowBalance] = useState(true);
  const [internalDatePeriod, setInternalDatePeriod] = useState<DatePeriod>(DATE_PRESETS[0]);
  const [internalSelectedMonth, setInternalSelectedMonth] = useState(() => new Date());
  const datePeriod = controlledDatePeriod ?? internalDatePeriod;
  const selectedMonth = controlledSelectedMonth ?? internalSelectedMonth;

  function setDatePeriod(period: DatePeriod) {
    if (onDatePeriodChange) onDatePeriodChange(period);
    else setInternalDatePeriod(period);

    const anchor = period.to ?? period.from;
    if (anchor) {
      const [year, month] = anchor.split("-").map(Number);
      const nextMonth = new Date(year, month - 1, 1);
      if (onSelectedMonthChange) onSelectedMonthChange(nextMonth);
      else setInternalSelectedMonth(nextMonth);
    }
  }

  function setSelectedMonth(month: Date) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    if (onSelectedMonthChange) onSelectedMonthChange(nextMonth);
    else setInternalSelectedMonth(nextMonth);

    const from = toDateKey(nextMonth);
    const to = toDateKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0));
    const locale = i18n.language === "id" ? "id-ID" : "en-US";
    const label = nextMonth.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const nextPeriod = { key: `month-${from}`, label, from, to };
    if (onDatePeriodChange) onDatePeriodChange(nextPeriod);
    else setInternalDatePeriod(nextPeriod);
  }

  function setSelectedMonthKey(month: string) {
    const [year, monthNumber] = month.split("-").map(Number);
    setSelectedMonth(new Date(year, monthNumber - 1, 1));
  }

  const data = useMemo(
    () => providedData ?? createMockAnalytics({ from: datePeriod.from, to: datePeriod.to, allTime: datePeriod.allTime }, localeFromLanguage(i18n.language)),
    [datePeriod, providedData, i18n.language],
  );

  const monthLabel = selectedMonth.toLocaleDateString(i18n.language === "id" ? "id-ID" : "en-US", { month: "long", year: "numeric" });
  const selectedMonthKey = monthKeyFromDate(selectedMonth);
  const highlightedMonths = useMemo<MonthHighlight>(() => {
    if (datePeriod.allTime || datePeriod.key === "thisYear") return "all";
    if (datePeriod.key === "3months") return recentMonthKeys(selectedMonth, 3);
    return [selectedMonthKey];
  }, [datePeriod, selectedMonth, selectedMonthKey]);

  const mutedSurface = appTheme.isDark ? "rgba(255,255,255,0.045)" : "rgba(15,23,42,0.035)";
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)";

  return (
    <ScrollView
      className="bg-[--app-color-background] flex-1"
      contentContainerClassName="gap-4 px-5 pb-10 pt-5"
      contentInsetAdjustmentBehavior="automatic"
    >
      {header}

      {/* Stats */}
      {hideStats ? null : (
        <View className="mb-1">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-3">
              <RNText className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>{t('analytics.balance')}</RNText>
              <Pressable onPress={() => setShowBalance(!showBalance)} className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: mutedSurface }}>
                <ChartSymbol name={showBalance ? "eye.fill" : "eye.slash.fill"} color={appTheme.colors.muted} />
              </Pressable>
            </View>
            <View className="flex-row items-center gap-2">
              <ChartSymbol name="arrow.down.circle.fill" color={positive} />
              <RNText className="text-xs font-semibold" style={{ color: positive }}>{showBalance ? format(data.summary.totalIncome, { compact: true }) : "••••"}</RNText>
              <View className="h-3 w-px" style={{ backgroundColor: appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)" }} />
              <ChartSymbol name="arrow.up.circle.fill" color={negative} />
              <RNText className="text-xs font-semibold" style={{ color: negative }}>{showBalance ? format(data.summary.totalExpenses, { compact: true }) : "••••"}</RNText>
            </View>
          </View>
          <RNText className="mt-1 text-4xl font-black tracking-tight" style={{ color: data.summary.balance < 0 ? negative : appTheme.colors.foreground }}>
            {showBalance ? format(data.summary.balance, { compact: true }) : "••••••"}
          </RNText>
          <RNText className="mt-0.5 text-xs" style={{ color: appTheme.colors.muted }}>{t('analytics.entries', { count: data.summary.entryCount })}</RNText>
        </View>
      )}

      {/* Period Navigation */}
      <PeriodNav
        label={monthLabel}
        onPrev={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))}
        onNext={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))}
      />

      {/* Filter Presets */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {DATE_PRESETS.map((preset) => {
          const isActive = preset.key === datePeriod.key || (preset.allTime && datePeriod.allTime) || (preset.from === datePeriod.from && preset.to === datePeriod.to);
          return <FilterChip key={preset.key} label={t(`analytics.${preset.key}` as const)} active={isActive} onPress={() => setDatePeriod(preset)} />;
        })}
      </ScrollView>

      {/* Monthly Trend */}
      <View className="overflow-hidden rounded-2xl p-4" style={{ borderColor, borderWidth: 1 }}>
        <View className="mb-3 flex-row items-center justify-between">
          <RNText className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{t('analytics.monthlyTrend')}</RNText>
          <View className="flex-row items-center gap-4">
            {[[t('analytics.income'), positive], [t('analytics.expenses'), negative]].map(([label, color]) => (
              <View key={label as string} className="flex-row items-center gap-1.5">
                <View className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>{label as string}</RNText>
              </View>
            ))}
          </View>
        </View>
        <BarChart data={monthlyTrendData ?? data.byMonth} highlightedMonths={highlightedMonths} onMonthPress={setSelectedMonthKey} />
      </View>

      {/* Category Breakdown */}
      <View className="overflow-hidden rounded-2xl p-4" style={{ borderColor, borderWidth: 1 }}>
        <CategoryBreakdown data={data.byCategory} onCategoryPress={onCategoryPress} />
      </View>

      {/* Creator Breakdown */}
      <View className="overflow-hidden rounded-2xl p-4" style={{ borderColor, borderWidth: 1 }}>
        <RNText className="mb-3 text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{t('analytics.byMember')}</RNText>
        <CreatorBreakdown data={data.byCreator} />
      </View>
    </ScrollView>
  );
}
