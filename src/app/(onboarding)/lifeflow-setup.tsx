import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassBox } from "@/components/GlassBox";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { TIME_BOX_COLORS } from "@/components/lifeflow/TimeMapDial";
import { alpha } from "@/lib/color";
import { setPreference } from "@/lib/preferences";
import { collectOnboardingHabitDrafts, findMatchingCustomHabit, HABIT_RECURRENCES, normalizeHabitName, type OnboardingHabitDraft } from "@/lib/onboardingHabits";
import { useSyncStatus } from "@/components/provider/SyncProvider";

type Mode = "cloud" | "offline";
type Recurrence = keyof typeof HABIT_RECURRENCES | "custom";
type Draft = OnboardingHabitDraft;

const habitDurations = [1, 5, 15, 30, 60] as const;

export default function LifeFlowSetup() {
  const { mode } = useLocalSearchParams<{ mode?: Mode }>();
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const growth = useLifeFlow();
  const sync = useSyncStatus();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [preferredDuration, setPreferredDuration] = useState<number>(5);
  const [recurrence, setRecurrence] = useState<Recurrence>("daily");
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [color, setColor] = useState(TIME_BOX_COLORS[0]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [savingAction, setSavingAction] = useState<"finish" | "skip" | null>(null);
  const saving = savingAction !== null;
  const weekdays = recurrence === "custom" ? customDays : [...HABIT_RECURRENCES[recurrence]];
  const valid = !!name.trim() && weekdays.length > 0;
  const existingMatch = findMatchingCustomHabit(growth.habits, name);
  const existingHabits = growth.habits.filter((habit) => !habit.isAppCheckIn && !habit.isJournalHabit);
  const borderColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.09 : 0.07);
  const surface = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.035 : 0.025);
  const canFinish = valid || drafts.length > 0;

  function resetDraft() {
    setName(""); setPreferredDuration(5); setRecurrence("daily"); setCustomDays([]); setColor(TIME_BOX_COLORS[0]); setEditing(null);
  }

  function addDraft() {
    if (!valid) return;
    const draft = { name: name.trim(), weekdays, color, preferredDuration };
    setDrafts((current) => editing === null ? [...current, draft] : current.map((item, index) => index === editing ? draft : item));
    resetDraft();
  }

  function editDraft(index: number) {
    const draft = drafts[index];
    setEditing(index); setName(draft.name); setColor(draft.color); setPreferredDuration(draft.preferredDuration);
    setRecurrence("custom"); setCustomDays(draft.weekdays);
  }

  async function finish(skip = false) {
    if (saving || growth.loading || (mode !== "cloud" && mode !== "offline")) return;
    const activeDraft = valid ? { name: name.trim(), weekdays, color, preferredDuration } : null;
    const allDrafts = skip ? [] : collectOnboardingHabitDrafts(drafts, activeDraft, editing);
    if (!skip && allDrafts.length === 0) return;
    setSavingAction(skip ? "skip" : "finish");
    try {
      const unique = [...new Map(allDrafts.map((draft) => [normalizeHabitName(draft.name), draft])).values()];
      for (const draft of unique) {
        const match = findMatchingCustomHabit(growth.habits, draft.name);
        if (match) await growth.updateHabit(match.id, draft);
        else await growth.createHabit(draft);
      }
      await sync.setCloudSyncEnabled(mode === "cloud");
      await setPreference("hasSkippedOnboarding", true);
      router.replace("/home");
    } catch (error) {
      Alert.alert(t("lifeFlowSetup.saveErrorTitle"), error instanceof Error ? error.message : t("lifeFlowSetup.saveError"));
    } finally { setSavingAction(null); }
  }

  return (
    <>
      <Stack.Screen options={{ title: "" }}>
        <Stack.Screen.BackButton displayMode="minimal" />
      </Stack.Screen>
      <ScrollView
        className="flex-1 bg-[--app-color-background]"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-5 px-4 pb-8 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3 px-2 pb-2">
          <Text className="text-xs font-bold uppercase tracking-[2px]" style={{ color: appTheme.colors.primary }}>
            {t("lifeFlowSetup.title")}
          </Text>
          <Text className="max-w-md text-4xl font-black leading-tight tracking-tight" style={{ color: appTheme.colors.foreground }}>
            {t("lifeFlowSetup.heading")}
          </Text>
          <Text className="max-w-md text-base leading-6" style={{ color: appTheme.colors.muted }}>
            {t("lifeFlowSetup.description")}
          </Text>
        </View>

        <View className="gap-6 rounded-[32px] border p-4" style={{ backgroundColor: surface, borderColor }}>
          {growth.loading ? <ActivityIndicator color={appTheme.colors.primary} /> : null}

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-[2px]" style={{ color: appTheme.colors.primary }}>
              {t("lifeFlowSetup.habitName")}
            </Text>
            {Platform.OS === "ios" ? (
              <GlassBox
                isInteractive
                tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.35 : 0.18)}
                glassEffectStyle="clear"
                style={{ borderRadius: 16, height: 48, width: "100%" }}
              >
                {name.length === 0 ? (
                  <View pointerEvents="none" className="absolute inset-0 justify-center px-4">
                    <Text className="text-base" style={{ color: appTheme.colors.muted }}>
                      {t("lifeFlowSetup.habitPlaceholder")}
                    </Text>
                  </View>
                ) : null}
                <TextInput
                  value={name}
                  onChangeText={setName}
                  accessibilityLabel={t("lifeFlowSetup.habitName")}
                  selectionColor={appTheme.colors.primary}
                  autoCapitalize="sentences"
                  autoCorrect
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  style={{
                    color: appTheme.colors.foreground,
                    fontSize: 16,
                    height: 48,
                    includeFontPadding: false,
                    paddingHorizontal: 16,
                    paddingVertical: 0,
                    textAlignVertical: "center",
                  }}
                />
              </GlassBox>
            ) : (
              <TextInput
                value={name}
                onChangeText={setName}
                accessibilityLabel={t("lifeFlowSetup.habitName")}
                placeholder={t("lifeFlowSetup.habitPlaceholder")}
                placeholderTextColor={appTheme.colors.muted}
                selectionColor={appTheme.colors.primary}
                autoCapitalize="sentences"
                autoCorrect
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                underlineColorAndroid="transparent"
                className="h-12 rounded-2xl border px-4"
                style={{
                  backgroundColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.14 : 0.07),
                  borderColor: alpha(appTheme.colors.muted, 0.2),
                  color: appTheme.colors.foreground,
                  fontSize: 16,
                  includeFontPadding: false,
                  paddingVertical: 0,
                  textAlignVertical: "center",
                }}
              />
            )}
            {existingMatch ? (
              <Text className="text-sm font-semibold" style={{ color: appTheme.colors.primary }}>
                {t("lifeFlowSetup.existingMatch")}
              </Text>
            ) : null}
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
              {t("lifeFlowSetup.tinyHabit")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {habitDurations.map((minutes) => {
                const selected = preferredDuration === minutes;
                const label = minutes === 1
                  ? t("lifeFlowSetup.durationMinute")
                  : minutes === 60
                    ? t("lifeFlowSetup.durationHour")
                    : t("lifeFlowSetup.durationMinutes", { minutes });
                return (
                  <GlassBox
                    key={minutes}
                    isInteractive
                    tintColor={selected ? appTheme.colors.primary : alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.1)}
                    glassEffectStyle="clear"
                    style={{ borderRadius: 9999 }}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: growth.loading }}
                      disabled={growth.loading}
                      onPress={() => setPreferredDuration(minutes)}
                      className="rounded-full px-4 py-3"
                    >
                      <Text className="font-semibold" style={{ color: selected ? appTheme.colors.inverseForeground : appTheme.colors.primary }}>
                        {label}
                      </Text>
                    </Pressable>
                  </GlassBox>
                );
              })}
            </View>
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
              {t("lifeFlowSetup.rhythm")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(["daily", "weekdays", "weekends", "custom"] as Recurrence[]).map((item) => {
                const selected = recurrence === item;
                return (
                  <GlassBox
                    key={item}
                    isInteractive
                    tintColor={selected ? appTheme.colors.primary : alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.1)}
                    glassEffectStyle="clear"
                    style={{ borderRadius: 9999 }}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: growth.loading }}
                      disabled={growth.loading}
                      onPress={() => setRecurrence(item)}
                      className="rounded-full px-4 py-3"
                    >
                      <Text className="font-semibold" style={{ color: selected ? appTheme.colors.inverseForeground : appTheme.colors.primary }}>
                        {t(`lifeFlowSetup.recurrence.${item}`)}
                      </Text>
                    </Pressable>
                  </GlassBox>
                );
              })}
            </View>
            {recurrence === "custom" ? (
              <View className="flex-row justify-between pt-1">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                  const selected = customDays.includes(day);
                  return (
                    <GlassBox
                      key={day}
                      isInteractive
                      tintColor={selected ? appTheme.colors.primary : alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.1)}
                      glassEffectStyle="clear"
                      style={{ borderRadius: 9999, height: 40, width: 40 }}
                    >
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected, disabled: growth.loading }}
                        disabled={growth.loading}
                        onPress={() => setCustomDays((days) => selected ? days.filter((value) => value !== day) : [...days, day].sort())}
                        className="h-10 w-10 items-center justify-center rounded-full"
                      >
                        <Text className="font-semibold" style={{ color: selected ? appTheme.colors.inverseForeground : appTheme.colors.primary }}>
                          {t(`lifeFlowSetup.days.${day}`)}
                        </Text>
                      </Pressable>
                    </GlassBox>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
              {t("lifeFlowSetup.color")}
            </Text>
            <View className="flex-row items-center gap-3">
              {TIME_BOX_COLORS.map((item) => {
                const selected = color === item;
                return (
                  <GlassBox
                    key={item}
                    isInteractive
                    tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.2 : 0.1)}
                    glassEffectStyle="clear"
                    style={{ alignItems: "center", borderRadius: 9999, height: 44, justifyContent: "center", width: 44 }}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityLabel={t("lifeFlowSetup.chooseColor", { color: item })}
                      accessibilityState={{ selected, disabled: growth.loading }}
                      disabled={growth.loading}
                      onPress={() => setColor(item)}
                      className="h-9 w-9 rounded-full border-2"
                      style={{ backgroundColor: item, borderColor: selected ? appTheme.colors.foreground : "transparent", transform: [{ scale: selected ? 1.08 : 1 }] }}
                    />
                  </GlassBox>
                );
              })}
            </View>
          </View>

          {valid ? (
            <View className="flex-row items-center gap-3 rounded-3xl p-4" style={{ backgroundColor: alpha(color, 0.15) }}>
              <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
              <Text className="min-w-0 flex-1 font-bold leading-5" style={{ color: appTheme.colors.foreground }}>
                {t("lifeFlowSetup.commitment", {
                  rhythm: t(`lifeFlowSetup.recurrence.${recurrence}`),
                  habit: name.trim(),
                  duration: preferredDuration === 1
                    ? t("lifeFlowSetup.durationMinute")
                    : preferredDuration === 60
                      ? t("lifeFlowSetup.durationHour")
                      : t("lifeFlowSetup.durationMinutes", { minutes: preferredDuration }),
                })}
              </Text>
            </View>
          ) : null}

          <GlassBox
            isInteractive
            tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.22 : 0.14)}
            glassEffectStyle="clear"
            style={{ borderRadius: 9999, opacity: valid && !growth.loading ? 1 : 0.45 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || growth.loading }}
              disabled={!valid || growth.loading}
              onPress={addDraft}
              className="items-center rounded-full px-6 py-4"
            >
              <Text className="font-bold" style={{ color: appTheme.colors.primary }}>
                {editing === null ? t("lifeFlowSetup.addAnother") : t("common.save")}
              </Text>
            </Pressable>
          </GlassBox>
        </View>

        {drafts.length > 0 ? (
          <View className="gap-3 px-1">
            {drafts.map((draft, index) => (
              <GlassBox
                key={`${normalizeHabitName(draft.name)}-${index}`}
                isInteractive
                tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.16 : 0.07)}
                glassEffectStyle="clear"
                style={{ borderRadius: 16 }}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => editDraft(index)}
                  className="flex-row items-center gap-3 rounded-2xl p-4"
                >
                  <View className="h-4 w-4 rounded-full" style={{ backgroundColor: draft.color }} />
                  <Text className="min-w-0 flex-1 font-semibold" style={{ color: appTheme.colors.foreground }}>{draft.name}</Text>
                  <Text className="font-semibold" style={{ color: appTheme.colors.primary }}>{t("common.edit")}</Text>
                </Pressable>
              </GlassBox>
            ))}
          </View>
        ) : null}

        {existingHabits.length > 0 ? (
          <View className="gap-2 px-2">
            <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: appTheme.colors.muted }}>
              {t("lifeFlowSetup.existingHabits")}
            </Text>
            <Text className="text-sm leading-6" style={{ color: appTheme.colors.muted }}>
              {existingHabits.map((habit) => habit.name).join(" · ")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        className="flex-row items-center gap-2 border-t px-4 pt-3"
        style={{ backgroundColor: appTheme.colors.background, borderColor, paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <GlassBox
          isInteractive
          tintColor={alpha(appTheme.colors.primary, appTheme.isDark ? 0.16 : 0.07)}
          glassEffectStyle="clear"
          style={{ borderRadius: 9999, opacity: saving || growth.loading ? 0.45 : 1 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || growth.loading }}
            disabled={saving || growth.loading}
            onPress={() => finish(true)}
            className="items-center rounded-full px-5 py-4"
          >
            {savingAction === "skip" ? (
              <ActivityIndicator color={appTheme.colors.muted} />
            ) : (
              <Text className="font-bold" style={{ color: appTheme.colors.muted }}>{t("lifeFlowSetup.skip")}</Text>
            )}
          </Pressable>
        </GlassBox>
        <GlassBox
          isInteractive
          tintColor={appTheme.colors.primary}
          glassEffectStyle="clear"
          style={{ borderRadius: 9999, flex: 1, opacity: saving || growth.loading || !canFinish ? 0.45 : 1 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || growth.loading || !canFinish }}
            disabled={saving || growth.loading || !canFinish}
            onPress={() => finish(false)}
            className="items-center rounded-full px-6 py-4"
          >
            {savingAction === "finish" ? (
              <ActivityIndicator color={appTheme.colors.inverseForeground} />
            ) : (
              <Text className="font-bold" style={{ color: appTheme.colors.inverseForeground }}>{t("lifeFlowSetup.finish")}</Text>
            )}
          </Pressable>
        </GlassBox>
      </View>
    </>
  );
}
