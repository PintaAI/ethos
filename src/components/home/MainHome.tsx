import { startTransition, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View, type LayoutChangeEvent } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { GlassBox } from "@/components/GlassBox";
import { useAppTheme } from "@/components/provider/AppTheme";
import { HOME_SECTION_ROUTES, type HomeSection } from "@/config/homeSections";
import { alpha } from "@/lib/color";
import { setPreference } from "@/lib/preferences";

type MainHomeProps = {
  section: HomeSection;
};

export function MainHome({ section }: MainHomeProps) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const [displayedSection, setDisplayedSection] = useState(section);
  const [controlWidth, setControlWidth] = useState(184);
  const [selectionAnimation] = useState(() => new Animated.Value(section === "cashflow" ? 0 : 1));
  const switching = useRef(false);
  const sections = [
    { id: "cashflow", label: t("sidebar.cashflow"), icon: "banknote.fill" },
    { id: "lifeflow", label: t("sidebar.lifeFlow"), icon: "sparkles" },
  ] as const;
  const containerColor = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.07 : 0.045);
  const containerBorder = alpha(appTheme.colors.foreground, appTheme.isDark ? 0.14 : 0.09);
  const selectedColor = alpha(appTheme.colors.primary, appTheme.isDark ? 0.22 : 0.13);
  const selectedBorder = alpha(appTheme.colors.primary, appTheme.isDark ? 0.42 : 0.28);
  const indicatorWidth = (controlWidth - 6) / 2;
  const indicatorTranslateX = selectionAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, indicatorWidth + 2],
  });

  useEffect(() => () => selectionAnimation.stopAnimation(), [selectionAnimation]);

  const handleSectionChange = (nextSection: HomeSection) => {
    if (nextSection === displayedSection || switching.current) return;

    switching.current = true;
    setDisplayedSection(nextSection);
    void Haptics.selectionAsync().catch(() => {});
    Animated.timing(selectionAnimation, {
      toValue: nextSection === "cashflow" ? 0 : 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        switching.current = false;
        setDisplayedSection(section);
        return;
      }

      void setPreference("lastHomeSection", nextSection)
        .catch((error) => console.warn("Failed to save home section", error));
      startTransition(() => router.replace(HOME_SECTION_ROUTES[nextSection]));
    });
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    setControlWidth(event.nativeEvent.layout.width);
  };

  return (
    <GlassBox
      isInteractive
      tintColor={containerColor}
      glassEffectStyle="clear"
      colorScheme={appTheme.isDark ? "dark" : "light"}
      style={{
        position: "relative",
        width: 184,
        flexDirection: "row",
        gap: 2,
        overflow: "hidden",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: containerBorder,
        padding: 2,
      }}
      onLayout={handleLayout}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 2,
          left: 2,
          top: 2,
          width: indicatorWidth,
          borderRadius: 13,
          borderWidth: 1,
          borderColor: selectedBorder,
          backgroundColor: selectedColor,
          transform: [{ translateX: indicatorTranslateX }],
        }}
      />
      {sections.map((item) => {
        const selected = item.id === displayedSection;
        const color = selected ? appTheme.colors.primary : appTheme.colors.muted;

        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            className="min-h-9 flex-1 flex-row items-center justify-center gap-1 rounded-[13px] px-1.5"
            onPress={() => handleSectionChange(item.id)}
          >
            <View
              className="h-4 w-4 items-center justify-center rounded-full"
              style={{ backgroundColor: selected ? alpha(appTheme.colors.primary, 0.14) : "transparent" }}
            >
              <AppSymbol name={item.icon} size={11} tintColor={color} />
            </View>
            <Text className="text-xs font-bold" style={{ color }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </GlassBox>
  );
}
