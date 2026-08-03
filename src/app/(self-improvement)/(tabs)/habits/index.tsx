import { ScrollView } from "react-native";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { useDrawer } from "@/components/DrawerContext";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useSelfImprovement } from "@/data/selfImprovement/SelfImprovementProvider";
import { HabitList, HabitProgressSummary } from "@/features/selfImprovement/HabitList";
import { useHabitPlanning } from "@/features/selfImprovement/useHabitPlanning";
import { toDateKey } from "@/lib/date";
import { isHabitScheduledOnDate } from "@/lib/habit";

export default function HabitsScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const { habits, habitLogs, getTimeBoxesForDate, deleteHabit, planHabit, setHabitCompleted } = useSelfImprovement();
  const today = toDateKey(new Date());
  const timeBoxes = getTimeBoxesForDate(today);
  const { planHabit: handlePlanHabit, planningHabitId } = useHabitPlanning(today, planHabit);
  const completedForDate = new Set(habitLogs.filter((log) => log.date === today).map((log) => log.habitId));
  const scheduledHabits = habits.filter((habit) => isHabitScheduledOnDate(habit, today));

  return (
    <>
      <Stack.Screen options={{ title: t("atomicHabits.title") }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel={t("sidebar.menu")} onPress={open} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={toolbarIcons.add}
          accessibilityLabel={t("atomicHabits.addHabit")}
          onPress={() => router.push("/forms/habit-add")}
        />
      </Stack.Toolbar>
      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-6 px-5 pb-14 pt-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <HabitProgressSummary habits={scheduledHabits} completedHabitIds={completedForDate} />
        <HabitList
          allHabitsCount={habits.length}
          habits={scheduledHabits}
          habitLogs={habitLogs}
          timeBoxes={timeBoxes}
          date={today}
          planningHabitId={planningHabitId}
          onDeleteHabit={deleteHabit}
          onPlanHabit={handlePlanHabit}
          onSetCompleted={(id, completed) => setHabitCompleted(id, today, completed)}
        />

      </ScrollView>
    </>
  );
}
