import {
  canEditRecord,
  createdByUserIdForUpdate,
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
import type { Income } from '../types';

interface IncomeRow {
  id: string;
  kind: Income['kind'];
  amount: number;
  source: string;
  cadence: Income['cadence'];
  start_date: string;
  end_date: string | null;
  received_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ledger_id: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  cloud_record_name: string | null;
  cloud_zone_name: string | null;
  record_change_tag: string | null;
  sync_status: Income['syncStatus'] | null;
  meta: string | null;
}

export class SQLiteIncomeRepo extends SQLiteRepository<Income> {
  protected readAll(): Income[] {
    return getDb().getAllSync<IncomeRow>(
      `SELECT * FROM incomes WHERE ${ledgerWhere()} ORDER BY start_date DESC, id DESC`,
      ledgerParam(),
    ).map(row => ({
      id: row.id,
      kind: row.kind ?? 'regular',
      amount: row.amount,
      source: row.source,
      cadence: row.cadence,
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      receivedAt: row.received_at ?? undefined,
      createdByUserId: row.created_by_user_id ?? undefined,
      updatedByUserId: row.updated_by_user_id ?? undefined,
      ledgerId: row.ledger_id,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      cloudRecordName: row.cloud_record_name ?? undefined,
      cloudZoneName: row.cloud_zone_name ?? undefined,
      recordChangeTag: row.record_change_tag ?? undefined,
      syncStatus: syncStatus(row.sync_status),
      meta: parseJson(row.meta),
    }));
  }

  create(input: Omit<Income, 'id'>): Income {
    const id = nextId('income');
    const sync = prepareCreateFields(input);
    getDb().runSync(
      `INSERT INTO incomes (
        id, kind, amount, source, cadence, start_date, end_date, received_at,
        created_by_user_id, updated_by_user_id, ledger_id, created_at, updated_at,
        cloud_record_name, cloud_zone_name, record_change_tag, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.kind ?? 'regular',
      input.amount,
      input.source,
      input.cadence,
      input.startDate,
      input.endDate ?? null,
      input.receivedAt ?? null,
      sync.createdByUserId,
      sync.updatedByUserId,
      sync.ledgerId,
      sync.createdAt,
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

  update(id: string, patch: Partial<Omit<Income, 'id'>>): Income | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (!canEditRecord(current.createdByUserId, current.ledgerId)) return undefined;
    const next = { ...current, ...patch };
    const sync = prepareUpdateFields(next);
    getDb().runSync(
      `UPDATE incomes
       SET kind = ?, amount = ?, source = ?, cadence = ?, start_date = ?,
           end_date = ?, received_at = ?, created_by_user_id = ?,
           updated_by_user_id = ?, updated_at = ?, cloud_record_name = ?,
           cloud_zone_name = ?, record_change_tag = ?, sync_status = ?, meta = ?
       WHERE id = ? AND ${ledgerWhere()}`,
      next.kind ?? 'regular',
      next.amount,
      next.source,
      next.cadence,
      next.startDate,
      next.endDate ?? null,
      next.receivedAt ?? null,
      createdByUserIdForUpdate(current.createdByUserId, next.createdByUserId),
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
    const result = getDb().runSync(
      `UPDATE incomes SET deleted_at = ?, updated_by_user_id = ?, updated_at = ?, sync_status = 'pending'
       WHERE id = ? AND ${ledgerWhere()}`,
      new Date().toISOString(),
      getCurrentUserId(),
      new Date().toISOString(),
      id,
      ledgerParam(),
    );
    if (result.changes > 0) this.emit();
  }
}
