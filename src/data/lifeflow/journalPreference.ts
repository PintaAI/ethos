import type { SQLiteDatabase } from "expo-sqlite";

export const journalPreferenceKey = "lifeflow_journal_enabled";

export async function persistJournalEnabled(db: SQLiteDatabase, enabled: boolean) {
  await db.runAsync(
    `INSERT INTO app_preferences (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    journalPreferenceKey, enabled ? "true" : "false", new Date().toISOString(),
  );
}

export async function isJournalEnabled(db: SQLiteDatabase) {
  return Boolean(await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key = ? AND lower(value) IN ('1', 'true')",
    journalPreferenceKey,
  ));
}
