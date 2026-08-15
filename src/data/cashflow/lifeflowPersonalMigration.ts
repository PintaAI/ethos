import type { SQLiteDatabase } from "expo-sqlite";

export async function migratePersonalLifeFlow(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DROP TRIGGER IF EXISTS items_sync_update;
      DROP TRIGGER IF EXISTS habit_logs_sync_update;
      DROP TRIGGER IF EXISTS item_exceptions_sync_update;
      DROP TRIGGER IF EXISTS items_sync_delete;
      DROP TRIGGER IF EXISTS habit_logs_sync_delete;
      DROP TRIGGER IF EXISTS item_exceptions_sync_delete;

      DROP TABLE IF EXISTS habit_logs;
      DROP TABLE IF EXISTS item_exceptions;
      DROP TABLE IF EXISTS items;
      DROP TABLE IF EXISTS lifeflow_tombstones;

      CREATE TABLE items (
        id TEXT PRIMARY KEY NOT NULL,
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
        CHECK ((start_time IS NULL) = (end_time IS NULL)),
        CHECK (start_time IS NOT NULL OR break_durations_json = '[]'),
        CHECK (kind = 'event' OR recurrence_frequency IS NOT NULL),
        CHECK (recurrence_frequency IS NOT NULL OR recurrence_ends_on IS NULL),
        CHECK (kind = 'habit' OR system_type IS NULL)
      );
      CREATE TABLE habit_logs (
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (item_id, date)
      );
      CREATE TABLE item_exceptions (
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        original_date TEXT NOT NULL,
        replacement_date TEXT,
        cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
        replacement_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (item_id, original_date),
        CHECK ((cancelled = 1 AND replacement_date IS NULL AND replacement_json IS NULL) OR
               (cancelled = 0 AND replacement_date IS NOT NULL AND replacement_json IS NOT NULL))
      );
      CREATE TABLE lifeflow_tombstones (
        kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, entity_id)
      );

      CREATE INDEX items_kind_idx ON items(kind, starts_on);
      CREATE UNIQUE INDEX items_system_idx ON items(system_type) WHERE system_type IS NOT NULL;
      CREATE INDEX habit_logs_date_idx ON habit_logs(date);
      CREATE INDEX item_exceptions_original_date_idx ON item_exceptions(original_date);
      CREATE INDEX item_exceptions_replacement_date_idx ON item_exceptions(replacement_date) WHERE replacement_date IS NOT NULL;

      CREATE TRIGGER items_sync_update AFTER UPDATE ON items WHEN NEW.updated_at IS OLD.updated_at BEGIN
        UPDATE items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
      END;
      CREATE TRIGGER habit_logs_sync_update AFTER UPDATE ON habit_logs WHEN NEW.updated_at IS OLD.updated_at BEGIN
        UPDATE habit_logs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE item_id = NEW.item_id AND date = NEW.date;
      END;
      CREATE TRIGGER item_exceptions_sync_update AFTER UPDATE ON item_exceptions WHEN NEW.updated_at IS OLD.updated_at BEGIN
        UPDATE item_exceptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE item_id = NEW.item_id AND original_date = NEW.original_date;
      END;
      CREATE TRIGGER items_sync_delete AFTER DELETE ON items BEGIN
        INSERT OR REPLACE INTO lifeflow_tombstones VALUES ('item', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;
      CREATE TRIGGER habit_logs_sync_delete AFTER DELETE ON habit_logs BEGIN
        INSERT OR REPLACE INTO lifeflow_tombstones VALUES ('habit_log', OLD.item_id || '|' || OLD.date, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;
      CREATE TRIGGER item_exceptions_sync_delete AFTER DELETE ON item_exceptions BEGIN
        INSERT OR REPLACE INTO lifeflow_tombstones VALUES ('item_exception', OLD.item_id || '|' || OLD.original_date, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      DELETE FROM app_preferences WHERE key = 'lifeflow_journal_enabled' OR key LIKE 'lifeflow_journal_enabled:%';
    `);
  });
}
