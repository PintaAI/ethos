import type { SQLiteDatabase } from "expo-sqlite";

import type { ServerNote, SavedNoteContent } from "@/lib/api/notes";
import type { CachedNote, NoteDraft, NoteDraftStatus } from "./types";

type NoteRow = {
  id: string;
  title: string;
  icon: string;
  icon_type: "hugeicon" | "emoji";
  icon_color: string;
  content_json: string | null;
  content_html: string | null;
  content_markdown: string | null;
  pinned: number;
  role: string;
  member_count: number;
  members_json: string;
  server_updated_at: string;
  cached_at: string;
  draft_content_json: string | null;
  draft_base_updated_at: string | null;
  draft_updated_at: string | null;
  draft_status: NoteDraftStatus | null;
  draft_error: string | null;
};

const NOTE_SELECT = `
  SELECT
    n.*,
    d.content_json AS draft_content_json,
    d.base_updated_at AS draft_base_updated_at,
    d.updated_at AS draft_updated_at,
    d.status AS draft_status,
    d.error AS draft_error
  FROM note_cache n
  LEFT JOIN note_drafts d ON d.user_id = n.user_id AND d.note_id = n.id
`;

function parseMembers(value: string): ServerNote["members"] {
  try {
    const members = JSON.parse(value) as unknown;
    return Array.isArray(members) ? (members as ServerNote["members"]) : [];
  } catch {
    return [];
  }
}

function mapNote(row: NoteRow): CachedNote {
  const draft: NoteDraft | null =
    row.draft_content_json && row.draft_base_updated_at && row.draft_updated_at && row.draft_status
      ? {
          contentJson: row.draft_content_json,
          baseUpdatedAt: row.draft_base_updated_at,
          updatedAt: row.draft_updated_at,
          status: row.draft_status,
          error: row.draft_error,
        }
      : null;

  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    iconType: row.icon_type,
    iconColor: row.icon_color,
    contentJson: row.content_json,
    contentHtml: row.content_html,
    contentMarkdown: row.content_markdown,
    pinned: row.pinned === 1,
    role: row.role,
    memberCount: row.member_count,
    members: parseMembers(row.members_json),
    updatedAt: row.server_updated_at,
    cachedAt: row.cached_at,
    draft,
  };
}

export async function upsertCachedNote(db: SQLiteDatabase, userId: string, note: ServerNote): Promise<void> {
  const cachedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO note_cache (
      user_id, id, title, icon, icon_type, icon_color, content_json, content_html,
      content_markdown, pinned, role, member_count, members_json, server_updated_at, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET
      title = excluded.title,
      icon = excluded.icon,
      icon_type = excluded.icon_type,
      icon_color = excluded.icon_color,
      content_json = excluded.content_json,
      content_html = excluded.content_html,
      content_markdown = excluded.content_markdown,
      pinned = excluded.pinned,
      role = excluded.role,
      member_count = excluded.member_count,
      members_json = excluded.members_json,
      server_updated_at = excluded.server_updated_at,
      cached_at = excluded.cached_at`,
    userId,
    note.id,
    note.title,
    note.icon,
    note.iconType,
    note.iconColor,
    note.contentJson,
    note.contentHtml,
    note.contentMarkdown,
    note.pinned ? 1 : 0,
    note.role,
    note.memberCount,
    JSON.stringify(note.members),
    note.updatedAt,
    cachedAt,
  );
}

export async function replaceCachedNotes(db: SQLiteDatabase, userId: string, notes: ServerNote[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const note of notes) await upsertCachedNote(db, userId, note);

    if (notes.length === 0) {
      await db.runAsync("DELETE FROM note_cache WHERE user_id = ?", userId);
      return;
    }

    const placeholders = notes.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM note_cache WHERE user_id = ? AND id NOT IN (${placeholders})`,
      userId,
      ...notes.map((note) => note.id),
    );
  });
}

export async function listCachedNotes(db: SQLiteDatabase, userId: string): Promise<CachedNote[]> {
  const rows = await db.getAllAsync<NoteRow>(
    `${NOTE_SELECT} WHERE n.user_id = ? ORDER BY n.pinned DESC, n.server_updated_at DESC`,
    userId,
  );
  return rows.map(mapNote);
}

export async function getCachedNote(db: SQLiteDatabase, userId: string, noteId: string): Promise<CachedNote | null> {
  const row = await db.getFirstAsync<NoteRow>(
    `${NOTE_SELECT} WHERE n.user_id = ? AND n.id = ? LIMIT 1`,
    userId,
    noteId,
  );
  return row ? mapNote(row) : null;
}

export async function saveNoteDraft(
  db: SQLiteDatabase,
  userId: string,
  noteId: string,
  contentJson: string,
  baseUpdatedAt: string,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO note_drafts (user_id, note_id, content_json, base_updated_at, updated_at, status, error)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL)
     ON CONFLICT(user_id, note_id) DO UPDATE SET
       content_json = excluded.content_json,
       base_updated_at = MAX(note_drafts.base_updated_at, excluded.base_updated_at),
       updated_at = excluded.updated_at,
       status = 'pending',
       error = NULL`,
    userId,
    noteId,
    contentJson,
    baseUpdatedAt,
    updatedAt,
  );
}

export async function setNoteDraftStatus(
  db: SQLiteDatabase,
  userId: string,
  noteId: string,
  status: NoteDraftStatus,
  error: string | null,
): Promise<void> {
  await db.runAsync(
    "UPDATE note_drafts SET status = ?, error = ? WHERE user_id = ? AND note_id = ?",
    status,
    error,
    userId,
    noteId,
  );
}

export async function clearNoteDraft(db: SQLiteDatabase, userId: string, noteId: string): Promise<void> {
  await db.runAsync("DELETE FROM note_drafts WHERE user_id = ? AND note_id = ?", userId, noteId);
}

export async function rebaseNoteDraft(
  db: SQLiteDatabase,
  userId: string,
  noteId: string,
  baseUpdatedAt: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE note_drafts SET base_updated_at = ? WHERE user_id = ? AND note_id = ?",
    baseUpdatedAt,
    userId,
    noteId,
  );
}

export async function applySavedNoteContent(
  db: SQLiteDatabase,
  userId: string,
  noteId: string,
  saved: SavedNoteContent,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE note_cache SET
        content_json = ?, content_html = ?, content_markdown = ?, server_updated_at = ?, cached_at = ?
       WHERE user_id = ? AND id = ?`,
      saved.contentJson,
      saved.html,
      saved.markdown,
      saved.updatedAt,
      new Date().toISOString(),
      userId,
      noteId,
    );
    await db.runAsync(
      `UPDATE note_drafts SET base_updated_at = ?
       WHERE user_id = ? AND note_id = ? AND content_json <> ?`,
      saved.updatedAt,
      userId,
      noteId,
      saved.contentJson,
    );
    await db.runAsync(
      "DELETE FROM note_drafts WHERE user_id = ? AND note_id = ? AND content_json = ?",
      userId,
      noteId,
      saved.contentJson,
    );
  });
}

export async function deleteCachedNote(db: SQLiteDatabase, userId: string, noteId: string): Promise<void> {
  await db.runAsync("DELETE FROM note_cache WHERE user_id = ? AND id = ?", userId, noteId);
}
