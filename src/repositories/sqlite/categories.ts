import { getDb, json, nextId } from './db';
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
  meta: string | null;
}

export class SQLiteCategoriesRepo extends SQLiteRepository<Category> {
  protected readAll(): Category[] {
    return getDb().getAllSync<CategoryRow>(
      'SELECT * FROM categories WHERE archived = 0 ORDER BY group_key, sort_order, label',
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
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: Omit<Category, 'id'>): Category {
    const id = nextId('cat');
    getDb().runSync(
      'INSERT INTO categories (id, label, icon, group_key, default_budget, sort_order, archived, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      input.label,
      input.icon,
      input.group,
      input.defaultBudget,
      input.sortOrder,
      input.archived ? 1 : 0,
      input.createdByUserId ?? 'local',
      input.updatedByUserId ?? 'local',
      json(input.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: Partial<Omit<Category, 'id'>>): Category | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb().runSync(
      'UPDATE categories SET label = ?, icon = ?, group_key = ?, default_budget = ?, sort_order = ?, archived = ?, created_by_user_id = ?, updated_by_user_id = ?, meta = ? WHERE id = ?',
      next.label,
      next.icon,
      next.group,
      next.defaultBudget,
      next.sortOrder,
      next.archived ? 1 : 0,
      next.createdByUserId ?? 'local',
      next.updatedByUserId ?? 'local',
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM categories WHERE id = ?', id);
    this.emit();
  }
}
