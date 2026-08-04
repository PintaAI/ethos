import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { useDrawer } from "@/components/provider/DrawerContext";
import { LifeFlowHomeContent } from "@/components/lifeflow/LifeFlowHomeContent";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { addDaysToDateKey, toDateKey } from "@/lib/date";

export default function LifeFlowHomeScreen() {
  const { t } = useTranslation();
  const { open } = useDrawer();
  const { notes } = useNotesData();
  const { habits, habitLogs, getTimeBoxesForDate, setHabitCompleted, setTimeBoxCompleted } = useLifeFlow();
  const today = toDateKey(new Date());
  const timeBoxes = Array.from({ length: 14 }, (_, index) => (
    getTimeBoxesForDate(addDaysToDateKey(today, index - 7))
  )).flat();

  return (
    <>
      <Stack.Screen options={{ title: t("lifeFlowHome.title") }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel={t("sidebar.menu")} onPress={open} />
      </Stack.Toolbar>
      <LifeFlowHomeContent
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
