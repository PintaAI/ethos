import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, type Href } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { HOME_SECTION_ROUTES, type HomeSection } from "@/config/homeSections";
import { getPreference } from "@/lib/preferences";

export default function Home() {
  const appTheme = useAppTheme();
  const [loadingPref, setLoadingPref] = useState(true);
  const [hasSkippedOnboarding, setHasSkippedOnboarding] = useState(false);
  const [homeSection, setHomeSection] = useState<HomeSection>("cashflow");

  useEffect(() => {
    Promise.all([
      getPreference("hasSkippedOnboarding"),
      getPreference("lastHomeSection"),
    ])
      .then(([hasSkipped, lastHomeSection]) => {
        setHasSkippedOnboarding(Boolean(hasSkipped));
        setHomeSection(lastHomeSection);
      })
      .catch((error) => console.warn("Failed to load startup preferences", error))
      .finally(() => setLoadingPref(false));
  }, []);

  useEffect(() => {
    if (loadingPref) return;

    router.replace((hasSkippedOnboarding ? HOME_SECTION_ROUTES[homeSection] : "/onboarding") as Href);
  }, [hasSkippedOnboarding, homeSection, loadingPref]);

  return (
    <View className="flex-1 items-center justify-center gap-4 px-5" style={{ backgroundColor: appTheme.colors.background }}>
      <ActivityIndicator color={appTheme.colors.primary} />
      <Text className="text-sm font-semibold" style={appTheme.text.muted}>
        Loading Ethos...
      </Text>
    </View>
  );
}
