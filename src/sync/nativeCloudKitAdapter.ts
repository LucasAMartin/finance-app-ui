import type { CloudKitAvailability } from './cloudKitAdapter';
import type { SyncAdapter, SyncConflict, SyncPullResult, SyncPushResult, SyncRecord } from './syncEngine';

export interface NativeCloudKitRecordPayload {
  recordName: string;
  recordType: SyncRecord['recordType'];
  zoneName: string;
  ledgerId: string;
  fields: Record<string, unknown>;
  createdByUserId?: string;
  updatedByUserId?: string;
  createdAt?: string;
  updatedAt: string;
  deletedAt?: string;
  recordChangeTag?: string;
  syncStatus?: SyncRecord['syncStatus'];
}

export interface NativeCloudKitConflictPayload {
  local: NativeCloudKitRecordPayload;
  remote?: NativeCloudKitRecordPayload;
  reason: SyncConflict['reason'];
}

export interface NativeCloudKitPullPayload {
  records: NativeCloudKitRecordPayload[];
  changeToken?: string;
}

export interface NativeCloudKitPushPayload {
  accepted: NativeCloudKitRecordPayload[];
  conflicts: NativeCloudKitConflictPayload[];
}

export interface NativeCloudKitModule {
  getCurrentUser(): Promise<CloudKitAvailability>;
  pullChanges(zoneName: string, sinceToken?: string): Promise<NativeCloudKitPullPayload>;
  pushRecords(zoneName: string, records: NativeCloudKitRecordPayload[]): Promise<NativeCloudKitPushPayload>;
  presentLedgerShare?(ledgerId: string): Promise<{ ledgerId: string; shareUrl?: string }>;
}

function isSyncStatus(value: unknown): value is SyncRecord['syncStatus'] {
  return value === 'local' || value === 'pending' || value === 'synced' || value === 'conflicted';
}

function isRecordType(value: unknown): value is SyncRecord['recordType'] {
  return (
    value === 'ledger' ||
    value === 'ledgerMember' ||
    value === 'transaction' ||
    value === 'income' ||
    value === 'category' ||
    value === 'budget' ||
    value === 'recurringRule' ||
    value === 'bill' ||
    value === 'attachment'
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`Invalid CloudKit record payload: missing ${field}`);
}

function isConflictReason(value: unknown): value is SyncConflict['reason'] {
  return value === 'remote-newer' || value === 'deleted-remotely' || value === 'permission-denied';
}

function fieldsObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function recordToNativePayload(record: SyncRecord): NativeCloudKitRecordPayload {
  return {
    recordName: record.recordName,
    recordType: record.recordType,
    zoneName: record.zoneName,
    ledgerId: record.ledgerId,
    fields: { ...record.fields },
    createdByUserId: record.createdByUserId,
    updatedByUserId: record.updatedByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    recordChangeTag: record.recordChangeTag,
    syncStatus: record.syncStatus,
  };
}

export function recordFromNativePayload(payload: NativeCloudKitRecordPayload): SyncRecord {
  if (!isRecordType(payload.recordType)) {
    throw new Error(`Unsupported CloudKit record type: ${String(payload.recordType)}`);
  }
  return {
    recordName: requiredString(payload.recordName, 'recordName'),
    recordType: payload.recordType,
    zoneName: requiredString(payload.zoneName, 'zoneName'),
    ledgerId: requiredString(payload.ledgerId, 'ledgerId'),
    fields: fieldsObject(payload.fields),
    createdByUserId: optionalString(payload.createdByUserId),
    updatedByUserId: optionalString(payload.updatedByUserId),
    createdAt: optionalString(payload.createdAt),
    updatedAt: requiredString(payload.updatedAt, 'updatedAt'),
    deletedAt: optionalString(payload.deletedAt),
    recordChangeTag: optionalString(payload.recordChangeTag),
    syncStatus: isSyncStatus(payload.syncStatus) ? payload.syncStatus : undefined,
  };
}

function conflictFromNativePayload(payload: NativeCloudKitConflictPayload): SyncConflict {
  if (!isConflictReason(payload.reason)) {
    throw new Error(`Unsupported CloudKit conflict reason: ${String(payload.reason)}`);
  }
  return {
    local: recordFromNativePayload(payload.local),
    remote: payload.remote ? recordFromNativePayload(payload.remote) : undefined,
    reason: payload.reason,
  };
}

export function createNativeCloudKitSyncAdapter(nativeModule?: NativeCloudKitModule | null): SyncAdapter {
  return {
    async getCurrentUser() {
      if (!nativeModule) return { available: false, reason: 'not-implemented' };
      return nativeModule.getCurrentUser();
    },

    async pullChanges(zoneName, sinceToken): Promise<SyncPullResult> {
      if (!nativeModule) return { records: [], changeToken: sinceToken };
      const result = await nativeModule.pullChanges(zoneName, sinceToken);
      return {
        records: result.records.map(recordFromNativePayload),
        changeToken: result.changeToken,
      };
    },

    async pushRecords(zoneName, records): Promise<SyncPushResult> {
      if (!nativeModule) return {
        accepted: [],
        conflicts: records.map(local => ({ local, reason: 'permission-denied' })),
      };
      const result = await nativeModule.pushRecords(zoneName, records.map(recordToNativePayload));
      return {
        accepted: result.accepted.map(recordFromNativePayload),
        conflicts: result.conflicts.map(conflictFromNativePayload),
      };
    },
  };
}

export const unavailableNativeCloudKitSyncAdapter = createNativeCloudKitSyncAdapter();
