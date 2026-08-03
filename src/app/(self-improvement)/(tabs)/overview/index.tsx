import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { useDrawer } from "@/components/DrawerContext";
import { PersonalGrowthHomeContent } from "@/components/selfImprovement/PersonalGrowthHomeContent";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import { useSelfImprovement } from "@/data/selfImprovement/SelfImprovementProvider";
import { addDaysToDateKey, toDateKey } from "@/lib/date";

export default function SelfImprovementOverviewScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const { notes } = useNotesData();
  const { habits, habitLogs, getTimeBoxesForDate, setHabitCompleted, setTimeBoxCompleted } = useSelfImprovement();
  const today = toDateKey(new Date());
  const timeBoxes = Array.from({ length: 14 }, (_, index) => (
    getTimeBoxesForDate(addDaysToDateKey(today, index - 7))
  )).flat();

  return (
    <>
      <Stack.Screen options={{ title: t("selfImprovementHome.title") }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel={t("sidebar.menu")} onPress={open} />
      </Stack.Toolbar>
      <PersonalGrowthHomeContent
        notes={notes}
        habits={habits}
        habitLogs={habitLogs}
        timeBoxes={timeBoxes}
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
