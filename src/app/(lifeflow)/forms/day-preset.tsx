import { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { getTimeBoxColor } from "@/components/lifeflow/TimeMapDial";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import type { DayPreset, UpdateDayPresetInput } from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { addDaysToDateKey, formatTimeRange12h, parseDateKey, toDateKey } from "@/lib/date";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export default function DayPresetFormSheet() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { date: paramDate } = useLocalSearchParams<{ date?: string }>();
  const sourceDate = paramDate ?? toDateKey(new Date());
  const {
    getTimeBoxesForDate,
    dayPresets,
    createDayPreset,
    updateDayPreset,
    applyDayPreset,
    deleteDayPreset,
    stopDayPresetRecurrence,
  } = useLifeFlow();
  const sourceBlocks = getTimeBoxesForDate(sourceDate);
  const today = toDateKey(new Date());
  const defaultStartDate = addDaysToDateKey(sourceDate > today ? sourceDate : today, 1);
  const [name, setName] = useState("");
  const [nameBlurred, setNameBlurred] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([parseDateKey(sourceDate).getDay()]);
  const [selectedBlockIds, setSelectedBlockIds] = useState(() => sourceBlocks.map((box) => box.id));
  const [saving, setSaving] = useState(false);
  const [editingPreset, setEditingPreset] = useState<DayPreset | null>(null);
  const selectedBlocks = sourceBlocks.filter((box) => selectedBlockIds.includes(box.id));
  const canSave = selectedBlocks.length > 0
    && name.trim().length > 0
    && (!repeatEnabled || weekdays.length > 0)
    && !saving;

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => current.includes(weekday)
      ? current.filter((value) => value !== weekday)
      : [...current, weekday].sort());
  };

  const toggleBlock = (blockId: string) => {
    setSelectedBlockIds((current) => current.includes(blockId)
      ? current.filter((id) => id !== blockId)
      : [...current, blockId]);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const input: UpdateDayPresetInput = {
        name,
        startDate: repeatEnabled ? editingPreset?.schedule?.startDate ?? defaultStartDate : undefined,
        frequency: repeatEnabled
          ? weekdays.length === WEEKDAYS.length ? "daily" : "weekly"
          : undefined,
        weekdays: repeatEnabled ? weekdays : [],
        blocks: selectedBlocks.map((box) => ({
          title: box.title,
          startTime: box.startTime,
          endTime: box.endTime,
          breakDurations: box.breakDurations,
          color: box.color ?? getTimeBoxColor(box.id),
        })),
      };
      if (editingPreset) await updateDayPreset(editingPreset.id, input);
      else await createDayPreset(input);
      router.back();
    } catch (error) {
      Alert.alert(
        t("timeBoxing.dayPresetSaveFailed"),
        error instanceof Error ? error.message : t("timeBoxing.dayPresetTryAgain"),
      );
    } finally {
      setSaving(false);
    }
  };

  const editPreset = (preset: DayPreset) => {
    setEditingPreset(preset);
    setName(preset.name);
    setRepeatEnabled(preset.schedule !== null);
    setWeekdays(preset.schedule?.frequency === "daily"
      ? [0, 1, 2, 3, 4, 5, 6]
      : preset.schedule?.weekdays ?? [parseDateKey(sourceDate).getDay()]);
  };

  const applyPreset = async (preset: DayPreset) => {
    const result = await applyDayPreset(preset.id, sourceDate);
    if (result === "applied") {
      router.back();
      return;
    }
    Alert.alert(
      t("timeBoxing.applyDayPresetFailed"),
      t("timeBoxing.applyDayPresetConflict"),
    );
  };

  const removePreset = (preset: DayPreset) => {
    Alert.alert(
      t("timeBoxing.deleteDayPresetTitle"),
      t("timeBoxing.deleteDayPresetMessage", { name: preset.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void deleteDayPreset(preset.id),
        },
      ],
    );
  };

  const stopRepeating = (preset: DayPreset) => {
    Alert.alert(
      t("timeBoxing.stopRepeatingTitle"),
      t("timeBoxing.stopRepeatingMessage", { name: preset.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("timeBoxing.stopRepeating"),
          style: "destructive",
          onPress: () => void stopDayPresetRecurrence(preset.id),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t("timeBoxing.dayPreset") }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.close} accessibilityLabel={t("common.close")} onPress={() => router.back()} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={toolbarIcons.check} hidden={sourceBlocks.length === 0} disabled={!canSave} onPress={() => void save()} variant="done" />
      </Stack.Toolbar>

      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-5 px-5 pb-12 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {sourceBlocks.length > 0 ? (
          <>
            <View className="gap-3">
              <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
                {t("timeBoxing.saveSelectedBlocks", { selected: selectedBlocks.length, count: sourceBlocks.length })}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                onBlur={() => setNameBlurred(true)}
                placeholder={t("timeBoxing.dayPresetNamePlaceholder")}
                placeholderTextColor={appTheme.colors.muted}
                className="rounded-2xl px-4 py-3 text-base"
                style={{ color: appTheme.colors.foreground, backgroundColor: alpha(appTheme.colors.foreground, 0.05) }}
              />
              {nameBlurred && name.trim().length === 0 ? (
                <Text className="text-xs leading-4" style={{ color: appTheme.colors.negative }}>
                  {t("timeBoxing.dayPresetNameRequired")}
                </Text>
              ) : null}
              <View
                className="overflow-hidden rounded-3xl px-3"
                style={{ backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.07 : 0.035) }}
              >
                {sourceBlocks.map((box, index) => {
                  const color = box.color ?? getTimeBoxColor(box.id);
                  const isLast = index === sourceBlocks.length - 1;
                  const selected = selectedBlockIds.includes(box.id);
                  return (
                    <Pressable
                      key={box.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={t("timeBoxing.selectBlockNamed", { title: box.title })}
                      className="min-h-16 flex-row"
                      onPress={() => toggleBlock(box.id)}
                      style={{ opacity: selected ? 1 : 0.5 }}
                    >
                      <View className="w-12 items-center pt-3">
                        <View
                          className="h-9 w-9 items-center justify-center rounded-xl"
                          style={{ backgroundColor: alpha(color, appTheme.isDark ? 0.24 : 0.14) }}
                        >
                          <Text className="text-xs font-black" style={{ color }}>
                            {String(index + 1).padStart(2, "0")}
                          </Text>
                        </View>
                        {!isLast ? (
                          <View className="w-px flex-1" style={{ backgroundColor: alpha(color, 0.3) }} />
                        ) : null}
                      </View>
                      <View
                        className="min-w-0 flex-1 flex-row items-center py-3 pl-2 pr-1"
                        style={!isLast ? { borderBottomColor: alpha(appTheme.colors.foreground, 0.08), borderBottomWidth: 1 } : undefined}
                      >
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-base font-bold" style={{ color: appTheme.colors.foreground }}>
                            {box.title}
                          </Text>
                          <View className="mt-1 flex-row items-center gap-2">
                            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                            <Text className="text-xs font-semibold" style={{ color: appTheme.colors.muted }}>
                              {formatTimeRange12h(box.startTime, box.endTime)}
                            </Text>
                          </View>
                        </View>
                        <View
                          className="h-6 w-6 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: selected ? appTheme.colors.primary : "transparent",
                            borderColor: selected ? appTheme.colors.primary : appTheme.colors.muted,
                            borderWidth: 1.5,
                          }}
                        >
                          {selected ? <AppSymbol name="checkmark" size={11} tintColor={appTheme.colors.inverseForeground} /> : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {selectedBlocks.length === 0 ? (
                <Text className="text-xs" style={{ color: appTheme.colors.negative }}>{t("timeBoxing.selectAtLeastOneBlock")}</Text>
              ) : null}
            </View>

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <View className="min-w-0 flex-1 pr-4">
                  <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{t("timeBoxing.repeatPreset")}</Text>
                  <Text className="mt-0.5 text-xs" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.repeatPresetOptional")}</Text>
                </View>
                <Switch
                  value={repeatEnabled}
                  onValueChange={setRepeatEnabled}
                  trackColor={{ true: appTheme.colors.primary }}
                />
              </View>
              {repeatEnabled ? (
                <>
                  <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
                    {t("timeBoxing.repeatOn")}
                  </Text>
                  <View className="flex-row justify-between gap-1">
                    {WEEKDAYS.map((weekday, index) => {
                      const selected = weekdays.includes(index);
                      return (
                        <Pressable
                          key={weekday}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() => toggleWeekday(index)}
                          className="h-10 flex-1 items-center justify-center rounded-xl"
                          style={{ backgroundColor: selected ? appTheme.colors.primary : alpha(appTheme.colors.foreground, 0.05) }}
                        >
                          <Text className="text-xs font-bold" style={{ color: selected ? appTheme.colors.inverseForeground : appTheme.colors.muted }}>
                            {t(`timeBoxing.weekdays.${weekday}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="text-xs leading-4" style={{ color: appTheme.colors.muted }}>
                    {weekdays.length === WEEKDAYS.length
                      ? t("timeBoxing.repeatsEveryDay")
                      : t("timeBoxing.repeatsSelectedDays")}
                  </Text>
                </>
              ) : null}
            </View>
          </>
        ) : (
          <View className="gap-2">
            <Text className="text-lg font-bold" style={{ color: appTheme.colors.foreground }}>{t("timeBoxing.applyPresetToDay")}</Text>
            <Text className="text-sm" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.applyPresetToDayDescription")}</Text>
          </View>
        )}

        {dayPresets.length > 0 ? (
          <View className="gap-3">
            <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
              {t("timeBoxing.savedDayPresets")}
            </Text>
            {dayPresets.map((preset) => (
              <View
                key={preset.id}
                className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
                style={{ backgroundColor: alpha(appTheme.colors.foreground, 0.045) }}
              >
                <View className="min-w-0 flex-1">
                  <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{preset.name}</Text>
                  <Text className="mt-0.5 text-xs" style={{ color: appTheme.colors.muted }}>
                    {formatPreset(preset, t)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void applyPreset(preset)}
                  className="rounded-xl px-3 py-2"
                  style={{ backgroundColor: appTheme.colors.primary }}
                >
                  <Text className="text-xs font-bold" style={{ color: appTheme.colors.inverseForeground }}>{t("timeBoxing.applyPreset")}</Text>
                </Pressable>
                {sourceBlocks.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("common.edit")} ${preset.name}`}
                    onPress={() => editPreset(preset)}
                    className="h-9 w-9 items-center justify-center"
                    style={{ backgroundColor: editingPreset?.id === preset.id ? alpha(appTheme.colors.primary, 0.14) : "transparent" }}
                  >
                    <AppSymbol name="pencil.circle.fill" size={17} tintColor={appTheme.colors.primary} />
                  </Pressable>
                ) : null}
                {preset.schedule ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("timeBoxing.stopRepeatingNamed", { name: preset.name })}
                    onPress={() => stopRepeating(preset)}
                    className="rounded-xl px-3 py-2"
                    style={{ backgroundColor: alpha(appTheme.colors.negative, 0.1) }}
                  >
                    <Text className="text-xs font-bold" style={{ color: appTheme.colors.negative }}>{t("timeBoxing.stopRepeating")}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel={t("common.delete")}
                  onPress={() => removePreset(preset)}
                  className="h-9 w-9 items-center justify-center"
                >
                  <AppSymbol name="trash.fill" size={15} tintColor={appTheme.colors.negative} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : sourceBlocks.length === 0 ? (
          <Text className="text-sm" style={{ color: appTheme.colors.muted }}>{t("timeBoxing.noSavedDayPresets")}</Text>
        ) : null}
      </ScrollView>

    </>
  );
}

function formatPreset(preset: DayPreset, t: ReturnType<typeof useTranslation>["t"]) {
  if (!preset.schedule) {
    return `${t("timeBoxing.noRepeat")} · ${preset.blocks.length} ${t("timeBoxing.blocks")}`;
  }
  if (preset.schedule.frequency !== "weekly") {
    return `${t(`timeBoxing.frequency.${preset.schedule.frequency}`)} · ${preset.blocks.length} ${t("timeBoxing.blocks")}`;
  }
  const days = preset.schedule.weekdays
    .map((weekday) => t(`timeBoxing.weekdays.${WEEKDAYS[weekday]}`))
    .join(", ");
  return `${days} · ${preset.blocks.length} ${t("timeBoxing.blocks")}`;
}
