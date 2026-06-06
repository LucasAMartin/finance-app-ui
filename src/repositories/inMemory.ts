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
  DevDataRepo,
  Income,
  Ledger,
  LedgerMember,
  MerchantLogo,
  RecurringRule,
  Repositories,
  RepoListener,
  Repository,
  SessionRepo,
  SpendSeriesPoint,
  SpendSeriesQuery,
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

const DEFAULT_LEDGER_ID = 'ledger-default';
const DEFAULT_OWNER_USER_ID = 'alex';
const DEV_PARTNER_USER_ID = 'partner';
let activeLedgerId = DEFAULT_LEDGER_ID;
let currentUserId = DEFAULT_OWNER_USER_ID;

const nowIso = () => new Date().toISOString();

const SEED_LEDGER: Ledger = {
  id: DEFAULT_LEDGER_ID,
  name: 'Shared finances',
  ownerUserId: DEFAULT_OWNER_USER_ID,
  active: true,
  ledgerId: DEFAULT_LEDGER_ID,
  createdByUserId: DEFAULT_OWNER_USER_ID,
  updatedByUserId: DEFAULT_OWNER_USER_ID,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  syncStatus: 'local',
};

const SEED_MEMBERS: LedgerMember[] = [
  {
    id: `member-${DEFAULT_LEDGER_ID}-${DEFAULT_OWNER_USER_ID}`,
    ledgerId: DEFAULT_LEDGER_ID,
    userId: DEFAULT_OWNER_USER_ID,
    displayName: 'Alex',
    role: 'owner',
    status: 'active',
    allowOthersToEditMyItems: true,
    createdByUserId: DEFAULT_OWNER_USER_ID,
    updatedByUserId: DEFAULT_OWNER_USER_ID,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: 'local',
  },
  {
    id: `member-${DEFAULT_LEDGER_ID}-${DEV_PARTNER_USER_ID}`,
    ledgerId: DEFAULT_LEDGER_ID,
    userId: DEV_PARTNER_USER_ID,
    displayName: 'Partner',
    role: 'member',
    status: 'active',
    allowOthersToEditMyItems: true,
    createdByUserId: DEFAULT_OWNER_USER_ID,
    updatedByUserId: DEFAULT_OWNER_USER_ID,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: 'local',
  },
];

function withCreateFields<T extends object>(row: T): T {
  const now = nowIso();
  const existing = row as any;
  return {
    ...row,
    ledgerId: existing.ledgerId ?? activeLedgerId,
    createdByUserId: existing.createdByUserId && existing.createdByUserId !== 'local' ? existing.createdByUserId : currentUserId,
    updatedByUserId: existing.updatedByUserId && existing.updatedByUserId !== 'local' ? existing.updatedByUserId : currentUserId,
    createdAt: existing.createdAt ?? now,
    updatedAt: existing.updatedAt ?? now,
    syncStatus: existing.syncStatus ?? 'pending',
  };
}

function canEditRow(row: any, members = SEED_MEMBERS): boolean {
  if (!row?.createdByUserId || row.createdByUserId === currentUserId) return true;
  const member = members.find(m => m.ledgerId === (row.ledgerId ?? activeLedgerId) && m.userId === row.createdByUserId);
  return member ? member.allowOthersToEditMyItems !== false : false;
}

class InMemoryRepository<T extends { id: string }, CreateInput = Omit<T, 'id'>, UpdateInput = Partial<Omit<T, 'id'>>>
  implements Repository<T, CreateInput, UpdateInput> {
  protected rows: T[];
  private listeners = new Set<RepoListener>();

  constructor(seed: T[]) {
    this.rows = seed.map(row => ({ ...row }));
  }

  list(): T[] {
    return this.rows.filter(row => {
      const item = row as any;
      if (item.deletedAt) return false;
      if (item.ledgerId && item.ledgerId !== activeLedgerId) return false;
      return true;
    });
  }

  get(id: string): T | undefined {
    const row = this.list().find(item => item.id === id);
    return row ? { ...row } : undefined;
  }

  create(input: CreateInput): T {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const row = withCreateFields({ id, ...(input as object) }) as T;
    this.rows = [row, ...this.rows];
    this.emit();
    return { ...row };
  }

  update(id: string, patch: UpdateInput): T | undefined {
    let next: T | undefined;
    this.rows = this.rows.map(row => {
      if (row.id !== id) return row;
      if (!canEditRow(row)) return row;
      next = {
        ...row,
        ...(patch as object),
        updatedByUserId: currentUserId,
        updatedAt: nowIso(),
        syncStatus: 'pending',
      };
      return next;
    });
    if (next) this.emit();
    return next ? { ...next } : undefined;
  }

  delete(id: string): void {
    let changed = false;
    this.rows = this.rows.map(row => {
      if (row.id !== id || !canEditRow(row)) return row;
      changed = true;
      return {
        ...row,
        deletedAt: nowIso(),
        updatedByUserId: currentUserId,
        updatedAt: nowIso(),
        syncStatus: 'pending',
      };
    });
    if (changed) this.emit();
  }

  replaceAll(rows: T[]) {
    this.rows = rows.map(row => ({ ...row }));
    this.emit();
  }

  refresh() {
    this.emit();
  }

  subscribe(listener: RepoListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit() {
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
  if (query.minAmount !== undefined && tx.amount < query.minAmount) return false;
  if (query.maxAmount !== undefined && tx.amount > query.maxAmount) return false;
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
  canEdit(tx: Transaction): boolean {
    return canEditRow(tx);
  }

  listPage(query: TransactionQuery): TransactionPage {
    const sort = query.sort ?? DEFAULT_TX_SORT;
    const filtered = this.list()
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
    const filtered = this.list().filter(tx => matchesTxQuery(tx, query));
    const expenses = filtered.filter(tx => tx.type !== 'income');
    const days = new Set(expenses.map(tx => (tx.occurredAt ?? '').slice(0, 10)).filter(Boolean));
    return {
      transactionCount: filtered.length,
      expenseCount: expenses.length,
      expenseTotal: expenses.reduce((sum, tx) => sum + tx.amount, 0),
      expenseDayCount: days.size,
    };
  }

  getSpendSeries(query: SpendSeriesQuery): SpendSeriesPoint[] {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const groups = new Map<string, number>();
    this.list().forEach(tx => {
      if (tx.type === 'income') return;
      if (!matchesTxQuery(tx, query)) return;
      if (!tx.occurredAt) return;
      const d = new Date(tx.occurredAt);
      const key =
        query.bucket === 'month'
          ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
          : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      groups.set(key, (groups.get(key) ?? 0) + tx.amount);
    });
    return [...groups.entries()]
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  getCalendarMarks(query: {
    year: number;
    month: number;
    categoryIds?: string[];
    merchantQuery?: string;
    searchCategoryIds?: string[];
    minAmount?: number;
    maxAmount?: number;
  }) {
    return this.list()
      .filter(tx => matchesTxQuery(tx, query))
      .map(tx => ({ tx, d: tx.occurredAt ? new Date(tx.occurredAt) : null }))
      .filter(({ d }) => d && d.getFullYear() === query.year && d.getMonth() === query.month)
      .map(({ tx, d }) => ({ day: d!.getDate(), cat: tx.cat }));
  }
}

class InMemoryDevDataRepo implements DevDataRepo {
  private listeners = new Set<RepoListener>();

  constructor(
    private repos: {
      transactionsRepo: InMemoryTransactionsRepo;
      incomeRepo: InMemoryRepository<Income>;
      billsRepo: InMemoryRepository<Bill>;
      budgetsRepo: InMemoryRepository<Budget>;
      categoriesRepo: InMemoryRepository<Category>;
      recurringRulesRepo: InMemoryRepository<RecurringRule>;
      attachmentsRepo: InMemoryRepository<Attachment>;
      ledgersRepo: InMemoryRepository<Ledger>;
      ledgerMembersRepo: InMemoryRepository<LedgerMember>;
    },
  ) {}

  isSeedDataEnabled(): boolean {
    return (
      this.repos.transactionsRepo.list().length +
      this.repos.incomeRepo.list().length +
      this.repos.billsRepo.list().length +
      this.repos.budgetsRepo.list().length +
      this.repos.categoriesRepo.list().length +
      this.repos.recurringRulesRepo.list().length +
      this.repos.attachmentsRepo.list().length
    ) > 0;
  }

  setSeedDataEnabled(enabled: boolean): void {
    this.repos.transactionsRepo.replaceAll(enabled ? SEED_TRANSACTIONS : []);
    this.repos.incomeRepo.replaceAll(enabled ? SEED_INCOME : []);
    this.repos.billsRepo.replaceAll(enabled ? SEED_BILLS : []);
    this.repos.budgetsRepo.replaceAll(enabled ? SEED_BUDGETS : []);
    this.repos.categoriesRepo.replaceAll(enabled ? SEED_CATEGORIES : []);
    this.repos.recurringRulesRepo.replaceAll(enabled ? SEED_RECURRING_RULES : []);
    this.repos.attachmentsRepo.replaceAll([]);
    this.repos.ledgersRepo.replaceAll(enabled ? [SEED_LEDGER] : []);
    this.repos.ledgerMembersRepo.replaceAll(enabled ? SEED_MEMBERS : []);
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: RepoListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class InMemorySessionRepo implements SessionRepo {
  private listeners = new Set<RepoListener>();

  constructor(
    private ledgersRepo: InMemoryRepository<Ledger>,
    private ledgerMembersRepo: InMemoryRepository<LedgerMember>,
    private onSessionChanged: () => void,
  ) {}

  getSession() {
    return { activeLedgerId, currentUserId };
  }

  setCurrentUserId(userId: string): void {
    if (userId === currentUserId) return;
    currentUserId = userId;
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
  }

  listLedgers() {
    return this.ledgersRepo.list();
  }

  listMembers(ledgerId = activeLedgerId) {
    return this.ledgerMembersRepo.list().filter(member => member.ledgerId === ledgerId);
  }

  updateMember(id: string, patch: Partial<Omit<LedgerMember, 'id' | 'ledgerId' | 'userId'>>) {
    const member = this.ledgerMembersRepo.update(id, patch);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return member;
  }

  canEdit(createdByUserId?: string, ledgerId = activeLedgerId): boolean {
    return canEditRow({ createdByUserId, ledgerId }, this.ledgerMembersRepo.list());
  }

  subscribe(listener: RepoListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createInMemoryRepositories(): Repositories {
  const transactionsRepo = new InMemoryTransactionsRepo(SEED_TRANSACTIONS);
  const incomeRepo = new InMemoryRepository<Income>(SEED_INCOME);
  const billsRepo = new InMemoryRepository<Bill>(SEED_BILLS);
  const budgetsRepo = new InMemoryRepository<Budget>(SEED_BUDGETS);
  const settingsRepo = new InMemoryRepository<AppSettings, AppSettings>([SEED_SETTINGS]);
  const categoriesRepo = new InMemoryRepository<Category>(SEED_CATEGORIES);
  const recurringRulesRepo = new InMemoryRepository<RecurringRule>(SEED_RECURRING_RULES);
  const attachmentsRepo = new InMemoryRepository<Attachment>([]);
  const merchantLogosRepo = new InMemoryRepository<MerchantLogo, UpsertMerchantLogoInput, Partial<UpsertMerchantLogoInput>>([]);
  const ledgersRepo = new InMemoryRepository<Ledger>([SEED_LEDGER]);
  const ledgerMembersRepo = new InMemoryRepository<LedgerMember>(SEED_MEMBERS);
  const refreshDomainRepos = () => {
    transactionsRepo.refresh();
    incomeRepo.refresh();
    billsRepo.refresh();
    budgetsRepo.refresh();
    categoriesRepo.refresh();
    recurringRulesRepo.refresh();
    attachmentsRepo.refresh();
  };
  const sessionRepo = new InMemorySessionRepo(ledgersRepo, ledgerMembersRepo, refreshDomainRepos);

  return {
    transactionsRepo,
    incomeRepo,
    billsRepo,
    budgetsRepo,
    settingsRepo,
    categoriesRepo,
    recurringRulesRepo,
    attachmentsRepo,
    merchantLogosRepo,
    devDataRepo: new InMemoryDevDataRepo({
      transactionsRepo,
      incomeRepo,
      billsRepo,
      budgetsRepo,
      categoriesRepo,
      recurringRulesRepo,
      attachmentsRepo,
      ledgersRepo,
      ledgerMembersRepo,
    }),
    sessionRepo,
  };
}
