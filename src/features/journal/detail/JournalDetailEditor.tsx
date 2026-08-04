import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";
import type { SFSymbol } from "expo-symbols";
import { useTranslation } from "react-i18next";

import { AppSymbol } from "@/components/AppSymbol";
import { AppText as Text } from "@/components/AppText";
import { useAppTheme } from "@/components/provider/AppTheme";
import NoteEditor from "@/components/notes/NoteEditor";
import type { HeadingLevel, NoteEditorHandle } from "@/components/notes/NoteEditor.types";
import { NoteReadOnly } from "@/components/notes/NoteReadOnly";
import { isNativeNoteContentSupported } from "@/components/notes/nativeContent";
import type { CachedNote } from "@/data/notes/types";
import { alpha } from "@/lib/color";

import type { SaveStatus } from "./useJournalDetailPersistence";

type Props = {
  note: CachedNote;
  saveStatus: SaveStatus;
  editorGeneration: number;
  onDraft: (contentJson: string) => Promise<void>;
  onSave: (contentJson: string) => Promise<void>;
};

function EditorToolButton({ label, icon, onPress }: { label: string; icon?: SFSymbol; onPress: () => void }) {
  const appTheme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 min-w-11 items-center justify-center rounded-xl px-3"
      style={{
        backgroundColor: alpha(appTheme.colors.foreground, appTheme.isDark ? 0.1 : 0.05),
        borderColor: alpha(appTheme.colors.foreground, 0.12),
        borderWidth: 1,
      }}
      onPress={onPress}
    >
      {icon ? (
        <AppSymbol name={icon} size={18} tintColor={appTheme.colors.foreground} fallback={null} />
      ) : (
        <Text className="text-sm font-bold" style={{ color: appTheme.colors.foreground }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function JournalDetailEditor({ note, saveStatus, editorGeneration, onDraft, onSave }: Props) {
  const appTheme = useAppTheme();
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const [headingLevel, setHeadingLevel] = useState<HeadingLevel | null>(null);
  const editorRef = useRef<NoteEditorHandle>(null);
  const contentJson = note.draft?.contentJson ?? note.contentJson;
  const canEdit = Platform.OS === "ios" && isNativeNoteContentSupported(contentJson);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1, backgroundColor: appTheme.colors.background }}
    >
      <View className="flex-row items-center gap-2 px-5 pb-2 pt-3">
        <AppSymbol name={note.role === "owner" ? "checkmark.circle.fill" : "person.2.fill"} size={12} tintColor={appTheme.colors.muted} fallback={null} />
        <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
          {note.role === "owner" ? t("notes.owner") : t("notes.shared")} · {note.memberCount} {t("notes.members")} ·
        </Text>
        {saveStatus === "saving" ? (
          <ActivityIndicator size={12} color={appTheme.colors.muted} style={{ marginLeft: 4 }} />
        ) : (
          <Text className="text-xs" style={{ color: appTheme.colors.muted }}>
            {saveStatus === "conflict" ? t("notes.conflict") : new Date(note.updatedAt).toLocaleString()}
          </Text>
        )}
      </View>

      <View style={{ flex: 1, minHeight: 0 }}>
        {canEdit ? (
          <NoteEditor
            ref={editorRef}
            key={`${note.id}:${editorGeneration}`}
            documentId={note.id}
            contentJson={contentJson}
            contentMarkdown={note.contentMarkdown}
            editable
            onHeadingLevelChange={setHeadingLevel}
            onDraft={onDraft}
            onSave={onSave}
          />
        ) : (
          <NoteReadOnly
            markdown={note.contentMarkdown}
            reason={Platform.OS === "android" ? t("notes.androidReadOnly") : t("notes.unsupportedReadOnly")}
          />
        )}
      </View>

      {canEdit ? (
        <View style={{ height: 53, flexShrink: 0, backgroundColor: appTheme.colors.background }}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 4 }}
          >
            <EditorToolButton label="Text" icon="textformat" onPress={() => editorRef.current?.setParagraph()} />
            <EditorToolButton label={headingLevel ? `H${headingLevel}` : "H"} onPress={() => editorRef.current?.cycleHeading()} />
            <EditorToolButton label="Bullets" icon="list.bullet" onPress={() => editorRef.current?.setBulletList()} />
            <EditorToolButton label="Numbers" icon="list.number" onPress={() => editorRef.current?.setNumberedList()} />
            <EditorToolButton label="Toggle" icon="chevron.right" onPress={() => editorRef.current?.setToggleList()} />
            <EditorToolButton label="Image" icon="photo" onPress={() => editorRef.current?.insertMedia("image")} />
            <EditorToolButton label="Video" icon="video" onPress={() => editorRef.current?.insertMedia("video")} />
            <EditorToolButton label="Audio" icon="waveform" onPress={() => editorRef.current?.insertMedia("audio")} />
            <EditorToolButton label="File" icon="doc" onPress={() => editorRef.current?.insertMedia("file")} />
            <EditorToolButton label="Outdent" icon="decrease.indent" onPress={() => editorRef.current?.outdent()} />
            <EditorToolButton label="Indent" icon="increase.indent" onPress={() => editorRef.current?.indent()} />
            <EditorToolButton label="Undo" icon="arrow.uturn.backward" onPress={() => editorRef.current?.undo()} />
            <EditorToolButton label="Redo" icon="arrow.uturn.forward" onPress={() => editorRef.current?.redo()} />
          </ScrollView>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
