import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function ScheduleLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        headerTransparent: Platform.OS === "ios",
        headerShadowVisible: false,
      }}
    />
  );
}
