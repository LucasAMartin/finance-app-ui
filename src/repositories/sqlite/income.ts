import { getDb, json, nextId } from './db';
import { SQLiteRepository } from './base';
import type { Income } from '../types';

interface IncomeRow {
  id: string;
  amount: number;
  source: string;
  cadence: Income['cadence'];
  start_date: string;
  end_date: string | null;
  meta: string | null;
}

export class SQLiteIncomeRepo extends SQLiteRepository<Income> {
  protected readAll(): Income[] {
    return getDb().getAllSync<IncomeRow>('SELECT * FROM incomes ORDER BY start_date DESC, id DESC').map(row => ({
      id: row.id,
      amount: row.amount,
      source: row.source,
      cadence: row.cadence,
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: Omit<Income, 'id'>): Income {
    const id = nextId('income');
    getDb().runSync(
      'INSERT INTO incomes (id, amount, source, cadence, start_date, end_date, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      input.amount,
      input.source,
      input.cadence,
      input.startDate,
      input.endDate ?? null,
      json(input.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: Partial<Omit<Income, 'id'>>): Income | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb().runSync(
      'UPDATE incomes SET amount = ?, source = ?, cadence = ?, start_date = ?, end_date = ?, meta = ? WHERE id = ?',
      next.amount,
      next.source,
      next.cadence,
      next.startDate,
      next.endDate ?? null,
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM incomes WHERE id = ?', id);
    this.emit();
  }
}
