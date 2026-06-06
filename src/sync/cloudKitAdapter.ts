import type { AppSession } from '../repositories/types';

export type CloudKitAvailability =
  | { available: true; userId: string }
  | { available: false; reason: 'ios-only' | 'signed-out' | 'unavailable' | 'not-implemented' };

export interface CloudKitLedgerSyncResult {
  ledgerId: string;
  pulledRecords: number;
  pushedRecords: number;
  conflicts: number;
}

export interface CloudKitShareResult {
  ledgerId: string;
  shareUrl?: string;
}

export interface CloudKitAdapter {
  getCurrentUser(): Promise<CloudKitAvailability>;
  syncLedger(ledgerId: string, session: AppSession): Promise<CloudKitLedgerSyncResult>;
  presentLedgerShare(ledgerId: string): Promise<CloudKitShareResult>;
}

export const unavailableCloudKitAdapter: CloudKitAdapter = {
  async getCurrentUser() {
    return { available: false, reason: 'not-implemented' };
  },
  async syncLedger(ledgerId) {
    return { ledgerId, pulledRecords: 0, pushedRecords: 0, conflicts: 0 };
  },
  async presentLedgerShare(ledgerId) {
    return { ledgerId };
  },
};
