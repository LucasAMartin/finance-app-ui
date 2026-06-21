import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDb, resetSQLiteDatabaseForTests } from '../repositories/sqlite/db.ts';
import {
  createNativeCloudKitSyncAdapter,
  recordFromNativePayload,
  recordToNativePayload,
  type NativeCloudKitModule,
  type NativeCloudKitRecordPayload,
} from './nativeCloudKitAdapter.ts';
import { cloudKitRouteForActiveLedger, syncActiveLedger } from './syncActiveLedger.ts';
import type { SyncRecord } from './syncEngine.ts';

const baseRecord: SyncRecord = {
  recordName: 'tx-native',
  recordType: 'transaction',
  zoneName: 'zone-ledger-default',
  ledgerId: 'ledger-default',
  fields: {
    amount: 18,
    merchant: 'Native Market',
    cat: 'groceries',
  },
  createdByUserId: 'alex',
  updatedByUserId: 'alex',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:05:00.000Z',
  deletedAt: undefined,
  recordChangeTag: 'tag-old',
  syncStatus: 'pending',
};

test('native CloudKit adapter maps records to JSON-safe native payloads', () => {
  const payload = recordToNativePayload(baseRecord);

  assert.deepEqual(payload, {
    recordName: 'tx-native',
    recordType: 'transaction',
    zoneName: 'zone-ledger-default',
    ledgerId: 'ledger-default',
    fields: {
      amount: 18,
      merchant: 'Native Market',
      cat: 'groceries',
    },
    createdByUserId: 'alex',
    updatedByUserId: 'alex',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:05:00.000Z',
    deletedAt: undefined,
    recordChangeTag: 'tag-old',
    syncStatus: 'pending',
  });
});

test('native CloudKit adapter maps native payloads back to SyncRecords', () => {
  const payload: NativeCloudKitRecordPayload = {
    ...recordToNativePayload(baseRecord),
    recordChangeTag: 'tag-new',
    syncStatus: 'synced',
  };

  const record = recordFromNativePayload(payload);

  assert.equal(record.recordName, 'tx-native');
  assert.equal(record.recordType, 'transaction');
  assert.equal(record.recordChangeTag, 'tag-new');
  assert.equal(record.syncStatus, 'synced');
  assert.equal(record.fields.amount, 18);
});

test('native CloudKit adapter rejects unknown native record types', () => {
  assert.throws(
    () => recordFromNativePayload({
      ...recordToNativePayload(baseRecord),
      recordType: 'unknown' as SyncRecord['recordType'],
    }),
    /Unsupported CloudKit record type/,
  );
});

test('native CloudKit adapter rejects malformed native record payloads', () => {
  assert.throws(
    () => recordFromNativePayload({
      ...recordToNativePayload(baseRecord),
      updatedAt: '' as string,
    }),
    /missing updatedAt/,
  );
});

test('native CloudKit adapter pauses cleanly when native module is missing', async () => {
  resetSQLiteDatabaseForTests();

  const result = await syncActiveLedger();

  assert.equal(result.status, 'paused');
  assert.equal(result.reason, 'not-implemented');
  assert.equal(result.pulledRecords, 0);
  assert.equal(result.pushedRecords, 0);
});

test('syncActiveLedger clears stale CloudKit change tokens and retries once', async () => {
  resetSQLiteDatabaseForTests();
  getDb().runSync(
    'INSERT INTO sync_state (zone_name, change_token, updated_at) VALUES (?, ?, ?)',
    'zone-ledger-default',
    'old-token',
    '2026-06-01T10:00:00.000Z',
  );
  let pulls = 0;
  const adapter = createNativeCloudKitSyncAdapter({
    async getCurrentUser() {
      return { available: true, userId: 'icloud-alex' };
    },
    async pullChanges(_zoneName, sinceToken) {
      pulls += 1;
      if (sinceToken === 'old-token') {
        throw new Error('CKErrorDomain Code=21 "changeTokenExpired"');
      }
      return { records: [], changeToken: 'fresh-token' };
    },
    async pushRecords(_zoneName, records) {
      return {
        accepted: records.map(record => ({
          ...record,
          recordChangeTag: `tag-${record.recordName}`,
          syncStatus: 'synced',
        })),
        conflicts: [],
      };
    },
  });

  const result = await syncActiveLedger({ adapter });

  assert.equal(pulls, 2);
  assert.equal(result.status, 'synced');
  assert.equal(getDb().getFirstSync<{ change_token: string }>(
    'SELECT change_token FROM sync_state WHERE zone_name = ?',
    'zone-ledger-default',
  )?.change_token, 'fresh-token');
});

test('native CloudKit adapter forwards push payloads and maps accepted responses', async () => {
  const pushed: NativeCloudKitRecordPayload[][] = [];
  const nativeModule: NativeCloudKitModule = {
    async getCurrentUser() {
      return { available: true, userId: 'icloud-alex' };
    },
    async pullChanges() {
      return { records: [], changeToken: 'token-1' };
    },
    async pushRecords(zoneName, records) {
      assert.equal(zoneName, 'zone-ledger-default');
      pushed.push(records);
      return {
        accepted: records.map(record => ({
          ...record,
          recordChangeTag: 'tag-accepted',
          syncStatus: 'synced',
        })),
        conflicts: [],
      };
    },
  };
  const adapter = createNativeCloudKitSyncAdapter(nativeModule);

  const result = await adapter.pushRecords('zone-ledger-default', [baseRecord]);

  assert.equal(pushed.length, 1);
  assert.equal(pushed[0][0].recordName, 'tx-native');
  assert.equal(pushed[0][0].recordType, 'transaction');
  assert.equal(pushed[0][0].fields.merchant, 'Native Market');
  assert.equal(result.accepted[0].recordChangeTag, 'tag-accepted');
  assert.equal(result.accepted[0].syncStatus, 'synced');
});

test('native CloudKit adapter maps pulled native records through the sync adapter contract', async () => {
  const nativeModule: NativeCloudKitModule = {
    async getCurrentUser() {
      return { available: true, userId: 'icloud-alex' };
    },
    async pullChanges(zoneName, sinceToken) {
      assert.equal(zoneName, 'zone-ledger-default');
      assert.equal(sinceToken, 'token-before');
      return {
        records: [{
          ...recordToNativePayload(baseRecord),
          recordChangeTag: 'tag-pulled',
          syncStatus: 'synced',
        }],
        changeToken: 'token-after',
      };
    },
    async pushRecords() {
      return { accepted: [], conflicts: [] };
    },
  };
  const adapter = createNativeCloudKitSyncAdapter(nativeModule);

  const result = await adapter.pullChanges('zone-ledger-default', 'token-before');

  assert.equal(result.changeToken, 'token-after');
  assert.equal(result.records[0].recordName, 'tx-native');
  assert.equal(result.records[0].recordChangeTag, 'tag-pulled');
  assert.equal(result.records[0].fields.cat, 'groceries');
});

test('native CloudKit adapter routes shared ledgers through the shared database bridge', async () => {
  const calls: string[] = [];
  const nativeModule: NativeCloudKitModule = {
    async getCurrentUser() {
      return { available: true, userId: 'icloud-alex' };
    },
    async pullChanges() {
      throw new Error('private pull should not be used for shared routes');
    },
    async pushRecords() {
      throw new Error('private push should not be used for shared routes');
    },
    async pullChangesInDatabase(zoneName, sinceToken, databaseScope, ownerName) {
      calls.push('pull');
      assert.equal(zoneName, 'zone-ledger-default');
      assert.equal(sinceToken, 'token-before');
      assert.equal(databaseScope, 'shared');
      assert.equal(ownerName, '__owner__');
      return { records: [], changeToken: 'token-after' };
    },
    async pushRecordsInDatabase(zoneName, records, databaseScope, ownerName) {
      calls.push('push');
      assert.equal(zoneName, 'zone-ledger-default');
      assert.equal(databaseScope, 'shared');
      assert.equal(ownerName, '__owner__');
      return {
        accepted: records.map(record => ({
          ...record,
          recordChangeTag: 'tag-shared',
          syncStatus: 'synced',
        })),
        conflicts: [],
      };
    },
  };
  const adapter = createNativeCloudKitSyncAdapter(nativeModule, {
    databaseScope: 'shared',
    ownerName: '__owner__',
  });

  const pull = await adapter.pullChanges('zone-ledger-default', 'token-before');
  const push = await adapter.pushRecords('zone-ledger-default', [baseRecord]);

  assert.deepEqual(calls, ['pull', 'push']);
  assert.equal(pull.changeToken, 'token-after');
  assert.equal(push.accepted[0].recordChangeTag, 'tag-shared');
});

test('cloudKitRouteForActiveLedger keeps shared ledgers on a separate owner-scoped token key', () => {
  resetSQLiteDatabaseForTests();
  getDb().runSync(
    'UPDATE ledgers SET meta = ? WHERE id = ?',
    JSON.stringify({
      cloudDatabaseScope: 'shared',
      cloudOwnerName: '__owner__',
      cloudZoneName: 'zone-ledger-default',
    }),
    'ledger-default',
  );

  const route = cloudKitRouteForActiveLedger('ledger-default');

  assert.deepEqual(route, {
    zoneName: 'zone-ledger-default',
    databaseScope: 'shared',
    ownerName: '__owner__',
    changeTokenKey: 'shared:__owner__:zone-ledger-default',
  });
});

test('native CloudKit adapter rejects unknown native conflict reasons', async () => {
  const nativeModule: NativeCloudKitModule = {
    async getCurrentUser() {
      return { available: true, userId: 'icloud-alex' };
    },
    async pullChanges() {
      return { records: [] };
    },
    async pushRecords() {
      return {
        accepted: [],
        conflicts: [{
          local: recordToNativePayload(baseRecord),
          reason: 'strange-conflict' as never,
        }],
      };
    },
  };
  const adapter = createNativeCloudKitSyncAdapter(nativeModule);

  await assert.rejects(
    () => adapter.pushRecords('zone-ledger-default', [baseRecord]),
    /Unsupported CloudKit conflict reason/,
  );
});
