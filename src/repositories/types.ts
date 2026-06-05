import { AccentKey, CardStyle } from '../theme';

export type GroupKey = 'needs' | 'wants' | 'savings';
export type TransactionType = 'expense' | 'income';
export type Visibility = 'shared' | 'private';

export interface Category {
  id: string;
  label: string;
  icon: string;
  group: GroupKey;
  defaultBudget: number;
  sortOrder: number;
  archived?: boolean;
  createdByUserId?: string;
  updatedByUserId?: string;
  meta?: Record<string, unknown>;
}

export interface Transaction {
  id: string;
  merchant: string;
  cat: string;
  amount: number;
  type?: TransactionType;
  note: string;
  date: string;
  time: string;
  when: 'today' | 'yesterday' | 'earlier';
  fullDate: string;
  occurredAt?: string;
  recurring?: boolean;
  recurringRuleId?: string;
  visibility?: Visibility;
  createdByUserId?: string;
  updatedByUserId?: string;
  meta?: Record<string, unknown>;
}

export interface CreateTransactionInput {
  merchant: string;
  cat: string;
  amount: number;
  type?: TransactionType;
  note?: string;
  occurredAt?: string;
  recurring?: boolean;
  recurringRuleId?: string;
  visibility?: Visibility;
  createdByUserId?: string;
  updatedByUserId?: string;
  meta?: Record<string, unknown>;
}

export type UpdateTransactionInput = Partial<CreateTransactionInput>;

export interface Income {
  id: string;
  kind?: 'regular' | 'irregular';
  amount: number;
  source: string;
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'annual' | 'oneTime';
  startDate: string;
  endDate?: string;
  receivedAt?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
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
  group?: GroupKey;
  category?: string;
  label?: string;
  icon?: string;
  amount: number;
  spent?: number;
  meta?: Record<string, unknown>;
}

export interface RecurringRule {
  id: string;
  merchant: string;
  cat: string;
  amount: number;
  cadence: 'weekly' | 'monthly' | 'annual' | 'customMonthly';
  startDate: string;
  nextDueDate: string;
  dayOfMonth?: number;
  monthOfYear?: number;
  estimate?: boolean;
  active: boolean;
  createdByUserId?: string;
  updatedByUserId?: string;
  meta?: Record<string, unknown>;
}

export interface Attachment {
  id: string;
  transactionId: string;
  localUri: string;
  type: 'receipt' | 'note' | 'other';
  createdAt: string;
  cloudAssetId?: string;
  meta?: Record<string, unknown>;
}

export type MerchantLogoStatus = 'resolved' | 'not_found' | 'error';

export interface MerchantLogo {
  id: string;
  merchantKey: string;
  displayName?: string;
  domain?: string;
  logoUrl?: string;
  /** Server-sampled logo background color (#rrggbb), or null/undefined when the
   *  logo reads cleanest on the default white disc. */
  bgColor?: string | null;
  status: MerchantLogoStatus;
  source?: string;
  lastCheckedAt: string;
  retryAfter?: string;
  failureCount: number;
  meta?: Record<string, unknown>;
}

export interface UpsertMerchantLogoInput {
  id: string;
  merchantKey: string;
  displayName?: string;
  domain?: string;
  logoUrl?: string;
  bgColor?: string | null;
  status: MerchantLogoStatus;
  source?: string;
  lastCheckedAt: string;
  retryAfter?: string;
  failureCount?: number;
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

export type TransactionSortOrder = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'cat';

export interface TransactionCursor {
  occurredAt: string;
  id: string;
  amount?: number;
  cat?: string;
  merchant?: string;
}

export interface TransactionQuery {
  limit: number;
  cursor?: TransactionCursor;
  categoryIds?: string[];
  merchantQuery?: string;
  searchCategoryIds?: string[];
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: TransactionSortOrder;
}

export interface TransactionPage {
  rows: Transaction[];
  nextCursor?: TransactionCursor;
}

export interface TransactionSummaryQuery {
  categoryIds?: string[];
  merchantQuery?: string;
  searchCategoryIds?: string[];
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface TransactionSummary {
  transactionCount: number;
  expenseCount: number;
  expenseTotal: number;
  expenseDayCount: number;
}

export interface CalendarMarkRow {
  day: number;
  cat: string;
}

export type SpendBucket = 'day' | 'month';

export interface SpendSeriesQuery {
  from: string;
  to: string;
  /** 'day' → one point per calendar day; 'month' → one point per calendar month. */
  bucket: SpendBucket;
  categoryIds?: string[];
  merchantQuery?: string;
  searchCategoryIds?: string[];
  minAmount?: number;
  maxAmount?: number;
}

export interface SpendSeriesPoint {
  /** Local-time bucket key: 'YYYY-MM-DD' for day, 'YYYY-MM' for month. */
  key: string;
  amount: number;
}

export interface Repository<T extends { id: string }, CreateInput = Omit<T, 'id'>, UpdateInput = Partial<Omit<T, 'id'>>> {
  list(): T[];
  get(id: string): T | undefined;
  create(input: CreateInput): T;
  update(id: string, patch: UpdateInput): T | undefined;
  delete(id: string): void;
  subscribe(listener: RepoListener): Unsubscribe;
}

export type TransactionsRepo = Repository<Transaction, CreateTransactionInput, UpdateTransactionInput> & {
  listPage(query: TransactionQuery): TransactionPage;
  getSummary(query: TransactionSummaryQuery): TransactionSummary;
  /** Aggregate expense spend grouped into ordered day/month buckets, computed in
   *  the data layer (SQL GROUP BY) rather than by loading every row. */
  getSpendSeries(query: SpendSeriesQuery): SpendSeriesPoint[];
  getCalendarMarks(query: {
    year: number;
    month: number;
    categoryIds?: string[];
    merchantQuery?: string;
    searchCategoryIds?: string[];
    minAmount?: number;
    maxAmount?: number;
  }): CalendarMarkRow[];
};
export type IncomeRepo = Repository<Income>;
export type BillsRepo = Repository<Bill>;
export type BudgetsRepo = Repository<Budget>;
export type SettingsRepo = Repository<AppSettings, AppSettings, Partial<Omit<AppSettings, 'id'>>>;
export type CategoriesRepo = Repository<Category>;
export type RecurringRulesRepo = Repository<RecurringRule>;
export type AttachmentsRepo = Repository<Attachment>;
export type MerchantLogosRepo = Repository<MerchantLogo, UpsertMerchantLogoInput, Partial<UpsertMerchantLogoInput>>;

export interface DevDataRepo {
  isSeedDataEnabled(): boolean;
  setSeedDataEnabled(enabled: boolean): void;
  subscribe(listener: RepoListener): Unsubscribe;
}

export interface Repositories {
  transactionsRepo: TransactionsRepo;
  incomeRepo: IncomeRepo;
  billsRepo: BillsRepo;
  budgetsRepo: BudgetsRepo;
  settingsRepo: SettingsRepo;
  categoriesRepo: CategoriesRepo;
  recurringRulesRepo: RecurringRulesRepo;
  attachmentsRepo: AttachmentsRepo;
  merchantLogosRepo: MerchantLogosRepo;
  devDataRepo: DevDataRepo;
}

export interface SpendSub {
  cat: string;
  label: string;
  icon: string;
  spent: number;
  budget: number;
}

export interface SpendGroup {
  key: GroupKey;
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
