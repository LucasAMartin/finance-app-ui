import { getDb, json, nextId } from './db';
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
  meta: string | null;
}

export class SQLiteIncomeRepo extends SQLiteRepository<Income> {
  protected readAll(): Income[] {
    return getDb().getAllSync<IncomeRow>('SELECT * FROM incomes ORDER BY start_date DESC, id DESC').map(row => ({
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
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: Omit<Income, 'id'>): Income {
    const id = nextId('income');
    getDb().runSync(
      'INSERT INTO incomes (id, kind, amount, source, cadence, start_date, end_date, received_at, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      input.kind ?? 'regular',
      input.amount,
      input.source,
      input.cadence,
      input.startDate,
      input.endDate ?? null,
      input.receivedAt ?? null,
      input.createdByUserId ?? 'local',
      input.updatedByUserId ?? 'local',
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
      'UPDATE incomes SET kind = ?, amount = ?, source = ?, cadence = ?, start_date = ?, end_date = ?, received_at = ?, created_by_user_id = ?, updated_by_user_id = ?, meta = ? WHERE id = ?',
      next.kind ?? 'regular',
      next.amount,
      next.source,
      next.cadence,
      next.startDate,
      next.endDate ?? null,
      next.receivedAt ?? null,
      next.createdByUserId ?? 'local',
      next.updatedByUserId ?? 'local',
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
