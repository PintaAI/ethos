import { useState, useMemo } from "react";
import { Alert, Pressable, View } from "react-native";
import { type SFSymbol } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as RNText } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useCurrency } from "@/components/provider/CurrencyProvider";
import { DayDetailPanel } from "@/components/cashflow/DayDetailPanel";
import type { CashflowEntry } from "@/components/cashflow/CashflowTable";
import { alpha } from "@/lib/color";
import { localizeCategoryName } from "@/lib/categoryNames";
import { localeFromLanguage, toDateKey } from "@/lib/date";

type CalendarData = Record<string, { entries: CashflowEntry[]; income: number; expenses: number }>;

type CashflowCalendarProps = {
  entries: CashflowEntry[];
};

function CalSymbol({ name, color, size = 15 }: { name: SFSymbol; color: string; size?: number }) {
  return <AppSymbol name={name} size={size} tintColor={color} fallback={<RNText style={{ color }}>•</RNText>} />;
}

function getCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + index);
    return d;
  });
}

function MonthCalendar({
  currentMonth,
  selectedDay,
  calendarData,
  onMonthChange,
  onDaySelect,
}: {
  currentMonth: Date;
  selectedDay: Date | undefined;
  calendarData: CalendarData;
  onMonthChange: (date: Date) => void;
  onDaySelect: (date: Date) => void;
}) {
  const appTheme = useAppTheme();
  const { t, i18n } = useTranslation();
  const { format } = useCurrency();
  const days = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);
  const today = useMemo(() => new Date(), []);
  const locale = localeFromLanguage(i18n.language);
  const monthLabel = currentMonth.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const monthSummary = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dayCount = new Date(year, month + 1, 0).getDate();
    let income = 0;
    let expenses = 0;

    for (let day = 1; day <= dayCount; day += 1) {
      const dayData = calendarData[toDateKey(new Date(year, month, day))];
      if (!dayData) continue;
      income += dayData.income;
      expenses += dayData.expenses;
    }

    return { income, expenses, net: income - expenses };
  }, [calendarData, currentMonth]);
  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: "short" });
    });
  }, [locale]);

  const positive = appTheme.colors.positive;
  const negative = appTheme.colors.negative;
  const mutedSurface = appTheme.isDark ? "rgba(255,255,255,0.075)" : "rgba(15,23,42,0.045)";
  const activeSurface = alpha(appTheme.colors.primary, appTheme.isDark ? 0.24 : 0.13);

  return (
    <View className="py-1">
      <View className="mb-4 flex-row items-end justify-between gap-3 px-1">
        <View className="min-w-0 flex-1">

          <RNText numberOfLines={1} className="mt-1 text-4xl font-black capitalize tracking-tight" style={{ color: appTheme.colors.foreground }}>
            {monthLabel}
          </RNText>
        </View>
        <View className="flex-row gap-2">
        <Pressable
          onPress={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: mutedSurface }}
        >
          <CalSymbol name="chevron.left" color={appTheme.colors.foreground} size={14} />
        </Pressable>
        <Pressable
          onPress={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: mutedSurface }}
        >
          <CalSymbol name="chevron.right" color={appTheme.colors.foreground} size={14} />
        </Pressable>
        </View>
      </View>

      <View className="mb-2 flex-row px-1 py-1.5">
        {weekdays.map((d) => (
          <View key={d} className="flex-1 items-center py-1">
            <RNText className="text-xs font-extrabold capitalize tracking-wide" style={{ color: d === weekdays[0] ? negative : appTheme.colors.muted }}>{d}</RNText>
          </View>
        ))}
      </View>

      {Array.from({ length: 6 }).map((_, row) => (
        <View key={row} className="flex-row gap-1">
          {days.slice(row * 7, row * 7 + 7).map((d) => {
            const dateKey = toDateKey(d);
            const dayData = calendarData[dateKey];
            const hasEntries = Boolean(dayData && dayData.entries.length > 0);
            const net = dayData ? dayData.income - dayData.expenses : 0;
            const isCurrentMonth = d.getMonth() === currentMonth.getMonth();
            const isSelected = selectedDay ? d.toDateString() === selectedDay.toDateString() : false;
            const isToday = d.toDateString() === today.toDateString();
            const dayTextColor = isSelected
              ? appTheme.colors.primary
              : isToday
                ? appTheme.colors.foreground
                : isCurrentMonth
                  ? appTheme.colors.foreground
                  : appTheme.colors.muted;

            return (
              <Pressable
                key={dateKey}
                onPress={() => {
                  if (d.getMonth() !== currentMonth.getMonth() || d.getFullYear() !== currentMonth.getFullYear()) {
                    onMonthChange(new Date(d.getFullYear(), d.getMonth(), 1));
                  }
                  onDaySelect(d);
                }}
                className="mb-2 min-h-[65px] flex-1 items-center justify-center overflow-hidden rounded-2xl border px-0.5 py-1"
                style={{
                  backgroundColor: isSelected ? activeSurface : "transparent",
                  borderColor: isSelected ? alpha(appTheme.colors.primary, 0.55) : isToday ? alpha(appTheme.colors.primary, 0.35) : "transparent",
                  opacity: isCurrentMonth ? 1 : 0.38,
                }}
              >
                <View className="w-full flex-row items-start justify-center gap-1">
                  <View
                    className="min-h-7 min-w-8 items-center justify-center rounded-xl px-1.5"
                    style={{ backgroundColor: hasEntries || isSelected || isToday ? (isSelected ? alpha(appTheme.colors.primary, 0.18) : appTheme.colors.foreground) : "transparent" }}
                  >
                    <RNText
                      className="text-base leading-none"
                      style={{
                        color: hasEntries && !isSelected ? appTheme.colors.background : dayTextColor,
                        fontWeight: hasEntries || isSelected || isToday ? "900" : "700",
                      }}
                    >
                      {d.getDate()}
                    </RNText>
                  </View>
                </View>
                {hasEntries ? (
                  <View className="mt-1 w-full items-center gap-0.5">
                    <RNText
                      adjustsFontSizeToFit
                      minimumFontScale={0.62}
                      numberOfLines={1}
                      className="w-full text-center text-xs font-bold leading-tight"
                      style={{ color: appTheme.colors.foreground }}
                    >
                      {net < 0 ? "-" : ""}{format(Math.abs(net), { compact: true })}
                    </RNText>
                    <View className="h-0.5 w-8 rounded-full" style={{ backgroundColor: alpha(net >= 0 ? positive : negative, appTheme.isDark ? 0.75 : 0.45) }} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View className="mt-1 flex-row flex-wrap justify-center gap-x-3 gap-y-1 px-1">
        {[
          { label: t('analytics.income'), icon: "arrow.down.circle.fill" as const, value: monthSummary.income, color: positive },
          { label: t('analytics.expenses'), icon: "arrow.up.circle.fill" as const, value: monthSummary.expenses, color: negative },
          { label: t('analytics.net'), icon: "equal.circle.fill" as const, value: monthSummary.net, color: appTheme.colors.foreground },
        ].map((item) => (
          <View
            key={item.label}
            accessible
            accessibilityLabel={`${item.label}: ${format(item.value)}`}
            className="flex-row items-center gap-1"
          >
            <CalSymbol name={item.icon} color={item.color} size={13} />
            <RNText className="text-xs font-bold" style={{ color: item.color }}>
              {format(item.value, { compact: true })}
            </RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CashflowCalendar({ entries }: CashflowCalendarProps) {
  const { t } = useTranslation();
  const { format } = useCurrency();
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const calendarData = useMemo(() => {
    const data: CalendarData = {};
    for (const entry of entries) {
      if (!entry.date) continue;
      const dayList = data[entry.date] = data[entry.date] || { entries: [], income: 0, expenses: 0 };
      dayList.entries.push(entry);
      if (entry.io === "Income") dayList.income += entry.nominal;
      else dayList.expenses += entry.nominal;
    }
    return data;
  }, [entries]);

  const selectedDayKey = selectedDay ? toDateKey(selectedDay) : null;
  const selectedDayData = selectedDayKey ? calendarData[selectedDayKey] : null;
  const selectedEntries = useMemo(() => selectedDayData?.entries ?? [], [selectedDayData]);
  return (
    <View className="gap-4">
      <MonthCalendar
        currentMonth={currentMonth}
        selectedDay={selectedDay}
        calendarData={calendarData}
        onMonthChange={setCurrentMonth}
        onDaySelect={setSelectedDay}
      />

      <DayDetailPanel
        date={selectedDay ?? null}
        entries={selectedEntries}
        onEntryPress={(entry) => Alert.alert(entry.name, `${format(entry.nominal)}\n${localizeCategoryName(entry.category) ?? t("cashflow.withoutCategory")}\n${entry.createdBy ?? "Unknown"}`)}
      />
    </View>
  );
}
