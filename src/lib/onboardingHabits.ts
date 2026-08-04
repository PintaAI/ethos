import type { Habit } from "@/data/lifeflow/types";

export type OnboardingHabitDraft = { name: string; weekdays: number[]; color: string; preferredDuration: number };

export const HABIT_RECURRENCES = {
  daily: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
} as const;

export function normalizeHabitName(name: string) {
  return name.trim().toLocaleLowerCase();
}

export function findMatchingCustomHabit(habits: Habit[], name: string) {
  const normalized = normalizeHabitName(name);
  return habits.find((habit) => !habit.isAppCheckIn && !habit.isJournalHabit && normalizeHabitName(habit.name) === normalized);
}

export function collectOnboardingHabitDrafts(
  drafts: OnboardingHabitDraft[],
  activeDraft: OnboardingHabitDraft | null,
  editing: number | null,
) {
  if (!activeDraft) return drafts;
  if (editing === null) return [...drafts, activeDraft];
  return drafts.map((draft, index) => index === editing ? activeDraft : draft);
}
