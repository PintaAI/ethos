import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import type { ItemOccurrence } from "@/data/lifeflow/types";
import { alpha } from "@/lib/color";
import { formatTime12h } from "@/lib/date";

export function ScheduleTimeline({
  occurrences,
  onEdit,
  onDelete,
}: {
  occurrences: ItemOccurrence[];
  onEdit: (item: ItemOccurrence) => void;
  onDelete: (item: ItemOccurrence) => void;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  return (
    <View className="gap-2">
      <Text
        className="text-sm font-bold uppercase"
        style={{ color: theme.colors.muted }}
      >
        {t("timeBoxing.schedule")}
      </Text>
      {occurrences.length === 0 ? (
        <Text
          className="py-10 text-center"
          style={{ color: theme.colors.muted }}
        >
          {t("timeBoxing.empty")}
        </Text>
      ) : (
        occurrences.map((item) => (
          <View
            key={item.id}
            className="flex-row items-center gap-3 rounded-2xl p-3"
            style={{ backgroundColor: alpha(theme.colors.foreground, 0.045) }}
          >
            <View className="w-16">
              <Text
                className="text-xs font-bold"
                style={{ color: theme.colors.foreground }}
              >
                {item.startTime
                  ? formatTime12h(item.startTime)
                  : t("lifeFlowItems.allDay")}
              </Text>
              {item.endTime ? (
                <Text className="text-xs" style={{ color: theme.colors.muted }}>
                  {formatTime12h(item.endTime)}
                </Text>
              ) : null}
            </View>
            <View
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("timeBoxing.editBlockNamed", {
                title: item.name,
              })}
              onPress={() => onEdit(item)}
              className="flex-1"
            >
              <Text
                className="font-semibold"
                style={{ color: theme.colors.foreground }}
              >
                {item.name}
              </Text>
              <Text className="text-xs" style={{ color: theme.colors.muted }}>
                {t(
                  item.kind === "habit"
                    ? "lifeFlowItems.habit"
                    : item.overridden
                      ? "lifeFlowItems.overridden"
                      : "lifeFlowItems.event",
                )}
              </Text>
            </Pressable>
            {item.kind === "event" ? (
              <Pressable
                accessibilityLabel={t("common.delete")}
                onPress={() => onDelete(item)}
              >
                <AppSymbol
                  name="trash.fill"
                  size={14}
                  tintColor={theme.colors.muted}
                />
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}
