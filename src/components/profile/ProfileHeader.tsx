import { ActivityIndicator, Pressable, View } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { AppSymbol } from "@/components/AppSymbol";
import { AppText as RNText } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";

type ProfileHeaderProps = {
  avatarSource: ImageSource | null;
  initials: string;
  isUpdatingPhoto?: boolean;
  onUpdatePhoto: () => void;
};

export function ProfileHeader({ avatarSource, initials, isUpdatingPhoto = false, onUpdatePhoto }: ProfileHeaderProps) {
  const appTheme = useAppTheme();

  return (
    <View className="items-center justify-center pt-2">
      <Pressable
        className="relative h-24 w-24 items-center justify-center"
        onPress={onUpdatePhoto}
        disabled={isUpdatingPhoto}
        accessibilityRole="button"
        accessibilityLabel="Update profile picture"
        style={{ opacity: isUpdatingPhoto ? 0.7 : 1 }}
      >
        <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: appTheme.colors.primary }}>
          {avatarSource ? (
            <Image source={avatarSource} contentFit="cover" style={{ height: "100%", width: "100%" }} />
          ) : (
            <RNText
              style={{
                color: appTheme.colors.inverseForeground,
                fontSize: appTheme.textSize * 2,
                fontWeight: "800",
                letterSpacing: appTheme.textSpacing,
              }}
            >
              {initials}
            </RNText>
          )}
        </View>
        <View
          className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2"
          style={{
            backgroundColor: appTheme.colors.background,
            borderColor: appTheme.colors.background,
          }}
        >
          <AppSymbol
            name="pencil.circle.fill"
            size={28}
            tintColor={appTheme.colors.primary}
            fallback={<RNText style={{ color: appTheme.colors.primary }}>✎</RNText>}
          />
        </View>
        {isUpdatingPhoto ? (
          <View className="absolute inset-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.24)" }}>
            <ActivityIndicator color={appTheme.colors.inverseForeground} />
          </View>
        ) : null}
      </Pressable>


    </View>
  );
}
