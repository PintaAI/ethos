export type Habit = {
  id: string;
  name: string;
  color: string;
  weekdays: number[];
  preferredDuration: number;
  isAppCheckIn: boolean;
  isJournalHabit: boolean;
  createdAt: string;
};

export type CreateHabitInput = Pick<Habit, "name" | "color" | "weekdays">;
export type UpdateHabitInput = CreateHabitInput;

export type HabitLog = {
  habitId: string;
  date: string;
};

export type TimeBox = {
  id: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  breakDurations: number[];
  color: string | null;
  completed: boolean;
  habitId: string | null;
  createdAt: string;
  dismissed?: boolean;
  presetScheduleId?: string | null;
  presetBlockId?: string | null;
  virtual?: boolean;
};

export type CreateTimeBoxInput = Pick<TimeBox, "date" | "title" | "startTime" | "endTime"> & {
  color?: string | null;
  breakDurations?: number[];
  habitId?: string | null;
};

export type UpdateTimeBoxInput = Pick<TimeBox, "title" | "startTime" | "endTime" | "color" | "breakDurations">;

export type DayPresetFrequency = "once" | "daily" | "weekly";

export type CreateDayPresetInput = {
  name: string;
  startDate?: string;
  frequency?: Exclude<DayPresetFrequency, "once">;
  weekdays: number[];
  blocks: Pick<TimeBox, "title" | "startTime" | "endTime" | "color" | "breakDurations">[];
};
export type UpdateDayPresetInput = CreateDayPresetInput;

export type DayPresetSchedule = {
  id: string;
  startDate: string;
  frequency: DayPresetFrequency;
  weekdays: number[];
};

export type DayPreset = {
  id: string;
  name: string;
  blocks: (Pick<TimeBox, "title" | "startTime" | "endTime" | "color" | "breakDurations"> & { id: string })[];
  schedule: DayPresetSchedule | null;
};

export type ApplyDayPresetResult = "applied" | "conflict" | "not-found";
export type PlanHabitResult = "planned" | "already-planned" | "no-space" | "not-found";
