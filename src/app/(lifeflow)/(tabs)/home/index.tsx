import { router, Stack } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { MainHome } from "@/components/home/MainHome";
import { LifeFlowHomeContent } from "@/components/lifeflow/LifeFlowHomeContent";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useDrawer } from "@/components/provider/DrawerContext";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import { alpha } from "@/lib/color";
import { getLifeFlowDailyProgress } from "@/lib/lifeFlowProgress";
import { useLifeFlowRefresh } from "@/lib/sync/useLifeFlowRefresh";

export default function LifeFlowHomeScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const theme = useAppTheme();
  const { notes } = useNotesData();
  const flow = useLifeFlow();
  const { refreshing, onRefresh } = useLifeFlowRefresh();
  const occurrences = flow.getOccurrencesForDate(flow.today);
  const progress = getLifeFlowDailyProgress(occurrences);
  return <>
    <Stack.Screen options={{ title: t("lifeFlowHome.title") }} />
    <Stack.Title asChild><MainHome section="lifeflow" /></Stack.Title>
    <Stack.Toolbar placement="left"><Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel={t("sidebar.menu")} onPress={open} /></Stack.Toolbar>
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.View hidesSharedBackground>
        <View
          accessible
          accessibilityLabel={t("lifeFlowHome.complete", { completed: progress.completedToday, total: progress.totalToday })}
          className="h-10 items-center justify-center rounded-full border"
          style={{
            width: 84,
            backgroundColor: alpha(theme.colors.primary, theme.isDark ? 0.18 : 0.1),
            borderColor: alpha(theme.colors.primary, theme.isDark ? 0.36 : 0.22),
          }}
        >
          <Text className="text-lg font-black tracking-tight" style={{ color: theme.colors.primary }}>
            {progress.percentage}%
          </Text>
        </View>
      </Stack.Toolbar.View>
    </Stack.Toolbar>
    <LifeFlowHomeContent
      notes={notes}
      items={flow.items}
      habitLogs={flow.habitLogs}
      occurrences={occurrences}
      dailyProgress={progress}
      getOccurrencesForDate={flow.getOccurrencesForDate}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onOpenJournal={() => router.push("/journal")}
      onOpenHabits={() => router.push("/habits")}
      onOpenSchedule={() => router.push("/schedule")}
      onOpenEvent={(item) => router.push(`/forms/schedule-block?itemId=${item.itemId}&date=${item.date}`)}
      onCompleteHabit={(item) => flow.setHabitCompleted(item.itemId, item.date, true)}
    />
  </>;
}
