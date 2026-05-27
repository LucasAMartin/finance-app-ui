import * as SQLite from 'expo-sqlite';
import {
  SEED_BILLS,
  SEED_BUDGETS,
  SEED_INCOME,
  SEED_SETTINGS,
  SEED_TRANSACTIONS,
} from '../../data';
import { shiftedSeedDate } from '../transactionDates';
import type { SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'finance-app.db';
const DB_VERSION = 1;

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
          amount REAL NOT NULL,
          source TEXT NOT NULL,
          cadence TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT,
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          merchant TEXT NOT NULL,
          category TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          note TEXT,
          recurring INTEGER NOT NULL DEFAULT 0,
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
    database.execSync(`PRAGMA user_version = ${DB_VERSION}`);
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
        'INSERT INTO incomes (id, amount, source, cadence, start_date, end_date, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
        income.id,
        income.amount,
        income.source,
        income.cadence,
        income.startDate,
        income.endDate ?? null,
        json(income.meta),
      );
    });

    SEED_TRANSACTIONS.forEach(tx => {
      database.runSync(
        'INSERT INTO transactions (id, amount, merchant, category, occurred_at, note, recurring, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        tx.id,
        tx.amount,
        tx.merchant,
        tx.cat,
        shiftedSeedDate(tx),
        tx.note,
        tx.recurring ? 1 : 0,
        json(tx.meta),
      );
    });

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
  });
}

export function json(value: Record<string, unknown> | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}

export function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
