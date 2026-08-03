import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";

export function NoteReadOnly({ markdown, reason }: { markdown: string | null; reason?: string }) {
  const appTheme = useAppTheme();
  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-16 pt-4">
      {reason ? (
        <View className="mb-4 rounded-2xl px-4 py-3" style={{ backgroundColor: appTheme.colors.overlay }}>
          <Text className="text-xs leading-5" style={{ color: appTheme.colors.muted }}>{reason}</Text>
        </View>
      ) : null}
      <Text className="text-base leading-7" style={{ color: appTheme.colors.foreground }} selectable>
        {markdown?.trim() || "This note has no content yet."}
      </Text>
    </ScrollView>
  );
}
