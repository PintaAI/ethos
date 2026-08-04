import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useDrawer } from "@/components/provider/DrawerContext";
import { getTimeBoxColor, TimeMapDial, TIME_BOX_COLORS } from "@/components/lifeflow/TimeMapDial";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import type { TimeBox } from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { addDaysToDateKey, formatDateKey, formatTimeRange12h } from "@/lib/date";
import { setPreference } from "@/lib/preferences";
import { isHabitScheduledOnDate } from "@/lib/habit";
import { getTimeBoxFocusDuration, timeBoxBreaksFit, timeBoxesOverlap } from "@/lib/timeBox";
import { ScheduleTimeline } from "@/features/lifeflow/ScheduleTimeline";
import { useHabitPlanning } from "@/features/lifeflow/useHabitPlanning";

const SLEEP_COLOR = TIME_BOX_COLORS[0].toUpperCase();
const WORK_COLOR = TIME_BOX_COLORS[2].toUpperCase();

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const { open } = useDrawer();
  const appTheme = useAppTheme();
  const { today, habits, habitLogs, dayPresets, getTimeBoxesForDate, clearTimeBoxesForDate, deleteTimeBox, planHabit, setTimeBoxCompleted, updateTimeBoxRange } = useLifeFlow();
  const [date, setDate] = useState(today);
  const previousToday = useRef(today);
  const [dialInteracting, setDialInteracting] = useState(false);

  useEffect(() => {
    setDate((current) => current === previousToday.current ? today : current);
    previousToday.current = today;
  }, [today]);

  const { planHabit: handlePlanHabit, planningHabitId } = useHabitPlanning(date, planHabit);
  const dayBoxes = useMemo(() => getTimeBoxesForDate(date), [date, getTimeBoxesForDate]);
  const completedCount = dayBoxes.filter((box) => box.completed).length;
  const scheduledHabits = habits.filter((habit) => !habit.isAppCheckIn && !habit.isJournalHabit && isHabitScheduledOnDate(habit, date));
  const completedHabits = new Set(habitLogs.filter((log) => log.date === date).map((log) => log.habitId));
  const plannedHabitCount = scheduledHabits.filter((habit) => dayBoxes.some((box) => box.habitId === habit.id)).length;
  const scheduledMinutes = dayBoxes.reduce(
    (total, box) => total + getTimeBoxFocusDuration(box.startTime, box.endTime, box.breakDurations),
    0,
  );
  const scheduledDurationLabel = scheduledMinutes % 60 === 0
    ? t("timeBoxing.compactHours", { hours: Math.floor(scheduledMinutes / 60) })
    : t("timeBoxing.duration", {
      hours: Math.floor(scheduledMinutes / 60),
      minutes: scheduledMinutes % 60,
    });

  const handleUpdateRange = async (box: TimeBox, startTime: string, endTime: string) => {
    if (!timeBoxBreaksFit(startTime, endTime, box.breakDurations)) {
      Alert.alert(t("timeBoxing.breaksDoNotFitTitle"), t("timeBoxing.breaksDoNotFitMessage"));
      return false;
    }
    const candidate = { date: box.date, startTime, endTime };
    const overlaps = dayBoxes.some((other) => other.id !== box.id && timeBoxesOverlap(candidate, other));
    if (overlaps) {
      Alert.alert(t("timeBoxing.overlapTitle"), t("timeBoxing.overlapMessage"));
      return false;
    }
    try {
      await updateTimeBoxRange(box, startTime, endTime);
    } catch (error) {
      Alert.alert(
        t("timeBoxing.overlapTitle"),
        error instanceof Error ? error.message : t("timeBoxing.overlapMessage"),
      );
      return false;
    }
    const effectiveColor = (box.color ?? getTimeBoxColor(box.id)).toUpperCase();
    if (effectiveColor === SLEEP_COLOR) {
      await setPreference("timeBoxSleepRange", { startTime, endTime }).catch(() => {});
    } else if (effectiveColor === WORK_COLOR) {
      await setPreference("timeBoxWorkRange", { startTime, endTime }).catch(() => {});
    }
    return true;
  };

  const clearDay = () => {
    Alert.alert(
      t("timeBoxing.clearDayTitle"),
      t("timeBoxing.clearDayMessage", { count: dayBoxes.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("timeBoxing.clearDay"),
          style: "destructive",
          onPress: () => void clearTimeBoxesForDate(date),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t("timeBoxing.title") }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.menu} accessibilityLabel={t("sidebar.menu")} onPress={open} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={toolbarIcons.clear}
          accessibilityLabel={t("timeBoxing.clearDay")}
          disabled={dayBoxes.length === 0}
          onPress={clearDay}
        />
        <Stack.Toolbar.Button
          icon={toolbarIcons.preset}
          accessibilityLabel={t("timeBoxing.saveDayPreset")}
          disabled={dayBoxes.length === 0 && dayPresets.length === 0}
          onPress={() => router.push(`/forms/day-preset?date=${date}`)}
        />
        <Stack.Toolbar.Button icon={toolbarIcons.add} accessibilityLabel={t("timeBoxing.addBlock")} onPress={() => router.push(`/forms/schedule-block?date=${date}`)} />
      </Stack.Toolbar>
      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-6 px-5 pb-14 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dialInteracting}
      >
        <View className="flex-row items-center justify-between rounded-2xl px-2 py-2" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.045) }}>
          <Pressable accessibilityLabel={t("timeBoxing.previousDay")} className="h-10 w-10 items-center justify-center" onPress={() => setDate(addDaysToDateKey(date, -1))}>
            <AppSymbol name="chevron.left" size={17} tintColor={appTheme.colors.foreground} />
          </Pressable>
          <Pressable onPress={() => setDate(today)} className="items-center px-3">
            <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>
              {date === today ? t("timeBoxing.today") : formatDateKey(date, { weekday: "long", day: "numeric", month: "short" }, i18n.language === "id" ? "id-ID" : "en-US")}
            </Text>
            <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{completedCount}/{dayBoxes.length} {t("timeBoxing.completed")}</Text>
          </Pressable>
          <Pressable accessibilityLabel={t("timeBoxing.nextDay")} className="h-10 w-10 items-center justify-center" onPress={() => setDate(addDaysToDateKey(date, 1))}>
            <AppSymbol name="chevron.right" size={17} tintColor={appTheme.colors.foreground} />
          </Pressable>
        </View>

        <View className="rounded-3xl px-2 py-3" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035) }}>
          <View className="flex-row items-center justify-between px-3">
            <Text className="text-lg font-bold" style={{ color: appTheme.colors.foreground }}>{t("timeBoxing.timeMap")}</Text>
            <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{dayBoxes.length} {t("timeBoxing.blocks")}</Text>
          </View>
          <TimeMapDial
            key={date}
            boxes={dayBoxes}
            date={date}
            durationLabel={scheduledDurationLabel}
            mapLabel={t("timeBoxing.planned")}
            onUpdateBox={handleUpdateRange}
            onEditBox={(box) => router.push(`/forms/schedule-block?boxId=${box.id}&date=${box.date}`)}
            onAddBox={(startTime, endTime) => router.push(`/forms/schedule-block?date=${date}&startTime=${startTime}&endTime=${endTime}`)}
            onInteractionChange={setDialInteracting}
          />
        </View>

        <ScheduleTimeline
          boxes={dayBoxes}
          onDelete={(id) => { const box = dayBoxes.find((item) => item.id === id); if (box) void deleteTimeBox(box); }}
          onSetCompleted={(id, completed) => { const box = dayBoxes.find((item) => item.id === id); if (box) void setTimeBoxCompleted(box, completed); }}
        />

        {scheduledHabits.length > 0 ? (
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.todaysHabits")}</Text>
              <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                {t("timeBoxing.habitsPlanned", { planned: plannedHabitCount, total: scheduledHabits.length })}
              </Text>
            </View>
            <View className="gap-1 rounded-2xl p-2" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.045) }}>
              {scheduledHabits.map((habit) => {
                const linkedBox = dayBoxes.find((box) => box.habitId === habit.id);
                const completed = completedHabits.has(habit.id);
                return (
                  <View key={habit.id} className="flex-row items-center gap-3 rounded-xl px-2 py-2">
                    <View className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: completed ? habit.color : alpha(habit.color, 0.14) }}>
                      {completed
                        ? <AppSymbol name="checkmark" size={14} tintColor="#FFFFFF" />
                        : <View className="h-2 w-2 rounded-full" style={{ backgroundColor: habit.color }} />}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="font-semibold" style={{ color: completed ? appTheme.colors.muted : appTheme.colors.foreground, textDecorationLine: completed ? "line-through" : "none" }}>
                        {habit.name}
                      </Text>
                      <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                        {completed
                          ? t("atomicHabits.completed")
                          : linkedBox
                            ? formatTimeRange12h(linkedBox.startTime, linkedBox.endTime)
                            : t("timeBoxing.notPlanned")}
                      </Text>
                    </View>
                    {!completed ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={planningHabitId === habit.id}
                        onPress={() => linkedBox
                          ? router.push(`/forms/schedule-block?boxId=${linkedBox.id}&date=${linkedBox.date}`)
                          : void handlePlanHabit(habit.id)}
                        className="rounded-full px-3 py-2"
                        style={{ backgroundColor: alpha(habit.color, appTheme.isDark ? 0.24 : 0.12), opacity: planningHabitId === habit.id ? 0.5 : 1 }}
                      >
                        <Text className="text-xs font-bold" style={{ color: habit.color }}>
                          {linkedBox ? t("atomicHabits.changeTime") : t("atomicHabits.plan")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

      </ScrollView>
    </>
  );
}
