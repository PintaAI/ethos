import type { TimeBox } from "@/data/selfImprovement/types";

export type PublishTimeMapWidgetInput = {
  date: string;
  boxes: TimeBox[];
  durationLabel: string;
  mapLabel: string;
  backgroundColor: string;
  foregroundColor: string;
  mutedColor: string;
  isDark: boolean;
  formatAvailable: (hours: number, minutes: number) => { full: string; compact: string };
};

export async function publishTimeMapWidget(_input: PublishTimeMapWidgetInput) {}
