import { archiveLifeFlow } from "./lifeflowArchive";
import type { SQLiteDatabase } from "expo-sqlite";
import { isJournalEnabled } from "@/data/lifeflow/journalPreference";
import { SYSTEM_ITEM_ANCHOR_DATE, SYSTEM_ITEM_ANCHOR_TIMESTAMP } from "@/data/lifeflow/systemItems";

export async function migrateUnifiedLifeFlow(db: SQLiteDatabase, _localDate: string) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    if ((await txn.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))!.user_version >= 24) return;
    await archiveLifeFlow(txn, 23);
    await txn.execAsync(`
      DROP TRIGGER IF EXISTS habits_sync_update;
      DROP TRIGGER IF EXISTS habit_logs_sync_update;
      DROP TRIGGER IF EXISTS time_boxes_sync_update;
      DROP TRIGGER IF EXISTS day_presets_sync_update;
      DROP TRIGGER IF EXISTS day_preset_blocks_sync_update;
      DROP TRIGGER IF EXISTS day_preset_schedules_sync_update;
      DROP TRIGGER IF EXISTS habits_sync_insert;
      DROP TRIGGER IF EXISTS habit_logs_sync_insert;
      DROP TRIGGER IF EXISTS time_boxes_sync_insert;
      DROP TRIGGER IF EXISTS day_presets_sync_insert;
      DROP TRIGGER IF EXISTS day_preset_blocks_sync_insert;
      DROP TRIGGER IF EXISTS day_preset_schedules_sync_insert;
      DROP TRIGGER IF EXISTS habits_sync_delete;
      DROP TRIGGER IF EXISTS habit_logs_sync_delete;
      DROP TRIGGER IF EXISTS time_boxes_sync_delete;
      DROP TRIGGER IF EXISTS day_presets_sync_delete;
      DROP TRIGGER IF EXISTS day_preset_blocks_sync_delete;
      DROP TRIGGER IF EXISTS day_preset_schedules_sync_delete;
      DROP TRIGGER IF EXISTS habits_management_required;
      DROP TRIGGER IF EXISTS habit_logs_management_required;
      DROP TRIGGER IF EXISTS time_boxes_management_required;
      DROP TRIGGER IF EXISTS day_presets_management_required;
      DROP TRIGGER IF EXISTS day_preset_blocks_management_required;
      DROP TRIGGER IF EXISTS day_preset_schedules_management_required;

      DELETE FROM lifeflow_tombstones;
      DROP TABLE IF EXISTS habit_logs;
      DROP TABLE IF EXISTS time_boxes;
      DROP TABLE IF EXISTS day_preset_schedules;
      DROP TABLE IF EXISTS day_preset_blocks;
      DROP TABLE IF EXISTS day_presets;
      DROP TABLE IF EXISTS habits;

      CREATE TABLE items (
        id TEXT PRIMARY KEY NOT NULL,
        management_id TEXT NOT NULL REFERENCES managements(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('habit', 'event')),
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        starts_on TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        break_durations_json TEXT NOT NULL DEFAULT '[]',
        recurrence_frequency TEXT CHECK (recurrence_frequency IS NULL OR recurrence_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
        recurrence_interval INTEGER NOT NULL DEFAULT 1 CHECK (recurrence_interval >= 1),
        recurrence_weekdays_json TEXT NOT NULL DEFAULT '[]',
        recurrence_ends_on TEXT,
        system_type TEXT CHECK (system_type IS NULL OR system_type IN ('app_check_in', 'journal')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (management_id, id),
        CHECK ((start_time IS NULL) = (end_time IS NULL)),
        CHECK (start_time IS NOT NULL OR break_durations_json = '[]'),
        CHECK (kind = 'event' OR recurrence_frequency IS NOT NULL),
        CHECK (recurrence_frequency IS NOT NULL OR recurrence_ends_on IS NULL),
        CHECK (kind = 'habit' OR system_type IS NULL)
      );
      CREATE TABLE habit_logs (
        management_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        date TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (management_id, item_id, date),
        FOREIGN KEY (management_id, item_id) REFERENCES items(management_id, id) ON DELETE CASCADE
      );
      CREATE TABLE item_exceptions (
        management_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        original_date TEXT NOT NULL,
        replacement_date TEXT,
        cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
        replacement_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (management_id, item_id, original_date),
        FOREIGN KEY (management_id, item_id) REFERENCES items(management_id, id) ON DELETE CASCADE,
        CHECK ((cancelled = 1 AND replacement_date IS NULL AND replacement_json IS NULL) OR
               (cancelled = 0 AND replacement_date IS NOT NULL AND replacement_json IS NOT NULL))
      );

      CREATE INDEX items_management_kind_idx ON items(management_id, kind, starts_on);
      CREATE UNIQUE INDEX items_management_system_idx ON items(management_id, system_type) WHERE system_type IS NOT NULL;
      CREATE INDEX habit_logs_management_date_idx ON habit_logs(management_id, date);
      CREATE INDEX item_exceptions_original_date_idx ON item_exceptions(management_id, original_date);
      CREATE INDEX item_exceptions_replacement_date_idx ON item_exceptions(management_id, replacement_date) WHERE replacement_date IS NOT NULL;

      CREATE TRIGGER items_sync_update AFTER UPDATE ON items WHEN NEW.updated_at IS OLD.updated_at BEGIN
        UPDATE items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE management_id = NEW.management_id AND id = NEW.id;
      END;
      CREATE TRIGGER habit_logs_sync_update AFTER UPDATE ON habit_logs WHEN NEW.updated_at IS OLD.updated_at BEGIN
        UPDATE habit_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE management_id = NEW.management_id AND item_id = NEW.item_id AND date = NEW.date;
      END;
      CREATE TRIGGER item_exceptions_sync_update AFTER UPDATE ON item_exceptions WHEN NEW.updated_at IS OLD.updated_at BEGIN
        UPDATE item_exceptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE management_id = NEW.management_id AND item_id = NEW.item_id AND original_date = NEW.original_date;
      END;
      CREATE TRIGGER items_sync_delete AFTER DELETE ON items BEGIN
        INSERT OR REPLACE INTO lifeflow_tombstones VALUES (OLD.management_id, 'item', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;
      CREATE TRIGGER habit_logs_sync_delete AFTER DELETE ON habit_logs BEGIN
        INSERT OR REPLACE INTO lifeflow_tombstones VALUES (OLD.management_id, 'habit_log', OLD.item_id || '|' || OLD.date, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;
      CREATE TRIGGER item_exceptions_sync_delete AFTER DELETE ON item_exceptions BEGIN
        INSERT OR REPLACE INTO lifeflow_tombstones VALUES (OLD.management_id, 'item_exception', OLD.item_id || '|' || OLD.original_date, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;


    `);

    const now = new Date().toISOString();
    const managements = await txn.getAllAsync<{ id: string; remote_id: string | null }>(
      "SELECT id, remote_id FROM managements WHERE deleted_at IS NULL",
    );
    for (const management of managements) {
      const systemScopeId = management.remote_id ?? management.id;
      await txn.runAsync(
        `INSERT INTO items (id, management_id, kind, name, color, starts_on, start_time, end_time, break_durations_json,
          recurrence_frequency, recurrence_interval, recurrence_weekdays_json, recurrence_ends_on, system_type, created_at, updated_at)
         VALUES (?, ?, 'habit', 'App check-in', '#5B8CFF', ?, NULL, NULL, '[]', 'daily', 1, '[]', NULL, 'app_check_in', ?, ?)`,
        `lifeflow-app-check-in-${systemScopeId}`, management.id, SYSTEM_ITEM_ANCHOR_DATE,
        SYSTEM_ITEM_ANCHOR_TIMESTAMP, now,
      );
      const journalEnabled = await isJournalEnabled(txn);
      if (journalEnabled) {
        await txn.runAsync(
          `INSERT INTO items (id, management_id, kind, name, color, starts_on, start_time, end_time, break_durations_json,
            recurrence_frequency, recurrence_interval, recurrence_weekdays_json, recurrence_ends_on, system_type, created_at, updated_at)
           VALUES (?, ?, 'habit', 'Daily Journal', '#A855F7', ?, NULL, NULL, '[]', 'daily', 1, '[]', NULL, 'journal', ?, ?)`,
          `lifeflow-journal-${systemScopeId}`, management.id, SYSTEM_ITEM_ANCHOR_DATE,
          SYSTEM_ITEM_ANCHOR_TIMESTAMP, now,
        );
      }
    }
    await txn.execAsync("PRAGMA user_version = 24");
  });
}
