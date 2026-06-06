import {
  canEditRecord,
  getCurrentUserId,
  getDb,
  json,
  ledgerParam,
  ledgerWhere,
  nextId,
  parseJson,
  prepareCreateFields,
  prepareUpdateFields,
  syncStatus,
} from './db';
import { SQLiteRepository } from './base';
import type { Attachment } from '../types';

interface AttachmentRow {
  id: string;
  transaction_id: string;
  local_uri: string;
  type: Attachment['type'];
  created_at: string;
  cloud_asset_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ledger_id: string;
  updated_at: string | null;
  deleted_at: string | null;
  cloud_record_name: string | null;
  cloud_zone_name: string | null;
  record_change_tag: string | null;
  sync_status: Attachment['syncStatus'] | null;
  meta: string | null;
}

export class SQLiteAttachmentsRepo extends SQLiteRepository<Attachment> {
  protected readAll(): Attachment[] {
    return getDb().getAllSync<AttachmentRow>(
      `SELECT * FROM attachments WHERE ${ledgerWhere()} ORDER BY created_at DESC`,
      ledgerParam(),
    ).map(row => ({
      id: row.id,
      transactionId: row.transaction_id,
      localUri: row.local_uri,
      type: row.type,
      createdAt: row.created_at,
      cloudAssetId: row.cloud_asset_id ?? undefined,
      createdByUserId: row.created_by_user_id ?? undefined,
      updatedByUserId: row.updated_by_user_id ?? undefined,
      ledgerId: row.ledger_id,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      cloudRecordName: row.cloud_record_name ?? undefined,
      cloudZoneName: row.cloud_zone_name ?? undefined,
      recordChangeTag: row.record_change_tag ?? undefined,
      syncStatus: syncStatus(row.sync_status),
      meta: parseJson(row.meta),
    }));
  }

  create(input: Omit<Attachment, 'id'>): Attachment {
    const id = nextId('att');
    const sync = prepareCreateFields(input);
    getDb().runSync(
      `INSERT INTO attachments (
        id, transaction_id, local_uri, type, created_at, cloud_asset_id,
        created_by_user_id, updated_by_user_id, ledger_id, updated_at,
        cloud_record_name, cloud_zone_name, record_change_tag, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.transactionId,
      input.localUri,
      input.type,
      input.createdAt ?? sync.createdAt,
      input.cloudAssetId ?? null,
      sync.createdByUserId,
      sync.updatedByUserId,
      sync.ledgerId,
      sync.updatedAt,
      sync.cloudRecordName ?? null,
      sync.cloudZoneName ?? null,
      sync.recordChangeTag ?? null,
      sync.syncStatus,
      json(input.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: Partial<Omit<Attachment, 'id'>>): Attachment | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (!canEditRecord(current.createdByUserId, current.ledgerId)) return undefined;
    const next = { ...current, ...patch };
    const sync = prepareUpdateFields(next);
    getDb().runSync(
      `UPDATE attachments
       SET transaction_id = ?, local_uri = ?, type = ?, created_at = ?,
           cloud_asset_id = ?, updated_by_user_id = ?, updated_at = ?,
           cloud_record_name = ?, cloud_zone_name = ?, record_change_tag = ?,
           sync_status = ?, meta = ?
       WHERE id = ? AND ${ledgerWhere()}`,
      next.transactionId,
      next.localUri,
      next.type,
      next.createdAt,
      next.cloudAssetId ?? null,
      sync.updatedByUserId,
      sync.updatedAt,
      next.cloudRecordName ?? null,
      next.cloudZoneName ?? null,
      next.recordChangeTag ?? null,
      sync.syncStatus,
      json(next.meta),
      id,
      ledgerParam(),
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    const current = this.get(id);
    if (!current || !canEditRecord(current.createdByUserId, current.ledgerId)) return;
    const now = new Date().toISOString();
    const result = getDb().runSync(
      `UPDATE attachments SET deleted_at = ?, updated_by_user_id = ?, updated_at = ?, sync_status = 'pending'
       WHERE id = ? AND ${ledgerWhere()}`,
      now,
      getCurrentUserId(),
      now,
      id,
      ledgerParam(),
    );
    if (result.changes > 0) this.emit();
  }
}
