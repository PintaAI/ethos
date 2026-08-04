import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { GlassBox } from "@/components/GlassBox";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { AppText as RNText } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { alpha } from "@/lib/color";
import { formatLocalizedDate, localeFromLanguage, parseDateKey, toDateKey } from "@/lib/date";
import { getPreference, setPreference } from "@/lib/preferences";

export type ActivityDay = {
  date: string;
  count: number;
};

export type ActivityOverview = {
  days: ActivityDay[];
  totalEntries: number;
  activeDays: number;
  currentStreak: number;
};

type ActivityHeatmapProps = {
  activity: ActivityOverview;
  selectedDate: string;
  onDateSelect: (date: string) => void;
};

type ActivityView = "grid" | "calendar";

function getLocalTodayKey() {
  return toDateKey(new Date());
}

function getDayLabels(locale: string) {
  const base = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    if (i % 2 !== 0) return "";
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toLocaleDateString(locale, { weekday: "short" });
  });
}

function getLevel(count: number) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

function getCellColor(count: number, primary: string, mutedFill: string) {
  switch (getLevel(count)) {
    case 1:
      return alpha(primary, 0.2);
    case 2:
      return alpha(primary, 0.4);
    case 3:
      return alpha(primary, 0.7);
    case 4:
      return primary;
    default:
      return mutedFill;
  }
}

function formatDayTitle(day: ActivityDay, locale: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const formattedDate = formatLocalizedDate(parseDateKey(day.date), locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (day.count === 0) return t("cashflow.activityNoTransactions", { formattedDate });

  return t("cashflow.activityTransactions", { formattedDate, count: day.count });
}

function getDayNumber(dateKey: string) {
  return parseDateKey(dateKey).getDate();
}

function getMonthRangeDays(days: ActivityDay[], selectedDate: string) {
  const selected = parseDateKey(selectedDate);
  const today = new Date();
  const firstOfMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const lastOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  const endDate = selected.getFullYear() === today.getFullYear() && selected.getMonth() === today.getMonth()
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)
    : lastOfMonth;
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const range: ActivityDay[] = [];
  const cursor = new Date(firstOfMonth);

  while (cursor <= endDate) {
    const key = toDateKey(cursor);
    range.push(dayMap.get(key) ?? { date: key, count: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return range;
}

function chunkWeeks(days: ActivityDay[]) {
  const weeks: ActivityDay[][] = [];

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

function ActivityViewTabs({ view, onChange, compact = false }: { view: ActivityView; onChange: (view: ActivityView) => void; compact?: boolean }) {
  const appTheme = useAppTheme();
  const swipeGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetX([-24, 24])
      .failOffsetY([-12, 12])
      .onEnd((event) => {
        if (event.translationX < -32) {
          runOnJS(onChange)("grid");
          return;
        }

        if (event.translationX > 32) runOnJS(onChange)("calendar");
      }),
    [onChange],
  );

  return (
    <GestureDetector gesture={swipeGesture}>
      <GlassBox
        isInteractive
        tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.1)}
        glassEffectStyle="clear"
        style={{ borderRadius: 9999, flexDirection: "row", }}
      >
        {(["grid", "calendar"] as const).map((item) => {
          const isActive = view === item;

          return (
            <Pressable
              key={item}
              onPress={() => onChange(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              className={`flex-row items-center gap-1 ${compact ? "px-1.5 py-0.5" : "px-2 py-1"}`}
              style={{
                backgroundColor: isActive ? appTheme.colors.primary : "transparent",
                ...(isActive && item === "grid" ? { borderTopLeftRadius: 9999, borderBottomLeftRadius: 9999 } : {}),
                ...(isActive && item === "calendar" ? { borderTopRightRadius: 9999, borderBottomRightRadius: 9999 } : {}),
              }}
            >
              <AppSymbol
                name={item === "grid" ? "square.grid.2x2" : "calendar"}
                size={compact ? 10 : 12}
                tintColor={isActive ? appTheme.colors.inverseForeground : appTheme.colors.muted}
              />
              <RNText
                className="text-xs font-medium"
                style={{ color: isActive ? appTheme.colors.inverseForeground : appTheme.colors.muted }}
              >
                {item === "grid" ? "Grid" : "Calendar"}
              </RNText>
            </Pressable>
          );
        })}
      </GlassBox>
    </GestureDetector>
  );
}

function ActivityGrid({ activity, selectedDate, onDateSelect }: ActivityHeatmapProps) {
  const appTheme = useAppTheme();
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = activity.days.findIndex((day) => day.date === selectedDate);
  const mutedFill = appTheme.isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)";
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)";
  const weeks = chunkWeeks(activity.days);
  const dayLabels = useMemo(() => getDayLabels(localeFromLanguage(i18n.language)), [i18n.language]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (selectedIndex >= 0) {
        scrollRef.current?.scrollTo({ x: Math.max(0, Math.floor(selectedIndex / 7) * 18 - 120), animated: true });
        return;
      }

      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [selectedIndex]);

  return (
    <View className="mt-3 flex-row gap-2">
      <View className="shrink-0 gap-1">
        {dayLabels.map((label, index) => (
          <RNText key={`${label}-${index}`} className="text-xs" style={{ color: appTheme.colors.muted }}>
            {label}
          </RNText>
        ))}
      </View>

      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerClassName="gap-1 pb-1">
        {weeks.map((week, weekIndex) => (
          <View key={week[0]?.date ?? weekIndex} className="gap-1">
            {week.map((day) => {
              const isSelected = day.date === selectedDate;

              return (
                <Pressable
                  key={day.date}
                  onPress={() => onDateSelect(day.date)}
                  accessibilityRole="button"
                  accessibilityLabel={formatDayTitle(day, localeFromLanguage(i18n.language), t)}
                  className="h-3 w-3 rounded-[3px]"
                  style={{
                    backgroundColor: getCellColor(day.count, appTheme.colors.primary, mutedFill),
                    borderColor: isSelected ? appTheme.colors.primary : "transparent",
                    borderWidth: isSelected ? 2 : 0,
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

function ActivityCalendar({ activity, selectedDate, onDateSelect }: ActivityHeatmapProps) {
  const appTheme = useAppTheme();
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const todayKey = getLocalTodayKey();
  const days = getMonthRangeDays(activity.days, selectedDate);
  const selectedIndex = days.findIndex((day) => day.date === selectedDate);
  const mutedFill = appTheme.isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)";
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)";
  const locale = localeFromLanguage(i18n.language);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (selectedIndex >= 0) scrollRef.current?.scrollTo({ x: Math.max(0, selectedIndex * 48 - 120), animated: true });
    });
  }, [selectedIndex]);

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-1 pb-1">
      {days.map((day) => {
        const date = parseDateKey(day.date);
        const weekday = date.toLocaleDateString(locale, { weekday: "short" });
        const isToday = day.date === todayKey;
        const isSelected = day.date === selectedDate;
        const isPast = day.date < todayKey;
        const level = getLevel(day.count);

        return (
          <View key={day.date} className="shrink-0 items-center gap-0.5">
            <RNText
              className="text-xs font-medium"
              style={{
                color: isSelected
                  ? appTheme.colors.primary
                  : isToday
                    ? appTheme.colors.foreground
                    : isPast
                      ? appTheme.colors.muted
                      : alpha(appTheme.colors.muted, 0.5),
              }}
            >
              {weekday}
            </RNText>
            <Pressable
              onPress={() => onDateSelect(day.date)}
              accessibilityRole="button"
              accessibilityLabel={formatDayTitle(day, locale, t)}
              className="h-8 w-11 items-center justify-center rounded-[3px]"
              style={{
                backgroundColor: getCellColor(day.count, appTheme.colors.primary, mutedFill),
                borderColor: isSelected ? appTheme.colors.primary : isToday ? alpha(appTheme.colors.foreground, 0.6) : borderColor,
                borderWidth: isSelected || isToday ? 2 : 1,
              }}
            >
              <RNText
                className="text-xs font-semibold"
                style={{ color: day.count > 0 && level >= 3 ? appTheme.colors.inverseForeground : appTheme.colors.muted }}
              >
                {getDayNumber(day.date)}
              </RNText>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function HeatmapLegend() {
  const appTheme = useAppTheme();
  const mutedFill = appTheme.isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)";
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)";

  return (
    <View className="mt-2 flex-row items-center justify-end gap-1">
      <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>Less</RNText>
      {[0, 1, 2, 4, 6].map((count) => (
        <View
          key={count}
          className="h-2.5 w-2.5 rounded-[2px]"
          style={{
            backgroundColor: getCellColor(count, appTheme.colors.primary, mutedFill),
            borderColor,
            borderWidth: 1,
          }}
        />
      ))}
      <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>More</RNText>
    </View>
  );
}

export function ActivityHeatmap({ activity, selectedDate, onDateSelect }: ActivityHeatmapProps) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { width } = useWindowDimensions();
  const [view, setView] = useState<ActivityView>("calendar");
  const isWide = width >= 640;
  const hasLoggedToday = activity.currentStreak > 0;

  useEffect(() => {
    getPreference("activityView").then((saved) => {
      if (saved) setView(saved as ActivityView);
    }).catch((error) => console.warn("Failed to load activity view", error));
  }, []);

  const handleViewChange = useCallback((nextView: ActivityView) => {
    setView(nextView);
    void setPreference("activityView", nextView)
      .catch((error) => console.warn("Failed to save activity view", error));
  }, []);

  return (
    <View>
      {isWide ? (
        <View className="mb-3 flex-row items-start justify-between gap-3">
          <View>
            <RNText className="text-base font-semibold" style={{ color: appTheme.colors.foreground }}>Activity</RNText>
            <RNText className="text-sm" style={{ color: appTheme.colors.muted }}>
              {hasLoggedToday ? "Today logged. Keep it alive." : "Log today to light up the grid."}
            </RNText>
          </View>
          <View className="flex-row items-center gap-2">
            <ActivityViewTabs view={view} onChange={handleViewChange} />
            <View className="shrink-0 rounded-full px-2.5 py-1" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.1) }}>
              <RNText className="text-xs font-semibold" style={{ color: appTheme.colors.primary }}>
                {activity.currentStreak} day streak
              </RNText>
            </View>
          </View>
        </View>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-2">
        <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>{t('cashflow.activityRecorded', { count: activity.totalEntries })}</RNText>
        <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>|</RNText>
        <RNText className="text-xs" style={{ color: appTheme.colors.muted }}>{activity.activeDays} active days</RNText>
        {!isWide ? (
          <View className="ml-auto">
            <ActivityViewTabs view={view} onChange={handleViewChange} compact />
          </View>
        ) : null}
      </View>

      {view === "grid" ? (
        <ActivityGrid activity={activity} selectedDate={selectedDate} onDateSelect={onDateSelect} />
      ) : (
        <ActivityCalendar activity={activity} selectedDate={selectedDate} onDateSelect={onDateSelect} />
      )}

      <HeatmapLegend />
    </View>
  );
}
