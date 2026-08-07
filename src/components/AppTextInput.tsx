import { forwardRef } from "react";
import { Platform, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { GlassBox } from "@/components/GlassBox";
import { useAppTheme } from "@/components/provider/AppTheme";
import { alpha } from "@/lib/color";

type AppTextInputProps = TextInputProps & {
  className?: string;
  containerClassName?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  ({ className, containerClassName, containerStyle, style, ...props }, ref) => {
    const appTheme = useAppTheme();
    const { isDark, colors } = appTheme;

    if (Platform.OS === "ios") {
      const placeholderColor = props.placeholderTextColor ?? colors.muted;

      return (
        <GlassBox
          isInteractive
          tintColor={alpha(colors.primary, isDark ? 0.35 : 0.18)}
          glassEffectStyle="clear"
          className={containerClassName}
          style={[{ borderRadius: 9999, height: 40 }, containerStyle]}
        >
          {props.placeholder && !props.value ? (
            <View pointerEvents="none" className="absolute inset-0 justify-center px-3.5">
              <Text className="text-base" style={{ color: placeholderColor }}>
                {props.placeholder}
              </Text>
            </View>
          ) : null}
          <TextInput
            ref={ref}
            className={className}
            selectionColor={colors.primary}
            {...props}
            placeholder={undefined}
            style={[
              {
                color: colors.foreground,
                fontSize: 16,
                height: 40,
                includeFontPadding: false,
                paddingHorizontal: 14,
                paddingVertical: 0,
                textAlignVertical: "center",
              },
              style,
            ]}
          />
        </GlassBox>
      );
    }

    return (
      <View
        className={`min-h-12 flex-row items-center rounded-2xl border px-4 ${containerClassName ?? ""}`}
        style={[
          {
            borderColor: alpha(colors.muted, 0.2),
            backgroundColor: alpha(colors.primary, isDark ? 0.14 : 0.07),
          },
          containerStyle,
        ]}
      >
        <TextInput
          ref={ref}
          className={`min-w-0 flex-1 py-0 text-base ${className ?? ""}`}
          placeholderTextColor={colors.muted}
          selectionColor={colors.primary}
          style={[{ color: colors.foreground, paddingVertical: 0 }, style]}
          {...props}
        />
      </View>
    );
  },
);

AppTextInput.displayName = "AppTextInput";
