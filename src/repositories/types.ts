import { AccentKey, CardStyle } from '../theme';

export interface Transaction {
  id: string;
  merchant: string;
  cat: string;
  amount: number;
  note: string;
  date: string;
  time: string;
  when: 'today' | 'yesterday' | 'earlier';
  fullDate: string;
  occurredAt?: string;
  recurring?: boolean;
  meta?: Record<string, unknown>;
}

export interface Income {
  id: string;
  amount: number;
  source: string;
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'annual';
  startDate: string;
  endDate?: string;
  meta?: Record<string, unknown>;
}

export interface Bill {
  id: string;
  name: string;
  merchant: string;
  icon: string;
  cat: string;
  amount: number;
  dueDate: string;
  recurring: boolean;
  daysUntil: number;
  estimate?: boolean;
  meta?: Record<string, unknown>;
}

export interface Budget {
  id: string;
  month: string;
  group?: 'needs' | 'wants' | 'savings';
  category?: string;
  label?: string;
  icon?: string;
  amount: number;
  spent?: number;
  meta?: Record<string, unknown>;
}

export interface AppSettings {
  id: 'settings';
  themeDark: boolean;
  accentKey: AccentKey;
  cardStyle: CardStyle;
  wallpaperId?: string;
  meta?: Record<string, unknown>;
}

export type RepoListener = () => void;
export type Unsubscribe = () => void;

export interface Repository<T extends { id: string }, CreateInput = Omit<T, 'id'>, UpdateInput = Partial<Omit<T, 'id'>>> {
  list(): T[];
  get(id: string): T | undefined;
  create(input: CreateInput): T;
  update(id: string, patch: UpdateInput): T | undefined;
  delete(id: string): void;
  subscribe(listener: RepoListener): Unsubscribe;
}

export type TransactionsRepo = Repository<Transaction>;
export type IncomeRepo = Repository<Income>;
export type BillsRepo = Repository<Bill>;
export type BudgetsRepo = Repository<Budget>;
export type SettingsRepo = Repository<AppSettings, AppSettings, Partial<Omit<AppSettings, 'id'>>>;

export interface Repositories {
  transactionsRepo: TransactionsRepo;
  incomeRepo: IncomeRepo;
  billsRepo: BillsRepo;
  budgetsRepo: BudgetsRepo;
  settingsRepo: SettingsRepo;
}

export interface SpendSub {
  label: string;
  icon: string;
  spent: number;
  budget: number;
}

export interface SpendGroup {
  key: 'needs' | 'wants' | 'savings';
  label: string;
  targetPct: number;
  subs: SpendSub[];
}

export interface MonthBudget {
  key: string;
  month: string;
  spent: number;
  budget: number;
  expectedPct: number;
  remainingLabel: string;
}
