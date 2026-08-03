import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";

import { getFirstBlockText } from "@/components/notes/nativeContent";
import { useNotesData } from "@/data/notes/NotesDataProvider";
import type { CachedNote } from "@/data/notes/types";
import { ApiError } from "@/lib/api/client";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export function useJournalDetailPersistence(id: string) {
  const { t } = useTranslation();
  const { loadNote, cacheDraft, saveContent, updateTitle, discardDraft } = useNotesData();
  const [note, setNote] = useState<CachedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [editorGeneration, setEditorGeneration] = useState(0);
  const baseUpdatedAtRef = useRef("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadNote(id).then((loaded) => {
      if (cancelled) return;
      setNote(loaded);
      baseUpdatedAtRef.current = loaded?.draft?.baseUpdatedAt ?? loaded?.updatedAt ?? "";
      setLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      console.warn("[notes] failed to load note", error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, loadNote]));

  const persistContent = async (contentJson: string, force = false) => {
    if (!note) return;
    setSaveStatus("saving");
    try {
      let updated = await saveContent(note.id, contentJson, baseUpdatedAtRef.current, force);
      if (updated) {
        setNote(updated);
        baseUpdatedAtRef.current = updated.updatedAt;
        const firstBlockText = getFirstBlockText(contentJson);
        if (firstBlockText && firstBlockText !== updated.title) {
          const titleUpdated = await updateTitle(note.id, firstBlockText);
          if (titleUpdated) {
            updated = titleUpdated;
            setNote(titleUpdated);
            baseUpdatedAtRef.current = titleUpdated.updatedAt;
          }
        }
      }
      setSaveStatus("saved");
    } catch (error) {
      console.warn("[notes] autosave failed", error);
      const isConflict = error instanceof ApiError && error.status === 409;
      setSaveStatus(isConflict ? "conflict" : "error");
      if (!isConflict) return;

      Alert.alert(t("notes.conflictTitle"), t("notes.conflictMessage"), [
        {
          text: t("notes.reloadServer"),
          onPress: () => {
            void discardDraft(note.id).then((serverNote) => {
              if (!serverNote) return;
              setNote(serverNote);
              baseUpdatedAtRef.current = serverNote.updatedAt;
              setEditorGeneration((current) => current + 1);
              setSaveStatus("idle");
            }).catch((error) => {
              console.warn("[notes] failed to discard draft", error);
              setSaveStatus("error");
            });
          },
        },
        {
          text: t("notes.keepMine"),
          onPress: () => void persistContent(contentJson, true),
        },
        { text: t("common.cancel"), style: "cancel" },
      ]);
    }
  };

  const queueSave = async (contentJson: string) => {
    const job = saveQueueRef.current.then(() => persistContent(contentJson));
    saveQueueRef.current = job.catch(() => undefined);
    await job;
  };

  const cacheContentDraft = async (contentJson: string) => {
    if (!note) return;
    await cacheDraft(note.id, contentJson, baseUpdatedAtRef.current);
  };

  return {
    note,
    loading,
    saveStatus,
    editorGeneration,
    cacheContentDraft,
    queueSave,
  };
}
