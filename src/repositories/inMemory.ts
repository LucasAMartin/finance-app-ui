import {
  SEED_BILLS,
  SEED_BUDGETS,
  SEED_CATEGORIES,
  SEED_INCOME,
  SEED_RECURRING_RULES,
  SEED_SETTINGS,
  SEED_TRANSACTIONS,
} from '../data';
import type {
  AppSettings,
  Attachment,
  Bill,
  Budget,
  Category,
  CreateTransactionInput,
  Income,
  MerchantLogo,
  RecurringRule,
  Repositories,
  RepoListener,
  Repository,
  Transaction,
  TransactionCursor,
  TransactionPage,
  TransactionQuery,
  TransactionSortOrder,
  TransactionSummary,
  TransactionSummaryQuery,
  TransactionsRepo,
  UpdateTransactionInput,
  UpsertMerchantLogoInput,
} from './types';

class InMemoryRepository<T extends { id: string }, CreateInput = Omit<T, 'id'>, UpdateInput = Partial<Omit<T, 'id'>>>
  implements Repository<T, CreateInput, UpdateInput> {
  protected rows: T[];
  private listeners = new Set<RepoListener>();

  constructor(seed: T[]) {
    this.rows = seed.map(row => ({ ...row }));
  }

  list(): T[] {
    return this.rows;
  }

  get(id: string): T | undefined {
    const row = this.rows.find(item => item.id === id);
    return row ? { ...row } : undefined;
  }

  create(input: CreateInput): T {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const row = { id, ...(input as object) } as T;
    this.rows = [row, ...this.rows];
    this.emit();
    return { ...row };
  }

  update(id: string, patch: UpdateInput): T | undefined {
    let next: T | undefined;
    this.rows = this.rows.map(row => {
      if (row.id !== id) return row;
      next = { ...row, ...(patch as object) };
      return next;
    });
    if (next) this.emit();
    return next ? { ...next } : undefined;
  }

  delete(id: string): void {
    const before = this.rows.length;
    this.rows = this.rows.filter(row => row.id !== id);
    if (this.rows.length !== before) this.emit();
  }

  subscribe(listener: RepoListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach(listener => listener());
  }
}

const DEFAULT_TX_SORT: TransactionSortOrder = 'date-desc';

function cursorFromTx(tx: Transaction): TransactionCursor {
  return {
    occurredAt: tx.occurredAt ?? new Date().toISOString(),
    id: tx.id,
    amount: tx.amount,
    cat: tx.cat,
    merchant: tx.merchant,
  };
}

function txTime(tx: Transaction) {
  return new Date(tx.occurredAt ?? 0).getTime();
}

function compareTx(a: Transaction, b: Transaction, sort: TransactionSortOrder): number {
  if (sort === 'date-asc') return txTime(a) - txTime(b) || a.id.localeCompare(b.id);
  if (sort === 'amount-desc') return b.amount - a.amount || txTime(b) - txTime(a) || b.id.localeCompare(a.id);
  if (sort === 'amount-asc') return a.amount - b.amount || txTime(b) - txTime(a) || b.id.localeCompare(a.id);
  if (sort === 'cat') return a.cat.localeCompare(b.cat) || a.merchant.localeCompare(b.merchant) || txTime(b) - txTime(a) || b.id.localeCompare(a.id);
  return txTime(b) - txTime(a) || b.id.localeCompare(a.id);
}

function matchesTxQuery(tx: Transaction, query: TransactionSummaryQuery): boolean {
  if (query.categoryIds && query.categoryIds.length > 0 && !query.categoryIds.includes(tx.cat)) return false;
  if (query.from && (tx.occurredAt ?? '') < query.from) return false;
  if (query.to && (tx.occurredAt ?? '') > query.to) return false;
  const q = query.merchantQuery?.trim().toLowerCase();
  if (q) {
    const matchesMerchant = tx.merchant.toLowerCase().includes(q);
    const matchesCategory = query.searchCategoryIds?.includes(tx.cat) ?? false;
    if (!matchesMerchant && !matchesCategory) return false;
  }
  return true;
}

class InMemoryTransactionsRepo
  extends InMemoryRepository<Transaction, CreateTransactionInput, UpdateTransactionInput>
  implements TransactionsRepo {
  listPage(query: TransactionQuery): TransactionPage {
    const sort = query.sort ?? DEFAULT_TX_SORT;
    const filtered = this.rows
      .filter(tx => matchesTxQuery(tx, query))
      .sort((a, b) => compareTx(a, b, sort));
    const startIdx = query.cursor
      ? filtered.findIndex(tx => tx.id === query.cursor?.id) + 1
      : 0;
    const safeStart = startIdx > 0 ? startIdx : 0;
    const limit = Math.max(1, Math.min(query.limit, 200));
    const rows = filtered.slice(safeStart, safeStart + limit);
    const hasMore = safeStart + limit < filtered.length;
    return {
      rows,
      nextCursor: hasMore && rows.length > 0 ? cursorFromTx(rows[rows.length - 1]) : undefined,
    };
  }

  getSummary(query: TransactionSummaryQuery): TransactionSummary {
    const filtered = this.rows.filter(tx => matchesTxQuery(tx, query));
    const expenses = filtered.filter(tx => tx.type !== 'income');
    const days = new Set(expenses.map(tx => (tx.occurredAt ?? '').slice(0, 10)).filter(Boolean));
    return {
      transactionCount: filtered.length,
      expenseCount: expenses.length,
      expenseTotal: expenses.reduce((sum, tx) => sum + tx.amount, 0),
      expenseDayCount: days.size,
    };
  }

  getCalendarMarks(query: {
    year: number;
    month: number;
    categoryIds?: string[];
    merchantQuery?: string;
    searchCategoryIds?: string[];
  }) {
    return this.rows
      .filter(tx => matchesTxQuery(tx, query))
      .map(tx => ({ tx, d: tx.occurredAt ? new Date(tx.occurredAt) : null }))
      .filter(({ d }) => d && d.getFullYear() === query.year && d.getMonth() === query.month)
      .map(({ tx, d }) => ({ day: d!.getDate(), cat: tx.cat }));
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    transactionsRepo: new InMemoryTransactionsRepo(SEED_TRANSACTIONS),
    incomeRepo: new InMemoryRepository<Income>(SEED_INCOME),
    billsRepo: new InMemoryRepository<Bill>(SEED_BILLS),
    budgetsRepo: new InMemoryRepository<Budget>(SEED_BUDGETS),
    settingsRepo: new InMemoryRepository<AppSettings, AppSettings>([SEED_SETTINGS]),
    categoriesRepo: new InMemoryRepository<Category>(SEED_CATEGORIES),
    recurringRulesRepo: new InMemoryRepository<RecurringRule>(SEED_RECURRING_RULES),
    attachmentsRepo: new InMemoryRepository<Attachment>([]),
    merchantLogosRepo: new InMemoryRepository<MerchantLogo, UpsertMerchantLogoInput, Partial<UpsertMerchantLogoInput>>([]),
  };
}
