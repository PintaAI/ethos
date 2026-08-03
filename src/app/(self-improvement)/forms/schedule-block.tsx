import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { NativeTimeWheel, TimeInput } from "@/components/selfImprovement/TimeInput";
import { getTimeBoxColor, TIME_BOX_COLORS } from "@/components/selfImprovement/TimeMapDial";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useSelfImprovement } from "@/data/selfImprovement/SelfImprovementProvider";
import { alpha } from "@/lib/color";
import { toDateKey, formatTimeRange12h } from "@/lib/date";
import { getPreference, removePreference, setPreference, type TimeBoxCustomPreset, type TimeBoxPresetRange } from "@/lib/preferences";
import { getTimeBoxBreakRanges, minutesToTime, timeBoxBreaksFit, timeBoxesOverlap, timeToMinutes } from "@/lib/timeBox";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SLEEP_COLOR = TIME_BOX_COLORS[0];
const WORK_COLOR = TIME_BOX_COLORS[2];
const CUSTOM_COLOR = TIME_BOX_COLORS[4];
const DEFAULT_PRESETS = {
  sleep: { startTime: "22:00", endTime: "06:00" },
  work: { startTime: "09:00", endTime: "17:00" },
} satisfies Record<"sleep" | "work", TimeBoxPresetRange>;

export default function ScheduleBlockForm() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const sleepAccent = appTheme.isDark ? "#7EA4FF" : "#2563EB";
  const workAccent = appTheme.isDark ? "#4ADEA8" : "#13795B";
  const customAccent = appTheme.isDark ? "#FCD34D" : "#B45309";
  const { date: paramDate, boxId, habitId: paramHabitId, startTime: paramStartTime, endTime: paramEndTime } = useLocalSearchParams<{
    date?: string;
    boxId?: string;
    habitId?: string;
    startTime?: string;
    endTime?: string;
  }>();
  const { habits, getTimeBoxesForDate, createTimeBox, updateTimeBox } = useSelfImprovement();
  const date = paramDate ?? toDateKey(new Date());
  const timeBoxes = getTimeBoxesForDate(date);
  const editingBox = boxId ? timeBoxes.find((box) => box.id === boxId) : undefined;
  const linkedHabitId = editingBox?.habitId ?? paramHabitId;
  const linkedHabit = linkedHabitId ? habits.find((habit) => habit.id === linkedHabitId) : undefined;
  const usedColors = new Set(
    timeBoxes
      .filter((box) => box.date === date && box.id !== editingBox?.id)
      .map((box) => (box.color ?? getTimeBoxColor(box.id)).toUpperCase()),
  );
  const firstAvailableColor = TIME_BOX_COLORS.find((color) => !usedColors.has(color.toUpperCase())) ?? null;
  const hasAvailableColor = linkedHabit !== undefined || editingBox !== undefined || firstAvailableColor !== null;
  const defaultStartTime = editingBox?.startTime ?? paramStartTime ?? "09:00";
  const defaultEndTime = editingBox?.endTime
    ?? paramEndTime
    ?? (linkedHabit ? minutesToTime(timeToMinutes(defaultStartTime) + linkedHabit.preferredDuration) : "10:00");
  const [title, setTitle] = useState(editingBox?.title ?? linkedHabit?.name ?? "");
  const [titleBlurred, setTitleBlurred] = useState(false);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [breakDurations, setBreakDurations] = useState(editingBox?.breakDurations ?? []);
  const [activeTimeInput, setActiveTimeInput] = useState<"start" | "end" | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<"sleep" | "work" | null>(null);
  const [selectedColor, setSelectedColor] = useState(
    editingBox?.color ?? linkedHabit?.color ?? (editingBox ? getTimeBoxColor(editingBox.id) : firstAvailableColor ?? TIME_BOX_COLORS[0]),
  );
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [customPreset, setCustomPreset] = useState<TimeBoxCustomPreset | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPreference("timeBoxSleepRange"), getPreference("timeBoxWorkRange"), getPreference("timeBoxCustomRange")]).then(([sleep, work, custom]) => {
      if (!cancelled) setPresets({ sleep, work });
      if (!cancelled && custom) setCustomPreset(custom);
    }).catch((error) => console.warn("Failed to load time-box presets", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const applyPreset = (preset: "sleep" | "work") => {
    const range = presets[preset];
    const presetColor = preset === "sleep" ? SLEEP_COLOR : WORK_COLOR;
    if (usedColors.has(presetColor.toUpperCase())) {
      Alert.alert(t("timeBoxing.colorUnavailableTitle"), t("timeBoxing.colorUnavailableMessage"));
      return;
    }
    setTitle(t(`timeBoxing.${preset}`));
    setStartTime(range.startTime);
    setEndTime(range.endTime);
    setSelectedColor(presetColor);
    setSelectedPreset(preset);
    setActiveTimeInput(null);
  };

  const handleSavePreset = async () => {
    if (!title.trim()) return;
    const preset = { title: title.trim(), color: selectedColor, startTime, endTime };
    await setPreference("timeBoxCustomRange", preset);
    setCustomPreset(preset);
  };

  const applyCustomPreset = () => {
    if (!customPreset) return;
    setTitle(customPreset.title);
    setSelectedColor(customPreset.color);
    setStartTime(customPreset.startTime);
    setEndTime(customPreset.endTime);
    setSelectedPreset(null);
    setActiveTimeInput(null);
  };

  const handleResetPreset = (preset: "sleep" | "work") => {
    Alert.alert(
      t("timeBoxing.resetPresetTitle"),
      t("timeBoxing.resetPresetMessage", { preset: t(`timeBoxing.${preset}`) }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.clear"),
          style: "destructive",
          onPress: async () => {
            await removePreference(preset === "sleep" ? "timeBoxSleepRange" : "timeBoxWorkRange");
            setPresets((current) => ({ ...current, [preset]: DEFAULT_PRESETS[preset] }));
          },
        },
      ],
    );
  };

  const handleDeleteCustomPreset = () => {
    if (!customPreset) return;
    Alert.alert(
      t("timeBoxing.deleteCustomPresetTitle"),
      t("timeBoxing.deleteCustomPresetMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await removePreference("timeBoxCustomRange");
            setCustomPreset(null);
          },
        },
      ],
    );
  };

  const breakRanges = getTimeBoxBreakRanges(startTime, endTime, breakDurations);

  const addBreak = (duration: number) => {
    const next = [...breakDurations, duration];
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || !timeBoxBreaksFit(startTime, endTime, next)) {
      Alert.alert(t("timeBoxing.breaksDoNotFitTitle"), t("timeBoxing.breaksDoNotFitMessage"));
      return;
    }
    setBreakDurations(next);
  };

  const updateBreakDuration = (index: number, duration: number) => {
    if (duration <= 0) {
      setBreakDurations((current) => current.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    const next = breakDurations.map((current, itemIndex) => itemIndex === index ? duration : current);
    if (!timeBoxBreaksFit(startTime, endTime, next)) {
      Alert.alert(t("timeBoxing.breaksDoNotFitTitle"), t("timeBoxing.breaksDoNotFitMessage"));
      return;
    }
    setBreakDurations(next);
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || startTime === endTime) {
      Alert.alert(t("timeBoxing.invalidTimeTitle"), t("timeBoxing.invalidTimeMessage"));
      return;
    }
    if (!timeBoxBreaksFit(startTime, endTime, breakDurations)) {
      Alert.alert(t("timeBoxing.breaksDoNotFitTitle"), t("timeBoxing.breaksDoNotFitMessage"));
      return;
    }
    const candidate = { date, startTime, endTime };
    const overlaps = timeBoxes.some((box) => box.id !== editingBox?.id && timeBoxesOverlap(candidate, box));
    if (overlaps) {
      Alert.alert(t("timeBoxing.overlapTitle"), t("timeBoxing.overlapMessage"));
      return;
    }
    if (!linkedHabit && usedColors.has(selectedColor.toUpperCase())) {
      Alert.alert(t("timeBoxing.colorUnavailableTitle"), t("timeBoxing.colorUnavailableMessage"));
      return;
    }
    setSaving(true);
    try {
      if (editingBox) {
        await updateTimeBox(editingBox, { title, startTime, endTime, breakDurations, color: selectedColor });
      } else {
        await createTimeBox({ date, title, startTime, endTime, breakDurations, color: selectedColor, habitId: linkedHabit?.id });
      }
      if (selectedPreset) {
        const preferenceKey = selectedPreset === "sleep" ? "timeBoxSleepRange" : "timeBoxWorkRange";
        await setPreference(preferenceKey, { startTime, endTime }).catch(() => {});
      }
      router.back();
    } catch (error) {
      Alert.alert(
        t("timeBoxing.overlapTitle"),
        error instanceof Error ? error.message : t("timeBoxing.overlapMessage"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t(editingBox ? "timeBoxing.editBlock" : linkedHabit ? "timeBoxing.planHabit" : "timeBoxing.addBlock") }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={toolbarIcons.close} accessibilityLabel={t("common.close")} onPress={() => router.back()} />
      </Stack.Toolbar>
      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-6 px-5 pb-14 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {linkedHabit ? (
          <View className="flex-row items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: alpha(linkedHabit.color, appTheme.isDark ? 0.2 : 0.1) }}>
            <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: linkedHabit.color }}>
              <AppSymbol name="checklist" size={18} tintColor="#FFFFFF" />
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-bold" style={{ color: appTheme.colors.foreground }}>{linkedHabit.name}</Text>
              <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.linkedHabitDescription")}</Text>
            </View>
          </View>
        ) : null}
        {!linkedHabit ? <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
            {t("timeBoxing.presets")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            <Pressable
              accessibilityRole="button"
              disabled={usedColors.has(SLEEP_COLOR.toUpperCase())}
              className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
              onPress={() => applyPreset("sleep")}
              onLongPress={() => handleResetPreset("sleep")}
              style={{
                width: 160,
                backgroundColor: alpha(SLEEP_COLOR, appTheme.isDark ? 0.2 : 0.12),
                opacity: usedColors.has(SLEEP_COLOR.toUpperCase()) ? 0.4 : 1,
                borderWidth: selectedPreset === "sleep" ? 2 : 0,
                borderColor: selectedPreset === "sleep" ? sleepAccent : "transparent",
              }}
            >
              <AppSymbol name="moon" size={18} tintColor={sleepAccent} />
              <View>
                <Text className="font-semibold" style={{ color: sleepAccent }}>{t("timeBoxing.sleep")}</Text>
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{formatTimeRange12h(presets.sleep.startTime, presets.sleep.endTime)}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={usedColors.has(WORK_COLOR.toUpperCase())}
              className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
              onPress={() => applyPreset("work")}
              onLongPress={() => handleResetPreset("work")}
              style={{
                width: 160,
                backgroundColor: alpha(WORK_COLOR, appTheme.isDark ? 0.2 : 0.12),
                opacity: usedColors.has(WORK_COLOR.toUpperCase()) ? 0.4 : 1,
                borderWidth: selectedPreset === "work" ? 2 : 0,
                borderColor: selectedPreset === "work" ? workAccent : "transparent",
              }}
            >
              <AppSymbol name="briefcase.fill" size={18} tintColor={workAccent} />
              <View>
                <Text className="font-semibold" style={{ color: workAccent }}>{t("timeBoxing.work")}</Text>
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{formatTimeRange12h(presets.work.startTime, presets.work.endTime)}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!customPreset}
              className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
              onPress={applyCustomPreset}
              onLongPress={handleDeleteCustomPreset}
              style={{
                width: 160,
                backgroundColor: alpha(customPreset?.color ?? CUSTOM_COLOR, appTheme.isDark ? 0.2 : 0.12),
                opacity: !customPreset ? 0.4 : 1,
              }}
            >
              <AppSymbol name="bookmark.fill" size={18} tintColor={customPreset?.color ?? customAccent} />
              <View>
                <Text className="font-semibold" style={{ color: customPreset?.color ?? customAccent }}>
                  {customPreset?.title ?? t("timeBoxing.custom")}
                </Text>
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                  {customPreset ? formatTimeRange12h(customPreset.startTime, customPreset.endTime) : "--"}
                </Text>
              </View>
            </Pressable>
          </ScrollView>
        </View> : null}
        <View className="gap-3 rounded-3xl p-4" style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.06 : 0.035) }}>
          {!linkedHabit ? <View className="flex-row items-center gap-3">
            <TextInput
              value={title}
              onChangeText={setTitle}
              onBlur={() => setTitleBlurred(true)}
              placeholder={t("timeBoxing.titlePlaceholder")}
              placeholderTextColor={appTheme.colors.muted}
              className="flex-1 rounded-xl px-3 py-3 text-base"
              style={{ color: appTheme.colors.foreground, backgroundColor: alpha(appTheme.colors.foreground, 0.05) }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("timeBoxing.savePreset")}
              disabled={!title.trim()}
              onPress={handleSavePreset}
              className="h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: alpha(selectedColor, appTheme.isDark ? 0.2 : 0.12), opacity: !title.trim() ? 0.4 : 1 }}
            >
              <AppSymbol name="bookmark.fill" size={15} tintColor={selectedColor} />
            </Pressable>
            {titleBlurred && title.trim().length === 0 ? (
              <Text className="text-xs leading-4" style={{ color: appTheme.colors.negative }}>
                {t("timeBoxing.titleRequired")}
              </Text>
            ) : null}
          </View> : null}
          {!linkedHabit ? <View className="gap-2">
            <Text className="text-xs font-semibold" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.color")}</Text>
            <View className="flex-row items-center justify-between">
              {TIME_BOX_COLORS.map((color) => {
                const unavailable = usedColors.has(color.toUpperCase());
                const selected = selectedColor === color;
                return (
                  <Pressable
                    key={color}
                    accessibilityRole="radio"
                    accessibilityLabel={color}
                    accessibilityState={{ checked: selected, disabled: unavailable }}
                    disabled={unavailable}
                    onPress={() => setSelectedColor(color)}
                    className="h-10 w-10 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: color,
                      borderColor: selected ? appTheme.colors.foreground : "transparent",
                      borderWidth: selected ? 3 : 0,
                      opacity: unavailable ? 0.2 : 1,
                    }}
                  >
                    {selected && !unavailable ? <AppSymbol name="checkmark" size={13} tintColor="#FFFFFF" /> : null}
                  </Pressable>
                );
              })}
            </View>
            {!hasAvailableColor ? (
              <Text className="text-xs" style={{ color: appTheme.colors.negative }}>{t("timeBoxing.noColorsAvailable")}</Text>
            ) : null}
          </View> : null}
          <View className="flex-row items-center gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-xs font-semibold" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.start")}</Text>
              <TimeInput
                value={startTime}
                onChange={setStartTime}
                active={activeTimeInput === "start"}
                onPress={() => setActiveTimeInput((current) => current === "start" ? null : "start")}
                accessibilityLabel={t("timeBoxing.start")}
              />
            </View>
            <Text className="pt-5" style={{ color: appTheme.colors.muted }}>-</Text>
            <View className="flex-1 gap-1">
              <Text className="text-xs font-semibold" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.end")}</Text>
              <TimeInput
                value={endTime}
                onChange={setEndTime}
                active={activeTimeInput === "end"}
                onPress={() => setActiveTimeInput((current) => current === "end" ? null : "end")}
                accessibilityLabel={t("timeBoxing.end")}
              />
            </View>
          </View>
          {activeTimeInput ? (
            <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.035) }}>
              <View className="flex-row items-center justify-between px-3 pt-3">
                <Text className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>
                  {activeTimeInput === "start" ? t("timeBoxing.start") : t("timeBoxing.end")}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setActiveTimeInput(null)} className="rounded-full px-3 py-1.5" style={{ backgroundColor: alpha(appTheme.colors.primary, 0.12) }}>
                  <Text className="text-xs font-bold" style={{ color: appTheme.colors.primary }}>{t("common.close")}</Text>
                </Pressable>
              </View>
              <NativeTimeWheel
                value={activeTimeInput === "start" ? startTime : endTime}
                onChange={activeTimeInput === "start" ? setStartTime : setEndTime}
              />
            </View>
          ) : null}
          <View className="gap-3 rounded-2xl p-3" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.035) }}>
            <View className="gap-2">
              <View>
                <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{t("timeBoxing.breaks")}</Text>
                <Text className="text-xs" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.breaksDescription")}</Text>
              </View>
              <View className="flex-row gap-1.5">
                {[5, 15, 30].map((duration) => (
                  <Pressable
                    key={duration}
                    accessibilityRole="button"
                    accessibilityLabel={t("timeBoxing.addBreakMinutes", { minutes: duration })}
                    onPress={() => addBreak(duration)}
                    className="rounded-lg px-2.5 py-2"
                    style={{ backgroundColor: alpha(appTheme.colors.primary, 0.12) }}
                  >
                    <Text className="text-xs font-bold" style={{ color: appTheme.colors.primary }}>+{duration}m</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {breakDurations.map((duration, index) => {
              const range = breakRanges[index];
              return (
                <View key={index} className="flex-row items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.045) }}>
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-semibold" style={{ color: appTheme.colors.foreground }}>
                      {t("timeBoxing.breakNumber", { number: index + 1 })}
                    </Text>
                    <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
                      {range ? formatTimeRange12h(range.startTime, range.endTime) : t("timeBoxing.breakNeedsMoreTime")}
                    </Text>
                  </View>
                  <Pressable accessibilityLabel={t("timeBoxing.decreaseBreak")} onPress={() => updateBreakDuration(index, duration - 5)} className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.07) }}>
                    <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>-</Text>
                  </Pressable>
                  <Text className="w-10 text-center text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{duration}m</Text>
                  <Pressable accessibilityLabel={t("timeBoxing.increaseBreak")} onPress={() => updateBreakDuration(index, duration + 5)} className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.07) }}>
                    <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>+</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={t("timeBoxing.removeBreak")} onPress={() => setBreakDurations((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="h-8 w-8 items-center justify-center">
                    <AppSymbol name="trash.fill" size={13} tintColor={appTheme.colors.muted} />
                  </Pressable>
                </View>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!title.trim() || saving || !hasAvailableColor}
            onPress={() => void handleSave()}
            className="flex-row items-center justify-center gap-2 rounded-xl py-3"
            style={{ backgroundColor: appTheme.colors.primary, opacity: !title.trim() || saving || !hasAvailableColor ? 0.45 : 1 }}
          >
            <AppSymbol name={editingBox ? "checkmark" : "plus"} size={16} tintColor={appTheme.colors.inverseForeground} />
            <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
              {t(editingBox ? "common.save" : linkedHabit ? "timeBoxing.addToSchedule" : "timeBoxing.addBlock")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}
