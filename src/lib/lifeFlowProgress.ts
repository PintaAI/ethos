import type { Habit, HabitLog, TimeBox } from "@/data/lifeflow/types";
import { isHabitScheduledOnDate } from "@/lib/habit";

export function getLifeFlowDailyProgress(
  habits: Habit[],
  habitLogs: HabitLog[],
  timeBoxes: TimeBox[],
  date: string,
) {
  const completedByDate = new Map<string, Set<string>>();

  for (const log of habitLogs) {
    const completed = completedByDate.get(log.date) ?? new Set<string>();
    completed.add(log.habitId);
    completedByDate.set(log.date, completed);
  }

  const journalHabit = habits.find((habit) => habit.isJournalHabit);
  const todayCompletedIds = completedByDate.get(date) ?? new Set<string>();
  const journalDone = Boolean(journalHabit && todayCompletedIds.has(journalHabit.id));
  const todayHabits = habits.filter((habit) => isHabitScheduledOnDate(habit, date));
  const todayNonJournalHabits = todayHabits.filter((habit) => !habit.isJournalHabit);
  const completedHabits = todayHabits.filter((habit) => todayCompletedIds.has(habit.id)).length;
  const completedNonJournalHabits = todayNonJournalHabits.filter((habit) => todayCompletedIds.has(habit.id)).length;
  const todayBoxes = timeBoxes.filter((box) => box.date === date);
  const completedBoxes = todayBoxes.filter((box) => box.completed).length;
  const totalToday = todayNonJournalHabits.length + todayBoxes.length + 1;
  const completedToday = completedNonJournalHabits + completedBoxes + Number(journalDone);

  return {
    completedByDate,
    journalHabit,
    journalDone,
    todayHabits,
    todayNonJournalHabits,
    todayCompletedIds,
    completedHabits,
    todayBoxes,
    completedBoxes,
    totalToday,
    completedToday,
    percentage: totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100),
  };
}

export type LifeFlowDailyProgress = ReturnType<typeof getLifeFlowDailyProgress>;
