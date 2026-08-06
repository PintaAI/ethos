import type { SQLiteDatabase } from "expo-sqlite";
import { withDbClearBarrier } from "@/lib/sync/dbLock";

const DATABASE_VERSION = 21;

async function hasColumn(db: SQLiteDatabase, table: string, column: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return columns.some((item) => item.name === column);
}

export async function migrateCashflowDatabase(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

  const result = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let currentVersion = result?.user_version ?? 0;

  if (currentVersion === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_preferences (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        name TEXT NOT NULL,
        email TEXT,
        image TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS managements (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        name TEXT NOT NULL,
        category TEXT,
        image TEXT,
        image_theme_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS management_members (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        management_id TEXT NOT NULL REFERENCES managements(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        UNIQUE(management_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        budget_daily INTEGER,
        budget_weekly INTEGER,
        budget_monthly INTEGER,
        budget_yearly INTEGER,
        management_id TEXT NOT NULL REFERENCES managements(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        UNIQUE(name, management_id)
      );

      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        notion_id TEXT,
        name TEXT NOT NULL,
        nominal INTEGER NOT NULL,
        original_nominal INTEGER,
        original_currency TEXT,
        exchange_rate_to_idr REAL,
        exchange_rate_at TEXT,
        category_id TEXT REFERENCES categories(id),
        date TEXT NOT NULL,
        io TEXT NOT NULL CHECK (io IN ('Income', 'Expenses')),
        management_id TEXT NOT NULL REFERENCES managements(id),
        created_by_id TEXT REFERENCES users(id),
        is_reconciliation INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS quick_fills (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        label TEXT NOT NULL,
        amount INTEGER,
        category_id TEXT REFERENCES categories(id),
        management_id TEXT NOT NULL REFERENCES managements(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS overall_budgets (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        management_id TEXT NOT NULL REFERENCES managements(id),
        period TEXT NOT NULL,
        nominal INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        UNIQUE(management_id, period)
      );

      CREATE TABLE IF NOT EXISTS recurring_entries (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        name TEXT NOT NULL,
        nominal INTEGER NOT NULL,
        category_id TEXT REFERENCES categories(id),
        io TEXT NOT NULL CHECK (io IN ('Income', 'Expenses')),
        management_id TEXT NOT NULL REFERENCES managements(id),
        frequency TEXT NOT NULL,
        next_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        remote_id TEXT,
        management_id TEXT NOT NULL REFERENCES managements(id),
        period TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS entries_date_created_idx ON entries(date, created_at, id);
      CREATE INDEX IF NOT EXISTS entries_io_date_idx ON entries(io, date);
      CREATE INDEX IF NOT EXISTS entries_category_idx ON entries(category_id);
      CREATE INDEX IF NOT EXISTS entries_management_idx ON entries(management_id);
      CREATE INDEX IF NOT EXISTS entries_created_by_idx ON entries(created_by_id);
      CREATE INDEX IF NOT EXISTS categories_management_idx ON categories(management_id);
      CREATE INDEX IF NOT EXISTS quick_fills_management_idx ON quick_fills(management_id);
    `);

    currentVersion = 1;
  }

  if (currentVersion < 2) {
    currentVersion = 2;
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS entries_remote_id_idx ON entries(remote_id);
      CREATE INDEX IF NOT EXISTS categories_remote_id_idx ON categories(remote_id);
      CREATE INDEX IF NOT EXISTS quick_fills_remote_id_idx ON quick_fills(remote_id);
      CREATE INDEX IF NOT EXISTS overall_budgets_remote_id_idx ON overall_budgets(remote_id);
      CREATE INDEX IF NOT EXISTS recurring_entries_remote_id_idx ON recurring_entries(remote_id);
      CREATE INDEX IF NOT EXISTS managements_remote_id_idx ON managements(remote_id);
      CREATE INDEX IF NOT EXISTS management_members_remote_id_idx ON management_members(remote_id);
    `);
    currentVersion = 3;
  }

  if (currentVersion < 4) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        DELETE FROM entries WHERE id LIKE 'wallet-%-entry-%' OR created_by_id = 'local-user-demo';
        DELETE FROM recurring_entries WHERE id LIKE 'wallet-%' OR management_id IN ('wallet-personal', 'wallet-household', 'wallet-business');
        DELETE FROM quick_fills WHERE id LIKE 'wallet-%-quick-%';
        DELETE FROM overall_budgets WHERE id LIKE 'wallet-%-budget-%';
        DELETE FROM categories WHERE id LIKE 'wallet-%-category-%';
        DELETE FROM audit_snapshots WHERE management_id IN ('wallet-personal', 'wallet-household', 'wallet-business');
        DELETE FROM management_members WHERE id LIKE 'wallet-%-member-%' OR user_id = 'local-user-demo';
        DELETE FROM managements WHERE id IN ('wallet-personal', 'wallet-household', 'wallet-business');
        DELETE FROM users WHERE id = 'local-user-demo';
        DELETE FROM app_preferences WHERE key = 'active_management_id' OR key = 'last_pulled_at';
      `);
    });
    currentVersion = 4;
  }

  if (currentVersion < 5) {
    await db.execAsync(`
      UPDATE categories SET color = CASE color
        WHEN 'default' THEN '#64748b'
        WHEN 'gray' THEN '#6b7280'
        WHEN 'brown' THEN '#d97706'
        WHEN 'orange' THEN '#f97316'
        WHEN 'yellow' THEN '#eab308'
        WHEN 'green' THEN '#22c55e'
        WHEN 'blue' THEN '#3b82f6'
        WHEN 'purple' THEN '#a855f7'
        WHEN 'pink' THEN '#ec4899'
        WHEN 'red' THEN '#ef4444'
        ELSE color
      END
      WHERE color IS NOT NULL AND color NOT LIKE '#%';

      UPDATE categories SET icon = CASE icon
        WHEN 'Alert01Icon' THEN 'exclamationmark.triangle.fill'
        WHEN 'Audit01Icon' THEN 'checkmark.seal.fill'
        WHEN 'BookEditIcon' THEN 'book.fill'
        WHEN 'Briefcase01Icon' THEN 'briefcase.fill'
        WHEN 'Bus01Icon' THEN 'bus.fill'
        WHEN 'Calendar03Icon' THEN 'calendar'
        WHEN 'Camera01Icon' THEN 'camera.fill'
        WHEN 'CleanIcon' THEN 'sparkles'
        WHEN 'Coffee01Icon' THEN 'cup.and.saucer.fill'
        WHEN 'CookieIcon' THEN 'birthday.cake.fill'
        WHEN 'CreditCardIcon' THEN 'creditcard.fill'
        WHEN 'Diamond01Icon' THEN 'diamond.fill'
        WHEN 'Dumbbell01Icon' THEN 'dumbbell.fill'
        WHEN 'FavouriteIcon' THEN 'heart.fill'
        WHEN 'GameController01Icon' THEN 'gamecontroller.fill'
        WHEN 'GiftIcon' THEN 'gift.fill'
        WHEN 'HealthIcon' THEN 'cross.case.fill'
        WHEN 'Home01Icon' THEN 'house.fill'
        WHEN 'Image01Icon' THEN 'photo.fill'
        WHEN 'Invoice01Icon' THEN 'receipt.fill'
        WHEN 'Laundry' THEN 'washer.fill'
        WHEN 'MoneyReceiveIcon' THEN 'arrow.down.circle.fill'
        WHEN 'MoneySendIcon' THEN 'arrow.up.circle.fill'
        WHEN 'More01Icon' THEN 'tag.fill'
        WHEN 'PinIcon' THEN 'pin.fill'
        WHEN 'SchoolIcon' THEN 'graduationcap.fill'
        WHEN 'Share01Icon' THEN 'square.and.arrow.up'
        WHEN 'ShoppingCart01Icon' THEN 'basket.fill'
        WHEN 'SmartPhone01Icon' THEN 'smartphone'
        WHEN 'TShirtIcon' THEN 'tshirt.fill'
        WHEN 'UserGroupIcon' THEN 'person.2.fill'
        WHEN 'Wallet01Icon' THEN 'wallet.pass.fill'
        WHEN 'Water' THEN 'drop.fill'
        ELSE icon
      END
      WHERE icon IS NOT NULL;
    `);
    currentVersion = 5;
  }

  if (currentVersion < 6) {
    const memberCountCol = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM pragma_table_info('managements') WHERE name = 'member_count'",
    );
    if (!memberCountCol) {
      await db.execAsync("ALTER TABLE managements ADD COLUMN member_count INTEGER NOT NULL DEFAULT 0;");
    }
    currentVersion = 6;
  }

  if (currentVersion < 7) {
    await db.execAsync(`
      UPDATE entries
      SET
        original_nominal = COALESCE(original_nominal, nominal),
        original_currency = COALESCE(original_currency, 'IDR'),
        exchange_rate_to_idr = COALESCE(exchange_rate_to_idr, 1),
        exchange_rate_at = COALESCE(exchange_rate_at, created_at)
      WHERE
        original_nominal IS NULL
        OR original_currency IS NULL
        OR exchange_rate_to_idr IS NULL
        OR exchange_rate_at IS NULL;
    `);
    currentVersion = 7;
  }

  if (currentVersion < 8) {
    currentVersion = 8;
  }

  if (currentVersion < 9) {
    const reminderTimeCol = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM pragma_table_info('recurring_entries') WHERE name = 'reminder_time'",
    );
    if (reminderTimeCol) {
      await db.execAsync("ALTER TABLE recurring_entries DROP COLUMN reminder_time;");
    }
    currentVersion = 9;
  }

  if (currentVersion < 10) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS note_cache (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        icon TEXT NOT NULL,
        icon_type TEXT NOT NULL,
        icon_color TEXT NOT NULL,
        content_json TEXT,
        content_html TEXT,
        content_markdown TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL,
        member_count INTEGER NOT NULL DEFAULT 1,
        members_json TEXT NOT NULL DEFAULT '[]',
        server_updated_at TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (user_id, id)
      );

      CREATE TABLE IF NOT EXISTS note_drafts (
        user_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        content_json TEXT NOT NULL,
        base_updated_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        PRIMARY KEY (user_id, note_id),
        FOREIGN KEY (user_id, note_id) REFERENCES note_cache(user_id, id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS note_cache_user_updated_idx
      ON note_cache(user_id, pinned, server_updated_at);
    `);
    currentVersion = 10;
  }

  if (currentVersion < 11) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        PRIMARY KEY (habit_id, date)
      );

      CREATE TABLE IF NOT EXISTS time_boxes (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS habit_logs_date_idx ON habit_logs(date);
      CREATE INDEX IF NOT EXISTS time_boxes_date_time_idx ON time_boxes(date, start_time);
    `);
    currentVersion = 11;
  }

  if (currentVersion < 12) {
    await db.execAsync("ALTER TABLE time_boxes ADD COLUMN color TEXT;");
    currentVersion = 12;
  }

  if (currentVersion < 13) {
    await db.execAsync(`
      UPDATE time_boxes SET color = '#5B8CFF'
      WHERE color IS NULL AND lower(trim(title)) IN ('sleep', 'tidur');

      UPDATE time_boxes SET color = '#2ECF8F'
      WHERE color IS NULL AND lower(trim(title)) IN ('work', 'kerja');
    `);
    currentVersion = 13;
  }

  if (currentVersion < 14) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS day_presets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS day_preset_blocks (
        id TEXT PRIMARY KEY NOT NULL,
        preset_id TEXT NOT NULL REFERENCES day_presets(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        color TEXT,
        sort_order INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS day_preset_schedules (
        id TEXT PRIMARY KEY NOT NULL,
        preset_id TEXT NOT NULL REFERENCES day_presets(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        frequency TEXT NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly')),
        weekdays_json TEXT NOT NULL DEFAULT '[]',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

    `);
    if (!await hasColumn(db, "time_boxes", "preset_schedule_id")) {
      await db.execAsync("ALTER TABLE time_boxes ADD COLUMN preset_schedule_id TEXT;");
    }
    if (!await hasColumn(db, "time_boxes", "preset_block_id")) {
      await db.execAsync("ALTER TABLE time_boxes ADD COLUMN preset_block_id TEXT;");
    }
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS time_boxes_preset_occurrence_idx
      ON time_boxes(preset_schedule_id, preset_block_id, date)
      WHERE preset_schedule_id IS NOT NULL AND preset_block_id IS NOT NULL;
    `);
    currentVersion = 14;
  }

  if (currentVersion < 15) {
    if (!await hasColumn(db, "time_boxes", "break_durations_json")) {
      await db.execAsync("ALTER TABLE time_boxes ADD COLUMN break_durations_json TEXT NOT NULL DEFAULT '[]';");
    }
    if (!await hasColumn(db, "day_preset_blocks", "break_durations_json")) {
      await db.execAsync("ALTER TABLE day_preset_blocks ADD COLUMN break_durations_json TEXT NOT NULL DEFAULT '[]';");
    }
    currentVersion = 15;
  }

  if (currentVersion < 16) {
    if (!await hasColumn(db, "time_boxes", "dismissed")) {
      await db.execAsync("ALTER TABLE time_boxes ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0;");
    }
    currentVersion = 16;
  }

  if (currentVersion < 17) {
    await db.execAsync(`
      DELETE FROM time_boxes
      WHERE preset_schedule_id IS NOT NULL
        AND completed = 0
        AND NOT EXISTS (
          SELECT 1 FROM day_preset_schedules
          WHERE day_preset_schedules.id = time_boxes.preset_schedule_id
        );
    `);
    currentVersion = 17;
  }

  if (currentVersion < 18) {
    if (!await hasColumn(db, "habits", "weekdays_json")) {
      await db.execAsync("ALTER TABLE habits ADD COLUMN weekdays_json TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]';");
    }
    currentVersion = 18;
  }

  if (currentVersion < 19) {
    if (!await hasColumn(db, "habits", "preferred_duration")) {
      await db.execAsync("ALTER TABLE habits ADD COLUMN preferred_duration INTEGER NOT NULL DEFAULT 30;");
    }
    if (!await hasColumn(db, "time_boxes", "habit_id")) {
      await db.execAsync("ALTER TABLE time_boxes ADD COLUMN habit_id TEXT REFERENCES habits(id) ON DELETE SET NULL;");
    }
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS time_boxes_habit_date_idx
      ON time_boxes(habit_id, date)
      WHERE habit_id IS NOT NULL;
    `);
    currentVersion = 19;
  }

  if (currentVersion < 20) {
    await db.execAsync(`
      DELETE FROM time_boxes
      WHERE preset_schedule_id IS NOT NULL
        AND completed = 0
        AND dismissed = 0
        AND EXISTS (
          SELECT 1
          FROM day_preset_blocks b
          JOIN day_preset_schedules s ON s.preset_id = b.preset_id
          WHERE s.id = time_boxes.preset_schedule_id
            AND b.id = time_boxes.preset_block_id
            AND b.title = time_boxes.title
            AND b.start_time = time_boxes.start_time
            AND b.end_time = time_boxes.end_time
            AND b.break_durations_json = time_boxes.break_durations_json
            AND b.color IS time_boxes.color
        );
    `);
    currentVersion = 20;
  }

  if (currentVersion < 21) {
    if (!(await hasColumn(db, "managements", "category"))) {
      await db.execAsync("ALTER TABLE managements ADD COLUMN category TEXT;");
    }
    currentVersion = 21;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export async function clearCashflowDatabase(db: SQLiteDatabase) {
  await withDbClearBarrier(() => db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DELETE FROM entries;
      DELETE FROM recurring_entries;
      DELETE FROM quick_fills;
      DELETE FROM overall_budgets;
      DELETE FROM categories;
      DELETE FROM audit_snapshots;
      DELETE FROM management_members;
      DELETE FROM managements;
      DELETE FROM users;
      DELETE FROM note_drafts;
      DELETE FROM note_cache;
      DELETE FROM habit_logs;
      DELETE FROM habits;
      DELETE FROM time_boxes;
      DELETE FROM day_preset_schedules;
      DELETE FROM day_preset_blocks;
      DELETE FROM day_presets;
      DELETE FROM app_preferences;
    `);
  }));
}
