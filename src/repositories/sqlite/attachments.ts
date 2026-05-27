import { getDb, json, nextId } from './db';
import { SQLiteRepository } from './base';
import type { Attachment } from '../types';

interface AttachmentRow {
  id: string;
  transaction_id: string;
  local_uri: string;
  type: Attachment['type'];
  created_at: string;
  cloud_asset_id: string | null;
  meta: string | null;
}

export class SQLiteAttachmentsRepo extends SQLiteRepository<Attachment> {
  protected readAll(): Attachment[] {
    return getDb().getAllSync<AttachmentRow>('SELECT * FROM attachments ORDER BY created_at DESC').map(row => ({
      id: row.id,
      transactionId: row.transaction_id,
      localUri: row.local_uri,
      type: row.type,
      createdAt: row.created_at,
      cloudAssetId: row.cloud_asset_id ?? undefined,
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: Omit<Attachment, 'id'>): Attachment {
    const id = nextId('att');
    getDb().runSync(
      'INSERT INTO attachments (id, transaction_id, local_uri, type, created_at, cloud_asset_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      input.transactionId,
      input.localUri,
      input.type,
      input.createdAt,
      input.cloudAssetId ?? null,
      json(input.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: Partial<Omit<Attachment, 'id'>>): Attachment | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb().runSync(
      'UPDATE attachments SET transaction_id = ?, local_uri = ?, type = ?, created_at = ?, cloud_asset_id = ?, meta = ? WHERE id = ?',
      next.transactionId,
      next.localUri,
      next.type,
      next.createdAt,
      next.cloudAssetId ?? null,
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM attachments WHERE id = ?', id);
    this.emit();
  }
}
