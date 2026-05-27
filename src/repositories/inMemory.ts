import {
  SEED_BILLS,
  SEED_BUDGETS,
  SEED_INCOME,
  SEED_SETTINGS,
  SEED_TRANSACTIONS,
} from '../data';
import type {
  AppSettings,
  Bill,
  Budget,
  Income,
  Repositories,
  RepoListener,
  Repository,
  Transaction,
} from './types';

class InMemoryRepository<T extends { id: string }, CreateInput = Omit<T, 'id'>, UpdateInput = Partial<Omit<T, 'id'>>>
  implements Repository<T, CreateInput, UpdateInput> {
  private rows: T[];
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

export function createInMemoryRepositories(): Repositories {
  return {
    transactionsRepo: new InMemoryRepository<Transaction>(SEED_TRANSACTIONS),
    incomeRepo: new InMemoryRepository<Income>(SEED_INCOME),
    billsRepo: new InMemoryRepository<Bill>(SEED_BILLS),
    budgetsRepo: new InMemoryRepository<Budget>(SEED_BUDGETS),
    settingsRepo: new InMemoryRepository<AppSettings, AppSettings>([SEED_SETTINGS]),
  };
}
