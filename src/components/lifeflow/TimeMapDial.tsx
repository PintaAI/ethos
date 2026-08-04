import { useRef, useState } from "react";
import { useWindowDimensions, View, type AccessibilityActionEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText, TextPath } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import type { TimeBox } from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { getTimeBoxDuration, getTimeBoxFocusDuration, getTimeBoxFocusRanges, timeToMinutes } from "@/lib/timeBox";

type TimeMapDialProps = {
  boxes: TimeBox[];
  date: string;
  durationLabel: string;
  mapLabel: string;
  onUpdateBox?: (box: TimeBox, startTime: string, endTime: string) => Promise<boolean>;
  onEditBox?: (box: TimeBox) => void;
  onAddBox?: (startTime: string, endTime: string) => void;
  onInteractionChange?: (active: boolean) => void;
};

const MINUTES_IN_DAY = 24 * 60;
const SNAP_MINUTES = 15;
const END_HANDLE_OFFSET_MINUTES = 10;
const REVERSED_LABEL_RADIUS_OFFSET = 5;
const BLOCK_LABEL_RADIUS_OFFSET = -6;
const BLOCK_CORNER_RADIUS = 4;

export const TIME_BOX_COLORS = ["#5B8CFF", "#FF9F43", "#2ECF8F", "#E76BA7", "#9B7EDE", "#35B8C8"];

export function getTimeBoxColor(id: string) {
  const colorIndex = Array.from(id).reduce((hash, character) => hash + character.charCodeAt(0), 0);
  return TIME_BOX_COLORS[colorIndex % TIME_BOX_COLORS.length];
}

function pointForMinutes(minutes: number, radius: number, center: number) {
  const angle = (minutes / MINUTES_IN_DAY) * Math.PI * 2 - Math.PI / 2;
  return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
}

function formatMinutes(value: number) {
  const normalized = (value + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function minutesForPoint(x: number, y: number, center: number) {
  const angle = (Math.atan2(y - center, x - center) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  const rawMinutes = (angle / (Math.PI * 2)) * MINUTES_IN_DAY;
  return Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES % MINUTES_IN_DAY;
}

function rangeContainsMinutes(startTime: string, endTime: string, minutes: number) {
  const start = timeToMinutes(startTime);
  const duration = getTimeBoxDuration(startTime, endTime);
  const offset = (minutes - start + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return duration > 0 && offset <= duration;
}

function labelArcPath(start: number, duration: number, radius: number, center: number, reversedRadiusOffset = 0) {
  const end = (start + duration) % MINUTES_IN_DAY;
  const midpoint = (start + duration / 2) % MINUTES_IN_DAY;
  const reverse = midpoint > 6 * 60 && midpoint < 18 * 60;
  const labelRadius = radius + (reverse ? reversedRadiusOffset : 0);
  const from = pointForMinutes(reverse ? end : start, labelRadius, center);
  const to = pointForMinutes(reverse ? start : end, labelRadius, center);
  return `M ${from.x} ${from.y} A ${labelRadius} ${labelRadius} 0 ${duration > MINUTES_IN_DAY / 2 ? 1 : 0} ${reverse ? 0 : 1} ${to.x} ${to.y}`;
}

function blockArcPath(start: number, duration: number, radius: number, width: number, center: number) {
  const outerRadius = radius + width / 2;
  const innerRadius = radius - width / 2;
  const sweep = (duration / MINUTES_IN_DAY) * Math.PI * 2;
  const cornerRadius = Math.min(BLOCK_CORNER_RADIUS, innerRadius * sweep / 4, width / 2);
  const outerInsetMinutes = cornerRadius / outerRadius / (Math.PI * 2) * MINUTES_IN_DAY;
  const innerInsetMinutes = cornerRadius / innerRadius / (Math.PI * 2) * MINUTES_IN_DAY;
  const end = start + duration;
  const outerStart = pointForMinutes(start + outerInsetMinutes, outerRadius, center);
  const outerEnd = pointForMinutes(end - outerInsetMinutes, outerRadius, center);
  const endOuterCorner = pointForMinutes(end, outerRadius, center);
  const endOuterCap = pointForMinutes(end, outerRadius - cornerRadius, center);
  const endInnerCap = pointForMinutes(end, innerRadius + cornerRadius, center);
  const endInnerCorner = pointForMinutes(end, innerRadius, center);
  const innerEnd = pointForMinutes(end - innerInsetMinutes, innerRadius, center);
  const innerStart = pointForMinutes(start + innerInsetMinutes, innerRadius, center);
  const startInnerCorner = pointForMinutes(start, innerRadius, center);
  const startInnerCap = pointForMinutes(start, innerRadius + cornerRadius, center);
  const startOuterCap = pointForMinutes(start, outerRadius - cornerRadius, center);
  const startOuterCorner = pointForMinutes(start, outerRadius, center);
  const largeArc = sweep > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `Q ${endOuterCorner.x} ${endOuterCorner.y} ${endOuterCap.x} ${endOuterCap.y}`,
    `L ${endInnerCap.x} ${endInnerCap.y}`,
    `Q ${endInnerCorner.x} ${endInnerCorner.y} ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    `Q ${startInnerCorner.x} ${startInnerCorner.y} ${startInnerCap.x} ${startInnerCap.y}`,
    `L ${startOuterCap.x} ${startOuterCap.y}`,
    `Q ${startOuterCorner.x} ${startOuterCorner.y} ${outerStart.x} ${outerStart.y}`,
    "Z",
  ].join(" ");
}

function textColorForLabel(backgroundColor: string) {
  const value = backgroundColor.replace("#", "");
  if (value.length !== 6) return "#FFFFFF";
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 160 ? "#111827" : "#FFFFFF";
}

function getAvailableRanges(ranges: { startTime: string; endTime: string }[]) {
  const occupied = ranges.flatMap((range) => {
    const start = timeToMinutes(range.startTime);
    const end = timeToMinutes(range.endTime);
    if (start === end) return [];
    return end > start
      ? [{ start, end }]
      : [{ start, end: MINUTES_IN_DAY }, { start: 0, end }];
  }).sort((first, second) => first.start - second.start);

  if (occupied.length === 0) return [{ start: 0, duration: MINUTES_IN_DAY }];

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
  if (available.length > 1 && first.start === 0 && last && last.start + last.duration === MINUTES_IN_DAY) {
    return [
      { start: last.start, duration: last.duration + first.duration },
      ...available.slice(1, -1),
    ];
  }
  return available;
}

export function TimeMapDial({ boxes, date, durationLabel, mapLabel, onUpdateBox, onEditBox, onAddBox, onInteractionChange }: TimeMapDialProps) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(324, width - 64);
  const center = size / 2;
  const radius = size / 2 - 29;
  const circumference = 2 * Math.PI * radius;
  const trackColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.12 : 0.09);
  const tickColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.34 : 0.25);
  const labelColor = alpha(appTheme.colors.foreground, 0.58);
  const centerContentRadius = Math.min(64, radius - 45);
  const isToday = date === toDateKey(new Date());
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowLineStart = pointForMinutes(nowMinutes, centerContentRadius, center);
  const nowPoint = pointForMinutes(nowMinutes, radius + 5, center);
  const nowBaseStart = pointForMinutes(nowMinutes - 10, radius + 15, center);
  const nowBaseEnd = pointForMinutes(nowMinutes + 10, radius + 15, center);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftRange, setDraftRange] = useState<{ startTime: string; endTime: string } | null>(null);
  const activeDrag = useRef<"start" | "end" | "range" | null>(null);
  const pendingRange = useRef<{ startTime: string; endTime: string } | null>(null);
  const dragOriginRange = useRef<{ startTime: string; endTime: string } | null>(null);
  const dragOriginTouch = useRef<number | null>(null);
  const didMove = useRef(false);
  const editOnRelease = useRef<TimeBox | null>(null);
  const touchWasHandled = useRef(false);
  const touchStartPoint = useRef<{ x: number; y: number } | null>(null);
  const selectedBox = boxes.find((box) => box.id === selectedId) ?? null;
  const selectedRange = selectedBox
    ? draftRange ?? { startTime: selectedBox.startTime, endTime: selectedBox.endTime }
    : null;
  const selectedColor = selectedBox ? selectedBox.color ?? getTimeBoxColor(selectedBox.id) : null;
  const selectedStartPoint = selectedRange
    ? pointForMinutes(timeToMinutes(selectedRange.startTime), radius, center)
    : null;
  const selectedEndPoint = selectedRange
    ? pointForMinutes(timeToMinutes(selectedRange.endTime) - END_HANDLE_OFFSET_MINUTES, radius, center)
    : null;
  const selectedDuration = selectedRange
    ? getTimeBoxFocusDuration(selectedRange.startTime, selectedRange.endTime, selectedBox?.breakDurations ?? [])
    : 0;
  const availableRanges = getAvailableRanges(boxes.map((box) => (
    box.id === selectedId && selectedRange ? selectedRange : box
  )));

  const handleNearPoint = (x: number, y: number) => {
    if (!selectedStartPoint || !selectedEndPoint) return null;
    const startDistance = Math.hypot(x - selectedStartPoint.x, y - selectedStartPoint.y);
    const endDistance = Math.hypot(x - selectedEndPoint.x, y - selectedEndPoint.y);
    if (Math.min(startDistance, endDistance) > 34) return null;
    return startDistance <= endDistance ? "start" as const : "end" as const;
  };

  const boxAtPoint = (x: number, y: number) => {
    if (Math.abs(Math.hypot(x - center, y - center) - radius) > 28) return null;
    const minutes = minutesForPoint(x, y, center);
    return [...boxes].reverse().find((box) => rangeContainsMinutes(box.startTime, box.endTime, minutes)) ?? null;
  };

  const availableRangeAtPoint = (x: number, y: number) => {
    if (Math.abs(Math.hypot(x - center, y - center) - radius) > 38) return null;
    const minutes = minutesForPoint(x, y, center);
    return availableRanges.find((range) => {
      if (range.duration === MINUTES_IN_DAY) return true;
      return (minutes - range.start + MINUTES_IN_DAY) % MINUTES_IN_DAY < range.duration;
    }) ?? null;
  };

  const updateDraftHandle = (handle: "start" | "end", nextMinutes: number) => {
    if (!selectedRange) return null;
    const otherMinutes = timeToMinutes(handle === "start" ? selectedRange.endTime : selectedRange.startTime);
    const adjusted = nextMinutes === otherMinutes
      ? (nextMinutes + (handle === "start" ? -SNAP_MINUTES : SNAP_MINUTES) + MINUTES_IN_DAY) % MINUTES_IN_DAY
      : nextMinutes;
    const nextRange = {
      startTime: handle === "start" ? formatMinutes(adjusted) : selectedRange.startTime,
      endTime: handle === "end" ? formatMinutes(adjusted) : selectedRange.endTime,
    };
    pendingRange.current = nextRange;
    setDraftRange(nextRange);
    return nextRange;
  };

  const updateDraftRange = (touchMinutes: number) => {
    if (!dragOriginRange.current || dragOriginTouch.current === null) return;
    let delta = touchMinutes - dragOriginTouch.current;
    if (delta > MINUTES_IN_DAY / 2) delta -= MINUTES_IN_DAY;
    if (delta < -MINUTES_IN_DAY / 2) delta += MINUTES_IN_DAY;
    const nextRange = {
      startTime: formatMinutes(timeToMinutes(dragOriginRange.current.startTime) + delta),
      endTime: formatMinutes(timeToMinutes(dragOriginRange.current.endTime) + delta),
    };
    pendingRange.current = nextRange;
    setDraftRange(nextRange);
  };

  const commitRange = async (range: { startTime: string; endTime: string }) => {
    if (!selectedBox || !onUpdateBox) return;
    const updated = await onUpdateBox(selectedBox, range.startTime, range.endTime);
    if (!updated) setDraftRange({ startTime: selectedBox.startTime, endTime: selectedBox.endTime });
  };

  const adjustHandle = (handle: "start" | "end", event: AccessibilityActionEvent) => {
    if (!selectedRange) return;
    const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
    const current = timeToMinutes(handle === "start" ? selectedRange.startTime : selectedRange.endTime);
    const nextRange = updateDraftHandle(handle, (current + direction * SNAP_MINUTES + MINUTES_IN_DAY) % MINUTES_IN_DAY);
    if (nextRange) void commitRange(nextRange);
  };

  const responderProps = onUpdateBox ? {
    onStartShouldSetResponder: (event: { nativeEvent: { locationX: number; locationY: number } }) => (
      handleNearPoint(event.nativeEvent.locationX, event.nativeEvent.locationY) !== null
      || boxAtPoint(event.nativeEvent.locationX, event.nativeEvent.locationY) !== null
    ),
    onMoveShouldSetResponder: (event: { nativeEvent: { locationX: number; locationY: number } }) => (
      handleNearPoint(event.nativeEvent.locationX, event.nativeEvent.locationY) !== null
      || boxAtPoint(event.nativeEvent.locationX, event.nativeEvent.locationY) !== null
    ),
    onResponderGrant: (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      touchWasHandled.current = true;
      onInteractionChange?.(true);
      didMove.current = false;
      editOnRelease.current = null;
      const handle = handleNearPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (handle) {
        activeDrag.current = handle;
        pendingRange.current = selectedRange;
        return;
      }
      const box = boxAtPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (box) {
        if (box.id === selectedId) editOnRelease.current = box;
        const range = box.id === selectedId && selectedRange
          ? selectedRange
          : { startTime: box.startTime, endTime: box.endTime };
        setSelectedId(box.id);
        setDraftRange(range);
        activeDrag.current = "range";
        pendingRange.current = range;
        dragOriginRange.current = range;
        dragOriginTouch.current = minutesForPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, center);
      }
    },
    onResponderMove: (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      if (!activeDrag.current) return;
      didMove.current = true;
      const touchMinutes = minutesForPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, center);
      if (activeDrag.current === "range") {
        updateDraftRange(touchMinutes);
      } else {
        const handleMinutes = activeDrag.current === "end"
          ? Math.round((touchMinutes + END_HANDLE_OFFSET_MINUTES) / SNAP_MINUTES) * SNAP_MINUTES % MINUTES_IN_DAY
          : touchMinutes;
        updateDraftHandle(activeDrag.current, handleMinutes);
      }
    },
    onResponderRelease: () => {
      const range = pendingRange.current;
      const shouldCommit = didMove.current;
      activeDrag.current = null;
      pendingRange.current = null;
      dragOriginRange.current = null;
      dragOriginTouch.current = null;
      didMove.current = false;
      onInteractionChange?.(false);
      if (range && shouldCommit) {
        editOnRelease.current = null;
        void commitRange(range);
      } else if (editOnRelease.current) {
        onEditBox?.(editOnRelease.current);
        editOnRelease.current = null;
      }
    },
    onResponderTerminate: () => {
      activeDrag.current = null;
      pendingRange.current = null;
      dragOriginRange.current = null;
      dragOriginTouch.current = null;
      didMove.current = false;
      editOnRelease.current = null;
      onInteractionChange?.(false);
      if (selectedBox) setDraftRange({ startTime: selectedBox.startTime, endTime: selectedBox.endTime });
    },
    onResponderTerminationRequest: () => false,
  } : {};

  const touchProps = {
    onTouchStart: (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      touchWasHandled.current = false;
      touchStartPoint.current = {
        x: event.nativeEvent.locationX,
        y: event.nativeEvent.locationY,
      };
    },
    onTouchEnd: (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      if (touchWasHandled.current) {
        touchWasHandled.current = false;
        touchStartPoint.current = null;
        return;
      }
      const start = touchStartPoint.current;
      touchStartPoint.current = null;
      if (!start) return;
      const x = event.nativeEvent.locationX;
      const y = event.nativeEvent.locationY;
      if (Math.hypot(x - start.x, y - start.y) > 8) return;
      if (handleNearPoint(x, y) || boxAtPoint(x, y)) return;
      const availableRange = availableRangeAtPoint(x, y);
      if (availableRange && onAddBox) {
        const startMinutes = availableRange.duration === MINUTES_IN_DAY
          ? minutesForPoint(x, y, center)
          : availableRange.start;
        const duration = availableRange.duration === MINUTES_IN_DAY ? 60 : availableRange.duration;
        onAddBox(formatMinutes(startMinutes), formatMinutes(startMinutes + duration));
        return;
      }
      setSelectedId(null);
      setDraftRange(null);
      onInteractionChange?.(false);
    },
  };

  return (
    <View className="items-center py-3">
      <View
        accessibilityLabel={t("timeBoxing.rangeDial")}
        style={{ width: size, height: size }}
        {...touchProps}
        {...responderProps}
      >
        <Svg width={size} height={size} pointerEvents="none">
          <Circle cx={center} cy={center} r={radius} fill="none" stroke={trackColor} strokeWidth={30} />

          {boxes.map((box) => {
            const range = box.id === selectedId && selectedRange ? selectedRange : box;
            const start = timeToMinutes(range.startTime);
            const duration = Math.max(1, getTimeBoxDuration(range.startTime, range.endTime));
            const arcLength = circumference * (duration / MINUTES_IN_DAY);
            const color = box.color ?? getTimeBoxColor(box.id);
            const focusRanges = getTimeBoxFocusRanges(range.startTime, range.endTime, box.breakDurations);
            const labelFits = arcLength >= Array.from(box.title).length * 6.5 + 24;
            const labelPathId = `time-box-label-${box.id.replace(/[^a-zA-Z0-9_-]/g, "")}-${start}-${duration}`;
            return (
              <G key={box.id}>
                {focusRanges.map((focusRange, index) => {
                  const blockWidth = box.id === selectedId ? 34 : 30;
                  return (
                    <Path
                      key={`${focusRange.startTime}-${index}`}
                      d={blockArcPath(
                        timeToMinutes(focusRange.startTime),
                        focusRange.duration,
                        radius,
                        blockWidth,
                        center,
                      )}
                      fill={color}
                      fillOpacity={box.completed ? 0.48 : 1}
                    />
                  );
                })}
                {labelFits ? (
                  <>
                    <Path
                      key={labelPathId}
                      id={labelPathId}
                      d={labelArcPath(
                        start,
                        duration,
                        radius + BLOCK_LABEL_RADIUS_OFFSET,
                        center,
                        REVERSED_LABEL_RADIUS_OFFSET,
                      )}
                      fill="none"
                      stroke="none"
                    />
                    <SvgText
                      key={`${labelPathId}-text`}
                      fill={textColorForLabel(color)}
                      fillOpacity={box.completed ? 0.6 : 1}
                      fontSize={11}
                      fontWeight="700"
                      letterSpacing={0.2}
                      textAnchor="middle"
                    >
                      <TextPath href={`#${labelPathId}`} startOffset="50%">{box.title}</TextPath>
                    </SvgText>
                  </>
                ) : null}
              </G>
            );
          })}

          <G pointerEvents="none">
            {Array.from({ length: 48 }, (_, index) => {
              const angle = (index / 48) * Math.PI * 2 - Math.PI / 2;
              const major = index % 6 === 0;
              const outer = radius + 11;
              const inner = outer - (major ? 10 : 5);
              return (
                <Line
                  key={index}
                  x1={center + Math.cos(angle) * inner}
                  y1={center + Math.sin(angle) * inner}
                  x2={center + Math.cos(angle) * outer}
                  y2={center + Math.sin(angle) * outer}
                  stroke={tickColor}
                  strokeWidth={major ? 2 : 1.5}
                  strokeLinecap="round"
                />
              );
            })}
          </G>

          {availableRanges.map((range, index) => {
            const hours = Math.floor(range.duration / 60);
            const minutes = range.duration % 60;
            const fullLabel = minutes === 0
              ? t("timeBoxing.availableDurationHours", { hours })
              : t("timeBoxing.availableDuration", { hours, minutes });
            const compactLabel = hours > 0 && minutes > 0
              ? t("timeBoxing.compactHoursMinutes", { hours, minutes })
              : hours > 0
                ? t("timeBoxing.compactHours", { hours })
                : t("timeBoxing.compactMinutes", { minutes });
            const labelRadius = radius + 21;
            const arcLength = 2 * Math.PI * labelRadius * (range.duration / MINUTES_IN_DAY);
            const label = arcLength >= Array.from(fullLabel).length * 5.5 + 20 ? fullLabel : compactLabel;
            if (arcLength < Array.from(label).length * 5.5 + 8) return null;
            const pathStart = range.duration === MINUTES_IN_DAY ? 12 * 60 : range.start;
            const pathDuration = Math.min(range.duration, MINUTES_IN_DAY - 1);
            const pathId = `available-label-${index}-${pathStart}-${pathDuration}`;
            return (
              <G key={pathId}>
                <Path
                  id={pathId}
                  d={labelArcPath(
                    pathStart,
                    pathDuration,
                    labelRadius,
                    center,
                    REVERSED_LABEL_RADIUS_OFFSET,
                  )}
                  fill="none"
                  stroke="none"
                />
                <SvgText
                  fill={appTheme.colors.muted}
                  fontSize={9.5}
                  fontWeight="600"
                  letterSpacing={0.3}
                  textAnchor="middle"
                >
                  <TextPath href={`#${pathId}`} startOffset="50%">{label}</TextPath>
                </SvgText>
              </G>
            );
          })}

          {selectedStartPoint && selectedEndPoint && selectedColor ? (
            <>
              <Circle cx={selectedStartPoint.x} cy={selectedStartPoint.y} r={12} fill={selectedColor} stroke={appTheme.colors.background} strokeWidth={4} />
              <Circle cx={selectedEndPoint.x} cy={selectedEndPoint.y} r={12} fill={selectedColor} stroke={appTheme.colors.background} strokeWidth={4} />
            </>
          ) : null}

          {Array.from({ length: 12 }, (_, index) => index * 2).map((hour) => {
            const point = pointForMinutes(hour * 60, radius - 33, center);
            return (
              <SvgText
                key={hour}
                x={point.x}
                y={point.y + 4}
                fill={hour % 6 === 0 ? appTheme.colors.foreground : labelColor}
                fontSize={hour % 6 === 0 ? 12 : 11}
                fontWeight={hour % 6 === 0 ? "700" : "500"}
                textAnchor="middle"
              >
                {String(hour).padStart(2, "0")}
              </SvgText>
            );
          })}

          {isToday ? (
            <>
              <Line
                x1={nowLineStart.x}
                y1={nowLineStart.y}
                x2={nowPoint.x}
                y2={nowPoint.y}
                stroke={alpha(appTheme.colors.foreground, 0.3)}
                strokeWidth={1.5}
                strokeDasharray="3 5"
              />
              <Path
                d={`M ${nowPoint.x} ${nowPoint.y} L ${nowBaseStart.x} ${nowBaseStart.y} L ${nowBaseEnd.x} ${nowBaseEnd.y} Z`}
                fill={appTheme.colors.foreground}
                stroke={appTheme.colors.foreground}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : null}

          <Circle
            cx={center}
            cy={center}
            r={centerContentRadius}
            fill={appTheme.colors.background}
            stroke={alpha(appTheme.colors.foreground, appTheme.isDark ? 0.2 : 0.14)}
            strokeWidth={1.5}
          />
        </Svg>

          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Text className="mt-0 text-2xl font-black" style={{ color: selectedColor ?? appTheme.colors.foreground }}>
            {selectedRange
              ? selectedDuration % 60 === 0
                ? t("timeBoxing.compactHours", { hours: Math.floor(selectedDuration / 60) })
                : t("timeBoxing.duration", { hours: Math.floor(selectedDuration / 60), minutes: selectedDuration % 60 })
              : durationLabel}
          </Text>
          <Text numberOfLines={1} className="max-w-36 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: appTheme.colors.muted }}>
            {selectedBox ? selectedBox.title : mapLabel}
          </Text>
        </View>

        {selectedStartPoint && selectedRange ? (
          <View
            accessible
            pointerEvents="none"
            accessibilityRole="adjustable"
            accessibilityLabel={`${t("timeBoxing.start")}: ${selectedRange.startTime}`}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={(event) => adjustHandle("start", event)}
            className="absolute h-12 w-12"
            style={{ left: selectedStartPoint.x - 24, top: selectedStartPoint.y - 24 }}
          />
        ) : null}
        {selectedEndPoint && selectedRange ? (
          <View
            accessible
            pointerEvents="none"
            accessibilityRole="adjustable"
            accessibilityLabel={`${t("timeBoxing.end")}: ${selectedRange.endTime}`}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={(event) => adjustHandle("end", event)}
            className="absolute h-12 w-12"
            style={{ left: selectedEndPoint.x - 24, top: selectedEndPoint.y - 24 }}
          />
        ) : null}
      </View>
      {selectedRange ? (
        <Text className="mt-2 text-base font-bold" style={{ color: appTheme.colors.foreground }}>
          {selectedRange.startTime} - {selectedRange.endTime}
        </Text>
      ) : null}
    </View>
  );
}
