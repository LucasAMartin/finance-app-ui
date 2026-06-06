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
import type { RecurringRule } from '../types';

interface RecurringRow {
  id: string;
  merchant: string;
  category: string;
  amount: number;
  cadence: RecurringRule['cadence'];
  start_date: string;
  next_due_date: string;
  day_of_month: number | null;
  month_of_year: number | null;
  estimate: number;
  active: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ledger_id: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  cloud_record_name: string | null;
  cloud_zone_name: string | null;
  record_change_tag: string | null;
  sync_status: RecurringRule['syncStatus'] | null;
  meta: string | null;
}

export class SQLiteRecurringRulesRepo extends SQLiteRepository<RecurringRule> {
  protected readAll(): RecurringRule[] {
    return getDb().getAllSync<RecurringRow>(
      `SELECT * FROM recurring_rules WHERE ${ledgerWhere()} ORDER BY active DESC, next_due_date ASC, merchant`,
      ledgerParam(),
    ).map(row => ({
      id: row.id,
      merchant: row.merchant,
      cat: row.category,
      amount: row.amount,
      cadence: row.cadence,
      startDate: row.start_date,
      nextDueDate: row.next_due_date,
      dayOfMonth: row.day_of_month ?? undefined,
      monthOfYear: row.month_of_year ?? undefined,
      estimate: Boolean(row.estimate),
      active: Boolean(row.active),
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

  create(input: Omit<RecurringRule, 'id'>): RecurringRule {
    const id = nextId('rec');
    const sync = prepareCreateFields(input);
    getDb().runSync(
      `INSERT INTO recurring_rules (
        id, merchant, category, amount, cadence, start_date, next_due_date,
        day_of_month, month_of_year, estimate, active, created_by_user_id,
        updated_by_user_id, ledger_id, created_at, updated_at, cloud_record_name,
        cloud_zone_name, record_change_tag, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.merchant,
      input.cat,
      input.amount,
      input.cadence,
      input.startDate,
      input.nextDueDate,
      input.dayOfMonth ?? null,
      input.monthOfYear ?? null,
      input.estimate ? 1 : 0,
      input.active ? 1 : 0,
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

  update(id: string, patch: Partial<Omit<RecurringRule, 'id'>>): RecurringRule | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (!canEditRecord(current.createdByUserId, current.ledgerId)) return undefined;
    const next = { ...current, ...patch };
    const sync = prepareUpdateFields(next);
    getDb().runSync(
      `UPDATE recurring_rules
       SET merchant = ?, category = ?, amount = ?, cadence = ?, start_date = ?,
           next_due_date = ?, day_of_month = ?, month_of_year = ?, estimate = ?,
           active = ?, created_by_user_id = ?, updated_by_user_id = ?,
           updated_at = ?, cloud_record_name = ?, cloud_zone_name = ?,
           record_change_tag = ?, sync_status = ?, meta = ?
       WHERE id = ? AND ${ledgerWhere()}`,
      next.merchant,
      next.cat,
      next.amount,
      next.cadence,
      next.startDate,
      next.nextDueDate,
      next.dayOfMonth ?? null,
      next.monthOfYear ?? null,
      next.estimate ? 1 : 0,
      next.active ? 1 : 0,
      next.createdByUserId ?? 'local',
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
      `UPDATE recurring_rules SET deleted_at = ?, updated_by_user_id = ?, updated_at = ?, sync_status = 'pending'
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
