import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import { VariableContextProvider } from "nativewind";
import { mix } from "@/lib/color";
import {
  deleteCustomTheme,
  getCustomThemes,
  getPreference,
  saveCustomTheme,
  setPreference,
  type StoredTheme,
} from "@/lib/preferences";

export type ThemeName = "default" | "sweet" | (string & {});
export type ThemeVars = Record<string, string>;
export type AppColorScheme = "light" | "dark";

export type ThemeSet = {
  light: ThemeVars;
  dark: ThemeVars;
};

export type ThemeMeta = {
  slug: ThemeName;
  name: string;
  isCustom: boolean;
};

const SYSTEM_TEXT_SIZE = 17;
const SYSTEM_TEXT_SPACING = 0;

const textTokenRatios = {
  xs: 0.75,
  sm: 0.875,
  base: 1,
  lg: 1.1363636364,
  xl: 1.25,
  "2xl": 1.5,
  "3xl": 1.875,
  "4xl": 2.25,
  "5xl": 3,
  "6xl": 3.75,
} satisfies Record<string, number>;

const trackingTokenOffsets = {
  tighter: -0.8,
  tight: -0.4,
  normal: 0,
  wide: 0.4,
  wider: 0.8,
  widest: 1.6,
} satisfies Record<string, number>;

function createTextVars(textSize: number, textSpacing: number) {
  return {
    ...Object.fromEntries(
      Object.entries(textTokenRatios).map(([token, ratio]) => [`--app-text-${token}`, `${Number((textSize * ratio).toFixed(3))}px`]),
    ),
    ...Object.fromEntries(
      Object.entries(trackingTokenOffsets).map(([token, offset]) => [`--app-tracking-${token}`, `${Number((textSpacing + offset).toFixed(3))}px`]),
    ),
  };
}

function createColorVars(colors: ReturnType<typeof createColorTokens>) {
  return {
    "--app-color-primary": colors.primary,
    "--app-color-secondary": colors.secondary,
    "--app-color-muted": colors.muted,
    "--app-color-background": colors.background,
    "--app-color-foreground": colors.foreground,
    "--app-color-inverse-foreground": colors.inverseForeground,
    "--app-color-positive": colors.positive,
    "--app-color-negative": colors.negative,
  };
}

function createColorTokens(colorVars: ThemeVars, resolvedScheme: AppColorScheme) {
  const primary = colorVars["--color-primary"];

  return {
    primary,
    secondary: colorVars["--color-secondary"],
    muted: colorVars["--color-muted"],
    background: colorVars["--color-background"],
    foreground: colorVars["--color-foreground"],
    inverseForeground: resolvedScheme === "dark" ? "#000000" : "#ffffff",
    overlay: resolvedScheme === "dark" ? "rgba(0,0,0,0.28)" : "rgba(15,23,42,0.16)",
    switchTrackOff: resolvedScheme === "dark" ? "#3a3a3c" : "#d1d5db",
    switchThumb: "#ffffff",
    positive: mix(primary, "#16a34a", 0.85),
    negative: mix(primary, "#dc2626", 0.85),
  };
}

const builtInThemes: Record<"default" | "sweet", ThemeSet> = {
  default: {
    light: {
      "--color-primary": "#2e3f55",
      "--color-secondary": "#a855f7",
      "--color-muted": "#64748b",
      "--color-background": "#f7fdf9",
      "--color-foreground": "#000000",
    },
    dark: {
      "--color-primary": "#b6bdca",
      "--color-secondary": "#c084fc",
      "--color-muted": "#a1a1aa",
      "--color-background": "#060d08",
      "--color-foreground": "#ffffff",
    },
  },
  sweet: {
    light: {
      "--color-primary": "#3b82f6",
      "--color-secondary": "#8b5cf6",
      "--color-muted": "#64748b",
      "--color-background": "#f7f8fd",
      "--color-foreground": "#000000",
    },
    dark: {
      "--color-primary": "#60a5fa",
      "--color-secondary": "#a78bfa",
      "--color-muted": "#a1a1aa",
      "--color-background": "#06080d",
      "--color-foreground": "#ffffff",
    },
  },
};

const builtInThemeMeta: ThemeMeta[] = [
  { slug: "default", name: "Default", isCustom: false },
  { slug: "sweet", name: "Sweet", isCustom: false },
];

type AppThemeContextValue = ReturnType<typeof createAppThemeValue>;

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function createAppThemeValue(
  theme: ThemeName,
  setTheme: (theme: ThemeName) => void,
  colorScheme: AppColorScheme,
  setColorScheme: (colorScheme: AppColorScheme) => void,
  textSizeOverride: number | null,
  setTextSize: (textSize: number) => void,
  textSpacingOverride: number | null,
  setTextSpacing: (textSpacing: number) => void,
  resetTextSettings: () => void,
  allThemes: Record<string, ThemeSet>,
  availableThemes: ThemeMeta[],
  customThemes: StoredTheme[],
  saveTheme: (name: string, themeSet: ThemeSet) => Promise<StoredTheme>,
  deleteTheme: (slug: string) => Promise<void>,
) {
  const resolvedScheme = colorScheme;
  const textSize = textSizeOverride ?? SYSTEM_TEXT_SIZE;
  const textSpacing = textSpacingOverride ?? SYSTEM_TEXT_SPACING;
  const colorVars = (allThemes[theme] ?? builtInThemes.default)[resolvedScheme];
  const colors = createColorTokens(colorVars, resolvedScheme);
  const vars = {
    ...createColorVars(colors),
    ...(textSizeOverride === null && textSpacingOverride === null ? {} : createTextVars(textSize, textSpacing)),
  };

  return {
    theme,
    setTheme,
    setColorScheme,
    textSize,
    setTextSize,
    textSpacing,
    setTextSpacing,
    resetTextSettings,
    usesSystemTextSettings: textSizeOverride === null && textSpacingOverride === null,
    colorScheme,
    resolvedScheme,
    isDark: resolvedScheme === "dark",
    availableThemes,
    customThemes,
    saveTheme,
    deleteTheme,
    vars,
    tokens: {
      colors,
      textSize,
      textSpacing,
      vars,
    },
    colors,
    text: {
      body: { color: colors.foreground, fontSize: textSize, letterSpacing: textSpacing },
      muted: { color: colors.muted, fontSize: textSize, letterSpacing: textSpacing },
      caption: { color: colors.muted, fontSize: textSize - 4, letterSpacing: textSpacing },
      footer: { color: colors.muted, fontSize: textSize - 4, letterSpacing: textSpacing },
      value: { color: colors.muted, fontSize: textSize - 1, letterSpacing: textSpacing },
      chevron: { color: colors.muted, fontSize: textSize, letterSpacing: textSpacing },
      selected: { color: colors.primary, fontSize: textSize, letterSpacing: textSpacing },
    },
    switch: {
      trackColor: { false: colors.switchTrackOff, true: colors.primary },
      thumbColor: colors.switchThumb,
      iosBackgroundColor: colors.switchTrackOff,
    },
  };
}

function slugifyThemeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "theme";
}

function createUniqueSlug(name: string, takenSlugs: string[]) {
  const baseSlug = slugifyThemeName(name);
  const taken = new Set(takenSlugs);

  if (!taken.has(baseSlug)) return baseSlug;

  let index = 2;
  while (taken.has(`${baseSlug}-${index}`)) {
    index += 1;
  }

  return `${baseSlug}-${index}`;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>("default");
  const [customThemes, setCustomThemes] = useState<StoredTheme[]>([]);
  const [textSize, setTextSize] = useState<number | null>(null);
  const [textSpacing, setTextSpacing] = useState<number | null>(null);
  const [colorScheme, setColorSchemeState] = useState<AppColorScheme>(() =>
    Appearance.getColorScheme() === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    let isMounted = true;

    async function loadThemePreferences() {
      const [savedTheme, savedCustomThemes, savedTextSize, savedTextSpacing] = await Promise.all([
        getPreference("selectedTheme"),
        getCustomThemes(),
        getPreference("textSize"),
        getPreference("textSpacing"),
      ]);

      if (!isMounted) return;

      const hasTheme = savedTheme in builtInThemes || savedCustomThemes.some((item) => item.slug === savedTheme);

      setCustomThemes(savedCustomThemes);
      setTheme(hasTheme ? savedTheme : "default");
      setTextSize(savedTextSize);
      setTextSpacing(savedTextSpacing);
    }

    void loadThemePreferences()
      .catch((error) => console.warn("Failed to load theme preferences", error));

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme: nextColorScheme }) => {
      setColorSchemeState(nextColorScheme === "dark" ? "dark" : "light");
    });

    return () => subscription.remove();
  }, []);

  const setColorScheme = (nextColorScheme: AppColorScheme) => {
    setColorSchemeState(nextColorScheme);

    requestAnimationFrame(() => {
      Appearance.setColorScheme(nextColorScheme);
    });
  };

  const setPersistedTheme = (nextTheme: ThemeName) => {
    setTheme(nextTheme);
    void setPreference("selectedTheme", nextTheme)
      .catch((error) => console.warn("Failed to save theme", error));
  };

  const setPersistedTextSize = (nextTextSize: number) => {
    setTextSize(nextTextSize);
    void setPreference("textSize", nextTextSize)
      .catch((error) => console.warn("Failed to save text size", error));
  };

  const setPersistedTextSpacing = (nextTextSpacing: number) => {
    setTextSpacing(nextTextSpacing);
    void setPreference("textSpacing", nextTextSpacing)
      .catch((error) => console.warn("Failed to save text spacing", error));
  };

  const resetTextSettings = () => {
    setTextSize(null);
    setTextSpacing(null);
    void Promise.all([setPreference("textSize", null), setPreference("textSpacing", null)])
      .catch((error) => console.warn("Failed to reset text settings", error));
  };

  const saveTheme = async (name: string, themeSet: ThemeSet) => {
    const slug = createUniqueSlug(name, [...Object.keys(builtInThemes), ...customThemes.map((item) => item.slug)]);
    const storedTheme: StoredTheme = {
      slug,
      name: name.trim() || "Untitled Theme",
      createdAt: new Date().toISOString(),
      ...themeSet,
    };
    const nextCustomThemes = await saveCustomTheme(storedTheme);

    setCustomThemes(nextCustomThemes);
    setPersistedTheme(storedTheme.slug);

    return storedTheme;
  };

  const deleteTheme = async (slug: string) => {
    const nextCustomThemes = await deleteCustomTheme(slug);

    setCustomThemes(nextCustomThemes);

    if (theme === slug) {
      setPersistedTheme("default");
    }
  };

  const allThemes = customThemes.reduce<Record<string, ThemeSet>>(
    (result, customTheme) => ({
      ...result,
      [customTheme.slug]: {
        light: customTheme.light,
        dark: customTheme.dark,
      },
    }),
    { ...builtInThemes },
  );
  const availableThemes: ThemeMeta[] = [
    ...builtInThemeMeta,
    ...customThemes.map((customTheme) => ({
      slug: customTheme.slug,
      name: customTheme.name,
      isCustom: true,
    })),
  ];

  const value = createAppThemeValue(
    theme,
    setPersistedTheme,
    colorScheme,
    setColorScheme,
    textSize,
    setPersistedTextSize,
    textSpacing,
    setPersistedTextSpacing,
    resetTextSettings,
    allThemes,
    availableThemes,
    customThemes,
    saveTheme,
    deleteTheme,
  );

  return (
    <AppThemeContext value={value}>
      <VariableContextProvider value={value.vars}>{children}</VariableContextProvider>
    </AppThemeContext>
  );
}

export function useAppTheme() {
  const value = use(AppThemeContext);

  if (!value) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }

  return value;
}
