import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";

function StepperSlider({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  formatValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  formatValue?: (value: number) => string;
}) {
  const appTheme = useAppTheme();
  const surface = appTheme.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)";
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)";

  const decrement = () => {
    const next = Math.max(min, value - step);
    onValueChange(Number(next.toFixed(2)));
  };

  const increment = () => {
    const next = Math.min(max, value + step);
    onValueChange(Number(next.toFixed(2)));
  };

  const display = formatValue ? formatValue(value) : String(value);

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold" style={{ color: appTheme.colors.muted }}>
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={value <= min}
          onPress={decrement}
          className="h-10 w-10 items-center justify-center rounded-xl border"
          style={{
            backgroundColor: surface,
            borderColor,
            opacity: value <= min ? 0.35 : 1,
          }}
        >
          <Text className="text-lg font-bold" style={{ color: appTheme.colors.primary }}>
            -
          </Text>
        </Pressable>
        <View
          className="h-10 flex-1 items-center justify-center rounded-xl border"
          style={{ backgroundColor: surface, borderColor }}
        >
          <Text className="text-base font-semibold" style={{ color: appTheme.colors.foreground }}>
            {display}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={value >= max}
          onPress={increment}
          className="h-10 w-10 items-center justify-center rounded-xl border"
          style={{
            backgroundColor: surface,
            borderColor,
            opacity: value >= max ? 0.35 : 1,
          }}
        >
          <Text className="text-lg font-bold" style={{ color: appTheme.colors.primary }}>
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function FontSettingsScreen() {
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const [draftTextSize, setDraftTextSize] = useState(appTheme.textSize);
  const [draftTextSpacing, setDraftTextSpacing] = useState(appTheme.textSpacing);
  const draftTextSizeRef = useRef(appTheme.textSize);
  const draftTextSpacingRef = useRef(appTheme.textSpacing);

  useEffect(() => {
    draftTextSizeRef.current = appTheme.textSize;
    queueMicrotask(() => setDraftTextSize(appTheme.textSize));
  }, [appTheme.textSize]);

  useEffect(() => {
    draftTextSpacingRef.current = appTheme.textSpacing;
    queueMicrotask(() => setDraftTextSpacing(appTheme.textSpacing));
  }, [appTheme.textSpacing]);

  const updateDraftTextSize = (value: number) => {
    draftTextSizeRef.current = value;
    setDraftTextSize(value);
  };

  const updateDraftTextSpacing = (value: number) => {
    draftTextSpacingRef.current = value;
    setDraftTextSpacing(value);
  };

  const onReset = () => {
    appTheme.resetTextSettings();
    queueMicrotask(() => {
      setDraftTextSize(appTheme.textSize);
      setDraftTextSpacing(appTheme.textSpacing);
    });
  };

  const surface = appTheme.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)";
  const borderColor = appTheme.isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)";

  return (
    <View
      collapsable={false}
      className={Platform.OS === "android" ? "px-5 pb-4 pt-4" : "flex-1 px-5 pt-4"}
      style={{ backgroundColor: appTheme.colors.background }}
    >
      <Stack.Title>{t("profile.fontSettings")}</Stack.Title>
      <View className="gap-6">
        <StepperSlider
          label={t("profile.textSize")}
          value={draftTextSize}
          min={14}
          max={22}
          step={1}
          onValueChange={(val) => {
            updateDraftTextSize(val);
            appTheme.setTextSize(val);
          }}
          formatValue={(v) => `${v} pt`}
        />
        <StepperSlider
          label={t("profile.textSpacing")}
          value={draftTextSpacing}
          min={-0.5}
          max={1.5}
          step={0.25}
          onValueChange={(val) => {
            updateDraftTextSpacing(val);
            appTheme.setTextSpacing(val);
          }}
          formatValue={(v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onReset}
          className="items-center rounded-2xl border px-6 py-3.5"
          style={{ backgroundColor: surface, borderColor }}
        >
          <Text className="text-base font-semibold" style={{ color: appTheme.colors.primary }}>
            {t("profile.useSystemTextSettings")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
