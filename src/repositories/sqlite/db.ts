import * as SQLite from 'expo-sqlite';
import {
  SEED_BILLS,
  SEED_BUDGETS,
  SEED_CATEGORIES,
  SEED_INCOME,
  SEED_RECURRING_RULES,
  SEED_SETTINGS,
  SEED_TRANSACTIONS,
} from '../../data';
import { shiftedSeedDate } from '../transactionDates';
export { parseJson } from '../json';
import type { SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'finance-app.db';
const DB_VERSION = 8;

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    configureDb(db);
    migrate(db);
    seedIfEmpty(db);
  }
  return db;
}

function configureDb(database: SQLiteDatabase) {
  database.execSync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
}

function migrate(database: SQLiteDatabase) {
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= DB_VERSION) return;

  database.withTransactionSync(() => {
    if (version < 1) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS settings (
          id TEXT PRIMARY KEY NOT NULL,
          theme_dark INTEGER NOT NULL,
          accent_key TEXT NOT NULL,
          card_style TEXT NOT NULL,
          wallpaper_id TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS incomes (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL DEFAULT 'regular',
          amount REAL NOT NULL,
          source TEXT NOT NULL,
          cadence TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT,
          received_at TEXT,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL DEFAULT 'expense',
          amount REAL NOT NULL,
          merchant TEXT NOT NULL,
          category TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          note TEXT,
          recurring INTEGER NOT NULL DEFAULT 0,
          recurring_rule_id TEXT,
          visibility TEXT NOT NULL DEFAULT 'shared',
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS budgets (
          id TEXT PRIMARY KEY NOT NULL,
          month TEXT NOT NULL,
          group_key TEXT,
          category TEXT,
          label TEXT,
          icon TEXT,
          amount REAL NOT NULL,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL,
          label TEXT NOT NULL,
          icon TEXT NOT NULL,
          group_key TEXT NOT NULL,
          default_budget REAL NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS recurring_rules (
          id TEXT PRIMARY KEY NOT NULL,
          merchant TEXT NOT NULL,
          category TEXT NOT NULL,
          amount REAL NOT NULL,
          cadence TEXT NOT NULL,
          start_date TEXT NOT NULL,
          next_due_date TEXT NOT NULL,
          day_of_month INTEGER,
          month_of_year INTEGER,
          estimate INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY NOT NULL,
          transaction_id TEXT NOT NULL,
          local_uri TEXT NOT NULL,
          type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          cloud_asset_id TEXT,
          meta TEXT,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bills (
          id TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          merchant TEXT NOT NULL,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          category TEXT NOT NULL,
          due_date TEXT NOT NULL,
          recurring INTEGER NOT NULL DEFAULT 1,
          days_until INTEGER NOT NULL DEFAULT 0,
          estimate INTEGER NOT NULL DEFAULT 0,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS merchant_logos (
          merchant_key TEXT PRIMARY KEY NOT NULL,
          display_name TEXT,
          domain TEXT,
          logo_url TEXT,
          bg_color TEXT,
          status TEXT NOT NULL,
          source TEXT,
          last_checked_at TEXT NOT NULL,
          retry_after TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          meta TEXT
        );
      `);
    }
    if (version >= 1 && version < 2) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL,
          label TEXT NOT NULL,
          icon TEXT NOT NULL,
          group_key TEXT NOT NULL,
          default_budget REAL NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS recurring_rules (
          id TEXT PRIMARY KEY NOT NULL,
          merchant TEXT NOT NULL,
          category TEXT NOT NULL,
          amount REAL NOT NULL,
          cadence TEXT NOT NULL,
          start_date TEXT NOT NULL,
          next_due_date TEXT NOT NULL,
          day_of_month INTEGER,
          month_of_year INTEGER,
          estimate INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY NOT NULL,
          transaction_id TEXT NOT NULL,
          local_uri TEXT NOT NULL,
          type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          cloud_asset_id TEXT,
          meta TEXT,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
        );

      `);
      addColumnIfMissing(database, 'incomes', 'kind', "TEXT NOT NULL DEFAULT 'regular'");
      addColumnIfMissing(database, 'incomes', 'received_at', 'TEXT');
      addColumnIfMissing(database, 'incomes', 'created_by_user_id', 'TEXT');
      addColumnIfMissing(database, 'incomes', 'updated_by_user_id', 'TEXT');

      addColumnIfMissing(database, 'transactions', 'type', "TEXT NOT NULL DEFAULT 'expense'");
      addColumnIfMissing(database, 'transactions', 'recurring_rule_id', 'TEXT');
      addColumnIfMissing(database, 'transactions', 'visibility', "TEXT NOT NULL DEFAULT 'shared'");
      addColumnIfMissing(database, 'transactions', 'created_by_user_id', 'TEXT');
      addColumnIfMissing(database, 'transactions', 'updated_by_user_id', 'TEXT');
    }
    if (version < 3) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS merchant_logos (
          merchant_key TEXT PRIMARY KEY NOT NULL,
          display_name TEXT,
          domain TEXT,
          logo_url TEXT,
          status TEXT NOT NULL,
          source TEXT,
          last_checked_at TEXT NOT NULL,
          retry_after TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          meta TEXT
        );
      `);
    }
    if (version >= 1 && version < 4) {
      // Replace the original 7-row sample with the richer ~6-month seed.
      // Only the known seed ids are removed, so user-added rows are preserved.
      // Fresh databases (version 0) skip this and get seeded by seedIfEmpty.
      database.runSync(
        `DELETE FROM transactions WHERE id IN ('t1','t2','t3','t4','t5','t6','t7')`,
      );
      insertSeedTransactions(database);
    }
    if (version < 5) {
      database.execSync(`
        CREATE INDEX IF NOT EXISTS idx_transactions_occurred_id
        ON transactions (occurred_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_transactions_category_occurred
        ON transactions (category, occurred_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_transactions_type_occurred
        ON transactions (type, occurred_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_transactions_amount_occurred_id
        ON transactions (amount DESC, occurred_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_transactions_category_merchant_occurred_id
        ON transactions (category, merchant, occurred_at DESC, id DESC);
      `);
    }
    // v6 was a one-time merchant_logos cache flush for the Brandfetch → Logo.dev
    // resolver migration. Removed after it ran on the only device; the version
    // number is retained so schema/device versions stay consistent.
    if (version < 7) {
      // Resolver now returns a server-sampled `bgColor` per logo; add the column.
      // (A one-time cache flush ran here too for the only device, now removed; the
      // column add stays — the repo reads/writes bg_color, so it must exist.)
      addColumnIfMissing(database, 'merchant_logos', 'bg_color', 'TEXT');
    }
    if (version < 8) {
      database.execSync(`
        CREATE INDEX IF NOT EXISTS idx_transactions_occurred_asc_id_asc
        ON transactions (occurred_at ASC, id ASC);

        CREATE INDEX IF NOT EXISTS idx_transactions_amount_asc_occurred_id
        ON transactions (amount ASC, occurred_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_attachments_transaction_id
        ON attachments (transaction_id);

        CREATE INDEX IF NOT EXISTS idx_budgets_month_group_category
        ON budgets (month DESC, group_key, category);

        CREATE INDEX IF NOT EXISTS idx_incomes_start_id
        ON incomes (start_date DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_due
        ON recurring_rules (active DESC, next_due_date ASC, merchant);

        CREATE INDEX IF NOT EXISTS idx_bills_due_id
        ON bills (days_until ASC, id);

        CREATE INDEX IF NOT EXISTS idx_categories_active_sort
        ON categories (archived, group_key, sort_order, label);
      `);
      database.runSync(`
        DELETE FROM attachments
        WHERE transaction_id NOT IN (SELECT id FROM transactions)
      `);
    }
    database.execSync(`PRAGMA user_version = ${DB_VERSION}`);
  });
  if (version > 0) {
    backfillV2(database);
  }
}

function insertSeedTransactions(database: SQLiteDatabase) {
  SEED_TRANSACTIONS.forEach(tx => {
    database.runSync(
      'INSERT OR IGNORE INTO transactions (id, type, amount, merchant, category, occurred_at, note, recurring, recurring_rule_id, visibility, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      tx.id,
      tx.type ?? 'expense',
      tx.amount,
      tx.merchant,
      tx.cat,
      shiftedSeedDate(tx),
      tx.note,
      tx.recurring ? 1 : 0,
      tx.recurringRuleId ?? null,
      tx.visibility ?? 'shared',
      tx.createdByUserId ?? 'local',
      tx.updatedByUserId ?? 'local',
      json(tx.meta),
    );
  });
}

function seedIfEmpty(database: SQLiteDatabase) {
  const row = database.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM settings');
  if ((row?.count ?? 0) > 0) return;

  database.withTransactionSync(() => {
    database.runSync(
      'INSERT INTO settings (id, theme_dark, accent_key, card_style, wallpaper_id, meta) VALUES (?, ?, ?, ?, ?, ?)',
      SEED_SETTINGS.id,
      SEED_SETTINGS.themeDark ? 1 : 0,
      SEED_SETTINGS.accentKey,
      SEED_SETTINGS.cardStyle,
      SEED_SETTINGS.wallpaperId ?? null,
      json(SEED_SETTINGS.meta),
    );

    SEED_INCOME.forEach(income => {
      database.runSync(
        'INSERT INTO incomes (id, kind, amount, source, cadence, start_date, end_date, received_at, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        income.id,
        income.kind ?? 'regular',
        income.amount,
        income.source,
        income.cadence,
        income.startDate,
        income.endDate ?? null,
        income.receivedAt ?? null,
        income.createdByUserId ?? 'local',
        income.updatedByUserId ?? 'local',
        json(income.meta),
      );
    });

    insertSeedTransactions(database);

    SEED_CATEGORIES.forEach(cat => insertCategory(database, cat));

    SEED_BUDGETS.forEach(budget => {
      database.runSync(
        'INSERT INTO budgets (id, month, group_key, category, label, icon, amount, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        budget.id,
        budget.month,
        budget.group ?? null,
        budget.category ?? null,
        budget.label ?? null,
        budget.icon ?? null,
        budget.amount,
        json(budget.meta),
      );
    });

    SEED_BILLS.forEach(bill => {
      database.runSync(
        'INSERT INTO bills (id, amount, merchant, name, icon, category, due_date, recurring, days_until, estimate, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        bill.id,
        bill.amount,
        bill.merchant,
        bill.name,
        bill.icon,
        bill.cat,
        bill.dueDate,
        bill.recurring ? 1 : 0,
        bill.daysUntil,
        bill.estimate ? 1 : 0,
        json(bill.meta),
      );
    });

    SEED_RECURRING_RULES.forEach(rule => {
      database.runSync(
        'INSERT INTO recurring_rules (id, merchant, category, amount, cadence, start_date, next_due_date, day_of_month, month_of_year, estimate, active, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        rule.id,
        rule.merchant,
        rule.cat,
        rule.amount,
        rule.cadence,
        rule.startDate,
        nextDueFromSeed(rule.dayOfMonth ?? new Date(rule.nextDueDate).getDate()),
        rule.dayOfMonth ?? null,
        rule.monthOfYear ?? null,
        rule.estimate ? 1 : 0,
        rule.active ? 1 : 0,
        rule.createdByUserId ?? 'local',
        rule.updatedByUserId ?? 'local',
        json(rule.meta),
      );
    });
  });
}

function backfillV2(database: SQLiteDatabase) {
  const categories = database.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if ((categories?.count ?? 0) === 0) {
    SEED_CATEGORIES.forEach(cat => insertCategory(database, cat));
    SEED_BUDGETS.forEach(budget => {
      if (budget.category) {
        database.runSync('UPDATE budgets SET category = ? WHERE id = ?', budget.category, budget.id);
      }
    });
  }

  const recurring = database.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM recurring_rules');
  if ((recurring?.count ?? 0) === 0) {
    SEED_RECURRING_RULES.forEach(rule => {
      database.runSync(
        'INSERT INTO recurring_rules (id, merchant, category, amount, cadence, start_date, next_due_date, day_of_month, month_of_year, estimate, active, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        rule.id,
        rule.merchant,
        rule.cat,
        rule.amount,
        rule.cadence,
        rule.startDate,
        nextDueFromSeed(rule.dayOfMonth ?? new Date(rule.nextDueDate).getDate()),
        rule.dayOfMonth ?? null,
        rule.monthOfYear ?? null,
        rule.estimate ? 1 : 0,
        rule.active ? 1 : 0,
        rule.createdByUserId ?? 'local',
        rule.updatedByUserId ?? 'local',
        json(rule.meta),
      );
    });
  }
}

function insertCategory(database: SQLiteDatabase, cat: (typeof SEED_CATEGORIES)[number]) {
  database.runSync(
    'INSERT OR REPLACE INTO categories (id, label, icon, group_key, default_budget, sort_order, archived, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    cat.id,
    cat.label,
    cat.icon,
    cat.group,
    cat.defaultBudget,
    cat.sortOrder,
    cat.archived ? 1 : 0,
    cat.createdByUserId ?? 'local',
    cat.updatedByUserId ?? 'local',
    json(cat.meta),
  );
}

function columnExists(database: SQLiteDatabase, table: string, column: string): boolean {
  return database
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
    .some(row => row.name === column);
}

function addColumnIfMissing(database: SQLiteDatabase, table: string, column: string, definition: string) {
  if (!columnExists(database, table, column)) {
    database.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function nextDueFromSeed(dayOfMonth: number): string {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), Math.min(dayOfMonth, 28), 9, 0, 0, 0);
  if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
  return candidate.toISOString();
}

export function json(value: Record<string, unknown> | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}

export function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
