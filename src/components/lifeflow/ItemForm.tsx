import { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import ExpoDateTimePicker from "@expo/ui/community/datetime-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { AppTextInput } from "@/components/AppTextInput";
import { NativeTimeWheel, TimeInput } from "@/components/lifeflow/TimeInput";
import { TIME_BOX_COLORS } from "@/components/lifeflow/TimeMapDial";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import type {
  ItemKind,
  Recurrence,
  RecurrenceFrequency,
  Weekday,
} from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { toolbarIcons } from "@/config/toolbarIcons";
import { toDateKey } from "@/lib/date";
import { timeBoxBreaksFit } from "@/lib/timeBox";

const WEEKDAYS: { code: Weekday; key: string }[] = [
  { code: "SU", key: "sunday" },
  { code: "MO", key: "monday" },
  { code: "TU", key: "tuesday" },
  { code: "WE", key: "wednesday" },
  { code: "TH", key: "thursday" },
  { code: "FR", key: "friday" },
  { code: "SA", key: "saturday" },
];

export function ItemForm({ kind }: { kind: ItemKind }) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const params = useLocalSearchParams<{
    itemId?: string;
    originalDate?: string;
    date?: string;
    scope?: string;
    startTime?: string;
    endTime?: string;
  }>();
  const flow = useLifeFlow();
  const item = params.itemId
    ? flow.items.find((candidate) => candidate.id === params.itemId)
    : undefined;
  const exception =
    params.originalDate && item
      ? flow.exceptions.find(
          (value) =>
            value.itemId === item.id &&
            value.originalDate === params.originalDate,
        )
      : undefined;
  const occurrence =
    params.originalDate && item
      ? flow
          .getOccurrencesForRange(params.date ?? params.originalDate, 1)
          .find(
            (value) =>
              value.itemId === item.id &&
              value.originalDate === params.originalDate,
          )
      : undefined;
  const editingOccurrence =
    kind === "event" &&
    Boolean(item?.recurrence && params.scope === "occurrence");
  const source = editingOccurrence
    ? (occurrence ?? exception?.replacement ?? item)
    : item;
  const initialRecurrence =
    item?.recurrence ??
    (kind === "habit"
      ? { frequency: "daily", interval: 1, weekdays: [], endsOn: null }
      : null);
  const [name, setName] = useState(source?.name ?? "");
  const [color, setColor] = useState(source?.color ?? TIME_BOX_COLORS[0]);
  const [startsOn, setStartsOn] = useState(
    editingOccurrence
      ? (occurrence?.date ?? exception?.replacementDate ?? params.originalDate!)
      : (item?.startsOn ?? params.date ?? toDateKey(new Date())),
  );
  const [timed, setTimed] = useState(
    (source?.startTime !== null && source?.startTime !== undefined) ||
      Boolean(params.startTime && params.endTime),
  );
  const [startTime, setStartTime] = useState(
    source?.startTime ?? params.startTime ?? "09:00",
  );
  const [endTime, setEndTime] = useState(
    source?.endTime ?? params.endTime ?? "10:00",
  );
  const [notifyStart, setNotifyStart] = useState(source?.notifyStart !== false);
  const [notifyEnd, setNotifyEnd] = useState(source?.notifyEnd !== false);
  const [breakDurations, setBreakDurations] = useState(
    source?.breakDurations ?? [],
  );
  const [repeating, setRepeating] = useState(
    kind === "habit" || initialRecurrence !== null,
  );
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    initialRecurrence?.frequency ?? "daily",
  );
  const [weekdays, setWeekdays] = useState<Weekday[]>(
    initialRecurrence?.frequency === "weekly"
      ? initialRecurrence.weekdays
      : [WEEKDAYS[new Date(`${startsOn}T00:00:00`).getDay()].code],
  );
  const [ends, setEnds] = useState(
    initialRecurrence?.endsOn !== null &&
      initialRecurrence?.endsOn !== undefined,
  );
  const [endsOn, setEndsOn] = useState(initialRecurrence?.endsOn ?? startsOn);
  const [activeDatePicker, setActiveDatePicker] = useState<
    "startsOn" | "endsOn" | null
  >(null);
  const [activeTime, setActiveTime] = useState<"start" | "end" | null>(null);
  const [saving, setSaving] = useState(false);

  const parsedStartsOn = new Date(`${startsOn}T12:00:00`);
  const recurrenceDate = Number.isNaN(parsedStartsOn.getTime())
    ? new Date()
    : parsedStartsOn;
  const recurrenceDateLabel =
    frequency === "monthly"
      ? t("lifeFlowItems.monthlyDate", { day: recurrenceDate.getDate() })
      : new Intl.DateTimeFormat(i18n.language === "id" ? "id-ID" : "en-US", {
          month: "long",
          day: "numeric",
        }).format(recurrenceDate);
  const parsedEndsOn = new Date(`${endsOn}T12:00:00`);
  const endDate = Number.isNaN(parsedEndsOn.getTime())
    ? recurrenceDate
    : parsedEndsOn;
  const formatFullDate = (date: Date) =>
    new Intl.DateTimeFormat(i18n.language === "id" ? "id-ID" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  const recurrenceInvalid =
    repeating && frequency === "weekly" && weekdays.length === 0;
  const iosNewItem = Platform.OS === "ios" && !item;
  const submitDisabled = !name.trim() || saving || recurrenceInvalid;

  const recurrence: Recurrence | null = repeating
    ? {
        frequency,
        interval: 1,
        weekdays: frequency === "weekly" ? weekdays : [],
        endsOn: kind === "habit" ? null : ends ? endsOn : null,
      }
    : null;
  const recurrenceChanged = Boolean(
    item &&
      JSON.stringify([item.startsOn, item.recurrence]) !==
        JSON.stringify([startsOn, recurrence]),
  );

  const save = async () => {
    if (
      !name.trim() ||
      saving ||
      recurrenceInvalid
    )
      return;
    const breaks = timed ? breakDurations : [];
    if (timed && !timeBoxBreaksFit(startTime, endTime, breaks)) {
      Alert.alert(
        t("timeBoxing.breaksDoNotFitTitle"),
        t("timeBoxing.breaksDoNotFitMessage"),
      );
      return;
    }
    const commit = async (resetHistory = false) => {
      setSaving(true);
      try {
        if (editingOccurrence && item && params.originalDate) {
          await flow.overrideEventOccurrence({
            itemId: item.id,
            originalDate: params.originalDate,
            replacementDate: startsOn,
            replacement: {
              kind: "event",
              name,
              color,
              startTime: timed ? startTime : null,
              endTime: timed ? endTime : null,
              notifyStart: timed ? notifyStart : true,
              notifyEnd: timed ? notifyEnd : true,
              breakDurations: breaks,
            },
          });
        } else if (item) {
          await flow.updateItem(
            item.id,
            {
              name,
              color,
              startsOn,
              startTime: timed ? startTime : null,
              endTime: timed ? endTime : null,
              notifyStart: timed ? notifyStart : true,
              notifyEnd: timed ? notifyEnd : true,
              breakDurations: breaks,
              recurrence,
            },
            resetHistory,
          );
        } else {
          await flow.createItem({
            kind,
            name,
            color,
            startsOn,
            startTime: timed ? startTime : null,
            endTime: timed ? endTime : null,
            breakDurations: breaks,
            recurrence,
          });
        }
        router.back();
      } catch (error) {
        Alert.alert(
          t("common.error"),
          error instanceof Error ? error.message : t("notes.tryAgain"),
        );
      } finally {
        setSaving(false);
      }
    };
    if (item && recurrenceChanged && !editingOccurrence) {
      Alert.alert(
        t("lifeFlowItems.resetHistoryTitle"),
        t("lifeFlowItems.resetHistoryMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("lifeFlowItems.resetAndSave"),
            style: "destructive",
            onPress: () => void commit(true),
          },
        ],
      );
    } else await commit();
  };

  const toggle = (value: Weekday) =>
    setWeekdays((current) =>
      current.includes(value)
        ? current.filter((day) => day !== value)
        : [...current, value],
    );
  return (
    <>
      {iosNewItem ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon={toolbarIcons.add}
            accessibilityLabel={t(
              kind === "habit"
                ? "atomicHabits.addHabit"
                : "timeBoxing.addBlock",
            )}
            disabled={submitDisabled}
            onPress={() => void save()}
          />
        </Stack.Toolbar>
      ) : null}
      <ScrollView
      className="flex-1 bg-[--app-color-background]"
      contentContainerClassName="gap-6 px-5 pb-20 pt-4"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2">
        <Text
          className="text-xs font-bold uppercase"
          style={{ color: theme.colors.muted }}
        >
          {t("lifeFlowItems.name")}
        </Text>
        <AppTextInput
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder={t(
            kind === "habit"
              ? "atomicHabits.namePlaceholder"
              : "timeBoxing.titlePlaceholder",
          )}
        />
      </View>
      <View className="gap-3">
        <Text
          className="text-xs font-bold uppercase"
          style={{ color: theme.colors.muted }}
        >
          {t("atomicHabits.color")}
        </Text>
        <View className="flex-row justify-between">
          {TIME_BOX_COLORS.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: color === value }}
              accessibilityLabel={t("lifeFlowItems.colorOption", {
                color: value,
              })}
              onPress={() => setColor(value)}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: value,
                borderColor:
                  color === value ? theme.colors.foreground : "transparent",
                borderWidth: 3,
              }}
            >
              {color === value ? (
                <AppSymbol name="checkmark" size={13} tintColor="#fff" />
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
      {((kind === "event" && !repeating) || editingOccurrence) ? (
        <View className="gap-2">
          <Text
            className="text-xs font-bold uppercase"
            style={{ color: theme.colors.muted }}
          >
            {t("lifeFlowItems.date")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("lifeFlowItems.date")}
            onPress={() => setActiveDatePicker("startsOn")}
            className="flex-row items-center justify-between rounded-xl px-3 py-3"
            style={{ backgroundColor: alpha(theme.colors.foreground, 0.05) }}
          >
            <Text
              className="text-base font-bold"
              style={{ color: theme.colors.foreground }}
            >
              {formatFullDate(recurrenceDate)}
            </Text>
            <AppSymbol
              name="calendar"
              size={17}
              tintColor={theme.colors.primary}
            />
          </Pressable>
        </View>
      ) : null}
      <View
        className="gap-3 rounded-3xl p-4"
        style={{ backgroundColor: alpha(theme.colors.foreground, 0.045) }}
      >
        <View className="flex-row items-center justify-between">
          <Text
            className="font-bold"
            style={{ color: theme.colors.foreground }}
          >
            {t("lifeFlowItems.addTime")}
          </Text>
          <Switch
            accessibilityLabel={t("lifeFlowItems.addTime")}
            value={timed}
            onValueChange={setTimed}
            trackColor={{ true: theme.colors.primary }}
          />
        </View>
        {timed ? (
          <>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text style={{ color: theme.colors.muted }}>
                  {t("timeBoxing.start")}
                </Text>
                <TimeInput
                  value={startTime}
                  onChange={setStartTime}
                  active={activeTime === "start"}
                  onPress={() =>
                    setActiveTime(activeTime === "start" ? null : "start")
                  }
                  accessibilityLabel={t("timeBoxing.start")}
                />
              </View>
              <View className="flex-1">
                <Text style={{ color: theme.colors.muted }}>
                  {t("timeBoxing.end")}
                </Text>
                <TimeInput
                  value={endTime}
                  onChange={setEndTime}
                  active={activeTime === "end"}
                  onPress={() =>
                    setActiveTime(activeTime === "end" ? null : "end")
                  }
                  accessibilityLabel={t("timeBoxing.end")}
                />
              </View>
            </View>
            <View className="gap-2">
              <Text className="font-bold" style={{ color: theme.colors.foreground }}>
                {t("timeBoxing.notifications")}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text style={{ color: theme.colors.muted }}>{t("timeBoxing.notifyStart")}</Text>
                <Switch
                  accessibilityLabel={t("timeBoxing.notifyStart")}
                  value={notifyStart}
                  onValueChange={setNotifyStart}
                  trackColor={{ true: theme.colors.primary }}
                />
              </View>
              <View className="flex-row items-center justify-between">
                <Text style={{ color: theme.colors.muted }}>{t("timeBoxing.notifyEnd")}</Text>
                <Switch
                  accessibilityLabel={t("timeBoxing.notifyEnd")}
                  value={notifyEnd}
                  onValueChange={setNotifyEnd}
                  trackColor={{ true: theme.colors.primary }}
                />
              </View>
            </View>
            {activeTime ? (
              <NativeTimeWheel
                value={activeTime === "start" ? startTime : endTime}
                onChange={activeTime === "start" ? setStartTime : setEndTime}
              />
            ) : null}
            <View className="gap-2">
              <Text
                className="font-bold"
                style={{ color: theme.colors.foreground }}
              >
                {t("timeBoxing.breaks")}
              </Text>
              <View className="flex-row gap-2">
                {[5, 15, 30, 60].map((minutes) => (
                  <Pressable
                    key={minutes}
                    accessibilityLabel={t("timeBoxing.addBreakMinutes", {
                      minutes,
                    })}
                    onPress={() =>
                      setBreakDurations([...breakDurations, minutes])
                    }
                    className="rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: alpha(theme.colors.primary, 0.12),
                    }}
                  >
                    <Text style={{ color: theme.colors.primary }}>
                      +{minutes}m
                    </Text>
                  </Pressable>
                ))}
              </View>
              {breakDurations.map((minutes, index) => (
                <Pressable
                  key={`${index}-${minutes}`}
                  accessibilityLabel={t("timeBoxing.removeBreak")}
                  onPress={() =>
                    setBreakDurations(
                      breakDurations.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Text style={{ color: theme.colors.muted }}>
                    {t("timeBoxing.breakNumber", { number: index + 1 })}:{" "}
                    {minutes}m
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
      {!editingOccurrence ? (
        <View
          className="gap-3 rounded-3xl p-4"
          style={{ backgroundColor: alpha(theme.colors.foreground, 0.045) }}
        >
          <View className="flex-row items-center justify-between">
            <Text
              className="font-bold"
              style={{ color: theme.colors.foreground }}
            >
              {t("lifeFlowItems.repeat")}
            </Text>
            {kind === "event" ? (
              <Switch
                accessibilityLabel={t("lifeFlowItems.repeat")}
                value={repeating}
                onValueChange={setRepeating}
                trackColor={{ true: theme.colors.primary }}
              />
            ) : null}
          </View>
          {repeating ? (
            <>
              <View className="flex-row flex-wrap justify-center gap-2">
                {(["daily", "weekly", "monthly", "yearly"] as const).map(
                  (value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: frequency === value }}
                      onPress={() => setFrequency(value)}
                      className="rounded-full px-3 py-2"
                      style={{
                        backgroundColor:
                          frequency === value
                            ? theme.colors.primary
                            : alpha(theme.colors.foreground, 0.08),
                        borderColor:
                          frequency === value
                            ? theme.colors.primary
                            : alpha(theme.colors.foreground, 0.12),
                        borderWidth: 1,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            frequency === value
                              ? theme.colors.inverseForeground
                              : theme.colors.foreground,
                          fontWeight: frequency === value ? "700" : "400",
                        }}
                      >
                        {t(`lifeFlowItems.frequency.${value}`)}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
              {frequency === "weekly" ? (
                <View className="gap-2">
                  <Text style={{ color: theme.colors.muted }}>
                    {t("lifeFlowItems.repeatOn")}
                  </Text>
                  <View className="flex-row justify-between">
                    {WEEKDAYS.map(({ code, key }) => (
                      <Pressable
                        key={code}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: weekdays.includes(code) }}
                        accessibilityLabel={t(`timeBoxing.weekdays.${key}`)}
                        onPress={() => toggle(code)}
                        className="h-10 w-10 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: weekdays.includes(code)
                            ? theme.colors.primary
                            : alpha(theme.colors.foreground, 0.08),
                          borderColor: weekdays.includes(code)
                            ? theme.colors.primary
                            : alpha(theme.colors.foreground, 0.12),
                          borderWidth: 1,
                        }}
                      >
                        <Text
                          style={{
                            color: weekdays.includes(code)
                              ? theme.colors.inverseForeground
                              : theme.colors.muted,
                            fontWeight: weekdays.includes(code) ? "700" : "400",
                          }}
                        >
                          {t(`timeBoxing.weekdays.${key}`)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {frequency === "monthly" || frequency === "yearly" ? (
                <View className="gap-2">
                  <Text style={{ color: theme.colors.muted }}>
                    {t(
                      frequency === "monthly"
                        ? "lifeFlowItems.dayOfMonth"
                        : "lifeFlowItems.monthAndDay",
                    )}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      frequency === "monthly"
                        ? "lifeFlowItems.dayOfMonth"
                        : "lifeFlowItems.monthAndDay",
                    )}
                    onPress={() => setActiveDatePicker("startsOn")}
                    className="flex-row items-center justify-between rounded-xl px-3 py-3"
                    style={{
                      backgroundColor: alpha(theme.colors.foreground, 0.05),
                    }}
                  >
                    <Text
                      className="text-base font-bold"
                      style={{ color: theme.colors.foreground }}
                    >
                      {recurrenceDateLabel}
                    </Text>
                    <AppSymbol
                      name="calendar"
                      size={17}
                      tintColor={theme.colors.primary}
                    />
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
      {!editingOccurrence && repeating && kind === "event" ? (
        <View
          className="gap-3 rounded-3xl p-4"
          style={{ backgroundColor: alpha(theme.colors.foreground, 0.045) }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="font-bold" style={{ color: theme.colors.foreground }}>
              {t("lifeFlowItems.ends")}
            </Text>
            <Switch
              accessibilityLabel={t("lifeFlowItems.ends")}
              value={ends}
              onValueChange={setEnds}
              trackColor={{ true: theme.colors.primary }}
            />
          </View>
          {ends ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("lifeFlowItems.endsOn")}
              onPress={() => setActiveDatePicker("endsOn")}
              className="flex-row items-center justify-between rounded-xl px-3 py-3"
              style={{
                backgroundColor: alpha(theme.colors.foreground, 0.05),
              }}
            >
              <Text
                className="text-base font-bold"
                style={{ color: theme.colors.foreground }}
              >
                {formatFullDate(endDate)}
              </Text>
              <AppSymbol
                name="calendar"
                size={17}
                tintColor={theme.colors.primary}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!iosNewItem ? (
        <Pressable
          accessibilityRole="button"
          disabled={submitDisabled}
          onPress={() => void save()}
          className="items-center rounded-xl py-3"
          style={{
            backgroundColor: theme.colors.primary,
            opacity: submitDisabled ? 0.45 : 1,
          }}
        >
          <Text
            className="font-bold"
            style={{ color: theme.colors.inverseForeground }}
          >
            {t(
              item
                ? "common.save"
                : kind === "habit"
                  ? "atomicHabits.addHabit"
                  : "timeBoxing.addBlock",
            )}
          </Text>
        </Pressable>
      ) : null}
      </ScrollView>
      {activeDatePicker ? (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setActiveDatePicker(null)}
        >
          <Pressable
            className="flex-1 justify-end px-4 pb-8"
            style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
            onPress={() => setActiveDatePicker(null)}
          >
            <Pressable
              className="rounded-3xl p-4"
              style={{ backgroundColor: theme.colors.background }}
            >
              <ExpoDateTimePicker
                value={activeDatePicker === "endsOn" ? endDate : recurrenceDate}
                mode="date"
                presentation="inline"
                display="inline"
                accentColor={theme.colors.primary}
                onValueChange={(_event, date) => {
                  if (date) {
                    if (activeDatePicker === "endsOn") setEndsOn(toDateKey(date));
                    else setStartsOn(toDateKey(date));
                  }
                  setActiveDatePicker(null);
                }}
                onDismiss={() => setActiveDatePicker(null)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
