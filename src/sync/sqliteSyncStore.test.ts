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

function remoteLedger(resetId: string, updatedAt = '2026-06-01T10:00:00.000Z'): SyncRecord {
  return {
    recordName: LEDGER_ID,
    recordType: 'ledger',
    zoneName: ZONE_NAME,
    ledgerId: LEDGER_ID,
    fields: {
      name: 'Shared finances',
      ownerUserId: 'alex',
      active: true,
      meta: {
        seeded: true,
        cloudResetId: resetId,
        cloudResetAt: updatedAt,
      },
    },
    createdByUserId: 'alex',
    updatedByUserId: 'alex',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt,
    recordChangeTag: `ledger-${resetId}`,
    syncStatus: 'synced',
  };
}

function remoteMember(userId: string, role: 'owner' | 'member', updatedAt = '2026-06-01T10:00:00.000Z'): SyncRecord {
  const recordName = `member-${LEDGER_ID}-${userId}`;
  return {
    recordName,
    recordType: 'ledgerMember',
    zoneName: ZONE_NAME,
    ledgerId: LEDGER_ID,
    fields: {
      userId,
      displayName: userId === 'alex' ? 'Alex' : 'Partner',
      role,
      status: 'active',
      allowOthersToEditMyItems: true,
      meta: { seeded: true },
    },
    createdByUserId: 'alex',
    updatedByUserId: 'alex',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt,
    recordChangeTag: `member-${userId}-${updatedAt}`,
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

function markSharingRowsSynced() {
  getDb().runSync(
    `UPDATE ledgers
     SET sync_status = 'synced', cloud_record_name = id, cloud_zone_name = ?, record_change_tag = 'seed-ledger'
     WHERE id = ?`,
    ZONE_NAME,
    LEDGER_ID,
  );
  getDb().runSync(
    `UPDATE ledger_members
     SET sync_status = 'synced', cloud_record_name = id, cloud_zone_name = ?, record_change_tag = 'seed-member'
     WHERE ledger_id = ?`,
    ZONE_NAME,
    LEDGER_ID,
  );
}

async function syncWith(adapter: SyncAdapter, store: SQLiteSyncStore) {
  return syncLedger({ adapter, store, ledgerId: LEDGER_ID, zoneName: ZONE_NAME });
}

test('SQLiteSyncStore emits pending local rows as SyncRecords through the registry', () => {
  const { repos, store } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
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

test('SQLiteSyncStore emits pre-sync local rows for first CloudKit upload', () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const tx = repos.transactionsRepo.create({
    merchant: 'Migrated Market',
    cat: 'groceries',
    amount: 18,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });
  db.runSync(
    `UPDATE transactions
     SET sync_status = 'local'
     WHERE id = ?`,
    tx.id,
  );

  const records = store.listPendingRecords(LEDGER_ID);

  assert.equal(records.length, 1);
  assert.equal(records[0].recordName, tx.id);
  assert.equal(records[0].syncStatus, 'local');
});

test('SQLiteSyncStore marks accepted local pushes as synced with CloudKit metadata', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
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

test('SQLite transaction edits re-enter pending sync and push updated fields', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const tx = repos.transactionsRepo.create({
    merchant: 'Before Market',
    cat: 'groceries',
    amount: 18,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });
  const adapter = new PushAcceptingAdapter();
  await syncWith(adapter, store);

  const edited = repos.transactionsRepo.update(tx.id, {
    merchant: 'After Market',
    amount: 27,
  });

  assert.ok(edited);
  const pending = db.getFirstSync<{
    sync_status: string;
    merchant: string;
    amount: number;
    record_change_tag: string;
  }>('SELECT sync_status, merchant, amount, record_change_tag FROM transactions WHERE id = ?', tx.id);
  assert.equal(pending?.sync_status, 'pending');
  assert.equal(pending?.merchant, 'After Market');
  assert.equal(pending?.amount, 27);
  assert.equal(pending?.record_change_tag, 'tag-1');

  const result = await syncWith(adapter, store);

  assert.equal(result.pushedRecords, 1);
  const pushed = adapter.pushed.at(-1);
  assert.equal(pushed?.recordName, tx.id);
  assert.equal(pushed?.fields.merchant, 'After Market');
  assert.equal(pushed?.fields.amount, 27);
  assert.equal(db.getFirstSync<{ sync_status: string }>('SELECT sync_status FROM transactions WHERE id = ?', tx.id)?.sync_status, 'synced');
});

test('SQLite ledger currency updates sync through ledger metadata', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const adapter = new PushAcceptingAdapter();

  const ledger = repos.sessionRepo.updateLedger(LEDGER_ID, {
    meta: { currencyCode: 'JPY' },
  });

  assert.equal(ledger?.meta?.currencyCode, 'JPY');
  const pending = db.getFirstSync<{ sync_status: string; meta: string }>(
    'SELECT sync_status, meta FROM ledgers WHERE id = ?',
    LEDGER_ID,
  );
  assert.equal(pending?.sync_status, 'pending');
  assert.deepEqual(JSON.parse(pending?.meta ?? '{}'), { currencyCode: 'JPY' });

  const result = await syncWith(adapter, store);

  assert.equal(result.pushedRecords, 1);
  const pushed = adapter.pushed.at(-1);
  assert.equal(pushed?.recordName, LEDGER_ID);
  assert.equal(pushed?.recordType, 'ledger');
  assert.deepEqual(pushed?.fields.meta, { currencyCode: 'JPY' });
  assert.equal(db.getFirstSync<{ sync_status: string }>('SELECT sync_status FROM ledgers WHERE id = ?', LEDGER_ID)?.sync_status, 'synced');
});

test('SQLite ledger sync keeps local CloudKit routing metadata on device only', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const adapter = new PushAcceptingAdapter();

  repos.sessionRepo.updateLedgerLocalMeta(LEDGER_ID, {
    currencyCode: 'JPY',
    cloudDatabaseScope: 'shared',
    cloudOwnerName: '__owner__',
    cloudZoneName: ZONE_NAME,
    cloudShareRecordName: '__share__',
    cloudParticipantPermission: 'readWrite',
  });
  repos.sessionRepo.updateLedger(LEDGER_ID, {
    meta: {
      ...(repos.sessionRepo.listLedgers()[0].meta ?? {}),
      currencyCode: 'EUR',
    },
  });

  const result = await syncWith(adapter, store);

  assert.equal(result.pushedRecords, 1);
  assert.deepEqual(adapter.pushed.at(-1)?.fields.meta, { currencyCode: 'EUR' });

  store.applyRemoteRecord({
    ...remoteLedger('remote-reset', '2026-06-01T12:00:00.000Z'),
    fields: {
      name: 'Shared finances',
      ownerUserId: 'alex',
      active: true,
      meta: { currencyCode: 'CAD' },
    },
  });

  const storedMeta = JSON.parse(db.getFirstSync<{ meta: string }>(
    'SELECT meta FROM ledgers WHERE id = ?',
    LEDGER_ID,
  )?.meta ?? '{}');
  assert.equal(storedMeta.currencyCode, 'CAD');
  assert.equal(storedMeta.cloudDatabaseScope, 'shared');
  assert.equal(storedMeta.cloudOwnerName, '__owner__');
});

test('SQLiteSyncStore applies remote transactions into the real transaction repo', async () => {
  const { repos, store } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
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

test('SQLiteSyncStore clears stale local ledger rows when a remote reset marker is pulled', async () => {
  const { repos, store } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const stale = repos.transactionsRepo.create({
    merchant: 'Only On Device A',
    cat: 'groceries',
    amount: 19,
    occurredAt: '2026-06-01T12:00:00.000Z',
  });
  getDb().runSync(
    `UPDATE transactions
     SET sync_status = 'synced', cloud_record_name = id, cloud_zone_name = ?, record_change_tag = ?
     WHERE id = ?`,
    ZONE_NAME,
    'old-zone-tag',
    stale.id,
  );
  repos.transactionsRepo.refresh?.();

  const result = await syncWith(new PushAcceptingAdapter([
    remoteLedger('reset-from-device-b', '2999-06-01T12:05:00.000Z'),
    remoteMember('alex', 'owner', '2999-06-01T12:05:01.000Z'),
    remoteMember('partner', 'member', '2999-06-01T12:05:02.000Z'),
    remoteTransaction('fresh-after-reset', '2999-06-01T12:06:00.000Z'),
  ]), store);

  assert.equal(result.pulledRecords, 4);
  assert.equal(repos.transactionsRepo.get(stale.id), undefined);
  assert.equal(repos.transactionsRepo.get('fresh-after-reset')?.merchant, 'Remote Market');
  assert.equal(repos.sessionRepo.listMembers().length, 2);
});

test('SQLiteSyncStore applies remote attachments without duplicate sync/domain timestamp columns', async () => {
  const { repos, store } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
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

test('SQLiteSyncStore applies pulled attachments after their transactions even when returned first', async () => {
  const { repos, store } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const tx = remoteTransaction('remote-tx-for-attachment');
  const attachment: SyncRecord = {
    recordName: 'remote-attachment-first',
    recordType: 'attachment',
    zoneName: ZONE_NAME,
    ledgerId: LEDGER_ID,
    fields: {
      transactionId: tx.recordName,
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
  };
  const adapter = new PushAcceptingAdapter([attachment, tx]);

  const result = await syncWith(adapter, store);

  assert.equal(result.pulledRecords, 2);
  assert.ok(repos.transactionsRepo.get(tx.recordName));
  assert.equal(repos.attachmentsRepo.get(attachment.recordName)?.transactionId, tx.recordName);
});

test('SQLiteSyncStore applies remote tombstones and keeps the raw tombstone row', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const tx = repos.transactionsRepo.create({
    merchant: 'Delete Local',
    cat: 'shopping',
    amount: 12,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });
  db.runSync(
    `UPDATE transactions
     SET sync_status = 'synced', cloud_record_name = ?, cloud_zone_name = ?, record_change_tag = ?, updated_at = ?
     WHERE id = ?`,
    tx.id,
    ZONE_NAME,
    'before-delete',
    '2026-06-01T10:00:00.000Z',
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
  markSharingRowsSynced();
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
  assert.match(row?.meta ?? '', /remoteSyncRecord/);
  assert.equal(store.listConflicts(LEDGER_ID).length, 1);
});

test('SQLiteSyncStore resolves a conflict by applying the remote record', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const tx = repos.transactionsRepo.create({
    merchant: 'Conflict Local',
    cat: 'shopping',
    amount: 12,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });

  await syncWith(new PushConflictingAdapter(), store);
  assert.equal(store.resolveConflict(tx.id, 'remote'), true);

  const row = db.getFirstSync<{ merchant: string; amount: number; sync_status: string; meta: string | null }>(
    'SELECT merchant, amount, sync_status, meta FROM transactions WHERE id = ?',
    tx.id,
  );
  assert.equal(row?.merchant, 'Conflict Local');
  assert.equal(row?.amount, 99);
  assert.equal(row?.sync_status, 'synced');
  assert.doesNotMatch(row?.meta ?? '', /syncConflictReason/);
});

test('SQLiteSyncStore resolves a conflict by keeping local changes for retry', async () => {
  const { repos, store, db } = fresh();
  clearDomainRows();
  markSharingRowsSynced();
  const tx = repos.transactionsRepo.create({
    merchant: 'Conflict Local',
    cat: 'shopping',
    amount: 12,
    occurredAt: '2026-06-01T10:00:00.000Z',
  });

  await syncWith(new PushConflictingAdapter(), store);
  assert.equal(store.resolveConflict(tx.id, 'local'), true);

  const row = db.getFirstSync<{ amount: number; sync_status: string; record_change_tag: string | null; meta: string | null }>(
    'SELECT amount, sync_status, record_change_tag, meta FROM transactions WHERE id = ?',
    tx.id,
  );
  assert.equal(row?.amount, 12);
  assert.equal(row?.sync_status, 'pending');
  assert.equal(row?.record_change_tag, 'remote-newer-tag');
  assert.doesNotMatch(row?.meta ?? '', /syncConflictReason/);
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
  assert.equal(adapter.pushed.some(record => record.recordType === 'transaction'), false);
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
  assert.equal(store.resolveConflict(tx.id, 'local'), false);
  assert.equal(store.resolveConflict(tx.id, 'discardLocal'), true);

  const resolvedRow = db.getFirstSync<{ sync_status: string; updated_at: string; deleted_at: string | null; meta: string | null }>(
    'SELECT sync_status, updated_at, deleted_at, meta FROM transactions WHERE id = ?',
    tx.id,
  );
  assert.equal(resolvedRow?.sync_status, 'synced');
  assert.equal(resolvedRow?.updated_at, '1970-01-01T00:00:00.000Z');
  assert.equal(resolvedRow?.deleted_at, null);
  assert.doesNotMatch(resolvedRow?.meta ?? '', /syncConflictReason/);
});
