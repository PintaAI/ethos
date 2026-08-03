import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function OverviewLayout() {
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
