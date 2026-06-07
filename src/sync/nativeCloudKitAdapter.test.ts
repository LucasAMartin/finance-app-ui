import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetSQLiteDatabaseForTests } from '../repositories/sqlite/db.ts';
import {
  createNativeCloudKitSyncAdapter,
  recordFromNativePayload,
  recordToNativePayload,
  type NativeCloudKitModule,
  type NativeCloudKitRecordPayload,
} from './nativeCloudKitAdapter.ts';
import { syncActiveLedger } from './syncActiveLedger.ts';
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
