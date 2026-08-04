import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useDrawer } from "@/components/DrawerContext";
import { AnalyticsCharts, DATE_PRESETS, type DatePeriod } from "@/components/cashflow/AnalyticsCharts";
import { CashflowStatsCard } from "@/components/cashflow/CashflowStatsCard";
import { useCashflowData } from "@/data/cashflow/CashflowDataProvider";
import { buildAnalytics, buildStats } from "@/data/cashflow/repository";

export default function SummaryScreen() {
  const { t, i18n } = useTranslation();
  const { from, to, month, review } = useLocalSearchParams<{ from?: string; to?: string; month?: string; review?: string }>();
  const { open } = useDrawer();
  const { analytics, entries, categories, activeManagement, isSwitchingManagement } = useCashflowData();
  const [datePeriod, setDatePeriod] = useState<DatePeriod>(DATE_PRESETS[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [appliedReview, setAppliedReview] = useState<string | null>(null);

  const reviewKey = from && to && month && review && /^\d{4}-\d{2}$/.test(month)
    ? `${from}:${to}:${month}:${review}:${i18n.language}`
    : null;
  if (reviewKey && reviewKey !== appliedReview) {
    const [year, monthNumber] = month!.split("-").map(Number);
    const nextMonth = new Date(year, monthNumber - 1, 1);
    setAppliedReview(reviewKey);
    setSelectedMonth(nextMonth);
    setDatePeriod({
      key: `month-${from}`,
      label: nextMonth.toLocaleDateString(i18n.language === "id" ? "id-ID" : "en-US", { month: "long", year: "numeric" }),
      from,
      to,
    });
  }

  const filteredEntries = useMemo(() => {
    if (datePeriod.allTime) return entries;
    return entries.filter((entry) => {
      if (datePeriod.from && entry.date < datePeriod.from) return false;
      if (datePeriod.to && entry.date > datePeriod.to) return false;
      return true;
    });
  }, [datePeriod, entries]);

  const filteredAnalytics = useMemo(() => buildAnalytics(filteredEntries, categories, i18n.language === "id" ? "id-ID" : "en-US"), [categories, filteredEntries, i18n.language]);
  const filteredStats = useMemo(() => buildStats(filteredEntries, i18n.language === "id" ? "id-ID" : "en-US"), [filteredEntries, i18n.language]);

  return (
    <>
      <Stack.Screen options={{ title: t('tabs.summary') }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={toolbarIcons.menu}
          accessibilityLabel="Open menu"
          onPress={open}
        />
      </Stack.Toolbar>
      <AnalyticsCharts
        data={filteredAnalytics}
        monthlyTrendData={analytics.byMonth}
        datePeriod={datePeriod}
        onDatePeriodChange={setDatePeriod}
        selectedMonth={selectedMonth}
        onSelectedMonthChange={setSelectedMonth}
        onCategoryPress={(category) => router.push({
          pathname: "/forms/category-entries",
          params: { category, from: datePeriod.from ?? "", to: datePeriod.to ?? "" },
        })}
        header={<CashflowStatsCard stats={filteredStats} hideMoreButton managementName={activeManagement?.name} loading={isSwitchingManagement} />}
        hideStats
      />
    </>
  );
}
