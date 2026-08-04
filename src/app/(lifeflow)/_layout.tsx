import { Stack } from "expo-router";
import { Platform } from "react-native";

const formSheetOptions = Platform.select({
  ios: {
    presentation: "formSheet" as const,
    headerLargeTitle: false,
    headerTransparent: true,
    sheetAllowedDetents: "fitToContents" as const,
    sheetExpandsWhenScrolledToEdge: false,
    sheetGrabberVisible: true,
  },
  default: {
    presentation: "formSheet" as const,
    headerLargeTitle: false,
    headerTransparent: false,
    sheetAllowedDetents: "fitToContents" as const,
    sheetInitialDetentIndex: 0,
    sheetCornerRadius: 28,
    sheetElevation: 24,
    sheetShouldOverflowTopInset: false,
    sheetLargestUndimmedDetentIndex: "none" as const,
    sheetResizeAnimationEnabled: true,
  },
});

const dayPresetFormSheetOptions = {
  ...formSheetOptions,
  sheetAllowedDetents: [0.6, 1] as [number, number],
  sheetInitialDetentIndex: 0,
};

export default function LifeFlowLayout() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <Stack
        screenOptions={{
          headerLargeTitle: false,
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="forms/journal-settings" options={formSheetOptions} />
        <Stack.Screen name="forms/habit-add" options={formSheetOptions} />
        <Stack.Screen name="forms/schedule-block" options={formSheetOptions} />
        <Stack.Screen name="forms/day-preset" options={dayPresetFormSheetOptions} />
      </Stack>
    </>
  );
}
