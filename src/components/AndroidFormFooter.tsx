import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { alpha } from "@/lib/color";

export function AndroidFormFooter({ children }: { children: ReactNode }) {
  const appTheme = useAppTheme();

  return (
    <View
      className="flex-row gap-2 border-t px-4 py-3"
      style={{
        backgroundColor: appTheme.colors.background,
        borderColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.12 : 0.08),
      }}
    >
      {children}
    </View>
  );
}

export function AndroidFormFooterButton({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const appTheme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className="h-12 flex-1 items-center justify-center rounded-2xl border px-3"
      style={{
        backgroundColor: primary ? appTheme.colors.primary : "transparent",
        borderColor: primary
          ? appTheme.colors.primary
          : alpha(appTheme.colors.foreground, appTheme.isDark ? 0.14 : 0.1),
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        className="text-center text-sm font-bold"
        style={{ color: primary ? appTheme.colors.inverseForeground : appTheme.colors.foreground }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
