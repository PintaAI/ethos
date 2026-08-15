import type { ItemOccurrence } from "@/data/lifeflow/types";

export function getLifeFlowDailyProgress(occurrences: ItemOccurrence[]) {
  const habits = occurrences.filter((item) => item.kind === "habit");
  const completed = habits.filter((item) => item.completed).length;
  return { habits, events: occurrences.filter((item) => item.kind === "event"), completedToday: completed, totalToday: habits.length, percentage: habits.length ? Math.round(completed / habits.length * 100) : 0 };
}
export type LifeFlowDailyProgress = ReturnType<typeof getLifeFlowDailyProgress>;
