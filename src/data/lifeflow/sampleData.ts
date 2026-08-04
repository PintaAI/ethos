import type { CachedNote } from "@/data/notes/types";
import type { Habit, HabitLog, TimeBox } from "@/data/lifeflow/types";
import { addDays, addDaysToDateKey, toDateKey } from "@/lib/date";
import { ALL_HABIT_WEEKDAYS } from "@/lib/habit";

export const sampleLifeFlowDate = new Date();
sampleLifeFlowDate.setHours(9, 0, 0, 0);

const today = toDateKey(sampleLifeFlowDate);
const monday = addDaysToDateKey(today, -((sampleLifeFlowDate.getDay() + 6) % 7));
const currentWeekdayIndex = (sampleLifeFlowDate.getDay() + 6) % 7;
const createdAt = addDays(sampleLifeFlowDate, -30).toISOString();

export const sampleLifeFlowHabits: Habit[] = [
  {
    id: "sample-journal",
    name: "Daily Journal",
    color: "#208AEF",
    weekdays: ALL_HABIT_WEEKDAYS,
    preferredDuration: 10,
    isAppCheckIn: false,
    isJournalHabit: true,
    createdAt,
  },
  {
    id: "sample-movement",
    name: "Morning movement",
    color: "#16A34A",
    weekdays: ALL_HABIT_WEEKDAYS,
    preferredDuration: 20,
    isAppCheckIn: false,
    isJournalHabit: false,
    createdAt,
  },
  {
    id: "sample-reading",
    name: "Read 20 pages",
    color: "#D97706",
    weekdays: ALL_HABIT_WEEKDAYS,
    preferredDuration: 30,
    isAppCheckIn: false,
    isJournalHabit: false,
    createdAt,
  },
  {
    id: "sample-sunset",
    name: "Digital sunset",
    color: "#7C3AED",
    weekdays: ALL_HABIT_WEEKDAYS,
    preferredDuration: 15,
    isAppCheckIn: false,
    isJournalHabit: false,
    createdAt,
  },
];

const completedHabitIds = sampleLifeFlowHabits.map((habit) => habit.id);

export const sampleLifeFlowHabitLogs: HabitLog[] = Array.from(
  { length: currentWeekdayIndex + 1 },
  (_, dayIndex) => {
    const date = addDaysToDateKey(monday, dayIndex);
    const completionCount = dayIndex === currentWeekdayIndex ? 3 : 2 + (dayIndex % 3);
    return completedHabitIds.slice(0, completionCount).map((habitId) => ({ habitId, date }));
  },
).flat();

const previousTimeBoxes: TimeBox[] = Array.from({ length: currentWeekdayIndex }, (_, dayIndex) => ({
  id: `sample-focus-${dayIndex}`,
  date: addDaysToDateKey(monday, dayIndex),
  title: "Focused work",
  startTime: "10:00",
  endTime: "11:30",
  breakDurations: [10],
  color: "#0F766E",
  completed: dayIndex % 3 !== 1,
  habitId: null,
  createdAt,
}));

export const sampleLifeFlowTimeBoxes: TimeBox[] = [
  ...previousTimeBoxes,
  {
    id: "sample-morning-plan",
    date: today,
    title: "Plan the day",
    startTime: "08:00",
    endTime: "08:30",
    breakDurations: [],
    color: "#2563EB",
    completed: true,
    habitId: null,
    createdAt,
  },
  {
    id: "sample-deep-work",
    date: today,
    title: "Focused work",
    startTime: "10:00",
    endTime: "11:30",
    breakDurations: [10],
    color: "#0F766E",
    completed: false,
    habitId: null,
    createdAt,
  },
];

export const sampleLifeFlowNotes: CachedNote[] = [
  {
    id: "sample-note",
    title: "A more intentional week",
    icon: "book.pages.fill",
    iconType: "hugeicon",
    iconColor: "#208AEF",
    contentJson: null,
    contentHtml: null,
    contentMarkdown: null,
    pinned: true,
    role: "owner",
    memberCount: 1,
    updatedAt: sampleLifeFlowDate.toISOString(),
    members: [],
    cachedAt: sampleLifeFlowDate.toISOString(),
    draft: null,
  },
];
