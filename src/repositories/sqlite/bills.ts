import { getDb, json, nextId } from './db';
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
  meta: string | null;
}

export class SQLiteBillsRepo extends SQLiteRepository<Bill> {
  protected readAll(): Bill[] {
    return getDb().getAllSync<BillRow>('SELECT * FROM bills ORDER BY days_until ASC, id').map(row => ({
      id: row.id,
      amount: row.amount,
      merchant: row.merchant,
      name: row.name,
      icon: row.icon,
      cat: row.category,
      dueDate: row.due_date,
      recurring: Boolean(row.recurring),
      daysUntil: row.days_until,
      estimate: Boolean(row.estimate),
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: Omit<Bill, 'id'>): Bill {
    const id = nextId('bill');
    getDb().runSync(
      'INSERT INTO bills (id, amount, merchant, name, icon, category, due_date, recurring, days_until, estimate, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      json(input.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: Partial<Omit<Bill, 'id'>>): Bill | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb().runSync(
      'UPDATE bills SET amount = ?, merchant = ?, name = ?, icon = ?, category = ?, due_date = ?, recurring = ?, days_until = ?, estimate = ?, meta = ? WHERE id = ?',
      next.amount,
      next.merchant,
      next.name,
      next.icon,
      next.cat,
      next.dueDate,
      next.recurring ? 1 : 0,
      next.daysUntil,
      next.estimate ? 1 : 0,
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM bills WHERE id = ?', id);
    this.emit();
  }
}
