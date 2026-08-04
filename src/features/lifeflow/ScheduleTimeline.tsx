import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { getTimeBoxColor } from "@/components/lifeflow/TimeMapDial";
import type { TimeBox } from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { formatTime12h } from "@/lib/date";
import { getTimeBoxFocusDuration } from "@/lib/timeBox";

type Props = {
  boxes: TimeBox[];
  onDelete: (id: string) => void;
  onSetCompleted: (id: string, completed: boolean) => void;
};

export function ScheduleTimeline({ boxes, onDelete, onSetCompleted }: Props) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();

  return (
    <View className="gap-2">
      <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.schedule")}</Text>
      {boxes.length === 0 ? (
        <View className="items-center gap-2 py-10">
          <AppSymbol name="calendar.day.timeline.left" size={30} tintColor={appTheme.colors.muted} />
          <Text className="text-center text-sm" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.empty")}</Text>
        </View>
      ) : null}
      {boxes.map((box, index) => {
        const breakMinutes = box.breakDurations.reduce((total, duration) => total + duration, 0);
        const focusMinutes = getTimeBoxFocusDuration(box.startTime, box.endTime, box.breakDurations);
        return (
          <View key={box.id} className="flex-row gap-3">
            <View className="w-16 items-end pt-3">
              <Text numberOfLines={1} className="text-xs font-bold" style={{ color: appTheme.colors.foreground }}>{formatTime12h(box.startTime)}</Text>
              <Text numberOfLines={1} className="text-[10px]" style={{ color: appTheme.colors.muted }}>{formatTime12h(box.endTime)}</Text>
            </View>
            <View className="relative w-3 items-center">
              <View className="mt-3 h-3 w-3 rounded-full" style={{ backgroundColor: box.color ?? getTimeBoxColor(box.id), opacity: box.completed ? 0.48 : 1 }} />
              {index < boxes.length - 1 ? (
                <View className="absolute" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.15), bottom: -22, left: 5, top: 20, width: 1 }} />
              ) : null}
            </View>
            <View className="mb-2 min-w-0 flex-1 flex-row items-center gap-3 rounded-2xl px-3 py-3" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.045) }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: box.completed }}
                onPress={() => onSetCompleted(box.id, !box.completed)}
                className="h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: box.completed ? appTheme.colors.positive : alpha(appTheme.colors.primary, 0.12), borderColor: box.completed ? appTheme.colors.positive : appTheme.colors.primary, borderWidth: 1 }}
              >
                {box.completed ? <AppSymbol name="checkmark" size={14} tintColor={appTheme.colors.inverseForeground} /> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("timeBoxing.editBlockNamed", { title: box.title })}
                onPress={() => router.push(`/forms/schedule-block?boxId=${box.id}&date=${box.date}`)}
                className="min-w-0 flex-1"
              >
                <Text numberOfLines={2} className="font-semibold" style={{ color: box.completed ? appTheme.colors.muted : appTheme.colors.foreground, textDecorationLine: box.completed ? "line-through" : "none" }}>{box.title}</Text>
                <Text className="mt-0.5 text-xs" style={{ color: appTheme.colors.muted }}>
                  {focusMinutes % 60 === 0
                    ? t("timeBoxing.focusDurationHours", { hours: Math.floor(focusMinutes / 60) })
                    : t("timeBoxing.focusDuration", { hours: Math.floor(focusMinutes / 60), minutes: focusMinutes % 60 })}
                  {box.habitId ? ` · ${t("timeBoxing.habit")}` : ""}
                  {breakMinutes > 0
                    ? ` · ${breakMinutes % 60 === 0
                      ? t("timeBoxing.breakDurationHours", { hours: Math.floor(breakMinutes / 60) })
                      : t("timeBoxing.breakDuration", { hours: Math.floor(breakMinutes / 60), minutes: breakMinutes % 60 })}`
                    : ""}
                </Text>
              </Pressable>
              <Pressable accessibilityLabel={t("common.delete")} className="h-8 w-8 items-center justify-center" onPress={() => onDelete(box.id)}>
                <AppSymbol name="trash.fill" size={14} tintColor={appTheme.colors.muted} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
