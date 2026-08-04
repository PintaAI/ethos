import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from "@expo/ui/jetpack-compose";
import { alpha } from "@/lib/color";
import { useAppTheme } from "@/components/provider/AppTheme";
import type { AppSegmentedControlProps } from "./AppSegmentedControl";

export function AppSegmentedControl({ values, selectedIndex, onIndexChange, style }: AppSegmentedControlProps) {
  const appTheme = useAppTheme();
  const colors = {
    activeBorderColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.55 : 0.4),
    activeContainerColor: alpha(appTheme.colors.primary, appTheme.isDark ? 0.28 : 0.16),
    activeContentColor: appTheme.colors.primary,
    inactiveBorderColor: alpha(appTheme.colors.muted, appTheme.isDark ? 0.45 : 0.3),
    inactiveContainerColor: appTheme.colors.background,
    inactiveContentColor: appTheme.colors.muted,
  };

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={appTheme.isDark ? "dark" : "light"}
      seedColor={appTheme.colors.primary}
      style={style}
    >
      <SingleChoiceSegmentedButtonRow>
        {values.map((label, index) => {
          const selected = index === selectedIndex;

          return (
            <SegmentedButton
              key={`${label}-${index}`}
              selected={selected}
              onClick={() => onIndexChange(index)}
              colors={colors}
            >
              <SegmentedButton.Label>
                <Text style={{ typography: "labelLarge", fontWeight: selected ? "700" : "500" }}>
                  {label}
                </Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          );
        })}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}
