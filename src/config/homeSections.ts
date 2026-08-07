import type { Href } from "expo-router";

export type HomeSection = "cashflow" | "lifeflow";

export const HOME_SECTION_ROUTES: Record<HomeSection, Href> = {
  cashflow: "/(cashflow)/(tabs)/home",
  lifeflow: "/(lifeflow)/(tabs)/home",
};
