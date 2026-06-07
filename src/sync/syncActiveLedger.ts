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
  return syncLedger({
    adapter,
    store: new SQLiteSyncStore(),
    ledgerId: session.activeLedgerId,
    zoneName: zoneNameForLedger(session.activeLedgerId),
  });
}
