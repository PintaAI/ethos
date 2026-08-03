import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client";

export type ServerNoteIconType = "hugeicon" | "emoji";

export type ServerNoteMember = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

export type ServerNote = {
  id: string;
  title: string;
  icon: string;
  iconType: ServerNoteIconType;
  iconColor: string;
  contentJson: string | null;
  contentHtml: string | null;
  contentMarkdown: string | null;
  pinned: boolean;
  role: string;
  memberCount: number;
  updatedAt: string;
  members: ServerNoteMember[];
};

export type ServerNoteInvitation = {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  expiresAt: string;
};

export type SavedNoteContent = {
  success: true;
  contentJson: string;
  html: string;
  markdown: string;
  updatedAt: string;
};

export function listNotes(): Promise<ServerNote[]> {
  return apiGet<ServerNote[]>("/notes");
}

export function getNote(id: string): Promise<ServerNote | null> {
  return apiGet<ServerNote | null>(`/notes/${encodeURIComponent(id)}`);
}

export function createNote(title: string): Promise<{ noteId: string }> {
  return apiPost<{ noteId: string }>("/notes", { title });
}

export function updateNoteTitle(id: string, title: string): Promise<{ success: true }> {
  return apiPatch<{ success: true }>(`/notes/${encodeURIComponent(id)}/title`, { title });
}

export function updateNoteIcon(
  id: string,
  icon: { icon: string; iconType: ServerNoteIconType; iconColor: string },
): Promise<{ success: true }> {
  return apiPatch<{ success: true }>(`/notes/${encodeURIComponent(id)}/icon`, icon);
}

export function toggleNotePin(id: string): Promise<{ success: true; pinned: boolean }> {
  return apiPatch<{ success: true; pinned: boolean }>(`/notes/${encodeURIComponent(id)}/pin`);
}

export function updateNoteContent(
  id: string,
  contentJson: string,
  expectedUpdatedAt?: string,
): Promise<SavedNoteContent> {
  return apiPut<SavedNoteContent>(`/notes/${encodeURIComponent(id)}/content`, {
    contentJson,
    expectedUpdatedAt,
  });
}

export function deleteNote(id: string): Promise<void> {
  return apiDelete(`/notes/${encodeURIComponent(id)}`);
}

export function listNoteInvitations(id: string): Promise<ServerNoteInvitation[]> {
  return apiGet<ServerNoteInvitation[]>(`/notes/${encodeURIComponent(id)}/invites`);
}

export function createNoteInvitation(id: string): Promise<{ code: string }> {
  return apiPost<{ code: string }>(`/notes/${encodeURIComponent(id)}/invites`);
}

export function deleteNoteInvitation(id: string, invitationId: string): Promise<void> {
  return apiDelete(
    `/notes/${encodeURIComponent(id)}/invites?invitation_id=${encodeURIComponent(invitationId)}`,
  );
}
