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
import type { Budget } from '../types';

interface BudgetRow {
  id: string;
  month: string;
  group_key: Budget['group'] | null;
  category: string | null;
  label: string | null;
  icon: string | null;
  amount: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ledger_id: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  cloud_record_name: string | null;
  cloud_zone_name: string | null;
  record_change_tag: string | null;
  sync_status: Budget['syncStatus'] | null;
  meta: string | null;
}

export class SQLiteBudgetsRepo extends SQLiteRepository<Budget> {
  protected readAll(): Budget[] {
    return getDb().getAllSync<BudgetRow>(
      `SELECT * FROM budgets WHERE ${ledgerWhere()} ORDER BY month DESC, group_key, label, id`,
      ledgerParam(),
    ).map(row => ({
      id: row.id,
      month: row.month,
      group: row.group_key ?? undefined,
      category: row.category ?? undefined,
      label: row.label ?? undefined,
      icon: row.icon ?? undefined,
      amount: row.amount,
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

  create(input: Omit<Budget, 'id'>): Budget {
    const id = nextId('budget');
    const sync = prepareCreateFields(input);
    getDb().runSync(
      `INSERT INTO budgets (
        id, month, group_key, category, label, icon, amount,
        ledger_id, created_by_user_id, updated_by_user_id, created_at, updated_at,
        cloud_record_name, cloud_zone_name, record_change_tag, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.month,
      input.group ?? null,
      input.category ?? null,
      input.label ?? null,
      input.icon ?? null,
      input.amount,
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

  update(id: string, patch: Partial<Omit<Budget, 'id'>>): Budget | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (!canEditRecord(current.createdByUserId, current.ledgerId)) return undefined;
    const next = { ...current, ...patch };
    const sync = prepareUpdateFields(next);
    getDb().runSync(
      `UPDATE budgets
       SET month = ?, group_key = ?, category = ?, label = ?, icon = ?, amount = ?,
           updated_by_user_id = ?, updated_at = ?, cloud_record_name = ?,
           cloud_zone_name = ?, record_change_tag = ?, sync_status = ?, meta = ?
       WHERE id = ? AND ${ledgerWhere()}`,
      next.month,
      next.group ?? null,
      next.category ?? null,
      next.label ?? null,
      next.icon ?? null,
      next.amount,
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
      `UPDATE budgets SET deleted_at = ?, updated_by_user_id = ?, updated_at = ?, sync_status = 'pending'
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
