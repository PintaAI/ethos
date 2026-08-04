import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type { StyleProp, ViewStyle } from "react-native";
import { useAppTheme } from "@/components/provider/AppTheme";

export type AppSegmentedControlProps = {
  values: string[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  style?: StyleProp<ViewStyle>;
};

export function AppSegmentedControl({ values, selectedIndex, onIndexChange, style }: AppSegmentedControlProps) {
  const appTheme = useAppTheme();

  return (
    <SegmentedControl
      values={values}
      selectedIndex={selectedIndex}
      onChange={(event) => onIndexChange(event.nativeEvent.selectedSegmentIndex)}
      tintColor={appTheme.colors.primary}
      appearance={appTheme.isDark ? "dark" : "light"}
      style={style}
    />
  );
}
