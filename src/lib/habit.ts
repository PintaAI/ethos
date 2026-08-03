import type { Habit } from "@/data/selfImprovement/types";

export const ALL_HABIT_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function getHabitCreationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function isHabitScheduledOnDate(habit: Pick<Habit, "createdAt" | "weekdays">, dateKey: string) {
  const creationDate = getHabitCreationDate(habit.createdAt);
  return (!creationDate || dateKey >= creationDate) && habit.weekdays.includes(weekdayForDateKey(dateKey));
}
