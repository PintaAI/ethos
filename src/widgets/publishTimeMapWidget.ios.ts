import { getTimeBoxColor } from "@/components/lifeflow/TimeMapDial";
import { timeToMinutes } from "@/lib/timeBox";
import EthosTimeMapWidget, {
  type TimeMapWidgetAvailableRange,
  type TimeMapWidgetProps,
} from "./EthosTimeMapWidget";
import type { PublishTimeMapWidgetInput } from "./publishTimeMapWidget";

const MINUTES_IN_DAY = 24 * 60;

function getAvailableRanges(input: PublishTimeMapWidgetInput): TimeMapWidgetAvailableRange[] {
  const occupied = input.boxes.flatMap((box) => {
    const start = timeToMinutes(box.startTime);
    const end = timeToMinutes(box.endTime);
    if (start === end) return [];
    return end > start
      ? [{ start, end }]
      : [{ start, end: MINUTES_IN_DAY }, { start: 0, end }];
  }).sort((first, second) => first.start - second.start);

  if (occupied.length === 0) {
    const labels = input.formatAvailable(24, 0);
    return [{ start: 0, duration: MINUTES_IN_DAY, fullLabel: labels.full, compactLabel: labels.compact }];
  }

  const merged = occupied.reduce<{ start: number; end: number }[]>((result, range) => {
    const previous = result.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      result.push({ ...range });
    }
    return result;
  }, []);
  const available: { start: number; duration: number }[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) available.push({ start: cursor, duration: range.start - cursor });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < MINUTES_IN_DAY) available.push({ start: cursor, duration: MINUTES_IN_DAY - cursor });

  const first = available[0];
  const last = available.at(-1);
  const ranges = available.length > 1 && first.start === 0 && last && last.start + last.duration === MINUTES_IN_DAY
    ? [{ start: last.start, duration: last.duration + first.duration }, ...available.slice(1, -1)]
    : available;

  return ranges.map((range) => {
    const labels = input.formatAvailable(Math.floor(range.duration / 60), range.duration % 60);
    return { ...range, fullLabel: labels.full, compactLabel: labels.compact };
  });
}

export async function publishTimeMapWidget(input: PublishTimeMapWidgetInput) {
  const props: TimeMapWidgetProps = {
    date: input.date,
    durationLabel: input.durationLabel,
    mapLabel: input.mapLabel,
    backgroundColor: input.backgroundColor,
    foregroundColor: input.foregroundColor,
    mutedColor: input.mutedColor,
    isDark: input.isDark,
    boxes: input.boxes.map((box) => ({
      id: box.id,
      title: box.title,
      startTime: box.startTime,
      endTime: box.endTime,
      breakDurations: box.breakDurations,
      color: box.color ?? getTimeBoxColor(box.id),
      completed: box.completed,
    })),
    availableRanges: getAvailableRanges(input),
  };

  EthosTimeMapWidget.updateSnapshot(props);
}
