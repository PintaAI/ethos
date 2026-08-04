import * as Haptics from "expo-haptics";
import type { SFSymbol } from "expo-symbols";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";

type IslandToastState = {
  id: number;
  icon: SFSymbol;
  label?: string;
  accessibilityLabel: string;
  dismissing: boolean;
};

export type IslandToastOptions = {
  icon: SFSymbol;
  label?: string;
  accessibilityLabel?: string;
};

type IslandToastContextValue = {
  showIslandToast: (options: IslandToastOptions) => void;
};

const IslandToastContext = createContext<IslandToastContextValue | null>(null);
const DYNAMIC_ISLAND_WIDTH = 126;
const DYNAMIC_ISLAND_HEIGHT = 36;
const DYNAMIC_ISLAND_TOP = 4;
const ISLAND_MORPH_SPRING = { duration: 500, dampingRatio: 0.82 } as const;

export function useIslandToast() {
  const value = useContext(IslandToastContext);
  if (!value) throw new Error("useIslandToast must be used within IslandToastProvider");
  return value;
}

export function IslandToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<IslandToastState | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (removeTimer.current) clearTimeout(removeTimer.current);
  };

  const showIslandToast = ({ icon, label, accessibilityLabel }: IslandToastOptions) => {
    clearTimers();
    const id = Date.now();
    setToast({
      id,
      icon,
      label,
      accessibilityLabel: accessibilityLabel ?? label ?? "Saved",
      dismissing: false,
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    dismissTimer.current = setTimeout(() => {
      setToast((current) => current?.id === id ? { ...current, dismissing: true } : current);
      removeTimer.current = setTimeout(() => {
        setToast((current) => current?.id === id ? null : current);
      }, 700);
    }, 2300);
  };

  useEffect(() => clearTimers, []);

  return (
    <IslandToastContext.Provider value={{ showIslandToast }}>
      {children}
      {toast ? <IslandToastOverlay key={toast.id} toast={toast} /> : null}
    </IslandToastContext.Provider>
  );
}

function IslandToastOverlay({ toast }: { toast: IslandToastState }) {
  const insets = useSafeAreaInsets();
  const [targetSize, setTargetSize] = useState<{ width: number; height: number } | null>(null);
  const measuredRef = useRef(false);
  const opacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const translateY = useSharedValue(DYNAMIC_ISLAND_TOP - (insets.top - 18));
  const animatedWidth = useSharedValue<number | undefined>(undefined);
  const animatedHeight = useSharedValue<number | undefined>(undefined);
  const iconScale = useSharedValue(0.45);

  useEffect(() => {
    if (!targetSize) return;
    const collapsedTranslateY = DYNAMIC_ISLAND_TOP - (insets.top - 18);

    if (toast.dismissing) {
      contentOpacity.value = withTiming(0, { duration: 90 });
      animatedWidth.value = withSpring(DYNAMIC_ISLAND_WIDTH, ISLAND_MORPH_SPRING);
      animatedHeight.value = withSpring(DYNAMIC_ISLAND_HEIGHT, ISLAND_MORPH_SPRING);
      translateY.value = withSpring(collapsedTranslateY, ISLAND_MORPH_SPRING);
      opacity.value = withDelay(420, withTiming(0, { duration: 80 }));
      return;
    }

    animatedWidth.value = DYNAMIC_ISLAND_WIDTH;
    animatedHeight.value = DYNAMIC_ISLAND_HEIGHT;
    translateY.value = collapsedTranslateY;
    opacity.value = 1;

    animatedWidth.value = withSpring(targetSize.width, ISLAND_MORPH_SPRING);
    animatedHeight.value = withSpring(targetSize.height, ISLAND_MORPH_SPRING);
    translateY.value = withSpring(0, ISLAND_MORPH_SPRING);
    contentOpacity.value = withDelay(75, withTiming(1, { duration: 130 }));
    iconScale.value = withSequence(
      withDelay(70, withTiming(1.18, { duration: 180 })),
      withSpring(1, { damping: 12, stiffness: 300 }),
    );
  }, [animatedHeight, animatedWidth, contentOpacity, iconScale, insets.top, opacity, targetSize, toast.dismissing, toast.id, translateY]);

  const pillStyle = useAnimatedStyle(() => ({
    width: animatedWidth.value,
    height: animatedHeight.value,
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const handleLayout = (event: LayoutChangeEvent) => {
    if (measuredRef.current) return;
    measuredRef.current = true;
    const { width, height } = event.nativeEvent.layout;
    setTargetSize({ width, height });
  };

  const content = (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={[styles.positioner, { top: insets.top - 10 }]}>
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          accessibilityLabel={toast.accessibilityLabel}
          style={[styles.pill, !toast.label && styles.iconOnlyPill, pillStyle]}
          onLayout={handleLayout}
        >
          <Animated.View style={[styles.content, contentStyle]}>
            <Animated.View style={iconStyle}>
              <AppSymbol name={toast.icon} size={21} tintColor="#5EE58C" />
            </Animated.View>
            {toast.label ? <Text numberOfLines={1} style={styles.message}>{toast.label}</Text> : null}
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );

  return Platform.OS === "ios"
    ? <FullWindowOverlay>{content}</FullWindowOverlay>
    : content;
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    height: 46,
    maxWidth: "88%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: "#050505",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  message: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  iconOnlyPill: {
    width: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
  },
});
