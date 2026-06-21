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
import type { AppSession, Ledger, LedgerMember, SyncFields, SyncStatus } from '../types';
import { openSQLiteDatabaseSync, type SQLiteDatabaseLike } from './driver';

const DB_NAME = 'finance-app.db';
const DB_VERSION = 10;
export const DEFAULT_LEDGER_ID = 'ledger-default';
export const DEFAULT_OWNER_USER_ID = 'alex';
export const DEV_PARTNER_USER_ID = 'partner';
const DEFAULT_LEDGER_NAME = 'Shared finances';

let db: SQLiteDatabaseLike | null = null;
let currentUserId = DEFAULT_OWNER_USER_ID;
let activeLedgerId = DEFAULT_LEDGER_ID;
const sessionListeners = new Set<() => void>();

export function getDb(): SQLiteDatabaseLike {
  if (!db) {
    db = openSQLiteDatabaseSync(DB_NAME);
    configureDb(db);
    migrate(db);
    seedIfEmpty(db);
  }
  return db;
}

export function resetSQLiteDatabaseForTests(setup?: (database: SQLiteDatabaseLike) => void): SQLiteDatabaseLike {
  db?.closeSync?.();
  db = openSQLiteDatabaseSync(':memory:');
  currentUserId = DEFAULT_OWNER_USER_ID;
  activeLedgerId = DEFAULT_LEDGER_ID;
  sessionListeners.clear();
  configureDb(db);
  setup?.(db);
  migrate(db);
  seedIfEmpty(db);
  return db;
}

function configureDb(database: SQLiteDatabaseLike) {
  database.execSync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
}

function migrate(database: SQLiteDatabaseLike) {
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
    if (version < 9) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS ledgers (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          owner_user_id TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          cloud_record_name TEXT,
          cloud_zone_name TEXT,
          record_change_tag TEXT,
          sync_status TEXT NOT NULL DEFAULT 'local',
          meta TEXT
        );

        CREATE TABLE IF NOT EXISTS ledger_members (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          status TEXT NOT NULL DEFAULT 'active',
          allow_others_to_edit_my_items INTEGER NOT NULL DEFAULT 1,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          cloud_record_name TEXT,
          cloud_zone_name TEXT,
          record_change_tag TEXT,
          sync_status TEXT NOT NULL DEFAULT 'local',
          meta TEXT,
          UNIQUE (ledger_id, user_id)
        );
      `);

      addSyncColumns(database, 'transactions');
      addSyncColumns(database, 'incomes');
      addSyncColumns(database, 'categories');
      addSyncColumns(database, 'budgets');
      addSyncColumns(database, 'recurring_rules');
      addSyncColumns(database, 'attachments');
      addSyncColumns(database, 'bills');

      database.execSync(`
        CREATE INDEX IF NOT EXISTS idx_transactions_ledger_deleted_occurred
        ON transactions (ledger_id, deleted_at, occurred_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_incomes_ledger_deleted_start
        ON incomes (ledger_id, deleted_at, start_date DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_categories_ledger_deleted_sort
        ON categories (ledger_id, deleted_at, archived, group_key, sort_order, label);

        CREATE INDEX IF NOT EXISTS idx_budgets_ledger_deleted_month
        ON budgets (ledger_id, deleted_at, month DESC, group_key, category);

        CREATE INDEX IF NOT EXISTS idx_recurring_rules_ledger_deleted_due
        ON recurring_rules (ledger_id, deleted_at, active DESC, next_due_date ASC, merchant);

        CREATE INDEX IF NOT EXISTS idx_attachments_ledger_deleted_created
        ON attachments (ledger_id, deleted_at, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_bills_ledger_deleted_due
        ON bills (ledger_id, deleted_at, days_until ASC, id);

        CREATE INDEX IF NOT EXISTS idx_ledger_members_ledger_status
        ON ledger_members (ledger_id, status, user_id);
      `);

      backfillDefaultLedger(database);
    }
    if (version < 10) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS sync_state (
          zone_name TEXT PRIMARY KEY NOT NULL,
          change_token TEXT,
          updated_at TEXT NOT NULL
        );
      `);
    }
    database.execSync(`PRAGMA user_version = ${DB_VERSION}`);
  });
  if (version > 0) {
    backfillV2(database);
  }
}

function insertSeedTransactions(database: SQLiteDatabaseLike) {
  SEED_TRANSACTIONS.forEach(tx => {
    const now = new Date().toISOString();
    database.runSync(
      `INSERT OR IGNORE INTO transactions (
        id, type, amount, merchant, category, occurred_at, note, recurring,
        recurring_rule_id, visibility, created_by_user_id, updated_by_user_id,
        ledger_id, created_at, updated_at, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      tx.createdByUserId ?? DEFAULT_OWNER_USER_ID,
      tx.updatedByUserId ?? DEFAULT_OWNER_USER_ID,
      tx.ledgerId ?? activeLedgerId,
      tx.createdAt ?? now,
      tx.updatedAt ?? now,
      tx.syncStatus ?? 'local',
      json(tx.meta),
    );
  });
}

function seedIfEmpty(database: SQLiteDatabaseLike) {
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

    insertSeedDomainData(database);
  });
}

export function isDevSeedDataEnabled(): boolean {
  const database = getDb();
  const row = database.getFirstSync<{ count: number }>(`
    SELECT
      (SELECT COUNT(*) FROM transactions) +
      (SELECT COUNT(*) FROM incomes) +
      (SELECT COUNT(*) FROM budgets) +
      (SELECT COUNT(*) FROM bills) +
      (SELECT COUNT(*) FROM categories) +
      (SELECT COUNT(*) FROM recurring_rules) +
      (SELECT COUNT(*) FROM attachments) AS count
  `);
  return (row?.count ?? 0) > 0;
}

export function setDevSeedDataEnabled(enabled: boolean) {
  const database = getDb();
  database.withTransactionSync(() => {
    clearDomainData(database);
    if (enabled) insertSeedDomainData(database);
  });
}

function clearDomainData(database: SQLiteDatabaseLike) {
  database.execSync(`
    DELETE FROM attachments;
    DELETE FROM transactions;
    DELETE FROM incomes;
    DELETE FROM budgets;
    DELETE FROM bills;
    DELETE FROM recurring_rules;
    DELETE FROM categories;
    DELETE FROM ledger_members;
    DELETE FROM ledgers;
  `);
}

function insertSeedDomainData(database: SQLiteDatabaseLike) {
  backfillDefaultLedger(database);
  SEED_INCOME.forEach(income => {
    const now = new Date().toISOString();
    database.runSync(
      `INSERT OR REPLACE INTO incomes (
        id, kind, amount, source, cadence, start_date, end_date, received_at,
        created_by_user_id, updated_by_user_id, ledger_id, created_at, updated_at,
        sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      income.id,
      income.kind ?? 'regular',
      income.amount,
      income.source,
      income.cadence,
      income.startDate,
      income.endDate ?? null,
      income.receivedAt ?? null,
      income.createdByUserId ?? DEFAULT_OWNER_USER_ID,
      income.updatedByUserId ?? DEFAULT_OWNER_USER_ID,
      income.ledgerId ?? activeLedgerId,
      income.createdAt ?? now,
      income.updatedAt ?? now,
      income.syncStatus ?? 'local',
      json(income.meta),
    );
  });

  insertSeedTransactions(database);

  SEED_CATEGORIES.forEach(cat => insertCategory(database, cat));

  SEED_BUDGETS.forEach(budget => {
    const now = new Date().toISOString();
    database.runSync(
      `INSERT OR REPLACE INTO budgets (
        id, month, group_key, category, label, icon, amount,
        ledger_id, created_by_user_id, updated_by_user_id, created_at, updated_at,
        sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      budget.id,
      budget.month,
      budget.group ?? null,
      budget.category ?? null,
      budget.label ?? null,
      budget.icon ?? null,
      budget.amount,
      budget.ledgerId ?? activeLedgerId,
      budget.createdByUserId ?? DEFAULT_OWNER_USER_ID,
      budget.updatedByUserId ?? DEFAULT_OWNER_USER_ID,
      budget.createdAt ?? now,
      budget.updatedAt ?? now,
      budget.syncStatus ?? 'local',
      json(budget.meta),
    );
  });

  SEED_BILLS.forEach(bill => {
    const now = new Date().toISOString();
    database.runSync(
      `INSERT OR REPLACE INTO bills (
        id, amount, merchant, name, icon, category, due_date, recurring, days_until,
        estimate, ledger_id, created_by_user_id, updated_by_user_id, created_at,
        updated_at, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      bill.ledgerId ?? activeLedgerId,
      bill.createdByUserId ?? DEFAULT_OWNER_USER_ID,
      bill.updatedByUserId ?? DEFAULT_OWNER_USER_ID,
      bill.createdAt ?? now,
      bill.updatedAt ?? now,
      bill.syncStatus ?? 'local',
      json(bill.meta),
    );
  });

  SEED_RECURRING_RULES.forEach(rule => {
    const now = new Date().toISOString();
    database.runSync(
      `INSERT OR REPLACE INTO recurring_rules (
        id, merchant, category, amount, cadence, start_date, next_due_date,
        day_of_month, month_of_year, estimate, active, created_by_user_id,
        updated_by_user_id, ledger_id, created_at, updated_at, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      rule.createdByUserId ?? DEFAULT_OWNER_USER_ID,
      rule.updatedByUserId ?? DEFAULT_OWNER_USER_ID,
      rule.ledgerId ?? activeLedgerId,
      rule.createdAt ?? now,
      rule.updatedAt ?? now,
      rule.syncStatus ?? 'local',
      json(rule.meta),
    );
  });
}

function backfillV2(database: SQLiteDatabaseLike) {
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

function insertCategory(database: SQLiteDatabaseLike, cat: (typeof SEED_CATEGORIES)[number]) {
  const now = new Date().toISOString();
  database.runSync(
    `INSERT OR REPLACE INTO categories (
      id, label, icon, group_key, default_budget, sort_order, archived,
      created_by_user_id, updated_by_user_id, ledger_id, created_at, updated_at,
      sync_status, meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cat.id,
    cat.label,
    cat.icon,
    cat.group,
    cat.defaultBudget,
    cat.sortOrder,
    cat.archived ? 1 : 0,
    cat.createdByUserId ?? DEFAULT_OWNER_USER_ID,
    cat.updatedByUserId ?? DEFAULT_OWNER_USER_ID,
    cat.ledgerId ?? activeLedgerId,
    cat.createdAt ?? now,
    cat.updatedAt ?? now,
    cat.syncStatus ?? 'local',
    json(cat.meta),
  );
}

function addSyncColumns(database: SQLiteDatabaseLike, table: string) {
  addColumnIfMissing(database, table, 'ledger_id', `TEXT NOT NULL DEFAULT '${DEFAULT_LEDGER_ID}'`);
  addColumnIfMissing(database, table, 'created_at', 'TEXT');
  addColumnIfMissing(database, table, 'updated_at', 'TEXT');
  addColumnIfMissing(database, table, 'deleted_at', 'TEXT');
  addColumnIfMissing(database, table, 'cloud_record_name', 'TEXT');
  addColumnIfMissing(database, table, 'cloud_zone_name', 'TEXT');
  addColumnIfMissing(database, table, 'record_change_tag', 'TEXT');
  addColumnIfMissing(database, table, 'sync_status', "TEXT NOT NULL DEFAULT 'local'");
  if (table === 'budgets' || table === 'bills' || table === 'attachments') {
    addColumnIfMissing(database, table, 'created_by_user_id', 'TEXT');
    addColumnIfMissing(database, table, 'updated_by_user_id', 'TEXT');
  }
}

function backfillDefaultLedger(database: SQLiteDatabaseLike) {
  const now = new Date().toISOString();
  database.runSync(
    `INSERT OR IGNORE INTO ledgers (
      id, name, owner_user_id, active, created_by_user_id, updated_by_user_id,
      created_at, updated_at, sync_status, meta
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'local', ?)`,
    DEFAULT_LEDGER_ID,
    DEFAULT_LEDGER_NAME,
    DEFAULT_OWNER_USER_ID,
    DEFAULT_OWNER_USER_ID,
    DEFAULT_OWNER_USER_ID,
    now,
    now,
    json({ seeded: true }),
  );
  insertSeedMember(database, {
    id: `member-${DEFAULT_LEDGER_ID}-${DEFAULT_OWNER_USER_ID}`,
    userId: DEFAULT_OWNER_USER_ID,
    displayName: 'Alex',
    role: 'owner',
    allowOthersToEditMyItems: true,
  });
  insertSeedMember(database, {
    id: `member-${DEFAULT_LEDGER_ID}-${DEV_PARTNER_USER_ID}`,
    userId: DEV_PARTNER_USER_ID,
    displayName: 'Partner',
    role: 'member',
    allowOthersToEditMyItems: true,
  });
  [
    'transactions',
    'incomes',
    'categories',
    'budgets',
    'recurring_rules',
    'attachments',
    'bills',
  ].forEach(table => {
    database.runSync(`UPDATE ${table} SET ledger_id = COALESCE(ledger_id, ?)`, DEFAULT_LEDGER_ID);
    database.runSync(`UPDATE ${table} SET created_at = COALESCE(created_at, ?)`, now);
    database.runSync(`UPDATE ${table} SET updated_at = COALESCE(updated_at, ?)`, now);
    database.runSync(`UPDATE ${table} SET sync_status = COALESCE(sync_status, 'local')`);
  });
  ['transactions', 'incomes', 'categories', 'recurring_rules'].forEach(table => {
    database.runSync(`UPDATE ${table} SET created_by_user_id = ? WHERE created_by_user_id IS NULL OR created_by_user_id = 'local'`, DEFAULT_OWNER_USER_ID);
    database.runSync(`UPDATE ${table} SET updated_by_user_id = ? WHERE updated_by_user_id IS NULL OR updated_by_user_id = 'local'`, DEFAULT_OWNER_USER_ID);
  });
  ['budgets', 'bills', 'attachments'].forEach(table => {
    database.runSync(`UPDATE ${table} SET created_by_user_id = COALESCE(created_by_user_id, ?)`, DEFAULT_OWNER_USER_ID);
    database.runSync(`UPDATE ${table} SET updated_by_user_id = COALESCE(updated_by_user_id, ?)`, DEFAULT_OWNER_USER_ID);
  });
}

function insertSeedMember(database: SQLiteDatabaseLike, member: {
  id: string;
  userId: string;
  displayName: string;
  role: 'owner' | 'member';
  allowOthersToEditMyItems: boolean;
}) {
  const now = new Date().toISOString();
  database.runSync(
    `INSERT OR IGNORE INTO ledger_members (
      id, ledger_id, user_id, display_name, role, status,
      allow_others_to_edit_my_items, created_by_user_id, updated_by_user_id,
      created_at, updated_at, sync_status, meta
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 'local', ?)`,
    member.id,
    DEFAULT_LEDGER_ID,
    member.userId,
    member.displayName,
    member.role,
    member.allowOthersToEditMyItems ? 1 : 0,
    DEFAULT_OWNER_USER_ID,
    DEFAULT_OWNER_USER_ID,
    now,
    now,
    json({ seeded: true }),
  );
}

export function getActiveLedgerId(): string {
  return activeLedgerId;
}

export function getCurrentUserId(): string {
  return currentUserId;
}

export function getSession(): AppSession {
  return { activeLedgerId, currentUserId };
}

export function setCurrentUserId(userId: string) {
  if (userId === currentUserId) return;
  currentUserId = userId;
  sessionListeners.forEach(listener => listener());
}

export function subscribeSession(listener: () => void) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function listLedgers(): Ledger[] {
  return getDb().getAllSync<any>(
    'SELECT * FROM ledgers WHERE deleted_at IS NULL ORDER BY active DESC, name ASC',
  ).map(row => ({
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    active: Boolean(row.active),
    createdByUserId: row.created_by_user_id ?? undefined,
    updatedByUserId: row.updated_by_user_id ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    cloudRecordName: row.cloud_record_name ?? undefined,
    cloudZoneName: row.cloud_zone_name ?? undefined,
    recordChangeTag: row.record_change_tag ?? undefined,
    syncStatus: row.sync_status ?? 'local',
    meta: row.meta ? JSON.parse(row.meta) : undefined,
  }));
}

export function updateLedger(id: string, patch: Partial<Omit<Ledger, 'id'>>): Ledger | undefined {
  const current = getDb().getFirstSync<any>('SELECT * FROM ledgers WHERE id = ? AND deleted_at IS NULL', id);
  if (!current) return undefined;
  const now = new Date().toISOString();
  getDb().runSync(
    `UPDATE ledgers
     SET name = ?, owner_user_id = ?, active = ?, updated_by_user_id = ?,
         updated_at = ?, sync_status = 'pending', meta = ?
     WHERE id = ?`,
    patch.name ?? current.name,
    patch.ownerUserId ?? current.owner_user_id,
    patch.active !== undefined ? (patch.active ? 1 : 0) : current.active,
    currentUserId,
    now,
    json(patch.meta ?? (current.meta ? JSON.parse(current.meta) : undefined)),
    id,
  );
  sessionListeners.forEach(listener => listener());
  return listLedgers().find(ledger => ledger.id === id);
}

export function listLedgerMembers(ledgerId = activeLedgerId): LedgerMember[] {
  return getDb().getAllSync<any>(
    'SELECT * FROM ledger_members WHERE ledger_id = ? AND deleted_at IS NULL ORDER BY role = ? DESC, display_name ASC',
    ledgerId,
    'owner',
  ).map(row => ({
    id: row.id,
    ledgerId: row.ledger_id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    allowOthersToEditMyItems: Boolean(row.allow_others_to_edit_my_items),
    createdByUserId: row.created_by_user_id ?? undefined,
    updatedByUserId: row.updated_by_user_id ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    cloudRecordName: row.cloud_record_name ?? undefined,
    cloudZoneName: row.cloud_zone_name ?? undefined,
    recordChangeTag: row.record_change_tag ?? undefined,
    syncStatus: row.sync_status ?? 'local',
    meta: row.meta ? JSON.parse(row.meta) : undefined,
  }));
}

export function updateLedgerMember(id: string, patch: Partial<Omit<LedgerMember, 'id' | 'ledgerId' | 'userId'>>): LedgerMember | undefined {
  const current = getDb().getFirstSync<any>('SELECT * FROM ledger_members WHERE id = ?', id);
  if (!current) return undefined;
  const actor = getDb().getFirstSync<{ role: string }>(
    'SELECT role FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND deleted_at IS NULL',
    current.ledger_id,
    currentUserId,
  );
  const changingAnotherMember = current.user_id !== currentUserId;
  if (changingAnotherMember && patch.allowOthersToEditMyItems !== undefined) return undefined;
  if (changingAnotherMember && actor?.role !== 'owner') return undefined;
  const now = new Date().toISOString();
  getDb().runSync(
    `UPDATE ledger_members
     SET display_name = ?, role = ?, status = ?, allow_others_to_edit_my_items = ?,
         updated_by_user_id = ?, updated_at = ?, sync_status = 'pending'
     WHERE id = ?`,
    patch.displayName ?? current.display_name,
    patch.role ?? current.role,
    patch.status ?? current.status,
    patch.allowOthersToEditMyItems !== undefined ? (patch.allowOthersToEditMyItems ? 1 : 0) : current.allow_others_to_edit_my_items,
    currentUserId,
    now,
    id,
  );
  sessionListeners.forEach(listener => listener());
  return listLedgerMembers(current.ledger_id).find(member => member.id === id);
}

export function canEditRecord(createdByUserId?: string | null, ledgerId = activeLedgerId): boolean {
  if (!createdByUserId || createdByUserId === 'local' || createdByUserId === currentUserId) return true;
  const member = getDb().getFirstSync<{ allow_others_to_edit_my_items: number; status: string }>(
    'SELECT allow_others_to_edit_my_items, status FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND deleted_at IS NULL',
    ledgerId,
    createdByUserId,
  );
  return member ? member.allow_others_to_edit_my_items !== 0 : false;
}

export function ledgerWhere(column = 'ledger_id'): string {
  return `${column} = ? AND deleted_at IS NULL`;
}

export function ledgerParam(): string {
  return activeLedgerId;
}

export function prepareCreateFields(input: SyncFields = {}): Required<Pick<SyncFields, 'ledgerId' | 'createdByUserId' | 'updatedByUserId' | 'createdAt' | 'updatedAt' | 'syncStatus'>> & SyncFields {
  const now = new Date().toISOString();
  return {
    ...input,
    ledgerId: input.ledgerId ?? activeLedgerId,
    createdByUserId: input.createdByUserId && input.createdByUserId !== 'local' ? input.createdByUserId : currentUserId,
    updatedByUserId: input.updatedByUserId && input.updatedByUserId !== 'local' ? input.updatedByUserId : currentUserId,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    syncStatus: input.syncStatus ?? 'pending',
  };
}

export function createdByUserIdForUpdate(current?: string | null, next?: string | null): string {
  if (current && current !== 'local') return current;
  if (next && next !== 'local') return next;
  return currentUserId;
}

export function prepareUpdateFields(
  input: SyncFields = {},
): Required<Pick<SyncFields, 'updatedByUserId' | 'updatedAt' | 'syncStatus'>> {
  return {
    updatedByUserId: input.updatedByUserId && input.updatedByUserId !== 'local' ? input.updatedByUserId : currentUserId,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
  };
}

export function syncStatus(value: unknown): SyncStatus {
  return value === 'pending' || value === 'synced' || value === 'conflicted' ? value : 'local';
}

function columnExists(database: SQLiteDatabaseLike, table: string, column: string): boolean {
  return database
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
    .some(row => row.name === column);
}

function addColumnIfMissing(database: SQLiteDatabaseLike, table: string, column: string, definition: string) {
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
