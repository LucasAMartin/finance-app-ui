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
import type { Bill } from '../types';

interface BillRow {
  id: string;
  amount: number;
  merchant: string;
  name: string;
  icon: string;
  category: string;
  due_date: string;
  recurring: number;
  days_until: number;
  estimate: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ledger_id: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  cloud_record_name: string | null;
  cloud_zone_name: string | null;
  record_change_tag: string | null;
  sync_status: Bill['syncStatus'] | null;
  meta: string | null;
}

export class SQLiteBillsRepo extends SQLiteRepository<Bill> {
  protected readAll(): Bill[] {
    return getDb().getAllSync<BillRow>(
      `SELECT * FROM bills WHERE ${ledgerWhere()} ORDER BY days_until ASC, id`,
      ledgerParam(),
    ).map(row => ({
      id: row.id,
      amount: row.amount,
      fullAmount: row.amount,
      merchant: row.merchant,
      name: row.name,
      icon: row.icon,
      cat: row.category,
      dueDate: row.due_date,
      recurring: Boolean(row.recurring),
      daysUntil: row.days_until,
      estimate: Boolean(row.estimate),
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

  create(input: Omit<Bill, 'id'>): Bill {
    const id = nextId('bill');
    const sync = prepareCreateFields(input);
    getDb().runSync(
      `INSERT INTO bills (
        id, amount, merchant, name, icon, category, due_date, recurring, days_until,
        estimate, ledger_id, created_by_user_id, updated_by_user_id, created_at,
        updated_at, cloud_record_name, cloud_zone_name, record_change_tag,
        sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.amount,
      input.merchant,
      input.name,
      input.icon,
      input.cat,
      input.dueDate,
      input.recurring ? 1 : 0,
      input.daysUntil,
      input.estimate ? 1 : 0,
      sync.ledgerId,
      sync.createdByUserId,
      sync.updatedByUserId,
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

  update(id: string, patch: Partial<Omit<Bill, 'id'>>): Bill | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (!canEditRecord(current.createdByUserId, current.ledgerId)) return undefined;
    const next = { ...current, ...patch };
    const sync = prepareUpdateFields(next);
    getDb().runSync(
      `UPDATE bills
       SET amount = ?, merchant = ?, name = ?, icon = ?, category = ?, due_date = ?,
           recurring = ?, days_until = ?, estimate = ?, updated_by_user_id = ?,
           updated_at = ?, cloud_record_name = ?, cloud_zone_name = ?,
           record_change_tag = ?, sync_status = ?, meta = ?
       WHERE id = ? AND ${ledgerWhere()}`,
      next.amount,
      next.merchant,
      next.name,
      next.icon,
      next.cat,
      next.dueDate,
      next.recurring ? 1 : 0,
      next.daysUntil,
      next.estimate ? 1 : 0,
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
      `UPDATE bills SET deleted_at = ?, updated_by_user_id = ?, updated_at = ?, sync_status = 'pending'
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
