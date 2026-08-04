import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, type Href } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { getPreference } from "@/lib/preferences";

export default function Home() {
  const appTheme = useAppTheme();
  const [loadingPref, setLoadingPref] = useState(true);
  const [hasSkippedOnboarding, setHasSkippedOnboarding] = useState(false);

  useEffect(() => {
    getPreference("hasSkippedOnboarding")
      .then((value) => setHasSkippedOnboarding(Boolean(value)))
      .catch((error) => console.warn("Failed to load onboarding preference", error))
      .finally(() => setLoadingPref(false));
  }, []);

  useEffect(() => {
    if (loadingPref) return;

    router.replace((hasSkippedOnboarding ? "/home" : "/onboarding") as Href);
  }, [hasSkippedOnboarding, loadingPref]);

  return (
    <View className="flex-1 items-center justify-center gap-4 px-5" style={{ backgroundColor: appTheme.colors.background }}>
      <ActivityIndicator color={appTheme.colors.primary} />
      <Text className="text-sm font-semibold" style={appTheme.text.muted}>
        Loading Ethos...
      </Text>
    </View>
  );
}
