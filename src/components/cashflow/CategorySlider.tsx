import { useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { Pressable, type ScrollView, View, useWindowDimensions } from "react-native";
import type { SFSymbol } from "expo-symbols";
import { useTranslation } from "react-i18next";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";

import { AppText as Text } from "@/components/AppText";
import { AppSymbol } from "@/components/AppSymbol";
import { useAppTheme } from "@/components/AppTheme";
import { alpha } from "@/lib/color";

export const CATEGORY_CHIP_WIDTH = 94;
export const CATEGORY_CHIP_GAP = 8;
export const CATEGORY_CHIP_SNAP = CATEGORY_CHIP_WIDTH + CATEGORY_CHIP_GAP;

export type CategoryOption = {
  id: string | null;
  name: string;
  symbol: SFSymbol;
  color: string;
};

export interface CategorySliderHandle {
  scrollToIndex: (index: number, animated?: boolean) => void;
}

function getCategoryIndexFromOffset(offsetX: number, snapWidth: number, maxIndex: number) {
  return Math.min(Math.max(Math.round(offsetX / snapWidth), 0), maxIndex);
}

function useChipInputRange(index: number) {
  return useMemo(
    () => [
      (index - 1) * CATEGORY_CHIP_SNAP,
      index * CATEGORY_CHIP_SNAP,
      (index + 1) * CATEGORY_CHIP_SNAP,
    ],
    [index],
  );
}

function CategoryChip({
  item,
  index,
  scrollX,
  isActive,
  dark,
  onPress,
}: {
  item: CategoryOption;
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
  dark: boolean;
  onPress: () => void;
}) {
  const inputRange = useChipInputRange(index);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, inputRange, [0.68, 1, 0.68], "clamp"),
    transform: [
      { translateY: interpolate(scrollX.value, inputRange, [5, -2, 5], "clamp") },
      { scale: interpolate(scrollX.value, inputRange, [0.9, 1.08, 0.9], "clamp") },
    ],
  }));

  return (
    <Animated.View style={[{ marginRight: CATEGORY_CHIP_GAP, width: CATEGORY_CHIP_WIDTH }, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="items-center justify-center rounded-2xl"
        style={{
          paddingVertical: 13,
          backgroundColor: isActive ? item.color : alpha(item.color, dark ? 0.14 : 0.09),
        }}
      >
        <AppSymbol
          name={item.symbol}
          size={20}
          tintColor={isActive ? "#fff" : item.color}
          fallback={<Text style={{ color: isActive ? "#fff" : item.color }}>•</Text>}
        />
        <Text className="mt-1 text-xs font-medium" style={{ color: isActive ? "#fff" : item.color }}>
          {item.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function AddCategoryChip({
  index,
  scrollX,
  primaryColor,
  dark,
  onPress,
  label,
}: {
  index: number;
  scrollX: SharedValue<number>;
  primaryColor: string;
  dark: boolean;
  onPress: () => void;
  label: string;
}) {
  const inputRange = useChipInputRange(index);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, inputRange, [0.68, 1, 0.68], "clamp"),
    transform: [
      { translateY: interpolate(scrollX.value, inputRange, [5, -2, 5], "clamp") },
      { scale: interpolate(scrollX.value, inputRange, [0.9, 1.08, 0.9], "clamp") },
    ],
  }));

  return (
    <Animated.View style={[{ width: CATEGORY_CHIP_WIDTH }, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="items-center justify-center rounded-2xl border border-dashed"
        style={{
          paddingVertical: 13,
          borderColor: alpha(primaryColor, 0.45),
          backgroundColor: alpha(primaryColor, dark ? 0.13 : 0.08),
        }}
      >
        <AppSymbol
          name="plus"
          size={20}
          tintColor={primaryColor}
          fallback={<Text style={{ color: primaryColor }}>+</Text>}
        />
        <Text className="mt-1 text-xs font-semibold" style={{ color: primaryColor }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function CategoryDot({
  index,
  scrollX,
  activeColor,
  inactiveColor,
}: {
  index: number;
  scrollX: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
}) {
  const inputRange = useChipInputRange(index);

  const animatedStyle = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, inputRange, [6, 20, 6], "clamp"),
    backgroundColor: interpolateColor(scrollX.value, inputRange, [inactiveColor, activeColor, inactiveColor]),
    opacity: interpolate(scrollX.value, inputRange, [0.35, 1, 0.35], "clamp"),
  }));

  return <Animated.View className="rounded-full" style={[{ height: 6 }, animatedStyle]} />;
}

export const CategorySlider = forwardRef<CategorySliderHandle, {
  categories: CategoryOption[];
  selectedIndex: number;
  onChangeIndex: (index: number) => void;
  showAddButton?: boolean;
  onAddPress?: () => void;
  showDots?: boolean;
  onFeedback?: () => void;
  onUserInteraction?: () => void;
}>(({
  categories,
  selectedIndex,
  onChangeIndex,
  showAddButton = false,
  onAddPress,
  showDots = true,
  onFeedback,
  onUserInteraction,
}, ref) => {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const maxSnapIndex = categories.length + (showAddButton ? 1 : 0) - 1;

  const neutralOffset = Math.floor(categories.length / 2) * CATEGORY_CHIP_SNAP;
  const initialOffset = selectedIndex >= 0 ? selectedIndex * CATEGORY_CHIP_SNAP : neutralOffset;
  const lastSnappedRef = useRef(selectedIndex >= 0 ? selectedIndex : Math.floor(categories.length / 2));
  const scrollX = useSharedValue(initialOffset);

  const snapOffsets = useMemo(() => {
    const total = categories.length + (showAddButton ? 1 : 0);
    return Array.from({ length: total }, (_, i) => i * CATEGORY_CHIP_SNAP);
  }, [categories.length, showAddButton]);

  const carouselW = Math.max(screenWidth - 32, CATEGORY_CHIP_WIDTH);
  const sidePad = carouselW / 2 - CATEGORY_CHIP_WIDTH / 2;
  const addCategoryIndex = categories.length;

  const settle = useCallback((offsetX: number, animated = false) => {
    const nextIndex = getCategoryIndexFromOffset(offsetX, CATEGORY_CHIP_SNAP, maxSnapIndex);
    lastSnappedRef.current = nextIndex;
    if (nextIndex < categories.length) {
      onChangeIndex(nextIndex);
    }
    const nextOffsetX = nextIndex * CATEGORY_CHIP_SNAP;
    if (animated || Math.abs(offsetX - nextOffsetX) > 0.5) {
      scrollRef.current?.scrollTo({ x: nextOffsetX, animated });
    }
  }, [categories.length, maxSnapIndex, onChangeIndex]);

  const notifyChange = useCallback((nextIndex: number) => {
    if (nextIndex === lastSnappedRef.current) return;
    lastSnappedRef.current = nextIndex;
    if (nextIndex < categories.length) {
      onChangeIndex(nextIndex);
    }
    onFeedback?.();
  }, [categories.length, onChangeIndex, onFeedback]);

  useAnimatedReaction(
    () => Math.min(Math.max(Math.round(scrollX.value / CATEGORY_CHIP_SNAP), 0), maxSnapIndex),
    (cur, prev) => {
      if (cur !== prev) {
        runOnJS(notifyChange)(cur);
      }
    },
    [maxSnapIndex, notifyChange, scrollX],
  );

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number, animated = true) => {
      if (index < 0) return;
      const offset = index * CATEGORY_CHIP_SNAP;
      lastSnappedRef.current = index;
      scrollRef.current?.scrollTo({ x: offset, animated });
    },
  }), []);

  const handleChipPress = useCallback((index: number) => {
    onUserInteraction?.();
    onFeedback?.();
    onChangeIndex(index);
    scrollRef.current?.scrollTo({ x: index * CATEGORY_CHIP_SNAP, animated: true });
  }, [onChangeIndex, onFeedback, onUserInteraction]);

  const handleAddPress = useCallback(() => {
    onFeedback?.();
    scrollRef.current?.scrollTo({ x: addCategoryIndex * CATEGORY_CHIP_SNAP, animated: true });
    onAddPress?.();
  }, [addCategoryIndex, onAddPress, onFeedback]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: (event) => {
      runOnJS(settle)(event.contentOffset.x);
    },
    onEndDrag: (event) => {
      const velocity = (event as { velocity?: { x: number } }).velocity;
      if (Math.abs(velocity?.x ?? 0) < 0.1) {
        runOnJS(settle)(event.contentOffset.x, true);
      }
    },
  });

  return (
    <View style={{ overflow: "visible" }}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        disableIntervalMomentum
        overScrollMode="never"
        removeClippedSubviews={false}
        showsHorizontalScrollIndicator={false}
        snapToOffsets={snapOffsets}
        decelerationRate="fast"
        style={{ overflow: "visible" }}
        onScroll={scrollHandler}
        onScrollBeginDrag={onUserInteraction}
        contentContainerStyle={{ paddingHorizontal: sidePad }}
      >
        {categories.map((item, index) => (
          <CategoryChip
            key={item.name}
            item={item}
            index={index}
            scrollX={scrollX}
            isActive={selectedIndex === index}
            dark={appTheme.isDark}
            onPress={() => handleChipPress(index)}
          />
        ))}
        {showAddButton ? (
          <AddCategoryChip
            index={addCategoryIndex}
            scrollX={scrollX}
            primaryColor={appTheme.colors.primary}
            dark={appTheme.isDark}
            onPress={handleAddPress}
            label={t("entry.kategori")}
          />
        ) : null}
      </Animated.ScrollView>
      {showDots ? (
        <View className="flex-row items-center justify-center gap-1.5 pt-2">
          {categories.map((item, index) => (
            <CategoryDot
              key={item.name}
              index={index}
              scrollX={scrollX}
              activeColor={item.color}
              inactiveColor={appTheme.colors.muted}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

CategorySlider.displayName = "CategorySlider";
