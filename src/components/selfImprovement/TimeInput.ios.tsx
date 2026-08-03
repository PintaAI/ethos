import { Keyboard, Pressable } from "react-native";
import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, labelsHidden, tint } from "@expo/ui/swift-ui/modifiers";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { alpha } from "@/lib/color";
import { formatTime12h } from "@/lib/date";
import type { NativeTimeWheelProps, TimeInputProps } from "./TimeInput.types";

function timeToDate(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date;
}

function dateToTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function TimeInput({ value, active, onPress, accessibilityLabel }: TimeInputProps) {
  const appTheme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: active }}
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
      className="rounded-xl px-3 py-3"
      style={{
        backgroundColor: active ? alpha(appTheme.colors.primary, 0.14) : alpha(appTheme.colors.foreground, 0.05),
        borderColor: active ? appTheme.colors.primary : "transparent",
        borderWidth: 1,
      }}
    >
      <Text className="text-center text-base font-bold" style={{ color: active ? appTheme.colors.primary : appTheme.colors.foreground }}>
        {formatTime12h(value)}
      </Text>
    </Pressable>
  );
}

export function NativeTimeWheel({ value, onChange }: NativeTimeWheelProps) {
  const appTheme = useAppTheme();

  return (
    <Host
      matchContents={{ vertical: true }}
      style={{ width: "100%" }}
      colorScheme={appTheme.resolvedScheme}
    >
      <DatePicker
        selection={timeToDate(value)}
        displayedComponents={["hourAndMinute"]}
        onDateChange={(date) => onChange(dateToTime(date))}
        modifiers={[datePickerStyle("wheel"), labelsHidden(), tint(appTheme.colors.primary)]}
      />
    </Host>
  );
}
