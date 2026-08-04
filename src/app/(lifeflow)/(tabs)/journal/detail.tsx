import { Keyboard, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import { JournalDetailEditor } from "@/features/journal/detail/JournalDetailEditor";
import { useJournalDetailPersistence } from "@/features/journal/detail/useJournalDetailPersistence";

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const { note, loading, saveStatus, editorGeneration, cacheContentDraft, queueSave } = useJournalDetailPersistence(id);

  const openSettings = () => {
    const href = { pathname: "/forms/journal-settings", params: { id } } as unknown as Href;
    if (!Keyboard.isVisible()) {
      router.push(href);
      return;
    }
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      subscription.remove();
      router.push(href);
    });
    Keyboard.dismiss();
  };

  if (loading) {
    return <View className="flex-1" style={{ backgroundColor: appTheme.colors.background }} />;
  }

  if (!note) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8" style={{ backgroundColor: appTheme.colors.background }}>
        <Text className="text-xl font-black" style={{ color: appTheme.colors.foreground }}>{t("notes.notFound")}</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: appTheme.colors.primary }}>{t("common.back")}</Text></Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: note.title }} />
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel={t("notes.settings")}
          onPress={openSettings}
        />
      </Stack.Toolbar>
      <JournalDetailEditor
        note={note}
        saveStatus={saveStatus}
        editorGeneration={editorGeneration}
        onDraft={cacheContentDraft}
        onSave={queueSave}
      />
    </>
  );
}
