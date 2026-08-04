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
    sheetAllowedDetents: [0.72, 0.92] as [number, number],
    sheetInitialDetentIndex: 0,
    sheetCornerRadius: 28,
    sheetElevation: 24,
    sheetShouldOverflowTopInset: false,
  },
});

const androidSheetOptions = (
  sheetAllowedDetents: "fitToContents" | [number] | [number, number],
  sheetInitialDetentIndex: number | "last" = 0,
) => ({
  presentation: "formSheet" as const,
  headerLargeTitle: false,
  headerTransparent: false,
  sheetAllowedDetents,
  sheetInitialDetentIndex,
  sheetCornerRadius: 28,
  sheetElevation: 24,
  sheetShouldOverflowTopInset: false,
  sheetLargestUndimmedDetentIndex: "none" as const,
  ...(sheetAllowedDetents === "fitToContents" ? { sheetResizeAnimationEnabled: true } : {}),
});

const entryFormOptions = Platform.OS === "ios"
  ? formSheetOptions
  : androidSheetOptions([0.72, 1]);

const walletOptions = Platform.OS === "ios" ? formSheetOptions : androidSheetOptions([0.6, 1]);
const walletDetailOptions = Platform.OS === "ios" ? formSheetOptions : androidSheetOptions([1]);
const categoriesOptions = Platform.OS === "ios"
  ? { ...formSheetOptions, sheetAllowedDetents: [0.9] as [number] }
  : androidSheetOptions([0.9]);
const categoryDetailOptions = Platform.OS === "ios"
  ? { ...formSheetOptions, sheetAllowedDetents: [0.9] as [number] }
  : androidSheetOptions([0.9]);
const categoryEntriesOptions = Platform.OS === "ios"
  ? { ...formSheetOptions, sheetAllowedDetents: [0.72, 0.92] as [number, number] }
  : androidSheetOptions([0.5, 1]);
const transferOptions = Platform.OS === "ios" ? formSheetOptions : androidSheetOptions([0.68, 1]);
const reminderOptions = Platform.OS === "ios" ? formSheetOptions : androidSheetOptions([0.7, 1]);
const auditOptions = Platform.OS === "ios" ? formSheetOptions : androidSheetOptions([0.68, 1]);
const automaticEntryOptions = Platform.OS === "ios" ? formSheetOptions : androidSheetOptions([1]);
const quickFillOptions = Platform.OS === "ios" ? formSheetOptions : androidSheetOptions([1]);

export default function CashflowLayout() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="forms/entry-form" options={entryFormOptions} />
        <Stack.Screen name="forms/wallet" options={walletOptions} />
        <Stack.Screen name="forms/wallet/detail" options={walletDetailOptions} />
        <Stack.Screen name="forms/categories" options={categoriesOptions} />
        <Stack.Screen name="forms/categories/detail" options={categoryDetailOptions} />
        <Stack.Screen name="forms/category-entries" options={categoryEntriesOptions} />
        <Stack.Screen name="forms/transfer" options={transferOptions} />
        <Stack.Screen name="forms/reminder" options={reminderOptions} />
        <Stack.Screen name="forms/audit" options={auditOptions} />
        <Stack.Screen name="forms/automatic-entry" options={automaticEntryOptions} />
        <Stack.Screen name="forms/quick-fill" options={quickFillOptions} />
      </Stack>
    </>
  );
}
