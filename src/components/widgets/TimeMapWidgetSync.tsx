import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAppTheme } from "@/components/provider/AppTheme";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";
import { toDateKey } from "@/lib/date";
import { getTimeBoxFocusDuration } from "@/lib/timeBox";
import { publishTimeMapWidget } from "@/widgets/publishTimeMapWidget";

export function TimeMapWidgetSync() {
  const { t, i18n } = useTranslation();
  const appTheme = useAppTheme();
  const { loading, getTimeBoxesForDate } = useLifeFlow();
  const date = toDateKey(new Date());
  const boxes = getTimeBoxesForDate(date);
  const scheduledMinutes = boxes.reduce(
    (total, box) => total + getTimeBoxFocusDuration(box.startTime, box.endTime, box.breakDurations),
    0,
  );
  const durationLabel = scheduledMinutes % 60 === 0
    ? t("timeBoxing.compactHours", { hours: Math.floor(scheduledMinutes / 60) })
    : t("timeBoxing.duration", {
      hours: Math.floor(scheduledMinutes / 60),
      minutes: scheduledMinutes % 60,
    });
  const mapLabel = t("timeBoxing.planned");
  const backgroundColor = appTheme.colors.background;
  const foregroundColor = appTheme.colors.foreground;
  const mutedColor = appTheme.colors.muted;

  useEffect(() => {
    if (loading) return;
    void publishTimeMapWidget({
      date,
      boxes,
      durationLabel,
      mapLabel,
      backgroundColor,
      foregroundColor,
      mutedColor,
      isDark: appTheme.isDark,
      formatAvailable: (hours, minutes) => ({
        full: minutes === 0
          ? t("timeBoxing.availableDurationHours", { hours })
          : t("timeBoxing.availableDuration", { hours, minutes }),
        compact: hours > 0 && minutes > 0
          ? t("timeBoxing.compactHoursMinutes", { hours, minutes })
          : hours > 0
            ? t("timeBoxing.compactHours", { hours })
            : t("timeBoxing.compactMinutes", { minutes }),
      }),
    }).catch((error) => console.warn("Failed to update time-map widget", error));
  }, [
    backgroundColor,
    boxes,
    date,
    durationLabel,
    foregroundColor,
    i18n.resolvedLanguage,
    appTheme.isDark,
    loading,
    mapLabel,
    mutedColor,
    t,
  ]);

  return null;
}
