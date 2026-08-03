import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import i18n from "@/i18n";
import type { TimeBox } from "@/data/selfImprovement/types";
import { parseDateKey } from "@/lib/date";
import {
  DEFAULT_NOTIFICATION_CHANNEL_ID,
  notificationsAreAllowedAsync,
  prepareDefaultNotificationChannelAsync,
  requestNotificationPermissionsAsync,
} from "@/lib/notifications";
import { getTimeBoxBreakRanges, timeToMinutes } from "@/lib/timeBox";

const TIME_BOX_NOTIFICATION_KIND = "time-box-reminder";
const MAX_SCHEDULED_EVENTS = 40;
let reconcileQueue: Promise<void> = Promise.resolve();

type ReconcileNotificationOptions = {
  requestPermission?: boolean;
  shouldCancel?: () => boolean;
};

type TimeBoxNotificationEvent = {
  box: TimeBox;
  event: "start" | "end" | `break-start-${number}` | `break-resume-${number}`;
  date: Date;
  title: string;
  body: string;
};

export function reconcileTimeBoxNotificationsAsync(
  timeBoxes: TimeBox[],
  options: ReconcileNotificationOptions = {},
) {
  const snapshot = timeBoxes.map((box) => ({ ...box }));
  const next = reconcileQueue
    .catch(() => undefined)
    .then(() => reconcileTimeBoxNotificationsNowAsync(snapshot, options));
  reconcileQueue = next;
  return next;
}

async function reconcileTimeBoxNotificationsNowAsync(
  timeBoxes: TimeBox[],
  options: ReconcileNotificationOptions,
) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (options.shouldCancel?.()) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = scheduled.filter(
    (notification) => notification.content.data?.kind === TIME_BOX_NOTIFICATION_KIND,
  );
  const allowed = options.requestPermission === false
    ? await notificationsAreAllowedAsync()
    : await requestNotificationPermissionsAsync();
  if (!allowed) {
    for (const notification of existing) {
      if (options.shouldCancel?.()) return;
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
    return;
  }

  const now = Date.now();
  const desired = timeBoxes
    .filter((box) => !box.completed)
    .flatMap(createEvents)
    .filter((event) => event.date.getTime() > now)
    .sort((first, second) => first.date.getTime() - second.date.getTime())
    .slice(0, MAX_SCHEDULED_EVENTS);
  const desiredByKey = new Map(desired.map((event) => [eventKey(event), event]));
  const retainedKeys = new Set<string>();

  for (const notification of existing) {
    if (options.shouldCancel?.()) return;
    const data = notification.content.data;
    const key = `${String(data?.timeBoxId)}:${String(data?.event)}:${String(data?.scheduledAt)}`;
    const desiredEvent = desiredByKey.get(key);
    if (
      desiredEvent
      && notification.content.title === desiredEvent.title
      && notification.content.body === desiredEvent.body
    ) {
      retainedKeys.add(key);
      continue;
    }
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
  }

  if (options.shouldCancel?.()) return;
  await prepareDefaultNotificationChannelAsync();
  for (const event of desired.filter((item) => !retainedKeys.has(eventKey(item)))) {
    if (options.shouldCancel?.()) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: event.title,
        body: event.body,
        sound: "default",
        color: event.box.color ?? undefined,
        data: {
          kind: TIME_BOX_NOTIFICATION_KIND,
          timeBoxId: event.box.id,
          event: event.event,
          scheduledAt: event.date.getTime(),
          url: "/schedule",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: event.date,
        channelId: Platform.OS === "android" ? DEFAULT_NOTIFICATION_CHANNEL_ID : undefined,
      },
    });
  }
}

function createEvents(box: TimeBox): TimeBoxNotificationEvent[] {
  const startDate = dateAtTime(box.date, box.startTime);
  const endDate = dateAtTime(box.date, box.endTime);
  if (timeToMinutes(box.endTime) < timeToMinutes(box.startTime)) {
    endDate.setDate(endDate.getDate() + 1);
  }
  const blockEvents: TimeBoxNotificationEvent[] = [
    {
      box,
      event: "start",
      date: startDate,
      title: i18n.t("timeBoxing.startNotificationTitle", { title: box.title }),
      body: i18n.t("timeBoxing.startNotificationBody", {
        startTime: box.startTime,
        endTime: box.endTime,
      }),
    },
    {
      box,
      event: "end",
      date: endDate,
      title: i18n.t("timeBoxing.endNotificationTitle", { title: box.title }),
      body: i18n.t("timeBoxing.endNotificationBody", { endTime: box.endTime }),
    },
  ];
  const breakEvents = getTimeBoxBreakRanges(box.startTime, box.endTime, box.breakDurations).flatMap((timeBoxBreak, index): TimeBoxNotificationEvent[] => [
    {
      box,
      event: `break-start-${index}`,
      date: dateAtOffset(box.date, box.startTime, timeBoxBreak.startOffset),
      title: i18n.t("timeBoxing.breakStartNotificationTitle"),
      body: i18n.t("timeBoxing.breakStartNotificationBody", {
        title: box.title,
        minutes: timeBoxBreak.duration,
      }),
    },
    {
      box,
      event: `break-resume-${index}`,
      date: dateAtOffset(box.date, box.startTime, timeBoxBreak.endOffset),
      title: i18n.t("timeBoxing.breakResumeNotificationTitle"),
      body: i18n.t("timeBoxing.breakResumeNotificationBody", { title: box.title }),
    },
  ]);
  return [...blockEvents, ...breakEvents];
}

function dateAtTime(dateKey: string, time: string) {
  const date = parseDateKey(dateKey);
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateAtOffset(dateKey: string, startTime: string, offset: number) {
  const date = parseDateKey(dateKey);
  date.setHours(0, timeToMinutes(startTime) + offset, 0, 0);
  return date;
}

function eventKey(event: TimeBoxNotificationEvent) {
  return `${event.box.id}:${event.event}:${event.date.getTime()}`;
}
