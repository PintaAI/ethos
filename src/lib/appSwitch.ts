import { router } from "expo-router";

import { HOME_SECTION_ROUTES, type HomeSection } from "@/config/homeSections";
import { setPreference } from "@/lib/preferences";

export function switchHomeSection(section: HomeSection) {
  void setPreference("lastHomeSection", section).catch((error) =>
    console.warn("Failed to save home section", error),
  );
  router.replace(HOME_SECTION_ROUTES[section]);
}
