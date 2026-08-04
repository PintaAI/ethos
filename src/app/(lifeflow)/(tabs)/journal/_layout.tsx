import { Stack } from "expo-router";
import { Platform } from "react-native";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function JournalStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        headerTransparent: Platform.OS === "ios",
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerLargeTitle: false }} />
      <Stack.Screen
        name="detail"
        options={{
          headerLargeTitle: false,
          headerTransparent: false,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
