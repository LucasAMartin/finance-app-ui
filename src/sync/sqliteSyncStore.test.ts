import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSQLiteRepositories } from '../repositories/sqlite/index.ts';
import { getDb, resetSQLiteDatabaseForTests } from '../repositories/sqlite/db.ts';
import { syncLedger, type SyncAdapter, type SyncConflict, type SyncRecord } from './syncEngine.ts';
import { SQLiteSyncStore } from './sqliteSyncStore.ts';
import type { CloudKitAvailability } from './cloudKitAdapter.ts';

const LEDGER_ID = 'ledger-default';
const ZONE_NAME = 'zone-ledger-default';

function cloneRecord(record: SyncRecord): SyncRecord {
  return { ...record, fields: { ...record.fields } };
}

function remoteTransaction(recordName: string, updatedAt = '2026-06-01T10:00:00.000Z'): SyncRecord {
  return {
    recordName,
    recordType: 'transaction',
    zoneName: ZONE_NAME,
    ledgerId: LEDGER_ID,
    fields: {
      type: 'expense',
      amount: 24,
      merchant: 'Remote Market',
      cat: 'groceries',
      occurredAt: '2026-06-01T09:30:00.000Z',
      note: 'from remote',
      recurring: false,
      visibility: 'shared',
    },
    createdByUserId: 'partner',
    updatedByUserId: 'partner',
    createdAt: '2026-06-01T09:30:00.000Z',
    updatedAt,
    recordChangeTag: `remote-${recordName}`,
    syncStatus: 'synced',
  };
}

class PushAcceptingAdapter implements SyncAdapter {
  pushed: SyncRecord[] = [];
  private version = 0;

  constructor(private pulled: SyncRecord[] = []) {}

  async getCurrentUser(): Promise<CloudKitAvailability> {
    return { available: true, userId: 'icloud-alex' };
  }

  async pullChanges(): Promise<{ records: SyncRecord[]; changeToken?: string }> {
    return {
      records: this.pulled.map(cloneRecord),
      changeToken: 'token-after-pull',
    };
  }

  async pushRecords(_zoneName: string, records: SyncRecord[]): Promise<{ accepted: SyncRecord[]; conflicts: SyncConflict[] }> {
    const accepted = records.map(record => {
      this.version += 1;
      const next = {
        ...cloneRecord(record),
        recordChangeTag: `tag-${this.version}`,
        syncStatus: 'synced' as const,
      };
      this.pushed.push(next);
      return next;
    });
    return { accepted, conflicts: [] };
  }
}

class PushConflictingAdapter extends PushAcceptingAdapter {
  async pushRecords(_zoneName: string, records: SyncRecord[]): Promise<{ accepted: SyncRecord[]; conflicts: SyncConflict[] }> {
    return {
      accepted: [],
      conflicts: records.map(local => ({
        local: cloneRecord(local),
        remote: {
          ...cloneRecord(local),
          fields: { ...local.fields, amount: 99 },
          updatedAt: '2026-06-01T11:00:00.000Z',
          recordChangeTag: 'remote-newer-tag',
          syncStatus: 'synced' as const,
        },
        reason: 'remote-newer' as const,
      })),
    };
  }
}

function fresh() {
  resetSQLiteDatabaseForTests();
  const repos = createSQLiteRepositories();
  const store = new SQLiteSyncStore();
  return { repos, store, db: getDb() };
}

function clearDomainRows() {
  getDb().execSync(`
    DELETE FROM attachments;
    DELETE FROM transactions;
    DELETE FROM incomes;
    DELETE FROM budgets;
    DELETE FROM bills;
    DELETE FROM recurring_rules;
    DELETE FROM categories;
  `);
}

async function syncWith(adapter: SyncAdapter, store: SQLiteSyncStore) {
  return syncLedger({ adapter, store, ledgerId: LEDGER_ID, zoneName: ZONE_NAME });
}

test('SQLiteSyncStore emits pending local rows as SyncRecords through the registry', () => {
  const { repos, store } = fresh();
  clearDomainRows();
  const tx = repos.transactionsRepo.create({
    merchant: 'Local Market',
    cat: 'groceries',
    amount: 18,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });

  const records = store.listPendingRecords(LEDGER_ID);

  assert.equal(records.length, 1);
  assert.equal(records[0].recordName, tx.id);
  assert.equal(records[0].recordType, 'transaction');
  assert.equal(records[0].zoneName, ZONE_NAME);
  assert.equal(records[0].fields.merchant, 'Local Market');
  assert.equal(records[0].fields.cat, 'groceries');
  assert.equal(records[0].syncStatus, 'pending');
});

test('SQLiteSyncStore marks accepted local pushes as synced with CloudKit metadata', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  const tx = repos.transactionsRepo.create({
    merchant: 'Local Market',
    cat: 'groceries',
    amount: 18,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });
  const adapter = new PushAcceptingAdapter();

  const result = await syncWith(adapter, store);

  assert.equal(result.pushedRecords, 1);
  const row = db.getFirstSync<{
    sync_status: string;
    cloud_record_name: string;
    cloud_zone_name: string;
    record_change_tag: string;
  }>('SELECT sync_status, cloud_record_name, cloud_zone_name, record_change_tag FROM transactions WHERE id = ?', tx.id);
  assert.equal(row?.sync_status, 'synced');
  assert.equal(row?.cloud_record_name, tx.id);
  assert.equal(row?.cloud_zone_name, ZONE_NAME);
  assert.equal(row?.record_change_tag, 'tag-1');
  assert.equal(store.getChangeToken(ZONE_NAME), 'token-after-pull');
});

test('SQLiteSyncStore applies remote transactions into the real transaction repo', async () => {
  const { repos, store } = fresh();
  clearDomainRows();
  const adapter = new PushAcceptingAdapter([remoteTransaction('remote-tx')]);

  const result = await syncWith(adapter, store);

  assert.equal(result.pulledRecords, 1);
  const tx = repos.transactionsRepo.get('remote-tx');
  assert.ok(tx);
  assert.equal(tx.merchant, 'Remote Market');
  assert.equal(tx.cat, 'groceries');
  assert.equal(tx.createdByUserId, 'partner');
  assert.equal(tx.syncStatus, 'synced');
});

test('SQLiteSyncStore applies remote attachments without duplicate sync/domain timestamp columns', async () => {
  const { repos, store } = fresh();
  clearDomainRows();
  const tx = repos.transactionsRepo.create({
    merchant: 'Receipt Market',
    cat: 'groceries',
    amount: 24,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });
  const adapter = new PushAcceptingAdapter([{
    recordName: 'remote-attachment',
    recordType: 'attachment',
    zoneName: ZONE_NAME,
    ledgerId: LEDGER_ID,
    fields: {
      transactionId: tx.id,
      localUri: 'file:///remote-receipt.jpg',
      type: 'receipt',
      createdAt: '2026-06-01T10:01:00.000Z',
    },
    createdByUserId: 'partner',
    updatedByUserId: 'partner',
    createdAt: '2026-06-01T10:01:00.000Z',
    updatedAt: '2026-06-01T10:02:00.000Z',
    recordChangeTag: 'attachment-tag',
    syncStatus: 'synced',
  }]);

  const result = await syncWith(adapter, store);

  assert.equal(result.pulledRecords, 1);
  const attachment = repos.attachmentsRepo.get('remote-attachment');
  assert.ok(attachment);
  assert.equal(attachment.transactionId, tx.id);
  assert.equal(attachment.localUri, 'file:///remote-receipt.jpg');
  assert.equal(attachment.createdAt, '2026-06-01T10:01:00.000Z');
  assert.equal(attachment.syncStatus, 'synced');
});

test('SQLiteSyncStore applies remote tombstones and keeps the raw tombstone row', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  const tx = repos.transactionsRepo.create({
    merchant: 'Delete Local',
    cat: 'shopping',
    amount: 12,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });
  db.runSync(
    `UPDATE transactions
     SET sync_status = 'synced', cloud_record_name = ?, cloud_zone_name = ?, record_change_tag = ?
     WHERE id = ?`,
    tx.id,
    ZONE_NAME,
    'before-delete',
    tx.id,
  );
  const deleted = {
    ...remoteTransaction(tx.id, '2026-06-07T10:05:00.000Z'),
    deletedAt: '2026-06-07T10:05:00.000Z',
    recordChangeTag: 'delete-tag',
  };

  await syncWith(new PushAcceptingAdapter([deleted]), store);

  assert.equal(repos.transactionsRepo.get(tx.id), undefined);
  const row = db.getFirstSync<{ deleted_at: string | null; sync_status: string; record_change_tag: string }>(
    'SELECT deleted_at, sync_status, record_change_tag FROM transactions WHERE id = ?',
    tx.id,
  );
  assert.equal(row?.deleted_at, '2026-06-07T10:05:00.000Z');
  assert.equal(row?.sync_status, 'synced');
  assert.equal(row?.record_change_tag, 'delete-tag');
});

test('SQLiteSyncStore marks push conflicts as conflicted in SQLite', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  const tx = repos.transactionsRepo.create({
    merchant: 'Conflict Local',
    cat: 'shopping',
    amount: 12,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });

  const result = await syncWith(new PushConflictingAdapter(), store);

  assert.equal(result.conflicts, 1);
  const row = db.getFirstSync<{ sync_status: string; meta: string | null }>(
    'SELECT sync_status, meta FROM transactions WHERE id = ?',
    tx.id,
  );
  assert.equal(row?.sync_status, 'conflicted');
  assert.match(row?.meta ?? '', /remote-newer/);
});

test('SQLiteSyncStore applies remote edit locks before protected local edits are pushed', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  const tx = repos.transactionsRepo.create({
    merchant: 'Partner Market',
    cat: 'groceries',
    amount: 42,
    occurredAt: '2026-06-01T10:00:00.000Z',
    createdByUserId: 'partner',
    updatedByUserId: 'alex',
  });
  const partnerLock: SyncRecord = {
    recordName: 'member-ledger-default-partner',
    recordType: 'ledgerMember',
    zoneName: ZONE_NAME,
    ledgerId: LEDGER_ID,
    fields: {
      userId: 'partner',
      displayName: 'Partner',
      role: 'member',
      status: 'active',
      allowOthersToEditMyItems: false,
    },
    createdByUserId: 'partner',
    updatedByUserId: 'partner',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-06-07T10:05:00.000Z',
    recordChangeTag: 'lock-tag',
    syncStatus: 'synced',
  };
  const adapter = new PushAcceptingAdapter([partnerLock]);

  const result = await syncWith(adapter, store);

  assert.equal(result.conflicts, 1);
  assert.equal(adapter.pushed.length, 0);
  assert.equal(
    db.getFirstSync<{ allow_others_to_edit_my_items: number }>(
      'SELECT allow_others_to_edit_my_items FROM ledger_members WHERE user_id = ?',
      'partner',
    )?.allow_others_to_edit_my_items,
    0,
  );
  const row = db.getFirstSync<{ sync_status: string; meta: string | null }>(
    'SELECT sync_status, meta FROM transactions WHERE id = ?',
    tx.id,
  );
  assert.equal(row?.sync_status, 'conflicted');
  assert.match(row?.meta ?? '', /permission-denied/);
});
