import { getDb, json, nextId } from './db';
import { SQLiteRepository } from './base';
import { normalizeTransactionInput, transactionFromStored } from '../transactionDates';
import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from '../types';

interface TxRow {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  occurred_at: string;
  note: string | null;
  recurring: number;
  meta: string | null;
}

export class SQLiteTransactionsRepo extends SQLiteRepository<Transaction, CreateTransactionInput, UpdateTransactionInput> {
  protected readAll(): Transaction[] {
    return getDb()
      .getAllSync<TxRow>('SELECT * FROM transactions ORDER BY occurred_at DESC, id DESC')
      .map(row => transactionFromStored({
        id: row.id,
        amount: row.amount,
        merchant: row.merchant,
        cat: row.category,
        occurredAt: row.occurred_at,
        note: row.note,
        recurring: row.recurring,
        meta: row.meta,
      }));
  }

  create(input: CreateTransactionInput): Transaction {
    const normalized = normalizeTransactionInput(input);
    const id = nextId('tx');
    getDb().runSync(
      'INSERT INTO transactions (id, amount, merchant, category, occurred_at, note, recurring, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      normalized.amount ?? 0,
      normalized.merchant || 'Unknown',
      normalized.cat || 'shopping',
      normalized.occurredAt,
      normalized.note,
      normalized.recurring ? 1 : 0,
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
      'UPDATE transactions SET amount = ?, merchant = ?, category = ?, occurred_at = ?, note = ?, recurring = ?, meta = ? WHERE id = ?',
      normalized.amount ?? current.amount,
      normalized.merchant || current.merchant,
      normalized.cat || current.cat,
      normalized.occurredAt,
      normalized.note,
      normalized.recurring ? 1 : 0,
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
