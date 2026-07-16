import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemeSet } from "@/components/AppTheme";

export type StoredTheme = ThemeSet & {
  slug: string;
  name: string;
  createdAt: string;
};

export type Preferences = {
  customThemes: StoredTheme[];
  selectedTheme: string;
  hasSkippedOnboarding: boolean;
  textSize: number | null;
  textSpacing: number | null;
  activityView: "grid" | "calendar";
  cashflowCategoryIndex: number | null;
  cashflowQuickFillCategoryIndex: number | null;
  cashflowView: "list" | "calendar";
  currency: string;
  exchangeRates: Record<string, number> | null;
};

const STORAGE_PREFIX = "@ethos/preferences";

const preferenceDefaults: Preferences = {
  customThemes: [],
  selectedTheme: "green",
  hasSkippedOnboarding: false,
  textSize: null,
  textSpacing: null,
  activityView: "grid",
  cashflowCategoryIndex: null,
  cashflowQuickFillCategoryIndex: null,
  cashflowView: "list",
  currency: "IDR",
  exchangeRates: null,
};

function getStorageKey(key: keyof Preferences) {
  return `${STORAGE_PREFIX}/${key}`;
}

export async function getPreference<K extends keyof Preferences>(key: K): Promise<Preferences[K]> {
  const value = await AsyncStorage.getItem(getStorageKey(key));

  if (value === null) {
    return preferenceDefaults[key];
  }

  try {
    return JSON.parse(value) as Preferences[K];
  } catch {
    return preferenceDefaults[key];
  }
}

export async function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<void> {
  await AsyncStorage.setItem(getStorageKey(key), JSON.stringify(value));
}

export async function removePreference(key: keyof Preferences): Promise<void> {
  await AsyncStorage.removeItem(getStorageKey(key));
}

export async function clearPreferences(options?: { preserveOnboarding?: boolean }): Promise<void> {
  const keys = (Object.keys(preferenceDefaults) as (keyof Preferences)[])
    .filter((key) => !options?.preserveOnboarding || key !== "hasSkippedOnboarding")
    .map(getStorageKey);

  await AsyncStorage.multiRemove(keys);
}

export async function getCustomThemes(): Promise<StoredTheme[]> {
  return getPreference("customThemes");
}

export async function saveCustomTheme(theme: StoredTheme): Promise<StoredTheme[]> {
  const themes = await getCustomThemes();
  const nextThemes = [...themes.filter((item) => item.slug !== theme.slug), theme];

  await setPreference("customThemes", nextThemes);

  return nextThemes;
}

export async function deleteCustomTheme(slug: string): Promise<StoredTheme[]> {
  const themes = await getCustomThemes();
  const nextThemes = themes.filter((theme) => theme.slug !== slug);

  await setPreference("customThemes", nextThemes);

  return nextThemes;
}
