import { useEffect, useMemo, useRef } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import type { Habit, HabitLog } from "@/data/selfImprovement/types";
import { addDays, parseDateKey, toDateKey } from "@/lib/date";
import { getHabitCreationDate } from "@/lib/habit";

const UPCOMING_DAYS = 17 * 7;
type HabitHeatmapProps = {
  habit: Habit;
  logs: HabitLog[];
  selectedDate: string;
};

function buildColumns(logs: HabitLog[], habit: Habit) {
  const today = new Date();
  const todayKey = toDateKey(today);
  const creationDate = getHabitCreationDate(habit.createdAt) ?? todayKey;
  const horizon = addDays(today, UPCOMING_DAYS);
  const completedDates = new Set(logs.filter((log) => log.habitId === habit.id).map((log) => log.date));
  const occurrences: { date: string; count: number; future: boolean }[] = [];

  for (let date = parseDateKey(creationDate); date <= horizon; date = addDays(date, 1)) {
    if (!habit.weekdays.includes(date.getDay())) continue;
    const key = toDateKey(date);
    occurrences.push({ date: key, count: Number(completedDates.has(key)), future: key > todayKey });
  }

  const rowCount = habit.weekdays.length;
  const columns: typeof occurrences[] = [];
  for (let index = 0; index < occurrences.length; index += rowCount) {
    columns.push(occurrences.slice(index, index + rowCount));
  }
  return columns;
}

function getColor(count: number, color: string, empty: string) {
  if (count < 0) return "transparent";
  if (count === 0) return empty;
  return color;
}

export function HabitHeatmap({ habit, logs, selectedDate }: HabitHeatmapProps) {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const columns = useMemo(() => buildColumns(logs, habit), [habit, logs]);
  const days = columns.flat();
  const empty = appTheme.isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)";
  const habitColor = habit.isAppCheckIn ? appTheme.colors.primary : habit.color;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const firstColumn = columns[0] ?? [];
  const dayLabels = firstColumn.map((day) => {
    const weekday = parseDateKey(day.date).getDay();
    return (
    habit.weekdays.length < 7 || [1, 3, 5].includes(weekday)
      ? parseDateKey(day.date).toLocaleDateString(locale, { weekday: "short" })
      : ""
    );
  });

  useEffect(() => {
    const selectedIndex = days.findIndex((day) => day.date === selectedDate);
    requestAnimationFrame(() => {
      if (selectedIndex >= 0) {
        scrollRef.current?.scrollTo({ x: Math.max(0, Math.floor(selectedIndex / habit.weekdays.length) * 18 - 120), animated: true });
        return;
      }
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [days, habit.weekdays.length, selectedDate]);

  return (
    <View className="flex-row gap-2">
      <View className="shrink-0 gap-1">
        {dayLabels.map((label, index) => (
          <View key={`${label}-${index}`} className="h-3 justify-center">
            <Text className="text-xs leading-4" style={{ color: appTheme.colors.muted }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="min-w-0 flex-1"
        contentContainerClassName="gap-1 pb-1"
      >
        {columns.map((column, index) => (
          <View key={column[0]?.date ?? index} className="gap-1">
            {column.map((day) => {
              const selected = day.date === selectedDate;
              return (
                <View
                  key={day.date}
                  accessible
                  accessibilityState={{ selected, disabled: day.future }}
                  accessibilityLabel={t("atomicHabits.heatmapDay", {
                    date: parseDateKey(day.date).toLocaleDateString(locale),
                    count: Math.max(0, day.count),
                  })}
                  className="h-3 w-3 rounded-[3px]"
                  style={{
                    backgroundColor: getColor(day.count, habitColor, empty),
                    borderColor: selected ? habitColor : "transparent",
                    borderWidth: selected ? 2 : 0,
                  }}
                />
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
