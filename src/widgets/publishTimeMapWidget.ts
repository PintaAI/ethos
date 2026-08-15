import type { TimedItemOccurrence } from "@/components/lifeflow/TimeMapDial";

export type PublishTimeMapWidgetInput = {
  date: string;
  boxes: TimedItemOccurrence[];
  durationLabel: string;
  mapLabel: string;
  backgroundColor: string;
  foregroundColor: string;
  mutedColor: string;
  isDark: boolean;
  formatAvailable: (hours: number, minutes: number) => { full: string; compact: string };
};

export async function publishTimeMapWidget(_input: PublishTimeMapWidgetInput) {}
