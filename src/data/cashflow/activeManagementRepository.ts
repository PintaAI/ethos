import type { SQLiteDatabase } from "expo-sqlite";
import { notifyActiveManagementChanged } from "@/lib/activeManagementEvents";

export async function getActiveManagementId(db: SQLiteDatabase) {
  const preference = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key = 'active_management_id'",
  );
  if (preference?.value) {
    const activeManagement = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM managements WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      preference.value,
    );
    if (activeManagement) return activeManagement.id;
  }

  const firstManagement = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM managements WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1",
  );
  if (!firstManagement) return null;

  await setActiveManagementId(db, firstManagement.id);
  return firstManagement.id;
}

export async function setActiveManagementId(
  db: SQLiteDatabase,
  managementId: string,
) {
  await db.runAsync(
    `INSERT INTO app_preferences (key, value) VALUES ('active_management_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    managementId,
  );
  notifyActiveManagementChanged();
}
