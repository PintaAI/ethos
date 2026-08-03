import type { ServerNote, ServerNoteInvitation } from "@/lib/api/notes";

export type NoteDraftStatus = "pending" | "conflict" | "error";

export type NoteDraft = {
  contentJson: string;
  baseUpdatedAt: string;
  updatedAt: string;
  status: NoteDraftStatus;
  error: string | null;
};

export type CachedNote = ServerNote & {
  cachedAt: string;
  draft: NoteDraft | null;
};

export type { ServerNoteInvitation };
