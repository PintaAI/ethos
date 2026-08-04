import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, Host, Image, Label, Slider, VStack } from "@expo/ui/swift-ui";
import {
  environment,
  font,
  frame,
  kerning,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useAppTheme } from "@/components/provider/AppTheme";

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

  const commitDraftTextSize = (isEditing: boolean) => {
    if (!isEditing) {
      appTheme.setTextSize(draftTextSizeRef.current);
    }
  };

  const commitDraftTextSpacing = (isEditing: boolean) => {
    if (!isEditing) {
      appTheme.setTextSpacing(draftTextSpacingRef.current);
    }
  };

  const onReset = () => {
    appTheme.resetTextSettings();
    queueMicrotask(() => {
      setDraftTextSize(appTheme.textSize);
      setDraftTextSpacing(appTheme.textSpacing);
    });
  };

  return (
    <View collapsable={false} style={{ width: "100%" }}>
      <Stack.Title>{t("profile.fontSettings")}</Stack.Title>
      <Host
        matchContents={{ vertical: true }}
        style={{ width: "100%" }}
        modifiers={[
          environment("colorScheme", appTheme.resolvedScheme),
          ...(appTheme.usesSystemTextSettings ? [] : [font({ size: appTheme.textSize }), kerning(appTheme.textSpacing)]),
        ]}
      >
        <VStack
          alignment="leading"
          spacing={12}
          modifiers={[padding({ top: 20, bottom: 26, horizontal: 20 })]}
        >
          <Label
            title={t("profile.textSize")}
            icon={<Image systemName="textformat.size" size={15} color={appTheme.colors.primary} />}
          />
          <Slider
            value={draftTextSize}
            min={14}
            max={22}
            step={1}
            onValueChange={updateDraftTextSize}
            onEditingChanged={commitDraftTextSize}
            modifiers={[frame({ height: 32 }), tint(appTheme.colors.primary)]}
          />
          <Label
            title={t("profile.textSpacing")}
            icon={<Image systemName="text.alignleft" size={15} color={appTheme.colors.primary} />}
          />
          <Slider
            value={draftTextSpacing}
            min={-0.5}
            max={1.5}
            step={0.25}
            onValueChange={updateDraftTextSpacing}
            onEditingChanged={commitDraftTextSpacing}
            modifiers={[frame({ height: 32 }), tint(appTheme.colors.primary)]}
          />
          <Button
            onPress={onReset}
            modifiers={[padding({ top: 8 }), tint(appTheme.colors.primary)]}
          >
            <Label
              title={t("profile.useSystemTextSettings")}
              icon={<Image systemName="textformat.size" size={15} color={appTheme.colors.primary} />}
            />
          </Button>
        </VStack>
      </Host>
    </View>
  );
}
