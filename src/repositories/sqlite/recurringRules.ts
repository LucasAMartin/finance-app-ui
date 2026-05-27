import { getDb, json, nextId } from './db';
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
  meta: string | null;
}

export class SQLiteRecurringRulesRepo extends SQLiteRepository<RecurringRule> {
  protected readAll(): RecurringRule[] {
    return getDb().getAllSync<RecurringRow>(
      'SELECT * FROM recurring_rules ORDER BY active DESC, next_due_date ASC, merchant',
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
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: Omit<RecurringRule, 'id'>): RecurringRule {
    const id = nextId('rec');
    getDb().runSync(
      'INSERT INTO recurring_rules (id, merchant, category, amount, cadence, start_date, next_due_date, day_of_month, month_of_year, estimate, active, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      input.createdByUserId ?? 'local',
      input.updatedByUserId ?? 'local',
      json(input.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: Partial<Omit<RecurringRule, 'id'>>): RecurringRule | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb().runSync(
      'UPDATE recurring_rules SET merchant = ?, category = ?, amount = ?, cadence = ?, start_date = ?, next_due_date = ?, day_of_month = ?, month_of_year = ?, estimate = ?, active = ?, created_by_user_id = ?, updated_by_user_id = ?, meta = ? WHERE id = ?',
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
      next.updatedByUserId ?? 'local',
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM recurring_rules WHERE id = ?', id);
    this.emit();
  }
}
