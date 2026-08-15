export type ItemKind = "habit" | "event";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export type SystemItemType = "app_check_in" | "journal";

export type Recurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: Weekday[];
  endsOn: string | null;
};

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;
  color: string;
  startsOn: string;
  startTime: string | null;
  endTime: string | null;
  breakDurations: number[];
  recurrence: Recurrence | null;
  systemType: SystemItemType | null;
  createdAt: string;
  updatedAt: string;
};

export type UnifiedHabitLog = {
  itemId: string;
  date: string;
  completedAt: string;
  updatedAt: string;
};

export type ItemOccurrenceSnapshot = Pick<
  Item,
  "kind" | "name" | "color" | "startTime" | "endTime" | "breakDurations"
>;

export type ItemException = {
  itemId: string;
  originalDate: string;
  replacementDate: string | null;
  cancelled: boolean;
  replacement: ItemOccurrenceSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemOccurrence = ItemOccurrenceSnapshot & {
  id: string;
  itemId: string;
  originalDate: string;
  date: string;
  completed: boolean;
  overridden: boolean;
};

export type CreateItemInput = Omit<Item, "id" | "createdAt" | "updatedAt" | "systemType">;
export type UpdateItemInput = Partial<Pick<Item, "name" | "color" | "startsOn" | "startTime" | "endTime" | "breakDurations" | "recurrence">>;
export type OverrideOccurrenceInput = {
  itemId: string;
  originalDate: string;
  replacementDate: string;
  replacement: ItemOccurrenceSnapshot;
};
