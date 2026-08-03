const MINUTES_IN_DAY = 24 * 60;
const MINIMUM_FOCUS_SEGMENT_MINUTES = 5;

type TimeRange = {
  date: string;
  startTime: string;
  endTime: string;
};

type SchedulableTimeBox = TimeRange & { id?: string };

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isOvernightTimeBox(startTime: string, endTime: string) {
  return timeToMinutes(endTime) < timeToMinutes(startTime);
}

export function getTimeBoxDuration(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === end) return 0;
  return end > start ? end - start : MINUTES_IN_DAY - start + end;
}

export function minutesToTime(value: number) {
  const normalized = (value + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function getTimeBoxFocusDuration(startTime: string, endTime: string, breakDurations: number[]) {
  return Math.max(0, getTimeBoxDuration(startTime, endTime) - breakDurations.reduce((total, duration) => total + duration, 0));
}

export function timeBoxBreaksFit(startTime: string, endTime: string, breakDurations: number[]) {
  if (breakDurations.length === 0) return true;
  if (breakDurations.some((duration) => !Number.isInteger(duration) || duration <= 0 || duration % 5 !== 0)) return false;
  const minimumFocusDuration = (breakDurations.length + 1) * MINIMUM_FOCUS_SEGMENT_MINUTES;
  return breakDurations.reduce((total, duration) => total + duration, minimumFocusDuration)
    <= getTimeBoxDuration(startTime, endTime);
}

export function getTimeBoxBreakRanges(startTime: string, endTime: string, breakDurations: number[]) {
  if (breakDurations.length === 0 || !timeBoxBreaksFit(startTime, endTime, breakDurations)) return [];
  const focusDuration = getTimeBoxFocusDuration(startTime, endTime, breakDurations);
  const focusSegmentCount = breakDurations.length + 1;
  const baseFocusSegment = Math.floor(focusDuration / focusSegmentCount);
  const remainder = focusDuration % focusSegmentCount;
  const start = timeToMinutes(startTime);
  let offset = 0;

  return breakDurations.map((duration, index) => {
    offset += baseFocusSegment + (index < remainder ? 1 : 0);
    const breakStartOffset = offset;
    offset += duration;
    return {
      duration,
      startTime: minutesToTime(start + breakStartOffset),
      endTime: minutesToTime(start + offset),
      startOffset: breakStartOffset,
      endOffset: offset,
    };
  });
}

export function getTimeBoxFocusRanges(startTime: string, endTime: string, breakDurations: number[]) {
  const blockDuration = getTimeBoxDuration(startTime, endTime);
  const breaks = getTimeBoxBreakRanges(startTime, endTime, breakDurations);
  const start = timeToMinutes(startTime);
  let offset = 0;
  const ranges = breaks.map((timeBoxBreak) => {
    const range = {
      startTime: minutesToTime(start + offset),
      endTime: timeBoxBreak.startTime,
      duration: timeBoxBreak.startOffset - offset,
    };
    offset = timeBoxBreak.endOffset;
    return range;
  });
  ranges.push({
    startTime: minutesToTime(start + offset),
    endTime,
    duration: blockDuration - offset,
  });
  return ranges;
}

export function timeBoxesOverlap(first: TimeRange, second: TimeRange) {
  if (first.date === second.date) {
    return circularSegments(first).some((firstSegment) => circularSegments(second).some(
      (secondSegment) => firstSegment.start < secondSegment.end && firstSegment.end > secondSegment.start,
    ));
  }
  const firstInterval = toAbsoluteInterval(first);
  const secondInterval = toAbsoluteInterval(second);
  return firstInterval.start < secondInterval.end && firstInterval.end > secondInterval.start;
}

export function canAllocateTimeBox(candidate: TimeRange, existing: TimeRange[]) {
  const sameDate = existing.filter((box) => box.date === candidate.date);
  if (getTimeBoxDuration(candidate.startTime, candidate.endTime) <= 0) return false;
  if (sameDate.some((box) => timeBoxesOverlap(candidate, box))) return false;
  return sameDate.reduce(
    (total, box) => total + getTimeBoxDuration(box.startTime, box.endTime),
    getTimeBoxDuration(candidate.startTime, candidate.endTime),
  ) <= MINUTES_IN_DAY;
}

export function timeBoxRangesAreValid(ranges: TimeRange[]) {
  return ranges.every((range, index) => canAllocateTimeBox(range, ranges.slice(0, index)));
}

function circularSegments(range: TimeRange) {
  const start = timeToMinutes(range.startTime);
  const end = timeToMinutes(range.endTime);
  if (start === end) return [];
  return end > start
    ? [{ start, end }]
    : [{ start, end: MINUTES_IN_DAY }, { start: 0, end }];
}

export function findNextAvailableTimeSlot(
  date: string,
  duration: number,
  timeBoxes: SchedulableTimeBox[],
  now = new Date(),
) {
  const safeDuration = Math.min(4 * 60, Math.max(5, Math.round(duration / 5) * 5));
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayStart = date === today ? Math.max(7 * 60, Math.ceil(currentMinutes / 15) * 15) : 7 * 60;
  const dayEnd = 22 * 60;

  for (let start = dayStart; start + safeDuration <= dayEnd; start += 15) {
    const candidate = {
      date,
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + safeDuration),
    };
    if (!timeBoxes.some((box) => timeBoxesOverlap(candidate, box))) return candidate;
  }
  return null;
}

function toAbsoluteInterval(range: TimeRange) {
  const [year, month, day] = range.date.split("-").map(Number);
  const dayOffset = Date.UTC(year, month - 1, day) / 86_400_000;
  const startInDay = timeToMinutes(range.startTime);
  const endInDay = timeToMinutes(range.endTime);
  const start = dayOffset * MINUTES_IN_DAY + startInDay;
  const end = dayOffset * MINUTES_IN_DAY + endInDay + (endInDay < startInDay ? MINUTES_IN_DAY : 0);
  return { start, end };
}
