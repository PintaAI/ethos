import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { Animated, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { ActivityHeatmap } from "@/components/cashflow/ActivityHeatmap";
import { useAppTheme } from "@/components/provider/AppTheme";
import type { Item, ItemOccurrence, UnifiedHabitLog } from "@/data/lifeflow/types";
import type { CachedNote } from "@/data/notes/types";
import { alpha } from "@/lib/color";
import { addDaysToDateKey, formatTimeRange12h, parseDateKey, toDateKey } from "@/lib/date";
import type { LifeFlowDailyProgress } from "@/lib/lifeFlowProgress";

type OverviewRowProps = {
  icon: "book.pages.fill" | "checkmark.circle.fill" | "calendar";
  title: string;
  value: string;
  detail: string;
  color: string;
  onPress?: () => void;
};

type LifeFlowHomeContentProps = {
  notes: CachedNote[];
  items: Item[];
  habitLogs: UnifiedHabitLog[];
  occurrences: ItemOccurrence[];
  dailyProgress: LifeFlowDailyProgress;
  getOccurrencesForDate: (date: string) => ItemOccurrence[];
  referenceDate?: Date;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenJournal: () => void;
  onOpenHabits: () => void;
  onOpenSchedule: () => void;
  onOpenEvent: (item: ItemOccurrence) => void;
  onCompleteHabit: (item: ItemOccurrence) => Promise<void>;
};

function OverviewRow({ icon, title, value, detail, color, onPress }: OverviewRowProps) {
  const appTheme = useAppTheme();
  const content = <>
    <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: alpha(color, 0.14) }}>
      <AppSymbol name={icon} size={20} tintColor={color} />
    </View>
    <View className="min-w-0 flex-1">
      <Text className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>{title}</Text>
      <Text className="mt-0.5 text-sm" numberOfLines={1} style={{ color: appTheme.colors.muted }}>{detail}</Text>
    </View>
    <Text className="text-sm font-bold" style={{ color }}>{value}</Text>
    {onPress ? <AppSymbol name="chevron.right" size={15} tintColor={appTheme.colors.muted} /> : null}
  </>;

  if (!onPress) {
    return <View accessible accessibilityLabel={`${title}, ${value}`} className="flex-row items-center gap-3 px-4 py-4">{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${value}`}
      className="flex-row items-center gap-3 px-4 py-4"
      style={{ backgroundColor: "transparent" }}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

export function LifeFlowHomeContent({
  notes,
  items,
  habitLogs,
  occurrences,
  dailyProgress,
  getOccurrencesForDate,
  referenceDate,
  refreshing,
  onRefresh,
  onOpenJournal,
  onOpenHabits,
  onOpenSchedule,
  onOpenEvent,
  onCompleteHabit,
}: LifeFlowHomeContentProps) {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const scheduleColor = appTheme.isDark ? appTheme.colors.secondary : appTheme.colors.foreground;
  const now = referenceDate ?? new Date();
  const today = toDateKey(now);
  const locale = i18n.language === "id" ? "id-ID" : "en-US";
  const monday = addDaysToDateKey(today, -((now.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(monday, index));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const systemType = (occurrence: ItemOccurrence) => itemById.get(occurrence.itemId)?.systemType;
  const appCheckInItem = items.find((item) => item.systemType === "app_check_in");
  const checkInDates = new Set(habitLogs.filter((log) => log.itemId === appCheckInItem?.id).map((log) => log.date));
  const checkInDays = Array.from({ length: 370 }, (_, index) => {
    const date = addDaysToDateKey(today, index - 369);
    return { date, count: checkInDates.has(date) ? 1 : 0 };
  });
  let checkInStreak = 0;
  while (checkInStreak < 370 && checkInDates.has(addDaysToDateKey(today, -checkInStreak))) checkInStreak += 1;
  const checkInActivity = {
    days: checkInDays,
    totalEntries: checkInDates.size,
    activeDays: checkInDates.size,
    currentStreak: checkInStreak,
  };
  const [selectedCheckInDate, setSelectedCheckInDate] = useState(today);
  const journal = occurrences.find((item) => systemType(item) === "journal");
  const userHabits = occurrences.filter((item) => item.kind === "habit" && systemType(item) === null);
  const completedHabits = userHabits.filter((item) => item.completed).length;
  const todayEvents = occurrences.filter((item) => item.kind === "event");
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nextEvent = [...todayEvents]
    .filter((item) => item.startTime === null || item.startTime >= currentTime)
    .sort((left, right) => (left.startTime ?? "").localeCompare(right.startTime ?? ""))[0];
  const nextHabit = userHabits.find((item) => !item.completed);
  const nextItem = nextEvent
    ? { type: "event" as const, occurrence: nextEvent, icon: "calendar" as const }
    : nextHabit
      ? { type: "habit" as const, occurrence: nextHabit, icon: "checkmark.circle.fill" as const }
      : journal && !journal.completed
        ? { type: "journal" as const, occurrence: journal, icon: "book.pages.fill" as const }
        : null;
  const [nextItemAnimation] = useState(() => new Animated.Value(0));
  const [completingNextItem, setCompletingNextItem] = useState(false);

  useEffect(() => {
    nextItemAnimation.setValue(0);
    const animation = Animated.timing(nextItemAnimation, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [nextItem?.occurrence.id, nextItemAnimation]);

  const completeNextHabit = () => {
    if (!nextItem || nextItem.type !== "habit" || completingNextItem) return;
    Haptics.selectionAsync().catch(() => {});
    setCompletingNextItem(true);
    Animated.timing(nextItemAnimation, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) {
        setCompletingNextItem(false);
        return;
      }
      void onCompleteHabit(nextItem.occurrence)
        .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}))
        .catch((error) => {
          console.warn("Failed to complete next item", error);
          Animated.timing(nextItemAnimation, { toValue: 1, duration: 180, useNativeDriver: true }).start();
        })
        .finally(() => setCompletingNextItem(false));
    });
  };
  const latestNote = [...notes].sort((left, right) => {
    const leftUpdatedAt = left.draft?.updatedAt ?? left.updatedAt;
    const rightUpdatedAt = right.draft?.updatedAt ?? right.updatedAt;
    return rightUpdatedAt.localeCompare(leftUpdatedAt);
  })[0];
  const journalDetail = journal?.completed
    ? latestNote
      ? t("lifeFlowHome.latestEntry", { title: latestNote.title || t("tabs.notes") })
      : t("lifeFlowHome.journalDone")
    : t("lifeFlowHome.journalPending");
  const scheduleDetail = nextEvent?.startTime
    ? t("lifeFlowHome.nextBlock", { title: nextEvent.name, time: formatTimeRange12h(nextEvent.startTime, nextEvent.endTime!) })
    : nextEvent
      ? nextEvent.name
      : t("lifeFlowHome.noUpcomingBlocks");
  const nextDetail = nextItem?.type === "event"
    ? nextItem.occurrence.startTime
      ? formatTimeRange12h(nextItem.occurrence.startTime, nextItem.occurrence.endTime!)
      : t("lifeFlowItems.allDay")
    : nextItem?.type === "journal"
      ? t("lifeFlowHome.journalPending")
      : t("lifeFlowHome.habitForToday");

  return (
    <ScrollView
      className="flex-1 bg-[--app-color-background]"
      contentContainerClassName="gap-7 px-5 pb-14 pt-4"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing === true} onRefresh={onRefresh} tintColor={appTheme.colors.primary} />
        ) : undefined
      }
    >
      <View>
        <View className="gap-3">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: appTheme.colors.muted }}>
            {now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          <View>
            <Text className="text-2xl font-black tracking-tight" style={{ color: appTheme.colors.foreground }}>
              {t("lifeFlowHome.dailyRhythm")}
            </Text>
            <Text className="mt-1 text-sm" style={{ color: appTheme.colors.muted }}>
              {t("lifeFlowHome.complete", { completed: dailyProgress.completedToday, total: dailyProgress.totalToday })}
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.08) }}>
            <View className="h-full rounded-full" style={{ width: `${dailyProgress.percentage}%`, backgroundColor: appTheme.colors.primary }} />
          </View>
        </View>

        <ActivityHeatmap
          activity={checkInActivity}
          selectedDate={selectedCheckInDate}
          onDateSelect={setSelectedCheckInDate}
          fixedView="calendar"
          binary
          countsPosition="below"
          copy={{
            title: appCheckInItem?.name ?? t("lifeFlowHome.appCheckIn"),
            activeToday: t("lifeFlowHome.checkedInToday"),
            inactiveToday: t("lifeFlowHome.notCheckedInToday"),
            recorded: t("lifeFlowHome.checkInsRecorded", { count: checkInActivity.totalEntries }),
            activeDays: t("lifeFlowHome.activeDays", { count: checkInActivity.activeDays }),
            streak: t("lifeFlowHome.dayStreak", { count: checkInActivity.currentStreak }),
            dayLabel: (day) => t(day.count > 0 ? "lifeFlowHome.checkedInOn" : "lifeFlowHome.notCheckedInOn", {
              date: parseDateKey(day.date).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
            }),
          }}
        />
      </View>

      <View className="overflow-hidden rounded-3xl" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035) }}>
        <OverviewRow
          icon="book.pages.fill"
          title={t("tabs.notes")}
          value={t(journal?.completed ? "lifeFlowHome.done" : "lifeFlowHome.open")}
          detail={journalDetail}
          color={appTheme.colors.primary}
          onPress={onOpenJournal}
        />
        <View className="ml-[68px] h-px" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.08) }} />
        <OverviewRow
          icon="checkmark.circle.fill"
          title={t("tabs.habits")}
          value={`${completedHabits}/${userHabits.length}`}
          detail={userHabits.length === 0
            ? t("lifeFlowHome.noHabits")
            : t("lifeFlowHome.habitsProgress", { completed: completedHabits, total: userHabits.length })}
          color={appTheme.colors.positive}
          onPress={onOpenHabits}
        />
        <View className="ml-[68px] h-px" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.08) }} />
        <OverviewRow
          icon="calendar"
          title={t("tabs.schedule")}
          value={`${todayEvents.length}`}
          detail={todayEvents.length === 0 ? t("lifeFlowHome.scheduleEmpty") : scheduleDetail}
          color={scheduleColor}
          onPress={onOpenSchedule}
        />
      </View>

      {nextItem ? (
        <View className="gap-3">
          <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>
            {t("lifeFlowHome.nextEvent")}
          </Text>
          <Animated.View
            className="gap-3 rounded-3xl p-4"
            style={{
              backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035),
              opacity: nextItemAnimation,
              transform: [{ translateX: nextItemAnimation.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={nextItem.occurrence.name}
              className="min-w-0 flex-row items-center gap-3"
              onPress={() => nextItem.type === "event"
                ? onOpenEvent(nextItem.occurrence)
                : nextItem.type === "journal"
                  ? onOpenJournal()
                  : onOpenHabits()}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: alpha(nextItem.occurrence.color, 0.14) }}>
                <AppSymbol name={nextItem.icon} size={19} tintColor={nextItem.occurrence.color} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-base font-bold" numberOfLines={1} style={{ color: appTheme.colors.foreground }}>
                  {nextItem.occurrence.name}
                </Text>
                <Text className="mt-0.5 text-sm" style={{ color: appTheme.colors.muted }}>{nextDetail}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole={nextItem.type === "habit" ? "checkbox" : "button"}
              accessibilityLabel={nextItem.type === "habit"
                ? t("lifeFlowHome.markEventComplete", { title: nextItem.occurrence.name })
                : nextItem.type === "journal"
                  ? t("lifeFlowHome.startJournal")
                  : nextItem.occurrence.name}
              accessibilityState={nextItem.type === "habit" ? { checked: false, disabled: completingNextItem } : undefined}
              disabled={completingNextItem}
              className="h-10 flex-row items-center justify-center gap-2 rounded-full px-3"
              style={{
                backgroundColor: alpha(nextItem.type === "habit" ? appTheme.colors.positive : appTheme.colors.primary, 0.14),
                opacity: completingNextItem ? 0.5 : 1,
              }}
              onPress={() => nextItem.type === "habit"
                ? completeNextHabit()
                : nextItem.type === "journal"
                  ? onOpenJournal()
                  : onOpenEvent(nextItem.occurrence)}
            >
              <AppSymbol name={nextItem.type === "habit" ? "checkmark" : nextItem.icon} size={14} tintColor={nextItem.type === "habit" ? appTheme.colors.positive : appTheme.colors.primary} />
              <Text className="text-sm font-bold" style={{ color: nextItem.type === "habit" ? appTheme.colors.positive : appTheme.colors.primary }}>
                {t(nextItem.type === "habit"
                  ? "lifeFlowHome.markComplete"
                  : nextItem.type === "journal"
                    ? "lifeFlowHome.startJournal"
                    : "lifeFlowHome.open")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}

      <View className="gap-4">
        <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>
          {t("lifeFlowHome.lastSevenDays")}
        </Text>
        <View className="gap-4 rounded-3xl px-4 py-5" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035) }}>
          <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {[
              [t("tabs.notes"), appTheme.colors.primary],
              [t("tabs.habits"), appTheme.colors.positive],
              [t("tabs.schedule"), scheduleColor],
              [t("lifeFlowHome.notCompleted"), alpha(appTheme.colors.foreground, 0.1)],
            ].map(([label, color]) => (
              <View key={label} className="flex-row items-center gap-1.5">
                <View className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{label}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row justify-between">
            {weekDates.map((date) => {
              const dateOccurrences = getOccurrencesForDate(date);
              const dateSystemType = (occurrence: ItemOccurrence) => itemById.get(occurrence.itemId)?.systemType;
              const dateJournal = dateOccurrences.find((item) => dateSystemType(item) === "journal");
              const dateHabits = dateOccurrences.filter((item) => item.kind === "habit" && dateSystemType(item) === null);
              const habitsComplete = dateHabits.length > 0 && dateHabits.every((item) => item.completed);
              const hasEvents = dateOccurrences.some((item) => item.kind === "event");
              return (
                <View key={date} className="items-center gap-2">
                  <View className="gap-1.5 rounded-full px-2 py-2" style={{ backgroundColor: date === today ? alpha(appTheme.colors.primary, 0.1) : "transparent" }}>
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: dateJournal?.completed ? appTheme.colors.primary : alpha(appTheme.colors.foreground, 0.1) }} />
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: habitsComplete ? appTheme.colors.positive : alpha(appTheme.colors.foreground, 0.1) }} />
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: hasEvents ? scheduleColor : alpha(appTheme.colors.foreground, 0.1) }} />
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
