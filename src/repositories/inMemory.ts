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
  AutomationImport,
  AutomationImportsRepo,
  BindCloudIdentityInput,
  Bill,
  Budget,
  Category,
  CreateTransactionInput,
  DevDataRepo,
  EnsureLedgerMemberInput,
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
  TransactionPageWithSummary,
  TransactionQuery,
  TransactionSortOrder,
  TransactionSummary,
  TransactionSummaryQuery,
  TransactionsRepo,
  UpdateTransactionInput,
  CreateAutomationImportInput,
  UpdateAutomationImportInput,
  UpsertMerchantLogoInput,
} from './types';

const DEFAULT_LEDGER_ID = 'ledger-default';
const DEFAULT_OWNER_USER_ID = 'alex';
const DEV_PARTNER_USER_ID = 'partner';
let activeLedgerId = DEFAULT_LEDGER_ID;
let currentUserId = DEFAULT_OWNER_USER_ID;
let getPermissionMembers: () => LedgerMember[] = () => SEED_MEMBERS;

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

function withSeedFields<T extends object>(row: T): T {
  const now = nowIso();
  const existing = row as any;
  return {
    ...row,
    ledgerId: existing.ledgerId ?? DEFAULT_LEDGER_ID,
    createdByUserId: existing.createdByUserId ?? DEFAULT_OWNER_USER_ID,
    updatedByUserId: existing.updatedByUserId ?? DEFAULT_OWNER_USER_ID,
    createdAt: existing.createdAt ?? now,
    updatedAt: existing.updatedAt ?? now,
    syncStatus: existing.syncStatus ?? 'local',
  };
}

function seedRows<T extends object>(rows: T[]): T[] {
  return rows.map(row => withSeedFields(row));
}

function canEditRow(row: any, members = getPermissionMembers()): boolean {
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

  forceUpdate(id: string, patch: UpdateInput): T | undefined {
    let next: T | undefined;
    this.rows = this.rows.map(row => {
      if (row.id !== id) return row;
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

function summarizeTransactions(rows: Transaction[]): TransactionSummary {
  const days = new Set<string>();
  let expenseCount = 0;
  let expenseTotal = 0;

  rows.forEach(tx => {
    if (tx.type === 'income') return;
    expenseCount += 1;
    expenseTotal += tx.amount;
    const day = (tx.occurredAt ?? '').slice(0, 10);
    if (day) days.add(day);
  });

  return {
    transactionCount: rows.length,
    expenseCount,
    expenseTotal,
    expenseDayCount: days.size,
  };
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

  listPageWithSummary(query: TransactionQuery): TransactionPageWithSummary {
    const sort = query.sort ?? DEFAULT_TX_SORT;
    const filtered = this.list()
      .filter(tx => matchesTxQuery(tx, query));
    const summary = summarizeTransactions(filtered);
    filtered.sort((a, b) => compareTx(a, b, sort));
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
      summary,
    };
  }

  getSummary(query: TransactionSummaryQuery): TransactionSummary {
    return summarizeTransactions(this.list().filter(tx => matchesTxQuery(tx, query)));
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

class InMemoryAutomationImportsRepo
  extends InMemoryRepository<AutomationImport, CreateAutomationImportInput, UpdateAutomationImportInput>
  implements AutomationImportsRepo {
  create(input: CreateAutomationImportInput): AutomationImport {
    const existing = this.rows.find(row => row.fingerprint === input.fingerprint);
    if (existing) return { ...existing };
    const now = nowIso();
    const row: AutomationImport = {
      id: `automation-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: input.source,
      rawText: input.rawText,
      amountHint: input.amountHint,
      merchantHint: input.merchantHint,
      categoryHint: input.categoryHint,
      occurredAtHint: input.occurredAtHint,
      cardLast4Hint: input.cardLast4Hint,
      fingerprint: input.fingerprint,
      status: input.status ?? 'pending',
      attempts: input.attempts ?? 0,
      processedTransactionId: input.processedTransactionId,
      error: input.error,
      receivedAt: input.receivedAt ?? now,
      ledgerId: input.ledgerId ?? activeLedgerId,
      createdByUserId: input.createdByUserId ?? currentUserId,
      createdAt: now,
      updatedAt: now,
      meta: input.meta,
    };
    this.rows = [row, ...this.rows];
    this.refresh();
    return { ...row };
  }

  listPending(limit = 25): AutomationImport[] {
    return this.list()
      .filter(row => row.status === 'pending')
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }
}

class InMemoryDevDataRepo implements DevDataRepo {
  private listeners = new Set<RepoListener>();
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
    automationImportsRepo: InMemoryAutomationImportsRepo;
  };

  constructor(repos: InMemoryDevDataRepo['repos']) {
    this.repos = repos;
  }

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
    this.repos.transactionsRepo.replaceAll(enabled ? seedRows(SEED_TRANSACTIONS) : []);
    this.repos.incomeRepo.replaceAll(enabled ? seedRows(SEED_INCOME) : []);
    this.repos.billsRepo.replaceAll(enabled ? seedRows(SEED_BILLS) : []);
    this.repos.budgetsRepo.replaceAll(enabled ? seedRows(SEED_BUDGETS) : []);
    this.repos.categoriesRepo.replaceAll(enabled ? seedRows(SEED_CATEGORIES) : []);
    this.repos.recurringRulesRepo.replaceAll(enabled ? seedRows(SEED_RECURRING_RULES) : []);
    this.repos.attachmentsRepo.replaceAll([]);
    this.repos.automationImportsRepo.replaceAll([]);
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
  private ledgersRepo: InMemoryRepository<Ledger>;
  private ledgerMembersRepo: InMemoryRepository<LedgerMember>;
  private onSessionChanged: () => void;

  constructor(
    ledgersRepo: InMemoryRepository<Ledger>,
    ledgerMembersRepo: InMemoryRepository<LedgerMember>,
    onSessionChanged: () => void,
  ) {
    this.ledgersRepo = ledgersRepo;
    this.ledgerMembersRepo = ledgerMembersRepo;
    this.onSessionChanged = onSessionChanged;
  }

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

  updateLedger(id: string, patch: Partial<Omit<Ledger, 'id'>>) {
    const ledger = this.ledgersRepo.forceUpdate(id, patch);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return ledger;
  }

  updateLedgerLocalMeta(id: string, meta: Record<string, unknown> | undefined) {
    const ledger = this.ledgersRepo.forceUpdate(id, { meta });
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return ledger;
  }

  listMembers(ledgerId = activeLedgerId) {
    return this.ledgerMembersRepo.list().filter(member => member.ledgerId === ledgerId);
  }

  ensureMember(input: EnsureLedgerMemberInput) {
    const existing = this.ledgerMembersRepo.list().find(member =>
      member.ledgerId === input.ledgerId && member.userId === input.userId
    );
    if (existing) return existing;
    const now = nowIso();
    const member: LedgerMember = {
      id: `member-${input.ledgerId}-${input.userId.replace(/[^A-Za-z0-9_.-]/g, '_')}`,
      ledgerId: input.ledgerId,
      userId: input.userId,
      displayName: input.displayName ?? 'You',
      role: input.role ?? 'member',
      status: 'active',
      allowOthersToEditMyItems: input.allowOthersToEditMyItems ?? true,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      meta: input.meta,
    };
    this.ledgerMembersRepo.replaceAll([member, ...this.ledgerMembersRepo.list()]);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return member;
  }

  bindCloudIdentity(input: BindCloudIdentityInput) {
    const member = this.ensureMember({
      ...input,
      role: input.role ?? (input.claimAsOwner ? 'owner' : 'member'),
      displayName: input.displayName ?? 'You',
      allowOthersToEditMyItems: input.allowOthersToEditMyItems ?? true,
      meta: {
        ...(input.meta ?? {}),
        cloudKitUserId: input.userId,
      },
    });
    this.ledgerMembersRepo.forceUpdate(member.id, {
      displayName: input.displayName ?? 'You',
      role: input.role ?? (input.claimAsOwner ? 'owner' : 'member'),
      status: 'active',
      allowOthersToEditMyItems: input.allowOthersToEditMyItems ?? true,
      deletedAt: undefined,
      meta: {
        ...(input.meta ?? {}),
        cloudKitUserId: input.userId,
      },
    });
    const fakeUserIds = new Set([DEFAULT_OWNER_USER_ID, DEV_PARTNER_USER_ID]);
    this.ledgerMembersRepo.list()
      .filter(item => item.ledgerId === input.ledgerId && fakeUserIds.has(item.userId) && item.userId !== input.userId)
      .forEach(item => {
        this.ledgerMembersRepo.forceUpdate(item.id, { deletedAt: nowIso() });
      });
    if (input.claimAsOwner) {
      this.ledgersRepo.forceUpdate(input.ledgerId, {
        ownerUserId: input.userId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
      });
    }
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return this.ledgerMembersRepo.get(member.id) ?? member;
  }

  updateMember(id: string, patch: Partial<Omit<LedgerMember, 'id' | 'ledgerId' | 'userId'>>) {
    const current = this.ledgerMembersRepo.get(id);
    if (!current) return undefined;
    const currentMember = this.ledgerMembersRepo.list().find(member => member.userId === currentUserId);
    const changingAnotherMember = current.userId !== currentUserId;
    if (changingAnotherMember && patch.allowOthersToEditMyItems !== undefined) return undefined;
    if (changingAnotherMember && currentMember?.role !== 'owner') return undefined;
    const member = this.ledgerMembersRepo.forceUpdate(id, patch);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return member;
  }

  canEdit(createdByUserId?: string, ledgerId = activeLedgerId): boolean {
    return canEditRow({ createdByUserId, ledgerId }, this.ledgerMembersRepo.list());
  }

  refresh(): void {
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: RepoListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createInMemoryRepositories(): Repositories {
  activeLedgerId = DEFAULT_LEDGER_ID;
  currentUserId = DEFAULT_OWNER_USER_ID;
  getPermissionMembers = () => SEED_MEMBERS;
  const transactionsRepo = new InMemoryTransactionsRepo(seedRows(SEED_TRANSACTIONS));
  const incomeRepo = new InMemoryRepository<Income>(seedRows(SEED_INCOME));
  const billsRepo = new InMemoryRepository<Bill>(seedRows(SEED_BILLS));
  const budgetsRepo = new InMemoryRepository<Budget>(seedRows(SEED_BUDGETS));
  const settingsRepo = new InMemoryRepository<AppSettings, AppSettings>([SEED_SETTINGS]);
  const categoriesRepo = new InMemoryRepository<Category>(seedRows(SEED_CATEGORIES));
  const recurringRulesRepo = new InMemoryRepository<RecurringRule>(seedRows(SEED_RECURRING_RULES));
  const attachmentsRepo = new InMemoryRepository<Attachment>([]);
  const merchantLogosRepo = new InMemoryRepository<MerchantLogo, UpsertMerchantLogoInput, Partial<UpsertMerchantLogoInput>>([]);
  const automationImportsRepo = new InMemoryAutomationImportsRepo([]);
  const ledgersRepo = new InMemoryRepository<Ledger>([SEED_LEDGER]);
  const ledgerMembersRepo = new InMemoryRepository<LedgerMember>(SEED_MEMBERS);
  getPermissionMembers = () => ledgerMembersRepo.list();
  const refreshDomainRepos = () => {
    transactionsRepo.refresh();
    incomeRepo.refresh();
    billsRepo.refresh();
    budgetsRepo.refresh();
    categoriesRepo.refresh();
    recurringRulesRepo.refresh();
    attachmentsRepo.refresh();
    automationImportsRepo.refresh();
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
    automationImportsRepo,
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
      automationImportsRepo,
    }),
    sessionRepo,
  };
}
