import { router, Stack } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "@/components/AppText";
import { useDrawer } from "@/components/provider/DrawerContext";
import { useAppTheme } from "@/components/provider/AppTheme";
import { MainHome } from "@/components/home/MainHome";
import { LifeFlowHomeContent } from "@/components/lifeflow/LifeFlowHomeContent";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { alpha } from "@/lib/color";
import { addDaysToDateKey, toDateKey } from "@/lib/date";
import { getLifeFlowDailyProgress } from "@/lib/lifeFlowProgress";

export default function LifeFlowHomeScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const appTheme = useAppTheme();
  const { notes } = useNotesData();
  const { habits, habitLogs, getTimeBoxesForDate, setHabitCompleted, setTimeBoxCompleted } = useLifeFlow();
  const today = toDateKey(new Date());
  const timeBoxes = Array.from({ length: 14 }, (_, index) => (
    getTimeBoxesForDate(addDaysToDateKey(today, index - 7))
  )).flat();
  const dailyProgress = getLifeFlowDailyProgress(habits, habitLogs, timeBoxes, today);

  return (
    <>
      <Stack.Screen options={{ title: t("lifeFlowHome.title") }} />
      <Stack.Title asChild>
        <MainHome section="lifeflow" />
      </Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel={t("sidebar.menu")} onPress={open} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View hidesSharedBackground>
          <View
            accessible
            accessibilityLabel={t("lifeFlowHome.complete", {
              completed: dailyProgress.completedToday,
              total: dailyProgress.totalToday,
            })}
            className="h-10 items-center justify-center rounded-full border"
            style={{
              width: 84,
              backgroundColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.18 : 0.1),
              borderColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.36 : 0.22),
            }}
          >
            <Text className="text-lg font-black tracking-tight" style={{ color: appTheme.colors.primary }}>
              {dailyProgress.percentage}%
            </Text>
          </View>
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <LifeFlowHomeContent
        notes={notes}
        habits={habits}
        habitLogs={habitLogs}
        timeBoxes={timeBoxes}
        dailyProgress={dailyProgress}
        onOpenJournal={() => router.push("/journal")}
        onOpenHabits={() => router.push("/habits")}
        onOpenSchedule={() => router.push("/schedule")}
        onOpenTimeBox={(box) => router.push(`/forms/schedule-block?boxId=${box.id}&date=${box.date}`)}
        onCompleteHabit={(habitId, date) => setHabitCompleted(habitId, date, true)}
        onCompleteTimeBox={(box) => setTimeBoxCompleted(box, true)}
      />
    </>
  );
}
