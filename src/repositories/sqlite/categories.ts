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
import type { Category } from '../types';

interface CategoryRow {
  id: string;
  label: string;
  icon: string;
  group_key: Category['group'];
  default_budget: number;
  sort_order: number;
  archived: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ledger_id: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  cloud_record_name: string | null;
  cloud_zone_name: string | null;
  record_change_tag: string | null;
  sync_status: Category['syncStatus'] | null;
  meta: string | null;
}

export class SQLiteCategoriesRepo extends SQLiteRepository<Category> {
  protected readAll(): Category[] {
    return getDb().getAllSync<CategoryRow>(
      `SELECT * FROM categories WHERE archived = 0 AND ${ledgerWhere()} ORDER BY group_key, sort_order, label`,
      ledgerParam(),
    ).map(row => ({
      id: row.id,
      label: row.label,
      icon: row.icon,
      group: row.group_key,
      defaultBudget: row.default_budget,
      sortOrder: row.sort_order,
      archived: Boolean(row.archived),
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

  create(input: Omit<Category, 'id'>): Category {
    const id = nextId('cat');
    const sync = prepareCreateFields(input);
    getDb().runSync(
      `INSERT INTO categories (
        id, label, icon, group_key, default_budget, sort_order, archived,
        created_by_user_id, updated_by_user_id, ledger_id, created_at, updated_at,
        cloud_record_name, cloud_zone_name, record_change_tag, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.label,
      input.icon,
      input.group,
      input.defaultBudget,
      input.sortOrder,
      input.archived ? 1 : 0,
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

  update(id: string, patch: Partial<Omit<Category, 'id'>>): Category | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (!canEditRecord(current.createdByUserId, current.ledgerId)) return undefined;
    const next = { ...current, ...patch };
    const sync = prepareUpdateFields(next);
    getDb().runSync(
      `UPDATE categories
       SET label = ?, icon = ?, group_key = ?, default_budget = ?, sort_order = ?,
           archived = ?, created_by_user_id = ?, updated_by_user_id = ?,
           updated_at = ?, cloud_record_name = ?, cloud_zone_name = ?,
           record_change_tag = ?, sync_status = ?, meta = ?
       WHERE id = ? AND ${ledgerWhere()}`,
      next.label,
      next.icon,
      next.group,
      next.defaultBudget,
      next.sortOrder,
      next.archived ? 1 : 0,
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
      `UPDATE categories SET deleted_at = ?, updated_by_user_id = ?, updated_at = ?, sync_status = 'pending'
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
