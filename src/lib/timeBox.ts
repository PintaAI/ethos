const MINUTES_IN_DAY = 24 * 60;
const MINIMUM_FOCUS_SEGMENT_MINUTES = 5;

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
