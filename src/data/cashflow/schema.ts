import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 9;

export async function migrateCashflowDatabase(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

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

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export async function clearCashflowDatabase(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
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
      DELETE FROM app_preferences;
    `);
  });
}
