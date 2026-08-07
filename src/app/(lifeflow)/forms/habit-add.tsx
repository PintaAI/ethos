import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { AppTextInput } from "@/components/AppTextInput";
import { useAppTheme } from "@/components/provider/AppTheme";
import { TIME_BOX_COLORS } from "@/components/lifeflow/TimeMapDial";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { alpha } from "@/lib/color";
import { ALL_HABIT_WEEKDAYS } from "@/lib/habit";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export default function HabitAddForm() {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { habits, createHabit, updateHabit } = useLifeFlow();
  const editingHabit = habitId ? habits.find((habit) => habit.id === habitId) : undefined;
  const editingSystemHabit = editingHabit?.isAppCheckIn || editingHabit?.isJournalHabit;
  const [name, setName] = useState(editingHabit?.name ?? "");
  const [nameBlurred, setNameBlurred] = useState(false);
  const [color, setColor] = useState(editingHabit?.color ?? TIME_BOX_COLORS[0]);
  const [weekdays, setWeekdays] = useState(editingHabit?.weekdays ?? ALL_HABIT_WEEKDAYS);
  const [saving, setSaving] = useState(false);
  const canSave = !editingSystemHabit && name.trim().length > 0 && weekdays.length > 0 && !saving;

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => current.includes(weekday)
      ? current.filter((value) => value !== weekday)
      : [...current, weekday].sort());
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = { name, color, weekdays };
      if (editingHabit) {
        await updateHabit(editingHabit.id, input);
      } else {
        await createHabit(input);
      }
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t(editingHabit ? "atomicHabits.editHabit" : "atomicHabits.addHabit") }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={toolbarIcons.close} accessibilityLabel={t("common.close")} onPress={() => router.back()} />
      </Stack.Toolbar>
      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentContainerClassName="gap-6 px-5 pb-14 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
            {t("atomicHabits.habitName")}
          </Text>
          <AppTextInput
            autoFocus
            editable={!editingSystemHabit}
            value={name}
            onChangeText={setName}
            onBlur={() => setNameBlurred(true)}
            onSubmitEditing={() => void handleSave()}
            placeholder={t("atomicHabits.namePlaceholder")}
            returnKeyType="done"
          />
          {nameBlurred && name.trim().length === 0 ? (
            <Text className="text-xs leading-4" style={{ color: appTheme.colors.negative }}>
              {t("atomicHabits.nameRequired")}
            </Text>
          ) : null}
        </View>

        {!editingSystemHabit ? (
          <View className="gap-3">
            <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: appTheme.colors.muted }}>
              {t("atomicHabits.color")}
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {TIME_BOX_COLORS.map((option) => {
                const selected = option === color;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={t("atomicHabits.changeColor")}
                    onPress={() => setColor(option)}
                    className="h-11 w-11 items-center justify-center rounded-full"
                    style={{ backgroundColor: option, borderColor: selected ? appTheme.colors.foreground : "transparent", borderWidth: selected ? 3 : 0 }}
                  >
                    {selected ? <AppSymbol name="checkmark" size={14} tintColor="#FFFFFF" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <View>
            <Text className="font-bold" style={{ color: appTheme.colors.foreground }}>{t("atomicHabits.repeatOn")}</Text>
            <Text className="mt-0.5 text-xs" style={{ color: appTheme.colors.muted }}>{t("atomicHabits.repeatDescription")}</Text>
          </View>
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
          <Text className="text-xs leading-4" style={{ color: weekdays.length === 0 ? appTheme.colors.negative : appTheme.colors.muted }}>
            {weekdays.length === 0
              ? t("atomicHabits.selectAtLeastOneDay")
              : weekdays.length === ALL_HABIT_WEEKDAYS.length
                ? t("atomicHabits.repeatsDaily")
                : t("atomicHabits.repeatsSelectedDays")}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={() => void handleSave()}
          className="flex-row items-center justify-center gap-2 rounded-xl py-3"
          style={{ backgroundColor: appTheme.colors.primary, opacity: canSave ? 1 : 0.45 }}
        >
          <AppSymbol name={editingHabit ? "checkmark" : "plus"} size={16} tintColor={appTheme.colors.inverseForeground} />
          <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>
            {t(editingHabit ? "common.save" : "atomicHabits.addHabit")}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
