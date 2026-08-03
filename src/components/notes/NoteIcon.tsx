import { View } from "react-native";
import type { SFSymbol } from "expo-symbols";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import { alpha } from "@/lib/color";
import type { ServerNoteIconType } from "@/lib/api/notes";

const HUGEICON_TO_SYMBOL: Record<string, SFSymbol> = {
  BookEditIcon: "note.text",
  FavouriteIcon: "heart.fill",
  PinIcon: "pin.fill",
  Calendar03Icon: "calendar",
  CheckmarkCircle01Icon: "checkmark.circle.fill",
  UserGroupIcon: "person.2.fill",
  BulbIcon: "lightbulb.fill",
  StarIcon: "star.fill",
};

export const NOTE_ICON_OPTIONS = [
  { icon: "BookEditIcon", iconType: "hugeicon" as const, iconColor: "default", symbol: "note.text" },
  { icon: "FavouriteIcon", iconType: "hugeicon" as const, iconColor: "red", symbol: "heart.fill" },
  { icon: "PinIcon", iconType: "hugeicon" as const, iconColor: "blue", symbol: "pin.fill" },
  { icon: "Calendar03Icon", iconType: "hugeicon" as const, iconColor: "green", symbol: "calendar" },
  { icon: "💡", iconType: "emoji" as const, iconColor: "default", symbol: null },
  { icon: "📝", iconType: "emoji" as const, iconColor: "default", symbol: null },
  { icon: "⭐", iconType: "emoji" as const, iconColor: "default", symbol: null },
];

const ICON_COLORS: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
};

export function NoteIcon({
  icon,
  iconType,
  iconColor,
  size = 38,
}: {
  icon: string;
  iconType: ServerNoteIconType;
  iconColor: string;
  size?: number;
}) {
  const appTheme = useAppTheme();
  const tint = ICON_COLORS[iconColor] ?? appTheme.colors.primary;

  return (
    <View
      className="items-center justify-center rounded-2xl"
      style={{ width: size, height: size, backgroundColor: alpha(tint, appTheme.isDark ? 0.2 : 0.12) }}
    >
      {iconType === "emoji" ? (
        <Text style={{ fontSize: size * 0.48 }}>{icon}</Text>
      ) : (
        <AppSymbol
          name={HUGEICON_TO_SYMBOL[icon] ?? "note.text"}
          size={size * 0.48}
          tintColor={tint}
          fallback={<Text style={{ color: tint }}>N</Text>}
        />
      )}
    </View>
  );
}
