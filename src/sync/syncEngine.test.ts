import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncLedger, type SyncAdapter, type SyncConflict, type SyncRecord, type SyncRecordStore } from './syncEngine.ts';
import type { CloudKitAvailability } from './cloudKitAdapter.ts';

const LEDGER_ID = 'ledger-default';
const ZONE_NAME = 'zone-ledger-default';

function cloneRecord(record: SyncRecord): SyncRecord {
  return {
    ...record,
    fields: { ...record.fields },
  };
}

function ms(value: string): number {
  return Date.parse(value);
}

function baseRecord(
  recordName: string,
  recordType: SyncRecord['recordType'],
  updatedAt: string,
  fields: Record<string, unknown> = {},
): SyncRecord {
  return {
    recordName,
    recordType,
    zoneName: ZONE_NAME,
    ledgerId: LEDGER_ID,
    fields,
    createdByUserId: 'alex',
    updatedByUserId: 'alex',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt,
    syncStatus: 'pending',
  };
}

class FakeCloudKitSyncAdapter implements SyncAdapter {
  availability: CloudKitAvailability = { available: true, userId: 'icloud-alex' };
  private records = new Map<string, SyncRecord>();
  private version = 0;

  getRemote(recordName: string): SyncRecord | undefined {
    const record = this.records.get(recordName);
    return record ? cloneRecord(record) : undefined;
  }

  seed(record: SyncRecord): SyncRecord {
    const accepted = this.accept(record);
    this.records.set(accepted.recordName, accepted);
    return cloneRecord(accepted);
  }

  async getCurrentUser(): Promise<CloudKitAvailability> {
    return this.availability;
  }

  async pullChanges(zoneName: string): Promise<{ records: SyncRecord[]; changeToken?: string }> {
    return {
      records: [...this.records.values()]
        .filter(record => record.zoneName === zoneName)
        .map(cloneRecord),
      changeToken: String(this.version),
    };
  }

  async pushRecords(zoneName: string, records: SyncRecord[]): Promise<{ accepted: SyncRecord[]; conflicts: SyncConflict[] }> {
    const accepted: SyncRecord[] = [];
    const conflicts: SyncConflict[] = [];
    records
      .filter(record => record.zoneName === zoneName)
      .forEach(record => {
        const current = this.records.get(record.recordName);
        if (current && this.remoteShouldReject(record, current)) {
          conflicts.push({
            local: cloneRecord(record),
            remote: cloneRecord(current),
            reason: current.deletedAt ? 'deleted-remotely' : 'remote-newer',
          });
          return;
        }
        const next = this.accept(record);
        this.records.set(next.recordName, next);
        accepted.push(cloneRecord(next));
      });
    return { accepted, conflicts };
  }

  private remoteShouldReject(local: SyncRecord, remote: SyncRecord): boolean {
    if (remote.deletedAt && (!local.deletedAt || ms(remote.updatedAt) >= ms(local.updatedAt))) return true;
    if (local.recordChangeTag && remote.recordChangeTag && local.recordChangeTag !== remote.recordChangeTag) {
      return ms(local.updatedAt) < ms(remote.updatedAt);
    }
    return ms(local.updatedAt) < ms(remote.updatedAt);
  }

  private accept(record: SyncRecord): SyncRecord {
    this.version += 1;
    return {
      ...cloneRecord(record),
      recordChangeTag: `tag-${this.version}`,
      syncStatus: 'synced',
    };
  }
}

class MemorySyncStore implements SyncRecordStore {
  records = new Map<string, SyncRecord>();
  conflicts: SyncConflict[] = [];
  private tokens = new Map<string, string | undefined>();

  constructor(private currentUserId = 'alex') {}

  put(record: SyncRecord, syncStatus: SyncRecord['syncStatus'] = 'pending') {
    this.records.set(record.recordName, { ...cloneRecord(record), syncStatus });
  }

  getChangeToken(zoneName: string): string | undefined {
    return this.tokens.get(zoneName);
  }

  setChangeToken(zoneName: string, token?: string): void {
    this.tokens.set(zoneName, token);
  }

  getRecord(recordName: string): SyncRecord | undefined {
    const record = this.records.get(recordName);
    return record ? cloneRecord(record) : undefined;
  }

  listPendingRecords(ledgerId: string): SyncRecord[] {
    return [...this.records.values()]
      .filter(record => record.ledgerId === ledgerId && record.syncStatus === 'pending')
      .map(cloneRecord);
  }

  applyRemoteRecord(record: SyncRecord): void {
    this.records.set(record.recordName, {
      ...cloneRecord(record),
      syncStatus: 'synced',
    });
  }

  markSynced(record: SyncRecord): void {
    this.records.set(record.recordName, {
      ...cloneRecord(record),
      syncStatus: 'synced',
    });
  }

  markConflicted(conflict: SyncConflict): void {
    this.conflicts.push({
      ...conflict,
      local: cloneRecord(conflict.local),
      remote: conflict.remote ? cloneRecord(conflict.remote) : undefined,
    });
    this.records.set(conflict.local.recordName, {
      ...cloneRecord(conflict.local),
      syncStatus: 'conflicted',
      fields: {
        ...conflict.local.fields,
        conflictReason: conflict.reason,
      },
    });
  }

  canPushRecord(record: SyncRecord): boolean {
    if (record.recordType !== 'transaction' && record.recordType !== 'income') return true;
    if (!record.createdByUserId || record.createdByUserId === this.currentUserId) return true;
    const ownerMember = [...this.records.values()].find(candidate =>
      candidate.recordType === 'ledgerMember' &&
      candidate.ledgerId === record.ledgerId &&
      candidate.fields.userId === record.createdByUserId
    );
    return ownerMember?.fields.allowOthersToEditMyItems !== false;
  }
}

async function sync(adapter: SyncAdapter, store: MemorySyncStore) {
  return syncLedger({ adapter, store, ledgerId: LEDGER_ID, zoneName: ZONE_NAME });
}

test('sync pushes a new shared ledger from device A and device B pulls it', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const deviceA = new MemorySyncStore('alex');
  const deviceB = new MemorySyncStore('partner');

  deviceA.put(baseRecord('ledger-default', 'ledger', '2026-06-01T10:00:00.000Z', {
    name: 'Shared finances',
    ownerUserId: 'alex',
  }));

  assert.equal((await sync(adapter, deviceA)).pushedRecords, 1);
  assert.equal(deviceA.getRecord('ledger-default')?.syncStatus, 'synced');

  assert.equal((await sync(adapter, deviceB)).pulledRecords, 1);
  assert.equal(deviceB.getRecord('ledger-default')?.fields.name, 'Shared finances');
  assert.equal(deviceB.getRecord('ledger-default')?.syncStatus, 'synced');
});

test('sync merges offline transactions created on two devices', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const deviceA = new MemorySyncStore('alex');
  const deviceB = new MemorySyncStore('partner');

  deviceA.put(baseRecord('tx-a', 'transaction', '2026-06-01T10:00:00.000Z', { amount: 30, merchant: 'Alex Grocer' }));
  deviceB.put({
    ...baseRecord('tx-b', 'transaction', '2026-06-01T10:05:00.000Z', { amount: 45, merchant: 'Partner Grocer' }),
    createdByUserId: 'partner',
    updatedByUserId: 'partner',
  });

  await sync(adapter, deviceA);
  await sync(adapter, deviceB);
  await sync(adapter, deviceA);

  assert.equal(deviceA.getRecord('tx-a')?.fields.amount, 30);
  assert.equal(deviceA.getRecord('tx-b')?.fields.amount, 45);
  assert.equal(deviceB.getRecord('tx-a')?.fields.amount, 30);
  assert.equal(deviceB.getRecord('tx-b')?.fields.amount, 45);
  assert.equal(adapter.getRemote('tx-a')?.syncStatus, 'synced');
  assert.equal(adapter.getRemote('tx-b')?.syncStatus, 'synced');
});

test('sync uses latest updatedAt for ordinary edit conflicts', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const remote = adapter.seed(baseRecord('tx-shared', 'transaction', '2026-06-01T10:00:00.000Z', { amount: 10 }));
  const deviceA = new MemorySyncStore('alex');
  const deviceB = new MemorySyncStore('partner');

  deviceA.put({
    ...remote,
    fields: { amount: 20 },
    updatedAt: '2026-06-01T10:02:00.000Z',
    syncStatus: 'pending',
  });
  await sync(adapter, deviceA);

  deviceB.put({
    ...remote,
    fields: { amount: 15 },
    updatedAt: '2026-06-01T10:01:00.000Z',
    syncStatus: 'pending',
  });
  const result = await sync(adapter, deviceB);

  assert.equal(result.pulledRecords, 1);
  assert.equal(deviceB.getRecord('tx-shared')?.fields.amount, 20);
  assert.equal(deviceB.getRecord('tx-shared')?.syncStatus, 'synced');
  assert.equal(adapter.getRemote('tx-shared')?.fields.amount, 20);
});

test('sync resolves offline same-record edits to the newer updatedAt without duplicates', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const remote = adapter.seed(baseRecord('tx-offline', 'transaction', '2026-06-01T10:00:00.000Z', {
    amount: 10,
    merchant: 'Original Market',
  }));
  const deviceA = new MemorySyncStore('alex');
  const deviceB = new MemorySyncStore('partner');
  deviceA.put(remote, 'synced');
  deviceB.put(remote, 'synced');

  // Device A is offline and edits first.
  deviceA.put({
    ...remote,
    fields: { ...remote.fields, amount: 20, merchant: 'Offline A' },
    updatedAt: '2026-06-01T10:01:00.000Z',
    syncStatus: 'pending',
  });

  // Device B stays online, edits later, and pushes.
  deviceB.put({
    ...remote,
    fields: { ...remote.fields, amount: 30, merchant: 'Online B' },
    updatedAt: '2026-06-01T10:02:00.000Z',
    updatedByUserId: 'partner',
    syncStatus: 'pending',
  });
  assert.equal((await sync(adapter, deviceB)).pushedRecords, 1);

  const result = await sync(adapter, deviceA);

  assert.equal(result.pulledRecords, 1);
  assert.equal(result.pushedRecords, 0);
  assert.equal(result.conflicts, 0);
  assert.equal(deviceA.getRecord('tx-offline')?.fields.amount, 30);
  assert.equal(deviceA.getRecord('tx-offline')?.fields.merchant, 'Online B');
  assert.equal(deviceA.getRecord('tx-offline')?.syncStatus, 'synced');
  assert.equal(deviceA.records.size, 1);
  assert.equal(adapter.getRemote('tx-offline')?.fields.amount, 30);
});

test('sync carries ledger currency metadata to another device', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const deviceA = new MemorySyncStore('alex');
  const deviceB = new MemorySyncStore('partner');

  deviceA.put(baseRecord('ledger-default', 'ledger', '2026-06-01T10:00:00.000Z', {
    name: 'Shared finances',
    ownerUserId: 'alex',
    active: true,
    meta: { currencyCode: 'JPY' },
  }));

  assert.equal((await sync(adapter, deviceA)).pushedRecords, 1);
  assert.equal((await sync(adapter, deviceB)).pulledRecords, 1);
  assert.deepEqual(deviceB.getRecord('ledger-default')?.fields.meta, { currencyCode: 'JPY' });
  assert.equal(deviceB.getRecord('ledger-default')?.syncStatus, 'synced');
});

test('sync lets a newer remote tombstone beat a stale local update', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const deleted = adapter.seed({
    ...baseRecord('tx-deleted', 'transaction', '2026-06-01T10:03:00.000Z', { amount: 10 }),
    deletedAt: '2026-06-01T10:03:00.000Z',
  });
  const device = new MemorySyncStore('alex');

  device.put({
    ...deleted,
    fields: { amount: 99 },
    updatedAt: '2026-06-01T10:02:00.000Z',
    deletedAt: undefined,
    syncStatus: 'pending',
  });

  const result = await sync(adapter, device);

  assert.equal(result.pulledRecords, 1);
  assert.equal(device.getRecord('tx-deleted')?.deletedAt, '2026-06-01T10:03:00.000Z');
  assert.equal(device.getRecord('tx-deleted')?.syncStatus, 'synced');
});

test('sync pulls edit-lock changes before permission-sensitive pushes', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const member = adapter.seed({
    ...baseRecord('member-partner', 'ledgerMember', '2026-06-01T10:05:00.000Z', {
      userId: 'partner',
      displayName: 'Partner',
      allowOthersToEditMyItems: false,
    }),
    createdByUserId: 'partner',
    updatedByUserId: 'partner',
  });
  adapter.seed({
    ...baseRecord('tx-partner', 'transaction', '2026-06-01T10:00:00.000Z', {
      amount: 42,
      merchant: 'Partner Market',
    }),
    createdByUserId: 'partner',
    updatedByUserId: 'partner',
  });

  const device = new MemorySyncStore('alex');
  device.put({
    ...member,
    fields: { ...member.fields, allowOthersToEditMyItems: true },
    updatedAt: '2026-06-01T10:00:00.000Z',
    syncStatus: 'synced',
  }, 'synced');
  device.put({
    ...baseRecord('tx-partner', 'transaction', '2026-06-01T10:04:00.000Z', {
      amount: 99,
      merchant: 'Partner Market',
    }),
    createdByUserId: 'partner',
    updatedByUserId: 'alex',
  });

  const result = await sync(adapter, device);

  assert.equal(result.conflicts, 1);
  assert.equal(device.getRecord('member-partner')?.fields.allowOthersToEditMyItems, false);
  assert.equal(device.getRecord('tx-partner')?.syncStatus, 'conflicted');
  assert.equal(device.getRecord('tx-partner')?.fields.conflictReason, 'permission-denied');
  assert.equal(adapter.getRemote('tx-partner')?.fields.amount, 42);
});

test('sync applies newer remote snapshots during pull before stale local pushes', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  const remote = adapter.seed(baseRecord('tx-conflict', 'transaction', '2026-06-01T10:05:00.000Z', { amount: 100 }));
  const device = new MemorySyncStore('alex');

  device.put({
    ...remote,
    fields: { amount: 80 },
    updatedAt: '2026-06-01T10:04:00.000Z',
    syncStatus: 'pending',
  });
  const result = await sync(adapter, device);

  assert.equal(result.pulledRecords, 1);
  assert.equal(device.getRecord('tx-conflict')?.fields.amount, 100);
  assert.equal(device.getRecord('tx-conflict')?.syncStatus, 'synced');
});

test('sync lets remote records replace local first-run placeholders', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  adapter.seed(baseRecord('ledger-default', 'ledger', '2026-06-01T10:00:00.000Z', {
    name: 'Remote ledger',
    ownerUserId: 'alex',
  }));
  const device = new MemorySyncStore('alex');
  device.put(baseRecord('ledger-default', 'ledger', '2026-06-12T10:00:00.000Z', {
    name: 'Local placeholder',
    ownerUserId: 'alex',
  }), 'local');

  const result = await sync(adapter, device);

  assert.equal(result.pulledRecords, 1);
  assert.equal(device.getRecord('ledger-default')?.fields.name, 'Remote ledger');
  assert.equal(device.getRecord('ledger-default')?.syncStatus, 'synced');
});

test('sync pauses cleanly when CloudKit is unavailable and keeps local pending records', async () => {
  const adapter = new FakeCloudKitSyncAdapter();
  adapter.availability = { available: false, reason: 'signed-out' };
  const device = new MemorySyncStore('alex');
  device.put(baseRecord('tx-local', 'transaction', '2026-06-01T10:00:00.000Z', { amount: 12 }));

  const result = await sync(adapter, device);

  assert.equal(result.status, 'paused');
  assert.equal(result.reason, 'signed-out');
  assert.equal(device.getRecord('tx-local')?.syncStatus, 'pending');
  assert.equal(adapter.getRemote('tx-local'), undefined);
});
