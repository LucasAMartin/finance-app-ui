export type CloudSyncUiState = {
  label: string;
  detail: string;
  lastSyncedAt?: string;
  pendingRecords: number;
  conflictedRecords: number;
};

export type CloudSyncConflictResolution = 'local' | 'remote' | 'discardLocal';

export type CloudSyncConflictItem = {
  recordName: string;
  title: string;
  detail: string;
  reason: string;
  localLabel: string;
  remoteLabel?: string;
  hasRemote: boolean;
  canKeepLocal: boolean;
  requiresDiscardLocal: boolean;
};

export const CLOUD_SYNC_OFF: CloudSyncUiState = {
  label: 'Off',
  detail: 'iCloud sync is off',
  pendingRecords: 0,
  conflictedRecords: 0,
};
