import { useCallback, useEffect, useEffectEvent, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { BlockNoteView, useCreateBlockNote } from "blocknote-native-editor";

import { useAppTheme } from "@/components/AppTheme";
import { parseNativeNoteContent } from "./nativeContent";
import type { HeadingLevel, MediaBlockType, NoteEditorProps } from "./NoteEditor.types";

type BlockKind = "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "toggleListItem";

export default function NoteEditor({ ref, documentId, contentJson, editable, onHeadingLevelChange, onDraft, onSave }: NoteEditorProps) {
  const appTheme = useAppTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<string | null>(null);
  const editor = useCreateBlockNote({
    documentId,
    initialContent: parseNativeNoteContent(contentJson),
    editable,
  });
  const draftEvent = useEffectEvent(onDraft);
  const saveEvent = useEffectEvent(onSave);
  const headingLevelEvent = useEffectEvent(onHeadingLevelChange);

  useEffect(() => {
    const unsubscribe = editor.onChange((currentEditor) => {
      const nextJson = currentEditor.getDocumentJSON();
      void draftEvent(nextJson).catch((error) => console.warn("[notes] failed to cache draft", error));
      pendingSaveRef.current = nextJson;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const pendingJson = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (pendingJson) void saveEvent(pendingJson);
      }, 900);
    });

    return () => {
      unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const pendingJson = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pendingJson) void saveEvent(pendingJson);
    };
  }, [editor]);

  useEffect(() => {
    const emitHeadingLevel = () => {
      const block = editor.getTextCursorPosition().block;
      const level = block.type === "heading" && block.props.level >= 1 && block.props.level <= 6
        ? block.props.level as HeadingLevel
        : null;
      headingLevelEvent(level);
    };
    emitHeadingLevel();
    const unsubscribeSelection = editor.onSelectionChange(emitHeadingLevel);
    const unsubscribeChange = editor.onChange(emitHeadingLevel);
    return () => {
      unsubscribeSelection();
      unsubscribeChange();
    };
  }, [editor]);

  const setBlockKind = useCallback((type: BlockKind) => {
    const block = editor.getTextCursorPosition().block;
    editor.updateBlock(block, type === "heading" ? { type, props: { level: 2 } } : { type });
    editor.focus();
  }, [editor]);

  const cycleHeading = useCallback(() => {
    const block = editor.getTextCursorPosition().block;
    const currentLevel = block.type === "heading" && typeof block.props.level === "number"
      ? block.props.level
      : 0;
    const nextLevel = (currentLevel >= 1 && currentLevel < 6 ? currentLevel + 1 : 1) as HeadingLevel;
    editor.updateBlock(block, { type: "heading", props: { level: nextLevel } });
    editor.focus();
  }, [editor]);

  const insertMedia = useCallback((type: MediaBlockType) => {
    const block = editor.getTextCursorPosition().block;
    const [inserted] = editor.insertBlocks([{ type }], block, "after");
    editor.setTextCursorPosition(inserted);
    editor.focus();
  }, [editor]);

  useImperativeHandle(ref, () => ({
    setParagraph: () => setBlockKind("paragraph"),
    cycleHeading,
    setBulletList: () => setBlockKind("bulletListItem"),
    setNumberedList: () => setBlockKind("numberedListItem"),
    setToggleList: () => setBlockKind("toggleListItem"),
    insertMedia,
    indent: () => editor.nestBlock(),
    outdent: () => editor.unnestBlock(),
    undo: () => editor.undo(),
    redo: () => editor.redo(),
  }), [cycleHeading, editor, insertMedia, setBlockKind]);

  return (
    <View className="flex-1">
      <BlockNoteView
        editor={editor}
        editable={editable}
        style={{ flex: 1, backgroundColor: appTheme.colors.background }}
      />
    </View>
  );
}
