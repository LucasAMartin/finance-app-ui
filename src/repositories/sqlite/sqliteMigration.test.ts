import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSQLiteRepositories } from './index.ts';
import { DEFAULT_LEDGER_ID, resetSQLiteDatabaseForTests } from './db.ts';
import type { SQLiteDatabaseLike } from './driver.ts';

const DOMAIN_TABLES = [
  'transactions',
  'incomes',
  'categories',
  'budgets',
  'recurring_rules',
  'attachments',
  'bills',
];

const SYNC_COLUMNS = [
  'ledger_id',
  'created_by_user_id',
  'updated_by_user_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'cloud_record_name',
  'cloud_zone_name',
  'record_change_tag',
  'sync_status',
];

function tableColumns(db: SQLiteDatabaseLike, table: string): string[] {
  return db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map(row => row.name);
}

function indexNames(db: SQLiteDatabaseLike, table: string): string[] {
  return db.getAllSync<{ name: string }>(`PRAGMA index_list(${table})`).map(row => row.name);
}

function expectColumns(db: SQLiteDatabaseLike, table: string, columns: string[]) {
  const actual = tableColumns(db, table);
  columns.forEach(column => assert.ok(actual.includes(column), `${table} missing ${column}`));
}

function createPreLedgerV8Schema(db: SQLiteDatabaseLike) {
  db.execSync(`
    CREATE TABLE settings (
      id TEXT PRIMARY KEY NOT NULL,
      theme_dark INTEGER NOT NULL,
      accent_key TEXT NOT NULL,
      card_style TEXT NOT NULL,
      wallpaper_id TEXT,
      meta TEXT
    );

    CREATE TABLE incomes (
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

    CREATE TABLE transactions (
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

    CREATE TABLE budgets (
      id TEXT PRIMARY KEY NOT NULL,
      month TEXT NOT NULL,
      group_key TEXT,
      category TEXT,
      label TEXT,
      icon TEXT,
      amount REAL NOT NULL,
      meta TEXT
    );

    CREATE TABLE categories (
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

    CREATE TABLE recurring_rules (
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

    CREATE TABLE attachments (
      id TEXT PRIMARY KEY NOT NULL,
      transaction_id TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      cloud_asset_id TEXT,
      meta TEXT,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE bills (
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

    CREATE TABLE merchant_logos (
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

    INSERT INTO settings (id, theme_dark, accent_key, card_style, wallpaper_id, meta)
    VALUES ('settings', 0, 'blue', 'flat', NULL, NULL);

    INSERT INTO transactions (
      id, type, amount, merchant, category, occurred_at, note, recurring,
      recurring_rule_id, visibility, created_by_user_id, updated_by_user_id, meta
    ) VALUES (
      'legacy-tx', 'expense', 31.5, 'Legacy Grocer', 'groceries',
      '2026-05-01T12:00:00.000Z', NULL, 0, NULL, 'shared', 'local', NULL, NULL
    );

    INSERT INTO incomes (
      id, kind, amount, source, cadence, start_date, end_date, received_at,
      created_by_user_id, updated_by_user_id, meta
    ) VALUES (
      'legacy-income', 'regular', 3000, 'Legacy Salary', 'monthly',
      '2026-05-01', NULL, NULL, NULL, 'local', NULL
    );

    INSERT INTO categories (
      id, label, icon, group_key, default_budget, sort_order, archived,
      created_by_user_id, updated_by_user_id, meta
    ) VALUES (
      'legacy-cat', 'Legacy Cat', 'tag', 'needs', 100, 1, 0, 'local', NULL, NULL
    );

    INSERT INTO budgets (id, month, group_key, category, label, icon, amount, meta)
    VALUES ('legacy-budget', '2026-05', 'needs', 'legacy-cat', 'Legacy Cat', 'tag', 100, NULL);

    INSERT INTO recurring_rules (
      id, merchant, category, amount, cadence, start_date, next_due_date,
      day_of_month, month_of_year, estimate, active, created_by_user_id,
      updated_by_user_id, meta
    ) VALUES (
      'legacy-rule', 'Legacy Bill', 'legacy-cat', 25, 'monthly',
      '2026-05-01', '2026-06-01', 1, NULL, 0, 1, NULL, NULL, NULL
    );

    INSERT INTO bills (
      id, amount, merchant, name, icon, category, due_date, recurring,
      days_until, estimate, meta
    ) VALUES (
      'legacy-bill', 25, 'Legacy Bill', 'Legacy Bill', 'tag',
      'legacy-cat', 'Jun 1', 1, 10, 0, NULL
    );

    INSERT INTO attachments (id, transaction_id, local_uri, type, created_at, cloud_asset_id, meta)
    VALUES ('legacy-attachment', 'legacy-tx', 'file:///legacy.jpg', 'receipt', '2026-05-01T12:01:00.000Z', NULL, NULL);

    PRAGMA user_version = 8;
  `);
}

test('sqlite fresh install creates CloudKit-ready schema, members, and ledger indexes', () => {
  const db = resetSQLiteDatabaseForTests();

  assert.equal(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version, 11);
  expectColumns(db, 'ledgers', [
    'id',
    'name',
    'owner_user_id',
    'active',
    'created_by_user_id',
    'updated_by_user_id',
    'created_at',
    'updated_at',
    'deleted_at',
    'cloud_record_name',
    'cloud_zone_name',
    'record_change_tag',
    'sync_status',
    'meta',
  ]);
  expectColumns(db, 'ledger_members', [
    'ledger_id',
    'user_id',
    'display_name',
    'role',
    'status',
    'allow_others_to_edit_my_items',
    'deleted_at',
    'sync_status',
  ]);
  expectColumns(db, 'sync_state', ['zone_name', 'change_token', 'updated_at']);
  DOMAIN_TABLES.forEach(table => expectColumns(db, table, SYNC_COLUMNS));

  assert.deepEqual(
    db.getAllSync<{ user_id: string }>('SELECT user_id FROM ledger_members ORDER BY user_id').map(row => row.user_id),
    ['alex'],
  );

  const expectedIndexes = new Map([
    ['transactions', 'idx_transactions_ledger_deleted_occurred'],
    ['incomes', 'idx_incomes_ledger_deleted_start'],
    ['categories', 'idx_categories_ledger_deleted_sort'],
    ['budgets', 'idx_budgets_ledger_deleted_month'],
    ['recurring_rules', 'idx_recurring_rules_ledger_deleted_due'],
    ['attachments', 'idx_attachments_ledger_deleted_created'],
    ['bills', 'idx_bills_ledger_deleted_due'],
    ['ledger_members', 'idx_ledger_members_ledger_status'],
  ]);
  expectedIndexes.forEach((index, table) => {
    assert.ok(indexNames(db, table).includes(index), `${table} missing ${index}`);
  });
});

test('sqlite v8 migration backfills local single-user rows into the default shared ledger', () => {
  const db = resetSQLiteDatabaseForTests(createPreLedgerV8Schema);
  const repos = createSQLiteRepositories();

  assert.equal(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version, 11);
  assert.deepEqual(
    repos.sessionRepo.listMembers().map(member => member.userId).sort(),
    ['alex'],
  );

  const tx = repos.transactionsRepo.get('legacy-tx');
  assert.ok(tx);
  assert.equal(tx.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(tx.createdByUserId, 'alex');
  assert.equal(tx.updatedByUserId, 'alex');
  assert.equal(tx.syncStatus, 'local');
  assert.match(tx.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(repos.transactionsRepo.getSummary({}).expenseTotal, 31.5);

  const income = repos.incomeRepo.get('legacy-income');
  assert.ok(income);
  assert.equal(income.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(income.createdByUserId, 'alex');
  assert.equal(income.updatedByUserId, 'alex');

  const category = repos.categoriesRepo.get('legacy-cat');
  assert.ok(category);
  assert.equal(category.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(category.createdByUserId, 'alex');

  const budget = repos.budgetsRepo.get('legacy-budget');
  assert.ok(budget);
  assert.equal(budget.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(budget.createdByUserId, 'alex');

  const rule = repos.recurringRulesRepo.get('legacy-rule');
  assert.ok(rule);
  assert.equal(rule.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(rule.createdByUserId, 'alex');

  const bill = repos.billsRepo.get('legacy-bill');
  assert.ok(bill);
  assert.equal(bill.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(bill.createdByUserId, 'alex');

  const attachment = repos.attachmentsRepo.get('legacy-attachment');
  assert.ok(attachment);
  assert.equal(attachment.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(attachment.createdByUserId, 'alex');
});
