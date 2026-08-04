import { TextInput } from "react-native";

import { useAppTheme } from "@/components/provider/AppTheme";
import { alpha } from "@/lib/color";
import type { NativeTimeWheelProps, TimeInputProps } from "./TimeInput.types";

export function TimeInput({ value, onChange, accessibilityLabel }: TimeInputProps) {
  const appTheme = useAppTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      accessibilityLabel={accessibilityLabel}
      placeholder="09:00"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      className="rounded-xl px-3 py-3 text-base font-bold"
      style={{
        color: appTheme.colors.foreground,
        backgroundColor: alpha(appTheme.colors.foreground, 0.05),
        textAlign: "center",
      }}
    />
  );
}

export function NativeTimeWheel(_props: NativeTimeWheelProps) {
  return null;
}
