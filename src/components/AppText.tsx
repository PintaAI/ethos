import { Text, StyleSheet, type TextProps, type TextStyle } from "react-native";
import { useAppTheme } from "@/components/provider/AppTheme";

type AppTextProps = TextProps & {
  className?: string;
};

const textScale = {
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

const trackingOffset = {
  tighter: -0.8,
  tight: -0.4,
  normal: 0,
  wide: 0.4,
  wider: 0.8,
  widest: 1.6,
} satisfies Record<string, number>;

function getClassToken(className: string | undefined, prefix: string) {
  return className?.split(/\s+/).find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function getTextSize(className: string | undefined, baseSize: number) {
  const token = getClassToken(className, "text-");

  if (!token || token.startsWith("[") || !(token in textScale)) {
    return undefined;
  }

  return Number((baseSize * textScale[token as keyof typeof textScale]).toFixed(3));
}

function getLetterSpacing(className: string | undefined, baseSpacing: number) {
  const token = getClassToken(className, "tracking-");

  if (!token) {
    return baseSpacing;
  }

  if (token.startsWith("[") && token.endsWith("px]")) {
    const value = Number(token.slice(1, -3));
    return Number.isFinite(value) ? baseSpacing + value : baseSpacing;
  }

  if (token in trackingOffset) {
    return baseSpacing + trackingOffset[token as keyof typeof trackingOffset];
  }

  return baseSpacing;
}

export function AppText({ className, style, ...props }: AppTextProps) {
  const appTheme = useAppTheme();
  const flatStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const themedStyle: TextStyle = {
    letterSpacing: getLetterSpacing(className, appTheme.textSpacing),
  };
  const classFontSize = getTextSize(className, appTheme.textSize);
  const fontSize = classFontSize ?? flatStyle?.fontSize ?? appTheme.textSize;

  if (classFontSize !== undefined) {
    themedStyle.fontSize = fontSize;
  } else if (flatStyle?.fontSize === undefined) {
    themedStyle.fontSize = fontSize;
  }

  if (flatStyle?.lineHeight === undefined) {
    themedStyle.lineHeight = Math.ceil(fontSize * 1.18);
  }

  return <Text className={className} style={[style, themedStyle]} {...props} />;
}
