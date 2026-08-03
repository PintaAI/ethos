import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/AppTheme";
import type { NoteEditorProps } from "./NoteEditor.types";

export default function NoteEditor({ contentMarkdown }: NoteEditorProps) {
  const appTheme = useAppTheme();
  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-16 pt-4">
      <View className="min-h-80">
        <Text className="text-base leading-7" style={{ color: appTheme.colors.foreground }} selectable>
          {contentMarkdown?.trim() || "This note has no content yet."}
        </Text>
      </View>
    </ScrollView>
  );
}
