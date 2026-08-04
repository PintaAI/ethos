import { Alert, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { HabitHeatmap } from "@/components/lifeflow/HabitHeatmap";
import type { Habit, HabitLog, TimeBox } from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { formatTimeRange12h } from "@/lib/date";

type HabitListProps = {
  allHabitsCount: number;
  habits: Habit[];
  habitLogs: HabitLog[];
  timeBoxes: TimeBox[];
  date: string;
  planningHabitId: string | null;
  onDeleteHabit: (id: string) => Promise<void>;
  onPlanHabit: (id: string) => Promise<void>;
  onSetCompleted: (id: string, completed: boolean) => Promise<void>;
};

export function HabitProgressSummary({ habits, completedHabitIds }: { habits: Habit[]; completedHabitIds: Set<string> }) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const completedCount = habits.filter((habit) => completedHabitIds.has(habit.id)).length;

  return (
    <View className="gap-4 rounded-3xl px-4 py-4" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035) }}>
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>
            {t("atomicHabits.dailyProgress")}
          </Text>
          <View className="mt-1 flex-row items-baseline gap-1">
            <Text className="text-4xl font-black" style={{ color: appTheme.colors.foreground }}>{completedCount}</Text>
            <Text className="text-base font-semibold" style={{ color: appTheme.colors.muted }}>/ {habits.length}</Text>
          </View>
        </View>
        <Text className="text-2xl font-black" style={{ color: appTheme.colors.primary }}>
          {habits.length === 0 ? "0%" : `${Math.round((completedCount / habits.length) * 100)}%`}
        </Text>
      </View>
      <View className="flex-row gap-1.5">
        {habits.length === 0 ? (
          <View className="h-2 flex-1 rounded-full" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.09) }} />
        ) : habits.map((habit) => (
          <View
            key={habit.id}
            className="h-2 flex-1 rounded-full"
            style={{ backgroundColor: habit.isAppCheckIn ? appTheme.colors.primary : habit.color, opacity: completedHabitIds.has(habit.id) ? 1 : 0.16 }}
          />
        ))}
      </View>
    </View>
  );
}

export function HabitList({
  allHabitsCount,
  habits,
  habitLogs,
  timeBoxes,
  date,
  planningHabitId,
  onDeleteHabit,
  onPlanHabit,
  onSetCompleted,
}: HabitListProps) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const completedHabitIds = new Set(habitLogs.filter((log) => log.date === date).map((log) => log.habitId));

  const confirmDelete = (id: string, habitName: string) => {
    Alert.alert(t("atomicHabits.deleteTitle"), t("atomicHabits.deleteMessage", { name: habitName }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => void onDeleteHabit(id) },
    ]);
  };

  const showHabitActions = (id: string, habitName: string) => {
    Alert.alert(habitName, t("atomicHabits.manageHabit"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("atomicHabits.editHabit"), onPress: () => router.push(`/forms/habit-add?habitId=${id}`) },
      { text: t("common.delete"), style: "destructive", onPress: () => confirmDelete(id, habitName) },
    ]);
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>{t("atomicHabits.habits")}</Text>
        <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{habits.length}</Text>
      </View>
      {allHabitsCount === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/forms/habit-add")} className="items-center gap-2 py-10">
          <AppSymbol name="checklist" size={30} tintColor={appTheme.colors.muted} />
          <Text className="max-w-64 text-center text-sm" style={{ color: appTheme.colors.muted }}>{t("atomicHabits.empty")}</Text>
        </Pressable>
      ) : null}
      {allHabitsCount > 0 && habits.length === 0 ? (
        <View className="items-center gap-2 py-10">
          <AppSymbol name="calendar" size={30} tintColor={appTheme.colors.muted} />
          <Text className="max-w-64 text-center text-sm" style={{ color: appTheme.colors.muted }}>{t("atomicHabits.noneScheduled")}</Text>
        </View>
      ) : null}
      {habits.map((habit) => {
        const completed = completedHabitIds.has(habit.id);
        const habitColor = habit.isAppCheckIn ? appTheme.colors.primary : habit.color;
        const linkedBox = timeBoxes.find((box) => box.date === date && box.habitId === habit.id);
        const isSystemHabit = habit.isAppCheckIn || habit.isJournalHabit;
        const habitName = habit.isAppCheckIn
          ? t("atomicHabits.appCheckIn")
          : habit.isJournalHabit
            ? t("atomicHabits.dailyJournal")
            : habit.name;

        return (
          <View key={habit.id} className="gap-3 rounded-2xl px-3 py-3" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.045) }}>
            <View className="flex-row items-center gap-3">
              <Pressable
                accessibilityRole={habit.isJournalHabit ? "button" : "checkbox"}
                accessibilityState={habit.isJournalHabit ? undefined : { checked: completed, disabled: isSystemHabit }}
                accessibilityLabel={habitName}
                accessibilityHint={habit.isJournalHabit
                  ? t("atomicHabits.openJournal")
                  : isSystemHabit
                    ? undefined
                    : t("atomicHabits.longPressToDelete")}
                disabled={habit.isAppCheckIn}
                delayLongPress={500}
                onPress={() => {
                  if (habit.isJournalHabit) {
                    router.push("/journal");
                    return;
                  }
                  Haptics.selectionAsync().catch(() => {});
                  void onSetCompleted(habit.id, !completed);
                }}
                onLongPress={isSystemHabit ? undefined : () => showHabitActions(habit.id, habit.name)}
                className="min-w-0 flex-1 flex-row items-center gap-3"
              >
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: completed ? habitColor : alpha(habitColor, 0.14), borderColor: habitColor, borderWidth: 1 }}
                >
                  {completed ? <AppSymbol name="checkmark" size={18} tintColor="#FFFFFF" /> : <View className="h-2 w-2 rounded-full" style={{ backgroundColor: habitColor }} />}
                </View>
                <View className="min-w-0 flex-1 py-1">
                  <Text numberOfLines={1} className="font-bold" style={{ color: completed ? appTheme.colors.muted : appTheme.colors.foreground, textDecorationLine: completed ? "line-through" : "none" }}>
                    {habitName}
                  </Text>
                  <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                    {completed
                      ? t("atomicHabits.completed")
                      : habit.isJournalHabit
                        ? t("atomicHabits.journalToComplete")
                        : linkedBox
                          ? t("atomicHabits.plannedFor", { time: formatTimeRange12h(linkedBox.startTime, linkedBox.endTime) })
                          : t("atomicHabits.tapToComplete")}
                  </Text>
                </View>
              </Pressable>
              {!isSystemHabit && !completed ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={planningHabitId === habit.id}
                  onPress={() => linkedBox
                    ? router.push(`/forms/schedule-block?boxId=${linkedBox.id}&date=${linkedBox.date}`)
                    : void onPlanHabit(habit.id)}
                  className="rounded-full px-3 py-2"
                  style={{ backgroundColor: alpha(habitColor, appTheme.isDark ? 0.24 : 0.12), opacity: planningHabitId === habit.id ? 0.5 : 1 }}
                >
                  <Text className="text-xs font-bold" style={{ color: habitColor }}>
                    {linkedBox ? t("atomicHabits.changeTime") : t("atomicHabits.plan")}
                  </Text>
                </Pressable>
              ) : habit.isJournalHabit ? (
                <AppSymbol name="chevron.right" size={15} tintColor={appTheme.colors.muted} />
              ) : null}
            </View>
            <HabitHeatmap habit={habit} logs={habitLogs} selectedDate={date} />
          </View>
        );
      })}
    </View>
  );
}
