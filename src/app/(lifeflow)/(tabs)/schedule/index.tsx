import { useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View, type AlertButton } from "react-native";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { TimeMapDial } from "@/components/lifeflow/TimeMapDial";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useDrawer } from "@/components/provider/DrawerContext";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import type { ItemOccurrence } from "@/data/lifeflow/types";
import { ScheduleTimeline } from "@/features/lifeflow/ScheduleTimeline";
import { alpha } from "@/lib/color";
import { addDaysToDateKey, formatDateKey } from "@/lib/date";
import { getTimeBoxFocusDuration, timeBoxBreaksFit } from "@/lib/timeBox";
import { useLifeFlowRefresh } from "@/lib/sync/useLifeFlowRefresh";

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const { open } = useDrawer();
  const theme = useAppTheme();
  const flow = useLifeFlow();
  const { refreshing, onRefresh } = useLifeFlowRefresh();
  const [date, setDate] = useState(flow.today);
  const [dialInteracting, setDialInteracting] = useState(false);
  // Preserve a manually selected date; only screens still showing today follow midnight changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDate(flow.today), [flow.today]);
  const occurrences = flow
    .getOccurrencesForDate(date)
    .filter((item) => item.kind === "event" || item.startTime !== null);
  const timed = occurrences.filter(
    (item): item is ItemOccurrence & { startTime: string; endTime: string } =>
      item.startTime !== null && item.endTime !== null,
  );
  const cancelled = flow.exceptions.filter(
    (exception) => exception.cancelled && exception.originalDate === date,
  );
  const minutes = timed.reduce(
    (sum, item) =>
      sum +
      getTimeBoxFocusDuration(
        item.startTime,
        item.endTime,
        item.breakDurations,
      ),
    0,
  );
  const updateRange = async (
    item: ItemOccurrence & { startTime: string; endTime: string },
    startTime: string,
    endTime: string,
  ) => {
    if (!timeBoxBreaksFit(startTime, endTime, item.breakDurations)) {
      Alert.alert(
        t("timeBoxing.breaksDoNotFitTitle"),
        t("timeBoxing.breaksDoNotFitMessage"),
      );
      return false;
    }
    try {
      await flow.updateItem(item.itemId, { startTime, endTime });
      return true;
    } catch (error) {
      Alert.alert(
        t("common.error"),
        error instanceof Error ? error.message : t("notes.tryAgain"),
      );
      return false;
    }
  };
  const edit = (item: ItemOccurrence) => {
    const parent = flow.items.find((value) => value.id === item.itemId);
    if (item.kind === "habit") {
      router.push(`/forms/habit-add?itemId=${item.itemId}`);
      return;
    }
    if (!parent?.recurrence) {
      router.push(
        `/forms/schedule-block?itemId=${item.itemId}&date=${item.date}`,
      );
      return;
    }
    const exception = flow.exceptions.find(
      (value) =>
        value.itemId === item.itemId &&
        value.originalDate === item.originalDate,
    );
    const buttons: AlertButton[] = [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("timeBoxing.thisOccurrence"),
        onPress: () =>
          router.push(
            `/forms/schedule-block?itemId=${item.itemId}&originalDate=${item.originalDate}&scope=occurrence`,
          ),
      },
      {
        text: t("timeBoxing.entireSeries"),
        onPress: () =>
          router.push(
            `/forms/schedule-block?itemId=${item.itemId}&scope=series`,
          ),
      },
    ];
    if (exception) {
      buttons.push({
        text: t("lifeFlowItems.restoreOccurrence"),
        onPress: () =>
          void flow.restoreEventOccurrence(item.itemId, item.originalDate),
      });
    }
    Alert.alert(
      t("lifeFlowItems.editRecurringTitle"),
      t("lifeFlowItems.editRecurringMessage"),
      buttons,
    );
  };
  const remove = (item: ItemOccurrence) => {
    const parent = flow.items.find((value) => value.id === item.itemId);
    if (!parent?.recurrence) {
      Alert.alert(t("common.delete"), item.name, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void flow.deleteItem(item.itemId),
        },
      ]);
      return;
    }
    Alert.alert(
      t("timeBoxing.deleteRecurringTitle"),
      t("timeBoxing.deleteRecurringMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("timeBoxing.thisOccurrence"),
          onPress: () =>
            void flow.cancelEventOccurrence(item.itemId, item.originalDate),
        },
        {
          text: t("timeBoxing.entireSeries"),
          style: "destructive",
          onPress: () => void flow.deleteItem(item.itemId),
        },
      ],
    );
  };
  return (
    <>
      <Stack.Screen options={{ title: t("timeBoxing.title") }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={toolbarIcons.menu}
          accessibilityLabel={t("sidebar.menu")}
          onPress={open}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={toolbarIcons.add}
          accessibilityLabel={t("timeBoxing.addBlock")}
          onPress={() => router.push(`/forms/schedule-block?date=${date}`)}
        />
      </Stack.Toolbar>
      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-6 px-5 pb-14 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={!dialInteracting}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.primary} />}
      >
        <View
          className="flex-row items-center justify-between rounded-2xl p-2"
          style={{ backgroundColor: alpha(theme.colors.foreground, 0.045) }}
        >
          <Pressable
            accessibilityLabel={t("timeBoxing.previousDay")}
            onPress={() => setDate(addDaysToDateKey(date, -1))}
          >
            <AppSymbol
              name="chevron.left"
              size={18}
              tintColor={theme.colors.foreground}
            />
          </Pressable>
          <Pressable onPress={() => setDate(flow.today)}>
            <Text
              className="font-bold"
              style={{ color: theme.colors.foreground }}
            >
              {date === flow.today
                ? t("timeBoxing.today")
                : formatDateKey(
                    date,
                    { weekday: "long", day: "numeric", month: "short" },
                    i18n.language,
                  )}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t("timeBoxing.nextDay")}
            onPress={() => setDate(addDaysToDateKey(date, 1))}
          >
            <AppSymbol
              name="chevron.right"
              size={18}
              tintColor={theme.colors.foreground}
            />
          </Pressable>
        </View>
        <TimeMapDial
          key={date}
          boxes={timed}
          date={date}
          durationLabel={`${Math.floor(minutes / 60)}h ${minutes % 60}m`}
          mapLabel={t("timeBoxing.planned")}
          onUpdateBox={updateRange}
          onEditBox={edit}
          onAddBox={(startTime, endTime) =>
            router.push(
              `/forms/schedule-block?date=${date}&startTime=${startTime}&endTime=${endTime}`,
            )
          }
          onInteractionChange={setDialInteracting}
        />
        <ScheduleTimeline
          occurrences={occurrences}
          onEdit={edit}
          onDelete={remove}
        />
        {cancelled.length > 0 ? (
          <View className="gap-2">
            <Text
              className="text-sm font-bold uppercase"
              style={{ color: theme.colors.muted }}
            >
              {t("lifeFlowItems.cancelledOccurrences")}
            </Text>
            {cancelled.map((exception) => {
              const item = flow.items.find(
                (value) => value.id === exception.itemId,
              );
              if (!item) return null;
              return (
                <View
                  key={`${exception.itemId}|${exception.originalDate}`}
                  className="flex-row items-center gap-3 rounded-2xl p-3"
                  style={{
                    backgroundColor: alpha(theme.colors.foreground, 0.045),
                  }}
                >
                  <View
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color, opacity: 0.45 }}
                  />
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={1}
                      className="font-semibold"
                      style={{ color: theme.colors.muted }}
                    >
                      {item.name}
                    </Text>
                    <Text className="text-xs" style={{ color: theme.colors.muted }}>
                      {t("lifeFlowItems.cancelledOccurrence")}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("lifeFlowItems.restoreOccurrence")}
                    onPress={() =>
                      void flow.restoreEventOccurrence(
                        exception.itemId,
                        exception.originalDate,
                      )
                    }
                    className="rounded-full px-3 py-2"
                    style={{ backgroundColor: alpha(theme.colors.primary, 0.12) }}
                  >
                    <Text className="text-xs font-bold" style={{ color: theme.colors.primary }}>
                      {t("lifeFlowItems.restore")}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
