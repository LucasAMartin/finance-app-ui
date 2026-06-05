import { getDb, json, nextId } from './db';
import { SQLiteRepository } from './base';
import { normalizeTransactionInput, transactionFromStored } from '../transactionDates';
import type {
  CalendarMarkRow,
  CreateTransactionInput,
  SpendSeriesPoint,
  SpendSeriesQuery,
  Transaction,
  TransactionCursor,
  TransactionPage,
  TransactionQuery,
  TransactionSortOrder,
  TransactionSummary,
  TransactionSummaryQuery,
  UpdateTransactionInput,
} from '../types';

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

const DEFAULT_SORT: TransactionSortOrder = 'date-desc';

function txFromRow(row: TxRow): Transaction {
  return transactionFromStored({
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
  });
}

function cursorFromTx(tx: Transaction): TransactionCursor {
  return {
    occurredAt: tx.occurredAt ?? new Date().toISOString(),
    id: tx.id,
    amount: tx.amount,
    cat: tx.cat,
    merchant: tx.merchant,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function placeholders(values: any[]): string {
  return values.map(() => '?').join(', ');
}

function appendInClause(parts: string[], params: any[], column: string, values?: string[]) {
  if (!values || values.length === 0) return;
  parts.push(`${column} IN (${placeholders(values)})`);
  params.push(...values);
}

function appendSearchClause(
  parts: string[],
  params: any[],
  merchantQuery?: string,
  searchCategoryIds?: string[],
) {
  const q = merchantQuery?.trim();
  if (!q) return;
  const searchParts = [`merchant LIKE ? ESCAPE '\\'`];
  params.push(`%${escapeLike(q)}%`);
  if (searchCategoryIds && searchCategoryIds.length > 0) {
    searchParts.push(`category IN (${placeholders(searchCategoryIds)})`);
    params.push(...searchCategoryIds);
  }
  parts.push(`(${searchParts.join(' OR ')})`);
}

function appendBaseWhere(parts: string[], params: any[], query: TransactionSummaryQuery) {
  appendInClause(parts, params, 'category', query.categoryIds);
  appendSearchClause(parts, params, query.merchantQuery, query.searchCategoryIds);
  if (query.from) {
    parts.push('occurred_at >= ?');
    params.push(query.from);
  }
  if (query.to) {
    parts.push('occurred_at <= ?');
    params.push(query.to);
  }
  if (query.minAmount !== undefined) {
    parts.push('amount >= ?');
    params.push(query.minAmount);
  }
  if (query.maxAmount !== undefined) {
    parts.push('amount <= ?');
    params.push(query.maxAmount);
  }
}

function appendCursorWhere(parts: string[], params: any[], sort: TransactionSortOrder, cursor?: TransactionCursor) {
  if (!cursor) return;
  if (sort === 'date-asc') {
    parts.push('(occurred_at > ? OR (occurred_at = ? AND id > ?))');
    params.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
    return;
  }
  if (sort === 'amount-desc') {
    parts.push('(amount < ? OR (amount = ? AND occurred_at < ?) OR (amount = ? AND occurred_at = ? AND id < ?))');
    params.push(cursor.amount ?? 0, cursor.amount ?? 0, cursor.occurredAt, cursor.amount ?? 0, cursor.occurredAt, cursor.id);
    return;
  }
  if (sort === 'amount-asc') {
    parts.push('(amount > ? OR (amount = ? AND occurred_at < ?) OR (amount = ? AND occurred_at = ? AND id < ?))');
    params.push(cursor.amount ?? 0, cursor.amount ?? 0, cursor.occurredAt, cursor.amount ?? 0, cursor.occurredAt, cursor.id);
    return;
  }
  if (sort === 'cat') {
    parts.push(`(
      category > ?
      OR (category = ? AND merchant > ?)
      OR (category = ? AND merchant = ? AND occurred_at < ?)
      OR (category = ? AND merchant = ? AND occurred_at = ? AND id < ?)
    )`);
    params.push(
      cursor.cat ?? '',
      cursor.cat ?? '',
      cursor.merchant ?? '',
      cursor.cat ?? '',
      cursor.merchant ?? '',
      cursor.occurredAt,
      cursor.cat ?? '',
      cursor.merchant ?? '',
      cursor.occurredAt,
      cursor.id,
    );
    return;
  }
  parts.push('(occurred_at < ? OR (occurred_at = ? AND id < ?))');
  params.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
}

function orderBy(sort: TransactionSortOrder): string {
  if (sort === 'date-asc') return 'occurred_at ASC, id ASC';
  if (sort === 'amount-desc') return 'amount DESC, occurred_at DESC, id DESC';
  if (sort === 'amount-asc') return 'amount ASC, occurred_at DESC, id DESC';
  if (sort === 'cat') return 'category ASC, merchant ASC, occurred_at DESC, id DESC';
  return 'occurred_at DESC, id DESC';
}

function whereSql(parts: string[]): string {
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

export class SQLiteTransactionsRepo extends SQLiteRepository<Transaction, CreateTransactionInput, UpdateTransactionInput> {
  get(id: string): Transaction | undefined {
    const row = getDb().getFirstSync<TxRow>('SELECT * FROM transactions WHERE id = ?', id);
    return row ? txFromRow(row) : undefined;
  }

  protected readAll(): Transaction[] {
    return getDb()
      .getAllSync<TxRow>('SELECT * FROM transactions ORDER BY occurred_at DESC, id DESC')
      .map(txFromRow);
  }

  listPage(query: TransactionQuery): TransactionPage {
    const sort = query.sort ?? DEFAULT_SORT;
    const limit = Math.max(1, Math.min(query.limit, 200));
    const parts: string[] = [];
    const params: any[] = [];
    appendBaseWhere(parts, params, query);
    appendCursorWhere(parts, params, sort, query.cursor);
    const rows = getDb()
      .getAllSync<TxRow>(
        `SELECT * FROM transactions ${whereSql(parts)} ORDER BY ${orderBy(sort)} LIMIT ?`,
        ...params,
        limit + 1,
      )
      .map(txFromRow);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      rows: pageRows,
      nextCursor: hasMore && pageRows.length > 0 ? cursorFromTx(pageRows[pageRows.length - 1]) : undefined,
    };
  }

  getSummary(query: TransactionSummaryQuery): TransactionSummary {
    const parts: string[] = [];
    const params: any[] = [];
    appendBaseWhere(parts, params, query);
    const row = getDb().getFirstSync<{
      transaction_count: number;
      expense_count: number;
      expense_total: number | null;
      expense_day_count: number;
    }>(
      `SELECT
        COUNT(*) AS transaction_count,
        SUM(CASE WHEN type != 'income' THEN 1 ELSE 0 END) AS expense_count,
        COALESCE(SUM(CASE WHEN type != 'income' THEN amount ELSE 0 END), 0) AS expense_total,
        COUNT(DISTINCT CASE WHEN type != 'income' THEN date(occurred_at) END) AS expense_day_count
       FROM transactions
       ${whereSql(parts)}`,
      ...params,
    );
    return {
      transactionCount: row?.transaction_count ?? 0,
      expenseCount: row?.expense_count ?? 0,
      expenseTotal: row?.expense_total ?? 0,
      expenseDayCount: row?.expense_day_count ?? 0,
    };
  }

  getSpendSeries(query: SpendSeriesQuery): SpendSeriesPoint[] {
    const parts: string[] = [];
    const params: any[] = [];
    appendBaseWhere(parts, params, {
      categoryIds: query.categoryIds,
      merchantQuery: query.merchantQuery,
      searchCategoryIds: query.searchCategoryIds,
      from: query.from,
      to: query.to,
      minAmount: query.minAmount,
      maxAmount: query.maxAmount,
    });
    // Income is excluded so the series matches the expense-only hero total.
    parts.push(`type != 'income'`);
    // 'localtime' buckets by the device's calendar day/month, matching the
    // JS chart math (new Date(occurredAt).getDate()/getMonth()).
    const fmt = query.bucket === 'month' ? '%Y-%m' : '%Y-%m-%d';
    return getDb()
      .getAllSync<{ key: string; amount: number | null }>(
        `SELECT strftime('${fmt}', occurred_at, 'localtime') AS key,
                COALESCE(SUM(amount), 0) AS amount
         FROM transactions
         ${whereSql(parts)}
         GROUP BY key
         ORDER BY key ASC`,
        ...params,
      )
      .map(row => ({ key: row.key, amount: row.amount ?? 0 }));
  }

  getCalendarMarks(query: {
    year: number;
    month: number;
    categoryIds?: string[];
    merchantQuery?: string;
    searchCategoryIds?: string[];
    minAmount?: number;
    maxAmount?: number;
  }): CalendarMarkRow[] {
    const from = new Date(query.year, query.month, 1).toISOString();
    const to = new Date(query.year, query.month + 1, 0, 23, 59, 59, 999).toISOString();
    const parts: string[] = [];
    const params: any[] = [];
    appendBaseWhere(parts, params, {
      categoryIds: query.categoryIds,
      merchantQuery: query.merchantQuery,
      searchCategoryIds: query.searchCategoryIds,
      from,
      to,
      minAmount: query.minAmount,
      maxAmount: query.maxAmount,
    });
    return getDb()
      .getAllSync<{ occurred_at: string; cat: string }>(
        `SELECT occurred_at, category AS cat
         FROM transactions
         ${whereSql(parts)}
         ORDER BY occurred_at DESC`,
        ...params,
      )
      .map(row => ({ day: new Date(row.occurred_at).getDate(), cat: row.cat }));
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
    const db = getDb();
    let changed = false;
    db.withTransactionSync(() => {
      const attachmentResult = db.runSync('DELETE FROM attachments WHERE transaction_id = ?', id);
      const result = db.runSync('DELETE FROM transactions WHERE id = ?', id);
      changed = attachmentResult.changes > 0 || result.changes > 0;
    });
    if (changed) this.emit();
  }
}
