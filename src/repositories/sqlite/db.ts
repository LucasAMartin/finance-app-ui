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
import type { SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'finance-app.db';
const DB_VERSION = 2;

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    migrate(db);
    seedIfEmpty(db);
  }
  return db;
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
          meta TEXT
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
          meta TEXT
        );

        ALTER TABLE incomes ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular';
        ALTER TABLE incomes ADD COLUMN received_at TEXT;
        ALTER TABLE incomes ADD COLUMN created_by_user_id TEXT;
        ALTER TABLE incomes ADD COLUMN updated_by_user_id TEXT;

        ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense';
        ALTER TABLE transactions ADD COLUMN recurring_rule_id TEXT;
        ALTER TABLE transactions ADD COLUMN visibility TEXT NOT NULL DEFAULT 'shared';
        ALTER TABLE transactions ADD COLUMN created_by_user_id TEXT;
        ALTER TABLE transactions ADD COLUMN updated_by_user_id TEXT;
      `);
    }
    database.execSync(`PRAGMA user_version = ${DB_VERSION}`);
  });
  if (version > 0) {
    backfillV2(database);
  }
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

    SEED_TRANSACTIONS.forEach(tx => {
      database.runSync(
        'INSERT INTO transactions (id, type, amount, merchant, category, occurred_at, note, recurring, recurring_rule_id, visibility, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
