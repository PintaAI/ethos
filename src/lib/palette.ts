import { getColors, type ImageColorsResult } from "react-native-image-colors";
import type { ThemeSet } from "@/components/provider/AppTheme";

export type ExtractedColors = {
  primary: string;
  secondary: string;
  muted: string;
  background: string;
  foreground: string;
};

export type ExtractedPalette = {
  colors: ExtractedColors;
  debugColors: Record<string, string>;
  platform: ImageColorsResult["platform"];
};

function normalizeHex(hex: string | undefined, fallback: string) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;

  return hex.toLowerCase();
}

function adjustHex(hex: string, amount: number) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;

  const red = Math.max(0, Math.min(255, Number.parseInt(value.slice(0, 2), 16) + amount));
  const green = Math.max(0, Math.min(255, Number.parseInt(value.slice(2, 4), 16) + amount));
  const blue = Math.max(0, Math.min(255, Number.parseInt(value.slice(4, 6), 16) + amount));

  return `#${((red << 16) | (green << 8) | blue).toString(16).padStart(6, "0")}`;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");

  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${((Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue)).toString(16).padStart(6, "0")}`;
}

function rgbToHsl(hex: string) {
  const { red, green, blue } = hexToRgb(hex);
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    if (max === g) hue = (b - r) / delta + 2;
    if (max === b) hue = (r - g) / delta + 4;
  }

  return {
    hue: Math.round(hue * 60 + (hue < 0 ? 360 : 0)),
    saturation,
    lightness,
  };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return rgbToHex((red + match) * 255, (green + match) * 255, (blue + match) * 255);
}

function mixHex(from: string, to: string, amount: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);

  return rgbToHex(
    start.red + (end.red - start.red) * amount,
    start.green + (end.green - start.green) * amount,
    start.blue + (end.blue - start.blue) * amount,
  );
}

function getRelativeLuminance(hex: string) {
  const { red, green, blue } = hexToRgb(hex);
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function getContrastRatio(first: string, second: string) {
  const lighter = Math.max(getRelativeLuminance(first), getRelativeLuminance(second));
  const darker = Math.min(getRelativeLuminance(first), getRelativeLuminance(second));

  return (lighter + 0.05) / (darker + 0.05);
}

function getHueDistance(first: string, second: string) {
  const firstHue = rgbToHsl(first).hue;
  const secondHue = rgbToHsl(second).hue;
  const distance = Math.abs(firstHue - secondHue);

  return Math.min(distance, 360 - distance) / 180;
}

function createMutedFromPrimary(primary: string) {
  const hsl = rgbToHsl(primary);

  return hslToHex(hsl.hue, hsl.saturation * 0.28, Math.min(0.62, Math.max(0.42, hsl.lightness + 0.08)));
}

function createLightBackground(primary: string) {
  return mixHex(primary, "#ffffff", 0.92);
}

function ensureLightPrimaryVisible(primary: string) {
  let hsl = rgbToHsl(primary);
  let adjustedPrimary = primary;

  while (getContrastRatio(adjustedPrimary, "#ffffff") < 4.5 && hsl.lightness > 0.18) {
    hsl = { ...hsl, lightness: Math.max(0.18, hsl.lightness - 0.04) };
    adjustedPrimary = hslToHex(hsl.hue, hsl.saturation, hsl.lightness);
  }

  return adjustedPrimary;
}

function ensureDarkPrimaryVisible(primary: string) {
  let hsl = rgbToHsl(primary);
  let adjustedPrimary = primary;

  while (getContrastRatio(adjustedPrimary, "#000000") < 4.5 && hsl.lightness < 0.82) {
    hsl = { ...hsl, lightness: Math.min(0.82, hsl.lightness + 0.04) };
    adjustedPrimary = hslToHex(hsl.hue, hsl.saturation, hsl.lightness);
  }

  return adjustedPrimary;
}

function createDarkBackground(primary: string) {
  return mixHex(primary, "#000000", 0.88);
}

function createLightForeground(primary: string) {
  return mixHex(primary, "#000000", 0.82);
}

function createDarkForeground(primary: string) {
  return mixHex(primary, "#ffffff", 0.88);
}

function pickSecondary(primary: string, candidates: string[]) {
  const usableCandidates = candidates.filter((candidate) => candidate !== primary);

  return usableCandidates.reduce(
    (best, candidate) => {
      const hsl = rgbToHsl(candidate);
      const score = getHueDistance(primary, candidate) * 2 + Math.min(getContrastRatio(primary, candidate) / 7, 1) + hsl.saturation;

      return score > best.score ? { color: candidate, score } : best;
    },
    { color: adjustHex(primary, 42), score: 0 },
  ).color;
}

function getValidResultColors(result: ImageColorsResult) {
  return Object.values(result).filter((value): value is string => /^#[0-9a-f]{6}$/i.test(String(value))).map((color) => color.toLowerCase());
}

function pickColors(result: ImageColorsResult): ExtractedColors {
  const candidates = getValidResultColors(result);

  if (result.platform === "ios") {
    const primary = ensureLightPrimaryVisible(normalizeHex(result.primary, "#3b82f6"));
    const secondary = pickSecondary(primary, candidates);

    return {
      primary,
      secondary,
      muted: createMutedFromPrimary(primary),
      background: createLightBackground(primary),
      foreground: createLightForeground(primary),
    };
  }

  const primary = ensureLightPrimaryVisible(normalizeHex(result.dominant, "#3b82f6"));
  const secondary = pickSecondary(primary, candidates);

  return {
    primary,
    secondary,
    muted: createMutedFromPrimary(primary),
    background: createLightBackground(primary),
    foreground: createLightForeground(primary),
  };
}

export async function extractColors(uri: string, headers?: Record<string, string>): Promise<ExtractedColors> {
  const result = await getColors(uri, {
    cache: true,
    fallback: "#3b82f6",
    ...(headers ? { headers } : {}),
    pixelSpacing: 8,
    quality: "low",
  });

  return pickColors(result);
}

export async function extractPalette(uri: string, headers?: Record<string, string>): Promise<ExtractedPalette> {
  const result = await getColors(uri, {
    cache: true,
    fallback: "#3b82f6",
    ...(headers ? { headers } : {}),
    pixelSpacing: 8,
    quality: "low",
  });
  const debugColors = Object.fromEntries(
    Object.entries(result).filter((entry): entry is [string, string] => /^#[0-9a-f]{6}$/i.test(String(entry[1]))),
  );

  return {
    colors: pickColors(result),
    debugColors,
    platform: result.platform,
  };
}

export function colorsToThemeSet(colors: ExtractedColors): ThemeSet {
  const lightPrimary = ensureLightPrimaryVisible(colors.primary);
  const darkPrimary = ensureDarkPrimaryVisible(mixHex(lightPrimary, "#ffffff", 0.28));

  return {
    light: {
      "--color-primary": lightPrimary,
      "--color-secondary": colors.secondary,
      "--color-muted": colors.muted,
      "--color-background": createLightBackground(lightPrimary),
      "--color-foreground": createLightForeground(lightPrimary),
    },
    dark: {
      "--color-primary": darkPrimary,
      "--color-secondary": mixHex(colors.secondary, "#ffffff", 0.22),
      "--color-muted": mixHex(colors.muted, "#ffffff", 0.3),
      "--color-background": createDarkBackground(lightPrimary),
      "--color-foreground": createDarkForeground(lightPrimary),
    },
  };
}
