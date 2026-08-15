import { Alert, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { HabitHeatmap } from "@/components/lifeflow/HabitHeatmap";
import { useAppTheme } from "@/components/provider/AppTheme";
import type {
  Item,
  ItemOccurrence,
  UnifiedHabitLog,
} from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { formatTimeRange12h } from "@/lib/date";

export function HabitProgressSummary({ habits }: { habits: ItemOccurrence[] }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const done = habits.filter((item) => item.completed).length;
  return (
    <View className="gap-3">
      <View className="flex-row justify-between">
        <Text
          className="text-xs font-bold uppercase"
          style={{ color: theme.colors.muted }}
        >
          {t("atomicHabits.dailyProgress")}
        </Text>
        <Text style={{ color: theme.colors.primary }}>
          {done}/{habits.length}
        </Text>
      </View>
      <Text
        className="text-4xl font-black"
        style={{ color: theme.colors.foreground }}
      >
        {habits.length ? Math.round((done / habits.length) * 100) : 0}%
      </Text>
    </View>
  );
}

export function HabitList({
  items,
  occurrences,
  logs,
  date,
  onDelete,
  onComplete,
}: {
  items: Item[];
  occurrences: ItemOccurrence[];
  logs: UnifiedHabitLog[];
  date: string;
  onDelete: (id: string) => Promise<void>;
  onComplete: (id: string, completed: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  if (items.length === 0)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/forms/habit-add")}
        className="items-center gap-2 py-10"
      >
        <AppSymbol name="checklist" size={30} tintColor={theme.colors.muted} />
        <Text style={{ color: theme.colors.muted }}>
          {t("atomicHabits.empty")}
        </Text>
      </Pressable>
    );
  return (
    <View className="gap-2">
      {occurrences.map((occurrence) => {
        const item = items.find((value) => value.id === occurrence.itemId)!;
        const journal = item.systemType === "journal";
        const checkIn = item.systemType === "app_check_in";
        return (
          <View
            key={occurrence.id}
            className="gap-3 rounded-2xl p-3"
            style={{ backgroundColor: alpha(theme.colors.foreground, 0.045) }}
          >
            <Pressable
              accessibilityRole={journal ? "button" : checkIn ? "text" : "checkbox"}
              accessibilityState={
                journal || checkIn ? undefined : { checked: occurrence.completed }
              }
              accessibilityLabel={occurrence.name}
              onPress={() => {
                if (checkIn) return;
                if (journal) {
                  router.push("/journal");
                  return;
                }

                void Haptics.selectionAsync().catch(() => {});
                void onComplete(item.id, !occurrence.completed).catch((error) => {
                  console.warn("Failed to update habit completion", error);
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                  Alert.alert(t("common.error"));
                });
              }}
              onLongPress={
                item.systemType
                  ? undefined
                  : () =>
                      Alert.alert(item.name, t("atomicHabits.manageHabit"), [
                        { text: t("common.cancel"), style: "cancel" },
                        {
                          text: t("common.edit"),
                          onPress: () =>
                            router.push(`/forms/habit-add?itemId=${item.id}`),
                        },
                        {
                          text: t("common.delete"),
                          style: "destructive",
                          onPress: () => void onDelete(item.id),
                        },
                      ])
              }
              className="flex-row items-center gap-3"
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: occurrence.completed
                    ? item.color
                    : alpha(item.color, 0.14),
                }}
              >
                {occurrence.completed ? (
                  <AppSymbol name="checkmark" size={18} tintColor="#fff" />
                ) : null}
              </View>
              <View className="flex-1">
                <Text
                  className="font-bold"
                  style={{ color: theme.colors.foreground }}
                >
                  {item.name}
                </Text>
                <Text className="text-xs" style={{ color: theme.colors.muted }}>
                  {journal
                    ? t("atomicHabits.journalToComplete")
                    : checkIn
                      ? t("lifeFlowHome.habitForToday")
                      : item.startTime
                        ? formatTimeRange12h(item.startTime, item.endTime!)
                        : t("atomicHabits.tapToComplete")}
                </Text>
              </View>
              {journal ? (
                <AppSymbol
                  name="chevron.right"
                  size={15}
                  tintColor={theme.colors.muted}
                />
              ) : null}
            </Pressable>
            <HabitHeatmap habit={item} logs={logs} selectedDate={date} />
          </View>
        );
      })}
    </View>
  );
}
