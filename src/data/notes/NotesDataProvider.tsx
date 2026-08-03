import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSQLiteContext } from "expo-sqlite";

import { useAuth } from "@/components/AuthProvider";
import { useSelfImprovement } from "@/data/selfImprovement/SelfImprovementProvider";
import { ApiError } from "@/lib/api/client";
import { toDateKey } from "@/lib/date";
import { DbOperationInvalidatedError, getDbLockGeneration, withDbLock } from "@/lib/sync/dbLock";
import {
  createNote as createServerNote,
  deleteNote as deleteServerNote,
  getNote as getServerNote,
  listNotes as listServerNotes,
  toggleNotePin as toggleServerNotePin,
  updateNoteContent as updateServerNoteContent,
  updateNoteIcon as updateServerNoteIcon,
  updateNoteTitle as updateServerNoteTitle,
  type ServerNoteIconType,
} from "@/lib/api/notes";
import {
  applySavedNoteContent,
  clearNoteDraft,
  deleteCachedNote,
  getCachedNote,
  listCachedNotes,
  rebaseNoteDraft,
  replaceCachedNotes,
  saveNoteDraft,
  setNoteDraftStatus,
  upsertCachedNote,
} from "./repository";
import type { CachedNote } from "./types";

type NotesDataContextValue = {
  notes: CachedNote[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadNote: (id: string) => Promise<CachedNote | null>;
  createNote: (title: string) => Promise<CachedNote | null>;
  deleteNote: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  updateTitle: (id: string, title: string) => Promise<CachedNote | null>;
  updateIcon: (
    id: string,
    icon: { icon: string; iconType: ServerNoteIconType; iconColor: string },
  ) => Promise<CachedNote | null>;
  cacheDraft: (id: string, contentJson: string, baseUpdatedAt: string) => Promise<void>;
  saveContent: (
    id: string,
    contentJson: string,
    baseUpdatedAt: string,
    force?: boolean,
  ) => Promise<CachedNote | null>;
  discardDraft: (id: string) => Promise<CachedNote | null>;
};

const NotesDataContext = createContext<NotesDataContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load notes";
}

export function NotesDataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { user, isAuthenticated, isPending } = useAuth();
  const { recordJournalActivity } = useSelfImprovement();
  const userId = user?.id ?? null;
  const recordedJournalDateRef = useRef<string | null>(null);
  const authScopeRef = useRef({ userId, generation: getDbLockGeneration() });
  if (authScopeRef.current.userId !== userId) {
    authScopeRef.current = { userId, generation: getDbLockGeneration() };
  }
  const [notes, setNotes] = useState<CachedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordJournalEdit = useCallback(async () => {
    const today = toDateKey(new Date());
    if (recordedJournalDateRef.current === today) return;
    await recordJournalActivity();
    recordedJournalDateRef.current = today;
  }, [recordJournalActivity]);

  const readCache = useCallback(async () => {
    if (!userId) {
      setNotes([]);
      return [];
    }
    const cached = await withDbLock(
      () => listCachedNotes(db, userId),
      authScopeRef.current.generation,
    );
    setNotes(cached);
    return cached;
  }, [db, userId]);

  const refresh = useCallback(async () => {
    if (!userId || !isAuthenticated) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setRefreshing(true);
    const generation = authScopeRef.current.generation;
    try {
      const serverNotes = await listServerNotes();
      await withDbLock(() => replaceCachedNotes(db, userId, serverNotes), generation);
      const cachedNotes = await withDbLock(() => listCachedNotes(db, userId), generation);
      for (const note of cachedNotes) {
        if (!note.draft || note.draft.status === "conflict") continue;
        try {
          const saved = await updateServerNoteContent(
            note.id,
            note.draft.contentJson,
            note.draft.baseUpdatedAt,
          );
          await withDbLock(() => applySavedNoteContent(db, userId, note.id, saved), generation);
        } catch (draftError) {
          const conflict = draftError instanceof ApiError && draftError.status === 409;
          await withDbLock(() => setNoteDraftStatus(
            db,
            userId,
            note.id,
            conflict ? "conflict" : "error",
            errorMessage(draftError),
          ), generation);
        }
      }
      await readCache();
      setError(null);
    } catch (nextError) {
      if (nextError instanceof DbOperationInvalidatedError) return;
      await readCache();
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, isAuthenticated, readCache, userId]);

  useEffect(() => {
    if (isPending) return;
    const timeout = setTimeout(() => {
      void refresh().catch((refreshError) => {
        if (!(refreshError instanceof DbOperationInvalidatedError)) {
          console.warn("Failed to refresh notes", refreshError);
        }
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [isPending, refresh]);

  const loadNote = useCallback(
    async (id: string, generation = authScopeRef.current.generation) => {
      if (!userId) return null;
      try {
        const serverNote = await getServerNote(id);
        if (!serverNote) return withDbLock(() => getCachedNote(db, userId, id), generation);
        await withDbLock(() => upsertCachedNote(db, userId, serverNote), generation);
        const cached = await withDbLock(() => getCachedNote(db, userId, id), generation);
        await withDbLock(() => listCachedNotes(db, userId), generation).then(setNotes);
        return cached;
      } catch (loadError) {
        if (loadError instanceof DbOperationInvalidatedError) return null;
        return withDbLock(() => getCachedNote(db, userId, id));
      }
    },
    [db, userId],
  );

  const createNote = useCallback(
    async (title: string) => {
      const generation = authScopeRef.current.generation;
      const { noteId } = await createServerNote(title);
      const created = await loadNote(noteId, generation);
      if (!created) return null;
      await recordJournalEdit();
      return created;
    },
    [loadNote, recordJournalEdit],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (!userId) return;
      const generation = authScopeRef.current.generation;
      await deleteServerNote(id);
      await withDbLock(() => deleteCachedNote(db, userId, id), generation);
      await readCache();
    },
    [db, readCache, userId],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const generation = authScopeRef.current.generation;
      await toggleServerNotePin(id);
      const updated = await loadNote(id, generation);
      if (userId && updated?.draft) {
        await withDbLock(() => rebaseNoteDraft(db, userId, id, updated.updatedAt), generation);
        await withDbLock(() => listCachedNotes(db, userId), generation).then(setNotes);
      }
    },
    [db, loadNote, userId],
  );

  const updateTitle = useCallback(
    async (id: string, title: string) => {
      const generation = authScopeRef.current.generation;
      await updateServerNoteTitle(id, title);
      const updated = await loadNote(id, generation);
      if (!updated) return null;
      await recordJournalEdit();
      if (userId && updated?.draft) {
        await withDbLock(() => rebaseNoteDraft(db, userId, id, updated.updatedAt), generation);
        return withDbLock(() => getCachedNote(db, userId, id), generation);
      }
      return updated;
    },
    [db, loadNote, recordJournalEdit, userId],
  );

  const updateIcon = useCallback(
    async (id: string, icon: { icon: string; iconType: ServerNoteIconType; iconColor: string }) => {
      const generation = authScopeRef.current.generation;
      await updateServerNoteIcon(id, icon);
      const updated = await loadNote(id, generation);
      if (!updated) return null;
      await recordJournalEdit();
      if (userId && updated?.draft) {
        await withDbLock(() => rebaseNoteDraft(db, userId, id, updated.updatedAt), generation);
        return withDbLock(() => getCachedNote(db, userId, id), generation);
      }
      return updated;
    },
    [db, loadNote, recordJournalEdit, userId],
  );

  const saveContent = useCallback(
    async (id: string, contentJson: string, baseUpdatedAt: string, force = false) => {
      if (!userId) return null;
      const generation = getDbLockGeneration();
      await withDbLock(() => saveNoteDraft(db, userId, id, contentJson, baseUpdatedAt), generation);
      await readCache();
      try {
        const saved = await updateServerNoteContent(id, contentJson, force ? undefined : baseUpdatedAt);
        await withDbLock(() => applySavedNoteContent(db, userId, id, saved), generation);
        await recordJournalEdit();
      } catch (saveError) {
        const conflict = saveError instanceof ApiError && saveError.status === 409;
        if (saveError instanceof DbOperationInvalidatedError) return null;
        await withDbLock(() => setNoteDraftStatus(db, userId, id, conflict ? "conflict" : "error", errorMessage(saveError)), generation);
        await readCache();
        throw saveError;
      }
      const cached = await withDbLock(() => getCachedNote(db, userId, id), generation);
      await readCache();
      return cached;
    },
    [db, readCache, recordJournalEdit, userId],
  );

  const cacheDraft = useCallback(
    async (id: string, contentJson: string, baseUpdatedAt: string) => {
      if (!userId) return;
      await withDbLock(
        () => saveNoteDraft(db, userId, id, contentJson, baseUpdatedAt),
        authScopeRef.current.generation,
      );
      await recordJournalEdit();
    },
    [db, recordJournalEdit, userId],
  );

  const discardDraft = useCallback(
    async (id: string) => {
      if (!userId) return null;
      const generation = authScopeRef.current.generation;
      await withDbLock(() => clearNoteDraft(db, userId, id), generation);
      return loadNote(id, generation);
    },
    [db, loadNote, userId],
  );

  return (
    <NotesDataContext
      value={{
        notes,
        loading,
        refreshing,
        error,
        refresh,
        loadNote,
        createNote,
        deleteNote,
        togglePin,
        updateTitle,
        updateIcon,
        cacheDraft,
        saveContent,
        discardDraft,
      }}
    >
      {children}
    </NotesDataContext>
  );
}

export function useNotesData() {
  const value = use(NotesDataContext);
  if (!value) throw new Error("useNotesData must be used within NotesDataProvider");
  return value;
}
