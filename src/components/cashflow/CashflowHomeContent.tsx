import { useMemo } from "react";
import { RefreshControl, View } from "react-native";

import { ActivityHeatmap, type ActivityOverview } from "@/components/cashflow/ActivityHeatmap";
import { CashflowStatsCard, type CashflowStats } from "@/components/cashflow/CashflowStatsCard";
import { CashflowTable, type CashflowEntry } from "@/components/cashflow/CashflowTable";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useSyncStatus } from "@/components/provider/SyncProvider";

type CashflowHomeContentProps = {
  entries: CashflowEntry[];
  activity: ActivityOverview;
  stats: CashflowStats;
  activeManagementName?: string;
  isSwitchingManagement: boolean;
  selectedDate: string;
  onDateFilterChange: (date: string) => void;
};

export function CashflowHomeContent({
  entries,
  activity,
  stats,
  activeManagementName,
  isSwitchingManagement,
  selectedDate,
  onDateFilterChange,
}: CashflowHomeContentProps) {
  const appTheme = useAppTheme();
  const sync = useSyncStatus();

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate),
    [entries, selectedDate],
  );

  const homeHeader = useMemo(
    () => (
      <View>
        <CashflowStatsCard stats={stats} managementName={activeManagementName} loading={isSwitchingManagement} />
        <ActivityHeatmap activity={activity} selectedDate={selectedDate} onDateSelect={onDateFilterChange} />
        <View className="mt-5" />
      </View>
    ),
    [stats, activeManagementName, activity, selectedDate, isSwitchingManagement, onDateFilterChange],
  );

  return (
    <View className="bg-[--app-color-background] flex-1">
      <CashflowTable
        entries={dayEntries}
        dateFilter={selectedDate}
        onDateFilterChange={onDateFilterChange}
        hideTanggal
        ListHeaderComponent={homeHeader}
        refreshControl={
          <RefreshControl
            refreshing={sync.status === "syncing"}
            onRefresh={() => void sync.syncNow()}
            tintColor={appTheme.colors.primary}
            colors={[appTheme.colors.primary]}
            progressBackgroundColor={appTheme.colors.background}
          />
        }
      />
    </View>
  );
}
