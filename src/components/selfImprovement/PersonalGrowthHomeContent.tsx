import { useEffect, useState } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import type { CachedNote } from "@/data/notes/types";
import type { Habit, HabitLog, TimeBox } from "@/data/selfImprovement/types";
import { alpha } from "@/lib/color";
import { addDaysToDateKey, formatTimeRange12h, parseDateKey, toDateKey } from "@/lib/date";
import { isHabitScheduledOnDate } from "@/lib/habit";

type OverviewRowProps = {
  icon: "book.pages.fill" | "checkmark.circle.fill" | "calendar";
  title: string;
  value: string;
  detail: string;
  color: string;
  onPress: () => void;
};

type PersonalGrowthHomeContentProps = {
  notes: CachedNote[];
  habits: Habit[];
  habitLogs: HabitLog[];
  timeBoxes: TimeBox[];
  referenceDate?: Date;
  onOpenJournal: () => void;
  onOpenHabits: () => void;
  onOpenSchedule: () => void;
  onOpenTimeBox: (box: TimeBox) => void;
  onCompleteHabit: (habitId: string, date: string) => Promise<void>;
  onCompleteTimeBox: (box: TimeBox) => Promise<void>;
};

function OverviewRow({ icon, title, value, detail, color, onPress }: OverviewRowProps) {
  const appTheme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${value}`}
      className="flex-row items-center gap-3 px-4 py-4"
      style={{ backgroundColor: "transparent" }}
      onPress={onPress}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: alpha(color, 0.14) }}>
        <AppSymbol name={icon} size={20} tintColor={color} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>{title}</Text>
        <Text className="mt-0.5 text-sm" numberOfLines={1} style={{ color: appTheme.colors.muted }}>{detail}</Text>
      </View>
      <Text className="text-sm font-bold" style={{ color }}>{value}</Text>
      <AppSymbol name="chevron.right" size={15} tintColor={appTheme.colors.muted} />
    </Pressable>
  );
}

export function PersonalGrowthHomeContent({
  notes,
  habits,
  habitLogs,
  timeBoxes,
  referenceDate,
  onOpenJournal,
  onOpenHabits,
  onOpenSchedule,
  onOpenTimeBox,
  onCompleteHabit,
  onCompleteTimeBox,
}: PersonalGrowthHomeContentProps) {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const scheduleColor = appTheme.isDark ? appTheme.colors.secondary : appTheme.colors.foreground;
  const now = referenceDate ?? new Date();
  const today = toDateKey(now);
  const locale = i18n.language === "id" ? "id-ID" : "en-US";
  const monday = addDaysToDateKey(today, -((now.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(monday, index));
  const completedByDate = new Map<string, Set<string>>();

  for (const log of habitLogs) {
    const completed = completedByDate.get(log.date) ?? new Set<string>();
    completed.add(log.habitId);
    completedByDate.set(log.date, completed);
  }

  const journalHabit = habits.find((habit) => habit.isJournalHabit);
  const journalDone = Boolean(journalHabit && completedByDate.get(today)?.has(journalHabit.id));
  const todayHabits = habits.filter((habit) => isHabitScheduledOnDate(habit, today));
  const todayNonJournalHabits = todayHabits.filter((habit) => !habit.isJournalHabit);
  const todayCompletedIds = completedByDate.get(today) ?? new Set<string>();
  const completedHabits = todayHabits.filter((habit) => todayCompletedIds.has(habit.id)).length;
  const completedNonJournalHabits = todayNonJournalHabits.filter((habit) => todayCompletedIds.has(habit.id)).length;
  const todayBoxes = timeBoxes.filter((box) => box.date === today);
  const completedBoxes = todayBoxes.filter((box) => box.completed).length;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nextBox = [...todayBoxes]
    .filter((box) => !box.completed && box.startTime >= currentTime)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))[0];
  const nextHabit = todayNonJournalHabits.find(
    (habit) => !habit.isAppCheckIn && !todayCompletedIds.has(habit.id),
  );
  const nextJournal = journalHabit && !journalDone
    ? {
      type: "journal" as const,
      id: journalHabit.id,
      title: journalHabit.name,
      detail: t("selfImprovementHome.journalPending"),
      color: appTheme.colors.primary,
      icon: "book.pages.fill" as const,
    }
    : null;
  const nextItem = nextBox
    ? {
      type: "timeBox" as const,
      id: nextBox.id,
      title: nextBox.title,
      detail: formatTimeRange12h(nextBox.startTime, nextBox.endTime),
      color: nextBox.color ?? scheduleColor,
      icon: "calendar" as const,
    }
    : nextHabit
      ? {
        type: "habit" as const,
        id: nextHabit.id,
        title: nextHabit.name,
        detail: t("selfImprovementHome.habitForToday"),
        color: nextHabit.color,
        icon: "checkmark.circle.fill" as const,
      }
      : nextJournal;
  const nextItemActionColor = nextItem?.type === "journal" ? appTheme.colors.primary : appTheme.colors.positive;
  const [nextItemAnimation] = useState(() => new Animated.Value(0));
  const [completingNextItem, setCompletingNextItem] = useState(false);

  useEffect(() => {
    nextItemAnimation.setValue(0);
    const animation = Animated.timing(nextItemAnimation, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [nextItem?.id, nextItemAnimation]);

  const completeNextItem = () => {
    if (!nextItem || completingNextItem) return;
    Haptics.selectionAsync().catch(() => {});
    setCompletingNextItem(true);
    Animated.timing(nextItemAnimation, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        setCompletingNextItem(false);
        return;
      }
      const completion = nextItem.type === "timeBox"
        ? onCompleteTimeBox(nextBox!)
        : onCompleteHabit(nextItem.id, today);
      void completion
        .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}))
        .catch((error) => {
          console.warn("Failed to complete next item", error);
          Animated.timing(nextItemAnimation, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }).start();
        })
        .finally(() => setCompletingNextItem(false));
    });
  };
  const latestNote = [...notes].sort((left, right) => {
    const leftUpdatedAt = left.draft?.updatedAt ?? left.updatedAt;
    const rightUpdatedAt = right.draft?.updatedAt ?? right.updatedAt;
    return rightUpdatedAt.localeCompare(leftUpdatedAt);
  })[0];
  const totalToday = todayNonJournalHabits.length + todayBoxes.length + 1;
  const completedToday = completedNonJournalHabits + completedBoxes + Number(journalDone);
  const dailyPercentage = totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100);
  const journalDetail = journalDone
    ? latestNote
      ? t("selfImprovementHome.latestEntry", { title: latestNote.title || t("tabs.notes") })
      : t("selfImprovementHome.journalDone")
    : t("selfImprovementHome.journalPending");
  const scheduleDetail = nextBox
    ? t("selfImprovementHome.nextBlock", {
      title: nextBox.title,
      time: formatTimeRange12h(nextBox.startTime, nextBox.endTime),
    })
    : todayBoxes.length > 0 && completedBoxes === todayBoxes.length
      ? t("selfImprovementHome.scheduleDone")
      : t("selfImprovementHome.noUpcomingBlocks");

  return (
    <ScrollView
      className="flex-1 bg-[--app-color-background]"
      contentContainerClassName="gap-7 px-5 pb-14 pt-4"
      contentInsetAdjustmentBehavior="automatic"
    >
      <View className="gap-3">
        <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: appTheme.colors.muted }}>
          {now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        <View className="flex-row items-end justify-between gap-4">
          <View className="flex-1">
            <Text className="text-2xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
              {t("selfImprovementHome.dailyRhythm")}
            </Text>
            <Text className="mt-1 text-sm" style={{ color: appTheme.colors.muted }}>
              {t("selfImprovementHome.complete", { completed: completedToday, total: totalToday })}
            </Text>
          </View>
          <Text className="text-5xl font-black tracking-tighter" style={{ color: appTheme.colors.primary }}>
            {dailyPercentage}%
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.08) }}>
          <View
            className="h-full rounded-full"
            style={{ width: `${dailyPercentage}%`, backgroundColor: appTheme.colors.primary }}
          />
        </View>
      </View>

      <View className="overflow-hidden rounded-3xl" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035) }}>
        <OverviewRow
          icon="book.pages.fill"
          title={t("tabs.notes")}
          value={journalDone ? t("selfImprovementHome.done") : t("selfImprovementHome.open")}
          detail={journalDetail}
          color={appTheme.colors.primary}
          onPress={onOpenJournal}
        />
        <View className="ml-[68px] h-px" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.08) }} />
        <OverviewRow
          icon="checkmark.circle.fill"
          title={t("tabs.habits")}
          value={`${completedHabits}/${todayHabits.length}`}
          detail={todayHabits.length === 0
            ? t("selfImprovementHome.noHabits")
            : t("selfImprovementHome.habitsProgress", { completed: completedHabits, total: todayHabits.length })}
          color={appTheme.colors.positive}
          onPress={onOpenHabits}
        />
        <View className="ml-[68px] h-px" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.08) }} />
        <OverviewRow
          icon="calendar"
          title={t("tabs.schedule")}
          value={`${completedBoxes}/${todayBoxes.length}`}
          detail={todayBoxes.length === 0
            ? t("selfImprovementHome.scheduleEmpty")
            : scheduleDetail}
          color={scheduleColor}
          onPress={onOpenSchedule}
        />
      </View>

      {nextItem ? (
        <View className="gap-3">
          <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>
            {t("selfImprovementHome.nextEvent")}
          </Text>
          <Animated.View
            className="gap-3 rounded-3xl p-4"
            style={{
              backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035),
              opacity: nextItemAnimation,
              transform: [{
                translateX: nextItemAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              }],
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={nextItem.title}
              className="min-w-0 flex-row items-center gap-3"
              onPress={() => nextItem.type === "timeBox"
                ? onOpenTimeBox(nextBox!)
                : nextItem.type === "journal"
                  ? onOpenJournal()
                  : onOpenHabits()}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: alpha(nextItem.color, 0.14) }}
              >
                <AppSymbol name={nextItem.icon} size={19} tintColor={nextItem.color} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-base font-bold" numberOfLines={1} style={{ color: appTheme.colors.foreground }}>
                  {nextItem.title}
                </Text>
                <Text className="mt-0.5 text-sm" style={{ color: appTheme.colors.muted }}>
                  {nextItem.detail}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole={nextItem.type === "journal" ? "button" : "checkbox"}
              accessibilityLabel={nextItem.type === "journal"
                ? t("selfImprovementHome.startJournal")
                : t("selfImprovementHome.markEventComplete", { title: nextItem.title })}
              accessibilityState={nextItem.type === "journal"
                ? undefined
                : { checked: false, disabled: completingNextItem }}
              disabled={completingNextItem}
              className="h-10 flex-row items-center justify-center gap-2 rounded-full px-3"
              style={{
                backgroundColor: alpha(nextItemActionColor, 0.14),
                opacity: completingNextItem ? 0.5 : 1,
              }}
              onPress={nextItem.type === "journal" ? onOpenJournal : completeNextItem}
            >
              <AppSymbol
                name={nextItem.type === "journal" ? "book.pages.fill" : "checkmark"}
                size={14}
                tintColor={nextItemActionColor}
              />
              <Text className="text-sm font-bold" style={{ color: nextItemActionColor }}>
                {t(nextItem.type === "journal"
                  ? "selfImprovementHome.startJournal"
                  : "selfImprovementHome.markComplete")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}

      <View className="gap-4">
        <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>
          {t("selfImprovementHome.lastSevenDays")}
        </Text>
        <View className="gap-4 rounded-3xl px-4 py-5" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035) }}>
          <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {[
              [t("tabs.notes"), appTheme.colors.primary],
              [t("tabs.habits"), appTheme.colors.positive],
              [t("tabs.schedule"), scheduleColor],
              [t("selfImprovementHome.notCompleted"), alpha(appTheme.colors.foreground, 0.1)],
            ].map(([label, color]) => (
              <View key={label} className="flex-row items-center gap-1.5">
                <View className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{label}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row justify-between">
            {weekDates.map((date) => {
              const completedIds = completedByDate.get(date) ?? new Set<string>();
              const scheduledHabits = habits.filter((habit) => isHabitScheduledOnDate(habit, date));
              const dateBoxes = timeBoxes.filter((box) => box.date === date);
              const journalComplete = Boolean(journalHabit && completedIds.has(journalHabit.id));
              const habitsComplete = scheduledHabits.length > 0 && scheduledHabits.every((habit) => completedIds.has(habit.id));
              const scheduleComplete = dateBoxes.length > 0 && dateBoxes.every((box) => box.completed);

              return (
                <View key={date} className="items-center gap-2">
                  <View className="gap-1.5 rounded-full px-2 py-2" style={{ backgroundColor: date === today ? alpha(appTheme.colors.primary, 0.1) : "transparent" }}>
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: journalComplete ? appTheme.colors.primary : alpha(appTheme.colors.foreground, 0.1) }} />
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: habitsComplete ? appTheme.colors.positive : alpha(appTheme.colors.foreground, 0.1) }} />
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: scheduleComplete ? scheduleColor : alpha(appTheme.colors.foreground, 0.1) }} />
                  </View>
                  <Text className="text-xs font-bold" style={{ color: date === today ? appTheme.colors.primary : appTheme.colors.muted }}>
                    {parseDateKey(date).toLocaleDateString(locale, { weekday: "narrow" })}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
