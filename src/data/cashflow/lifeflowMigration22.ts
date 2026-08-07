type BindValue = string | number | null;

export type MigrationDatabase = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: BindValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string): Promise<T[]>;
};

const tables = ["habits", "habit_logs", "time_boxes", "day_presets", "day_preset_blocks", "day_preset_schedules"];

async function hasColumn(db: MigrationDatabase, table: string, column: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return columns.some((item) => item.name === column);
}

export async function ensureLifeFlowScopeColumns(db: MigrationDatabase) {
  for (const table of tables) {
    if (!await hasColumn(db, table, "management_id")) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN management_id TEXT REFERENCES managements(id) ON DELETE CASCADE;`);
    }
  }
  if (!await hasColumn(db, "habits", "system_type")) await db.execAsync("ALTER TABLE habits ADD COLUMN system_type TEXT;");
}

export async function adoptLifeFlowScope(db: MigrationDatabase, managementId: string) {
  for (const table of tables) await db.runAsync(`UPDATE ${table} SET management_id = ? WHERE management_id IS NULL`, managementId);
  await db.runAsync(
    `UPDATE habits SET system_type = 'app_check_in'
     WHERE id = (SELECT value FROM app_preferences WHERE key = 'atomic_habits_app_check_in_id') AND management_id = ?`,
    managementId,
  );
  await db.runAsync(
    `UPDATE habits SET system_type = 'journal'
     WHERE id = (SELECT value FROM app_preferences WHERE key = 'habits_daily_journal_id') AND management_id = ?`,
    managementId,
  );
}
