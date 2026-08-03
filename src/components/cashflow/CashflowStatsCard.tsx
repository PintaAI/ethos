import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppText as RNText } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { useCurrency } from "@/components/CurrencyProvider";
import { useSyncStatus } from "@/components/SyncProvider";
import { alpha } from "@/lib/color";

export type CashflowStats = {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  currentDay: {
    income: number;
    expenses: number;
  };
  currentWeek: {
    weekNumber: number;
    range: string;
    income: number;
    expenses: number;
  };
  currentMonth: {
    label: string;
    income: number;
    expenses: number;
  };
  topExpenseCategories: {
    category: string;
    total: number;
    percentage: number;
  }[];
};

export const mockCashflowStats: CashflowStats = {
  totalIncome: 12850000,
  totalExpenses: 7420000,
  balance: 5430000,
  currentDay: {
    income: 450000,
    expenses: 125000,
  },
  currentWeek: {
    weekNumber: 27,
    range: "30 Jun - 6 Jul",
    income: 2750000,
    expenses: 1385000,
  },
  currentMonth: {
    label: "June 2026",
    income: 12850000,
    expenses: 7420000,
  },
  topExpenseCategories: [
    { category: "Groceries", total: 1850000, percentage: 72 },
    { category: "Transport", total: 960000, percentage: 38 },
    { category: "Coffee & meals", total: 680000, percentage: 26 },
  ],
};

const statSymbols = {
  "chevron.down": "expand_more",
  "chevron.up": "expand_less",
  "checkmark.seal.fill": "verified",
  "arrow.down.circle.fill": "arrow_circle_down",
  "arrow.up.circle.fill": "arrow_circle_up",
  "eye.fill": "visibility",
  "eye.slash.fill": "visibility_off",
  calendar: "calendar_month",
  "calendar.badge.plus": "event_upcoming",
  "bag.fill": "shopping_bag",
} as const satisfies Record<string, AndroidSymbol>;

type StatSymbolName = keyof typeof statSymbols;

function StatSymbol({ name, color }: { name: StatSymbolName; color: string }) {
  const androidName = statSymbols[name];

  return (
    <SymbolView
      name={{ ios: name as SFSymbol, android: androidName, web: androidName }}
      size={15}
      tintColor={color}
      fallback={<RNText style={{ color }}>•</RNText>}
    />
  );
}

function SkeletonBlock({ className, color, style }: { className?: string; color: string; style?: object }) {
  const [opacity] = useState(() => new Animated.Value(0.42));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.82,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.42,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View className={className} style={[{ backgroundColor: color, opacity }, style]} />;
}

export function CashflowStatsCard({ stats, hideMoreButton = false, managementName, loading = false }: { stats: CashflowStats; hideMoreButton?: boolean; managementName?: string; loading?: boolean }) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const {
    format,
    cashflowAmountsVisible: showBalance,
    cashflowStatsPeriod: statsPeriod,
    setCashflowAmountsVisible: setShowBalance,
    setCashflowStatsPeriod: setStatsPeriod,
  } = useCurrency();
  const sync = useSyncStatus();
  const [isExpanded, setIsExpanded] = useState(false);
  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;
  const detailBackground = appTheme.isDark ? "rgba(255,255,255,0.045)" : "rgba(15,23,42,0.035)";
  const mutedLine = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const skeletonColor = appTheme.isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)";
  const isLoading = loading || sync.status === "syncing";
  const statsPeriods = ["daily", "weekly", "monthly", "allTime"] as const;
  const periodStats = statsPeriod === "daily"
    ? stats.currentDay
    : statsPeriod === "weekly"
      ? stats.currentWeek
      : statsPeriod === "monthly"
        ? stats.currentMonth
        : { income: stats.totalIncome, expenses: stats.totalExpenses };
  const periodBalance = periodStats.income - periodStats.expenses;
  const balanceText = showBalance ? format(periodBalance, { compact: true }) : "••••••";
  const balancePeriodLabel = t(`analytics.${statsPeriod}`);
  const topExpenseCategories = isLoading && stats.topExpenseCategories.length === 0
    ? [
        { category: "skeleton-1", total: 0, percentage: 72 },
        { category: "skeleton-2", total: 0, percentage: 56 },
        { category: "skeleton-3", total: 0, percentage: 38 },
      ]
    : stats.topExpenseCategories;

  return (
    <View className="mb-5">
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.push("/forms/wallet")}
            accessibilityRole="button"
            accessibilityLabel={t('analytics.switchWallet')}
            className="max-w-[170px] flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5"
            style={{ backgroundColor: detailBackground }}
          >
            {isLoading ? (
              <SkeletonBlock className="h-3 w-20 rounded-full" color={skeletonColor} />
            ) : (
              <RNText
                numberOfLines={1}
                className="shrink text-xs font-semibold uppercase tracking-[2px]"
                style={{ color: appTheme.colors.muted }}
              >
                {managementName ?? t('analytics.balance')}
              </RNText>
            )}
            <StatSymbol name="chevron.down" color={appTheme.colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/forms/audit")}
            accessibilityRole="button"
            accessibilityLabel={t("audit.open")}
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: detailBackground }}
          >
            <StatSymbol name="checkmark.seal.fill" color={appTheme.colors.muted} />
          </Pressable>
        </View>

        <View className="flex-row items-center gap-2">
          <StatSymbol name="arrow.down.circle.fill" color={positive} />
          {isLoading ? (
            <SkeletonBlock className="h-3 w-12 rounded-full" color={skeletonColor} />
          ) : (
            <RNText className="text-xs font-semibold" style={{ color: positive }}>
              {showBalance ? format(periodStats.income, { compact: true }) : "••••"}
            </RNText>
          )}
          <View className="h-3 w-px" style={{ backgroundColor: mutedLine }} />
          <StatSymbol name="arrow.up.circle.fill" color={negative} />
          {isLoading ? (
            <SkeletonBlock className="h-3 w-12 rounded-full" color={skeletonColor} />
          ) : (
            <RNText className="text-xs font-semibold" style={{ color: negative }}>
              {showBalance ? format(periodStats.expenses, { compact: true }) : "••••"}
            </RNText>
          )}
        </View>
      </View>

      <View className="flex-row items-end justify-between gap-4">
        <View className="min-w-0 flex-1 flex-row items-end gap-2">
          {isLoading ? (
            <SkeletonBlock className="h-11 w-48 max-w-full rounded-2xl" color={skeletonColor} />
          ) : (
            <>
              <Pressable
                onPress={() => {
                  const currentIndex = statsPeriods.indexOf(statsPeriod);
                  setStatsPeriod(statsPeriods[(currentIndex + 1) % statsPeriods.length]);
                }}
                accessibilityRole="button"
                accessibilityLabel={t("analytics.changeBalancePeriod", { period: balancePeriodLabel })}
                className="min-w-0 shrink"
              >
                <RNText
                  className="mb-0.5 uppercase"
                  style={{ color: appTheme.colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 1 }}
                >
                  {balancePeriodLabel}
                </RNText>
                <RNText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  className="text-4xl font-black tracking-tight"
                  style={{ color: periodBalance < 0 ? negative : appTheme.colors.foreground }}
                >
                  {balanceText}
                </RNText>
              </Pressable>
              <Pressable
                onPress={() => setShowBalance(!showBalance)}
                accessibilityRole="button"
                accessibilityLabel={showBalance ? t('analytics.hideBalance') : t('analytics.showBalance')}
                className="mb-1 h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: detailBackground }}
              >
                <StatSymbol name={showBalance ? "eye.fill" : "eye.slash.fill"} color={appTheme.colors.muted} />
              </Pressable>
            </>
          )}

        </View>

        {hideMoreButton ? null : (
          <Pressable
            onPress={() => setIsExpanded(!isExpanded)}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? t('analytics.hideBalance') : t('analytics.showBalance')}
            className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5"
            style={{
              backgroundColor: isExpanded ? alpha(appTheme.colors.primary, 0.1) : "transparent",
            }}
          >
            <RNText
              className="text-xs font-semibold"
              style={{ color: isExpanded ? appTheme.colors.primary : appTheme.colors.foreground }}
            >
              {isExpanded ? t('analytics.hide') : t('analytics.more')}
            </RNText>
            <StatSymbol
              name={isExpanded ? "chevron.up" : "chevron.down"}
              color={isExpanded ? appTheme.colors.primary : appTheme.colors.foreground}
            />
          </Pressable>
        )}
      </View>

      {!hideMoreButton && isExpanded ? (
        <View className="mt-5 gap-3">
          <View className="gap-3 py-2">
            <View className="flex-row items-center gap-2">
              <StatSymbol name="calendar" color={appTheme.colors.muted} />
              {isLoading ? (
                <SkeletonBlock className="h-4 w-24 rounded-full" color={skeletonColor} />
              ) : (
                <RNText className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>
                  {stats.currentMonth.label}
                </RNText>
              )}
            </View>
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-2">
              <StatSymbol name="arrow.down.circle.fill" color={positive} />
              {isLoading ? (
                <SkeletonBlock className="h-4 w-14 rounded-full" color={skeletonColor} />
              ) : (
                <RNText className="text-sm font-bold" style={{ color: positive }}>
                  {showBalance ? format(stats.currentMonth.income, { compact: true }) : "••••"}
                </RNText>
              )}
              <View className="h-3 w-px" style={{ backgroundColor: mutedLine }} />
              <StatSymbol name="arrow.up.circle.fill" color={negative} />
              {isLoading ? (
                <SkeletonBlock className="h-4 w-14 rounded-full" color={skeletonColor} />
              ) : (
                <RNText className="text-sm font-bold" style={{ color: negative }}>
                  {showBalance ? format(stats.currentMonth.expenses, { compact: true }) : "••••"}
                </RNText>
              )}
              <View className="h-3 w-px" style={{ backgroundColor: mutedLine }} />
              <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>
                {t('analytics.net')}
              </RNText>
              {isLoading ? (
                <SkeletonBlock className="h-4 w-14 rounded-full" color={skeletonColor} />
              ) : (
                <RNText className="text-sm font-black" style={{ color: appTheme.colors.foreground }}>
                  {showBalance
                    ? format(stats.currentMonth.income - stats.currentMonth.expenses, { compact: true })
                    : "••••"}
                </RNText>
              )}
            </View>
          </View>

          <View className="h-px" style={{ backgroundColor: mutedLine }} />

          <View className="gap-3 py-2">
            <View className="flex-row items-center gap-2">
              <StatSymbol name="calendar.badge.plus" color={appTheme.colors.muted} />
              <RNText className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>
                {t('analytics.currentWeek')}
              </RNText>
            </View>
            {isLoading ? (
              <SkeletonBlock className="h-3 w-32 rounded-full" color={skeletonColor} />
            ) : (
              <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>
                {t('analytics.week', { number: stats.currentWeek.weekNumber, range: stats.currentWeek.range })}
              </RNText>
            )}
            <View className="flex-row items-center gap-2">
              <StatSymbol name="arrow.down.circle.fill" color={positive} />
              {isLoading ? (
                <SkeletonBlock className="h-4 w-14 rounded-full" color={skeletonColor} />
              ) : (
                <RNText className="text-sm font-bold" style={{ color: positive }}>
                  {showBalance ? format(stats.currentWeek.income, { compact: true }) : "••••"}
                </RNText>
              )}
              <View className="h-3 w-px" style={{ backgroundColor: mutedLine }} />
              <StatSymbol name="arrow.up.circle.fill" color={negative} />
              {isLoading ? (
                <SkeletonBlock className="h-4 w-14 rounded-full" color={skeletonColor} />
              ) : (
                <RNText className="text-sm font-bold" style={{ color: negative }}>
                  {showBalance ? format(stats.currentWeek.expenses, { compact: true }) : "••••"}
                </RNText>
              )}
              <View className="h-3 w-px" style={{ backgroundColor: mutedLine }} />
              <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>
                {t('analytics.net')}
              </RNText>
              {isLoading ? (
                <SkeletonBlock className="h-4 w-14 rounded-full" color={skeletonColor} />
              ) : (
                <RNText className="text-sm font-black" style={{ color: appTheme.colors.foreground }}>
                  {showBalance
                    ? format(stats.currentWeek.income - stats.currentWeek.expenses, { compact: true })
                    : "••••"}
                </RNText>
              )}
            </View>
          </View>

          <View className="gap-3 py-2">
            <View className="flex-row items-center gap-2">
              <StatSymbol name="bag.fill" color={appTheme.colors.muted} />
              <RNText className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>
                {t('analytics.topExpenses')}
              </RNText>
            </View>
            {topExpenseCategories.map((category, index) => (
              <View key={category.category} className="gap-1.5">
                <View className="flex-row items-center justify-between gap-3">
                  {isLoading ? (
                    <SkeletonBlock className="h-3 w-32 rounded-full" color={skeletonColor} />
                  ) : (
                    <RNText numberOfLines={1} className="flex-1 text-xs" style={{ color: appTheme.colors.muted }}>
                      {index + 1}. {category.category}
                    </RNText>
                  )}
                  {isLoading ? (
                    <SkeletonBlock className="h-3 w-12 rounded-full" color={skeletonColor} />
                  ) : (
                    <RNText className="text-xs font-bold" style={{ color: appTheme.colors.foreground }}>
                      {showBalance ? format(category.total, { compact: true }) : "••••"}
                    </RNText>
                  )}
                </View>
                <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: mutedLine }}>
                  {isLoading ? (
                    <SkeletonBlock className="h-full w-2/3 rounded-full" color={skeletonColor} />
                  ) : (
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(category.percentage, 100)}%`, backgroundColor: negative, opacity: 0.72 }}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
