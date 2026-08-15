import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import type { Item, UnifiedHabitLog } from "@/data/lifeflow/types";
import { recurrenceAppliesOnDate } from "@/data/lifeflow/itemRecurrence";
import { alpha } from "@/lib/color";
import { addDaysToDateKey, parseDateKey, toDateKey } from "@/lib/date";

export function HabitHeatmap({ habit, logs, selectedDate }: { habit: Item; logs: UnifiedHabitLog[]; selectedDate: string }) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const [gridWidth, setGridWidth] = useState(0);
  const today = toDateKey(new Date());
  const completed = new Set(logs.filter((log) => log.itemId === habit.id).map((log) => log.date));
  const rowCount = habit.recurrence?.frequency === "weekly"
    ? Math.max(1, habit.recurrence.weekdays.length)
    : habit.recurrence?.frequency === "daily"
      ? 7
      : 1;
  const columnCount = Math.max(1, Math.floor((gridWidth + 4) / 16));
  const targetDateCount = columnCount * rowCount;
  const recurrenceInterval = habit.recurrence?.interval ?? 1;
  const preferredStart = addDaysToDateKey(today, -Math.floor(columnCount * 2 / 3) * 7 * recurrenceInterval);
  const rangeStart = habit.startsOn > preferredStart ? habit.startsOn : preferredStart;
  const dates: string[] = [];
  let cursor = rangeStart;

  for (let scannedDays = 0; dates.length < targetDateCount && scannedDays < 10_000; scannedDays += 1) {
    if (habit.recurrence?.endsOn && cursor > habit.recurrence.endsOn) break;
    if (recurrenceAppliesOnDate(habit, cursor)) dates.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }

  const columns = Array.from(
    { length: Math.ceil(dates.length / rowCount) },
    (_, index) => dates.slice(index * rowCount, index * rowCount + rowCount),
  );
  const firstColumn = columns[0] ?? [];

  return (
    <View className="flex-row gap-2">
      <View className="shrink-0 gap-1">
        {firstColumn.map((date, index) => (
          <View key={date} className="h-3 justify-center">
            <Text className="text-xs leading-4" style={{ color: theme.colors.muted }}>
              {rowCount < 7 || index % 2 === 0
                ? parseDateKey(date).toLocaleDateString(i18n.resolvedLanguage, { weekday: "short" })
                : ""}
            </Text>
          </View>
        ))}
      </View>
      <View
        onLayout={(event) => setGridWidth(Math.round(event.nativeEvent.layout.width))}
        className="min-w-0 flex-1"
        style={{
          flexDirection: "row",
          gap: 4,
          justifyContent: columns.length === columnCount ? "space-between" : "flex-start",
        }}
      >
        {columns.map((column) => (
          <View key={column[0]} className="gap-1">
            {column.map((date) => (
              <View
                key={date}
                accessible
                accessibilityState={{ selected: date === selectedDate, disabled: date > today }}
                accessibilityLabel={t("atomicHabits.heatmapDay", {
                  date: parseDateKey(date).toLocaleDateString(i18n.resolvedLanguage),
                  count: Number(completed.has(date)),
                })}
                className="h-3 w-3 rounded-[3px]"
                style={{
                  backgroundColor: completed.has(date) ? habit.color : alpha(theme.colors.foreground, 0.12),
                  borderColor: date === selectedDate ? habit.color : "transparent",
                  borderWidth: date === selectedDate ? 2 : 0,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
