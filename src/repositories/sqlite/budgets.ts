import { getDb, json, nextId } from './db';
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
  meta: string | null;
}

export class SQLiteBudgetsRepo extends SQLiteRepository<Budget> {
  protected readAll(): Budget[] {
    return getDb().getAllSync<BudgetRow>('SELECT * FROM budgets ORDER BY month DESC, group_key, label, id').map(row => ({
      id: row.id,
      month: row.month,
      group: row.group_key ?? undefined,
      category: row.category ?? undefined,
      label: row.label ?? undefined,
      icon: row.icon ?? undefined,
      amount: row.amount,
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: Omit<Budget, 'id'>): Budget {
    const id = nextId('budget');
    getDb().runSync(
      'INSERT INTO budgets (id, month, group_key, category, label, icon, amount, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      input.month,
      input.group ?? null,
      input.category ?? null,
      input.label ?? null,
      input.icon ?? null,
      input.amount,
      json(input.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: Partial<Omit<Budget, 'id'>>): Budget | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb().runSync(
      'UPDATE budgets SET month = ?, group_key = ?, category = ?, label = ?, icon = ?, amount = ?, meta = ? WHERE id = ?',
      next.month,
      next.group ?? null,
      next.category ?? null,
      next.label ?? null,
      next.icon ?? null,
      next.amount,
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM budgets WHERE id = ?', id);
    this.emit();
  }
}
