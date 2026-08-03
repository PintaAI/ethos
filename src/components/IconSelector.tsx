import { Pressable, ScrollView, View } from "react-native";
import type { SFSymbol } from "expo-symbols";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { alpha } from "@/lib/color";

type IconSelectorProps = {
  options: readonly SFSymbol[];
  value: SFSymbol;
  onChange: (value: SFSymbol) => void;
  tintColor?: string;
  horizontal?: boolean;
};

export function IconSelector({ options, value, onChange, tintColor, horizontal = false }: IconSelectorProps) {
  const appTheme = useAppTheme();
  const activeColor = tintColor ?? appTheme.colors.primary;
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";

  const icons = options.map((option) => {
        const selected = value === option;
        const iconColor = selected ? activeColor : appTheme.colors.muted;

        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.replaceAll(".", " ")}
            onPress={() => onChange(option)}
            className={horizontal ? "h-12 w-12 items-center justify-center rounded-2xl border" : "h-11 w-11 items-center justify-center rounded-2xl border"}
            style={{ backgroundColor: selected ? alpha(activeColor, 0.18) : appTheme.colors.background, borderColor: selected ? activeColor : borderColor, borderWidth: selected ? 2 : 1 }}
          >
            <AppSymbol name={option} size={horizontal ? 20 : 18} tintColor={iconColor} fallback={<Text style={{ color: iconColor }}>•</Text>} />
            {selected && horizontal ? (
              <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: activeColor }}>
                <AppSymbol name="checkmark" size={9} tintColor={appTheme.colors.inverseForeground} fallback={<Text style={{ color: appTheme.colors.inverseForeground }}>✓</Text>} />
              </View>
            ) : null}
          </Pressable>
        );
      });

  if (horizontal) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerClassName="gap-2 px-0.5 pb-1 pt-1">
        {icons}
      </ScrollView>
    );
  }

  return <View className="flex-row flex-wrap gap-2">{icons}</View>;
}
