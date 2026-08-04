import { View } from "react-native";
import { router, Stack } from "expo-router";
import { toolbarIcons } from "@/config/toolbarIcons";
import { useAppTheme } from "@/components/provider/AppTheme";
import { ProfileContent } from "@/components/profile/ProfileContent";

export default function Profile() {
  const appTheme = useAppTheme();

  return (
    <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
      <Stack.Screen
        options={{
          title: "Settings",
          contentStyle: { backgroundColor: appTheme.colors.background },
          headerStyle: { backgroundColor: appTheme.colors.background },
          headerTintColor: appTheme.colors.foreground,
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={toolbarIcons.close} accessibilityLabel="Close" tintColor={appTheme.colors.foreground} onPress={() => router.back()} />
      </Stack.Toolbar>
      <ProfileContent />
    </View>
  );
}
