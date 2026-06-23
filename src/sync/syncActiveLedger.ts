import { getSession, listLedgers } from '../repositories/sqlite/db';
import { SQLiteSyncStore, type StoredSyncConflict, type SyncConflictResolution } from './sqliteSyncStore';
import {
  createNativeCloudKitSyncAdapter,
  type NativeCloudKitDatabaseRoute,
  type NativeCloudKitModule,
} from './nativeCloudKitAdapter';
import { syncLedger, type SyncAdapter, type SyncLedgerResult } from './syncEngine';

export function zoneNameForLedger(ledgerId: string): string {
  return `zone-${ledgerId}`;
}

export interface SyncActiveLedgerOptions {
  adapter?: SyncAdapter;
  nativeModule?: NativeCloudKitModule | null;
}

export interface ActiveLedgerCloudKitRoute extends NativeCloudKitDatabaseRoute {
  zoneName: string;
  changeTokenKey: string;
}

export async function syncActiveLedger(options: SyncActiveLedgerOptions = {}): Promise<SyncLedgerResult> {
  const session = getSession();
  const route = cloudKitRouteForActiveLedger(session.activeLedgerId);
  const adapter = options.adapter ?? createNativeCloudKitSyncAdapter(options.nativeModule, route);
  const store = new SQLiteSyncStore();
  const syncOptions = {
    adapter,
    store,
    ledgerId: session.activeLedgerId,
    zoneName: route.zoneName,
    changeTokenKey: route.changeTokenKey,
  };

  try {
    return await syncLedger(syncOptions);
  } catch (error) {
    if (!isRecoverableCloudKitResetError(error)) throw error;
    store.setChangeToken(route.changeTokenKey, undefined);
    return syncLedger(syncOptions);
  }
}

export function hasPendingActiveLedgerChanges(): boolean {
  const session = getSession();
  const route = cloudKitRouteForActiveLedger(session.activeLedgerId);
  return new SQLiteSyncStore()
    .listPendingRecords(session.activeLedgerId)
    .some(record => record.zoneName === route.zoneName);
}

export function activeLedgerSyncDiagnostics(): {
  pendingRecords: number;
  conflictedRecords: number;
} {
  const session = getSession();
  const route = cloudKitRouteForActiveLedger(session.activeLedgerId);
  const store = new SQLiteSyncStore();
  return {
    pendingRecords: store
      .listPendingRecords(session.activeLedgerId)
      .filter(record => record.zoneName === route.zoneName).length,
    conflictedRecords: store
      .listConflictedRecords(session.activeLedgerId)
      .filter(record => record.zoneName === route.zoneName).length,
  };
}

export function listActiveLedgerSyncConflicts(): StoredSyncConflict[] {
  const session = getSession();
  const route = cloudKitRouteForActiveLedger(session.activeLedgerId);
  return new SQLiteSyncStore()
    .listConflicts(session.activeLedgerId)
    .filter(conflict => conflict.local.zoneName === route.zoneName);
}

export function resolveActiveLedgerSyncConflict(
  recordName: string,
  resolution: SyncConflictResolution,
): boolean {
  return new SQLiteSyncStore().resolveConflict(recordName, resolution);
}

export function resetActiveLedgerSyncState(): void {
  const session = getSession();
  const route = cloudKitRouteForActiveLedger(session.activeLedgerId);
  new SQLiteSyncStore().setChangeToken(route.changeTokenKey, undefined);
}

export function cloudKitRouteForActiveLedger(ledgerId: string): ActiveLedgerCloudKitRoute {
  const ledger = listLedgers().find(item => item.id === ledgerId);
  const meta = ledger?.meta ?? {};
  const zoneName = typeof meta.cloudZoneName === 'string' && meta.cloudZoneName.length > 0
    ? meta.cloudZoneName
    : zoneNameForLedger(ledgerId);
  const ownerName = typeof meta.cloudOwnerName === 'string' && meta.cloudOwnerName.length > 0
    ? meta.cloudOwnerName
    : undefined;
  const databaseScope = meta.cloudDatabaseScope === 'shared' && ownerName ? 'shared' : 'private';
  return {
    zoneName,
    databaseScope,
    ownerName,
    changeTokenKey: databaseScope === 'shared' ? `shared:${ownerName}:${zoneName}` : zoneName,
  };
}

function isRecoverableCloudKitResetError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    message.includes('changetoken') ||
    message.includes('change token') ||
    message.includes('token expired') ||
    message.includes('zone not found') ||
    message.includes('zonenotfound') ||
    message.includes('unknownitem')
  );
}
