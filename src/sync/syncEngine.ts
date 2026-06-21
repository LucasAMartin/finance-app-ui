import type { CloudKitAvailability } from './cloudKitAdapter';

export type SyncRecordType =
  | 'ledger'
  | 'ledgerMember'
  | 'transaction'
  | 'income'
  | 'category'
  | 'budget'
  | 'recurringRule'
  | 'bill'
  | 'attachment';

export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflicted';

export interface SyncRecord {
  recordName: string;
  recordType: SyncRecordType;
  zoneName: string;
  ledgerId: string;
  fields: Record<string, unknown>;
  createdByUserId?: string;
  updatedByUserId?: string;
  createdAt?: string;
  updatedAt: string;
  deletedAt?: string;
  recordChangeTag?: string;
  syncStatus?: SyncStatus;
}

export interface SyncConflict {
  local: SyncRecord;
  remote?: SyncRecord;
  reason: 'remote-newer' | 'deleted-remotely' | 'permission-denied';
}

export interface SyncPullResult {
  records: SyncRecord[];
  changeToken?: string;
}

export interface SyncPushResult {
  accepted: SyncRecord[];
  conflicts: SyncConflict[];
}

export interface SyncAdapter {
  getCurrentUser(): Promise<CloudKitAvailability>;
  pullChanges(zoneName: string, sinceToken?: string): Promise<SyncPullResult>;
  pushRecords(zoneName: string, records: SyncRecord[]): Promise<SyncPushResult>;
}

export interface SyncRecordStore {
  getChangeToken(zoneName: string): string | undefined;
  setChangeToken(zoneName: string, token?: string): void;
  getRecord(recordName: string): SyncRecord | undefined;
  listPendingRecords(ledgerId: string): SyncRecord[];
  applyRemoteRecord(record: SyncRecord): void;
  markSynced(record: SyncRecord): void;
  markConflicted(conflict: SyncConflict): void;
  canPushRecord?(record: SyncRecord): boolean;
}

export interface SyncLedgerOptions {
  adapter: SyncAdapter;
  store: SyncRecordStore;
  ledgerId: string;
  zoneName: string;
  changeTokenKey?: string;
}

export interface SyncLedgerResult {
  status: 'synced' | 'paused';
  reason?: Extract<CloudKitAvailability, { available: false }>['reason'];
  pulledRecords: number;
  pushedRecords: number;
  conflicts: number;
}

function time(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function remoteWins(local: SyncRecord, remote: SyncRecord): boolean {
  if (remote.deletedAt && time(remote.updatedAt) >= time(local.updatedAt)) return true;
  if (local.deletedAt && time(local.updatedAt) > time(remote.updatedAt)) return false;
  return time(remote.updatedAt) >= time(local.updatedAt);
}

function shouldApplyRemote(local: SyncRecord | undefined, remote: SyncRecord): boolean {
  if (!local) return true;
  if (local.syncStatus === 'local') return true;
  if (local.syncStatus !== 'pending') return remoteWins(local, remote);
  return remoteWins(local, remote);
}

const RECORD_APPLY_ORDER: Record<SyncRecordType, number> = {
  ledger: 0,
  ledgerMember: 1,
  category: 2,
  recurringRule: 3,
  transaction: 4,
  income: 4,
  budget: 4,
  bill: 4,
  attachment: 5,
};

function orderedForApply(records: SyncRecord[]): SyncRecord[] {
  return [...records].sort((a, b) => RECORD_APPLY_ORDER[a.recordType] - RECORD_APPLY_ORDER[b.recordType]);
}

export async function syncLedger({
  adapter,
  store,
  ledgerId,
  zoneName,
  changeTokenKey,
}: SyncLedgerOptions): Promise<SyncLedgerResult> {
  const currentUser = await adapter.getCurrentUser();
  if (!currentUser.available) {
    return {
      status: 'paused',
      reason: currentUser.reason,
      pulledRecords: 0,
      pushedRecords: 0,
      conflicts: 0,
    };
  }

  let pulledRecords = 0;
  let pushedRecords = 0;
  let conflicts = 0;

  const tokenKey = changeTokenKey ?? zoneName;
  const pull = await adapter.pullChanges(zoneName, store.getChangeToken(tokenKey));
  orderedForApply(pull.records).forEach(remote => {
    if (remote.ledgerId !== ledgerId) return;
    const local = store.getRecord(remote.recordName);
    if (shouldApplyRemote(local, remote)) {
      store.applyRemoteRecord(remote);
      pulledRecords += 1;
      return;
    }
  });
  store.setChangeToken(tokenKey, pull.changeToken);

  const permitted: SyncRecord[] = [];
  store.listPendingRecords(ledgerId).forEach(record => {
    if (record.zoneName !== zoneName) return;
    if (store.canPushRecord && !store.canPushRecord(record)) {
      store.markConflicted({ local: record, reason: 'permission-denied' });
      conflicts += 1;
      return;
    }
    permitted.push(record);
  });

  if (permitted.length > 0) {
    const push = await adapter.pushRecords(zoneName, permitted);
    push.accepted.forEach(record => {
      store.markSynced(record);
      pushedRecords += 1;
    });
    push.conflicts.forEach(conflict => {
      if (conflict.remote && remoteWins(conflict.local, conflict.remote)) {
        store.applyRemoteRecord(conflict.remote);
      } else {
        store.markConflicted(conflict);
      }
      conflicts += 1;
    });
  }

  return {
    status: 'synced',
    pulledRecords,
    pushedRecords,
    conflicts,
  };
}
