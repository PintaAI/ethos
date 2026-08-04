import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import type { PlanHabitResult } from "@/data/lifeflow/types";

type PlanHabit = (habitId: string, date: string) => Promise<PlanHabitResult>;

export function useHabitPlanning(date: string, planHabit: PlanHabit) {
  const { t } = useTranslation();
  const [planningHabitId, setPlanningHabitId] = useState<string | null>(null);

  const plan = async (habitId: string) => {
    setPlanningHabitId(habitId);
    try {
      const result = await planHabit(habitId, date);
      if (result === "no-space") {
        Alert.alert(t("timeBoxing.noSuggestedTimeTitle"), t("timeBoxing.noSuggestedTimeMessage"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("timeBoxing.chooseTime"), onPress: () => router.push(`/forms/schedule-block?date=${date}&habitId=${habitId}`) },
        ]);
      }
    } catch {
      Alert.alert(t("timeBoxing.planFailedTitle"), t("timeBoxing.planFailedMessage"));
    } finally {
      setPlanningHabitId(null);
    }
  };

  return { planHabit: plan, planningHabitId };
}
