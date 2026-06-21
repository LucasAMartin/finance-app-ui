import { getSession } from '../repositories/sqlite/db';
import { SQLiteSyncStore } from './sqliteSyncStore';
import { createNativeCloudKitSyncAdapter, type NativeCloudKitModule } from './nativeCloudKitAdapter';
import { syncLedger, type SyncAdapter, type SyncLedgerResult } from './syncEngine';

export function zoneNameForLedger(ledgerId: string): string {
  return `zone-${ledgerId}`;
}

export interface SyncActiveLedgerOptions {
  adapter?: SyncAdapter;
  nativeModule?: NativeCloudKitModule | null;
}

export async function syncActiveLedger(options: SyncActiveLedgerOptions = {}): Promise<SyncLedgerResult> {
  const session = getSession();
  const adapter = options.adapter ?? createNativeCloudKitSyncAdapter(options.nativeModule);
  const store = new SQLiteSyncStore();
  const zoneName = zoneNameForLedger(session.activeLedgerId);
  const syncOptions = {
    adapter,
    store,
    ledgerId: session.activeLedgerId,
    zoneName,
  };

  try {
    return await syncLedger(syncOptions);
  } catch (error) {
    if (!isRecoverableCloudKitResetError(error)) throw error;
    store.setChangeToken(zoneName, undefined);
    return syncLedger(syncOptions);
  }
}

export function hasPendingActiveLedgerChanges(): boolean {
  const session = getSession();
  const zoneName = zoneNameForLedger(session.activeLedgerId);
  return new SQLiteSyncStore()
    .listPendingRecords(session.activeLedgerId)
    .some(record => record.zoneName === zoneName);
}

export function resetActiveLedgerSyncState(): void {
  const session = getSession();
  new SQLiteSyncStore().setChangeToken(zoneNameForLedger(session.activeLedgerId), undefined);
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
