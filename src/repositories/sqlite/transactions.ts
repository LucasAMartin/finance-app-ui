import { getDb, json, nextId } from './db';
import { SQLiteRepository } from './base';
import { normalizeTransactionInput, transactionFromStored } from '../transactionDates';
import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from '../types';

interface TxRow {
  id: string;
  type: Transaction['type'];
  amount: number;
  merchant: string;
  category: string;
  occurred_at: string;
  note: string | null;
  recurring: number;
  recurring_rule_id: string | null;
  visibility: Transaction['visibility'];
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  meta: string | null;
}

export class SQLiteTransactionsRepo extends SQLiteRepository<Transaction, CreateTransactionInput, UpdateTransactionInput> {
  protected readAll(): Transaction[] {
    return getDb()
      .getAllSync<TxRow>('SELECT * FROM transactions ORDER BY occurred_at DESC, id DESC')
      .map(row => transactionFromStored({
        id: row.id,
        type: row.type,
        amount: row.amount,
        merchant: row.merchant,
        cat: row.category,
        occurredAt: row.occurred_at,
        note: row.note,
        recurring: row.recurring,
        recurringRuleId: row.recurring_rule_id ?? undefined,
        visibility: row.visibility,
        createdByUserId: row.created_by_user_id ?? undefined,
        updatedByUserId: row.updated_by_user_id ?? undefined,
        meta: row.meta,
      }));
  }

  create(input: CreateTransactionInput): Transaction {
    const normalized = normalizeTransactionInput(input);
    const id = nextId('tx');
    getDb().runSync(
      'INSERT INTO transactions (id, type, amount, merchant, category, occurred_at, note, recurring, recurring_rule_id, visibility, created_by_user_id, updated_by_user_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      normalized.type ?? 'expense',
      normalized.amount ?? 0,
      normalized.merchant || 'Unknown',
      normalized.cat || 'shopping',
      normalized.occurredAt,
      normalized.note,
      normalized.recurring ? 1 : 0,
      normalized.recurringRuleId ?? null,
      normalized.visibility ?? 'shared',
      normalized.createdByUserId ?? 'local',
      normalized.updatedByUserId ?? 'local',
      json(normalized.meta),
    );
    this.emit();
    return this.get(id)!;
  }

  update(id: string, patch: UpdateTransactionInput): Transaction | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const normalized = normalizeTransactionInput({ ...current, ...patch });
    getDb().runSync(
      'UPDATE transactions SET type = ?, amount = ?, merchant = ?, category = ?, occurred_at = ?, note = ?, recurring = ?, recurring_rule_id = ?, visibility = ?, created_by_user_id = ?, updated_by_user_id = ?, meta = ? WHERE id = ?',
      normalized.type ?? current.type ?? 'expense',
      normalized.amount ?? current.amount,
      normalized.merchant || current.merchant,
      normalized.cat || current.cat,
      normalized.occurredAt,
      normalized.note,
      normalized.recurring ? 1 : 0,
      normalized.recurringRuleId ?? current.recurringRuleId ?? null,
      normalized.visibility ?? current.visibility ?? 'shared',
      normalized.createdByUserId ?? current.createdByUserId ?? 'local',
      normalized.updatedByUserId ?? 'local',
      json(normalized.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM transactions WHERE id = ?', id);
    this.emit();
  }
}
