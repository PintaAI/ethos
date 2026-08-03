import { useState } from "react";

import type { CachedNote } from "@/data/notes/types";

export function useNoteSelection(visibleNotes: CachedNote[]) {
  const [selectedNotes, setSelectedNotes] = useState<Record<string, boolean>>({});
  const visibleOwnedNotes = visibleNotes.filter((note) => note.role === "owner");
  const selectedIds = Object.keys(selectedNotes).filter((id) => selectedNotes[id]);
  const isSelecting = selectedIds.length > 0;
  const allVisibleSelected = visibleOwnedNotes.length > 0 && visibleOwnedNotes.every((note) => selectedNotes[note.id]);

  const toggleNoteSelection = (note: CachedNote) => {
    if (note.role !== "owner") return;
    setSelectedNotes((current) => ({ ...current, [note.id]: !current[note.id] }));
  };

  const toggleVisibleNotes = () => {
    setSelectedNotes((current) => {
      const next = { ...current };
      visibleOwnedNotes.forEach((note) => {
        next[note.id] = !allVisibleSelected;
      });
      return next;
    });
  };

  return {
    allVisibleSelected,
    clearSelection: () => setSelectedNotes({}),
    isSelecting,
    selectedIds,
    selectedNotes,
    toggleNoteSelection,
    toggleVisibleNotes,
  };
}
