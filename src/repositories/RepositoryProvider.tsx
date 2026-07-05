import React, { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';
import { EMPTY_STATE_PREVIEW_META_KEY } from '../emptyStatePreview';
import { createInMemoryRepositories } from './inMemory';
import { createSQLiteRepositories } from './sqlite';
import type {
  AutomationImportsRepo,
  CalendarMarkRow,
  LedgerMember,
  Repositories,
  Repository,
  SpendSeriesPoint,
  TransactionPage,
  TransactionPageWithSummary,
  TransactionSummary,
  TransactionsRepo,
} from './types';

const RepositoryContext = createContext<Repositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repos = useMemo(
    () => process.env.NODE_ENV === 'test' ? createInMemoryRepositories() : createSQLiteRepositories(),
    [],
  );
  return (
    <RepositoryContext.Provider value={repos}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  const emptyStatePreview = useEmptyStatePreview(ctx);
  const repos = useMemo(
    () => ctx ? (emptyStatePreview ? createEmptyStatePreviewRepositories(ctx) : ctx) : null,
    [ctx, emptyStatePreview],
  );
  if (!repos) throw new Error('useRepositories must be used inside <RepositoryProvider>');
  return repos;
}

export function useRepositoryList<T extends { id: string }>(repo: Repository<T, any, any>): T[] {
  const subscribe = useCallback((listener: () => void) => repo.subscribe(listener), [repo]);
  const getSnapshot = useCallback(() => repo.list(), [repo]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLedgerMembers(): LedgerMember[] {
  const { sessionRepo } = useRepositories();
  const snapshotRef = useRef<LedgerMember[]>([]);
  const snapshotKeyRef = useRef('');
  const subscribe = useCallback((listener: () => void) => sessionRepo.subscribe(listener), [sessionRepo]);
  const getSnapshot = useCallback(() => {
    const session = sessionRepo.getSession();
    const next = sessionRepo.listMembers(session.activeLedgerId);
    const key = ledgerMembersSnapshotKey(next);
    if (snapshotKeyRef.current === key) return snapshotRef.current;
    snapshotKeyRef.current = key;
    snapshotRef.current = next;
    return next;
  }, [sessionRepo]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function ledgerMembersSnapshotKey(members: LedgerMember[]): string {
  return members
    .map(member => [
      member.id,
      member.ledgerId,
      member.userId,
      member.displayName,
      member.role,
      member.status,
      member.allowOthersToEditMyItems ? '1' : '0',
      member.updatedAt ?? '',
      member.deletedAt ?? '',
    ].join('\u001f'))
    .join('\u001e');
}

function shallowEqualRecord<T extends object>(a: T, b: T): boolean {
  const aKeys = Object.keys(a) as Array<keyof T>;
  const bKeys = Object.keys(b) as Array<keyof T>;
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => Object.is(a[key], b[key]));
}

export function useRepositoryItem<T extends { id: string }>(repo: Repository<T, any, any>, id: string): T | undefined {
  const snapshotRef = useRef<T | undefined>(undefined);
  const subscribe = useCallback((listener: () => void) => repo.subscribe(listener), [repo]);
  const getSnapshot = useCallback(() => {
    const next = repo.list().find(item => item.id === id);
    const prev = snapshotRef.current;
    if (prev === next) return prev;
    if (prev && next && shallowEqualRecord(prev, next)) return prev;
    snapshotRef.current = next;
    return next;
  }, [repo, id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useEmptyStatePreview(repos: Repositories | null): boolean {
  const subscribe = useCallback(
    (listener: () => void) => repos ? repos.settingsRepo.subscribe(listener) : () => undefined,
    [repos],
  );
  const getSnapshot = useCallback(
    () => !!repos?.settingsRepo.get('settings')?.meta?.[EMPTY_STATE_PREVIEW_META_KEY],
    [repos],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function createEmptyStatePreviewRepositories(repos: Repositories): Repositories {
  return {
    ...repos,
    transactionsRepo: createEmptyTransactionsRepo(repos.transactionsRepo),
    incomeRepo: createEmptyRepository(repos.incomeRepo),
    billsRepo: createEmptyRepository(repos.billsRepo),
    budgetsRepo: createEmptyRepository(repos.budgetsRepo),
    categoriesRepo: createEmptyRepository(repos.categoriesRepo),
    recurringRulesRepo: createEmptyRepository(repos.recurringRulesRepo),
    attachmentsRepo: createEmptyRepository(repos.attachmentsRepo),
    merchantLogosRepo: createEmptyRepository(repos.merchantLogosRepo),
    automationImportsRepo: createEmptyAutomationImportsRepo(repos.automationImportsRepo),
  };
}

function createEmptyRepository<T extends { id: string }, CreateInput, UpdateInput>(
  repo: Repository<T, CreateInput, UpdateInput>,
): Repository<T, CreateInput, UpdateInput> {
  const emptyRows: T[] = [];
  const previewRepo: Repository<T, CreateInput, UpdateInput> = {
    list: () => emptyRows,
    get: () => undefined,
    create: input => repo.create(input),
    update: (id, patch) => repo.update(id, patch),
    delete: id => repo.delete(id),
    subscribe: listener => repo.subscribe(listener),
  };
  if (repo.refresh) previewRepo.refresh = () => repo.refresh?.();
  return previewRepo;
}

const EMPTY_TRANSACTION_PAGE: TransactionPage = {
  rows: [],
  nextCursor: undefined,
};

const EMPTY_TRANSACTION_SUMMARY: TransactionSummary = {
  transactionCount: 0,
  expenseCount: 0,
  expenseTotal: 0,
  expenseDayCount: 0,
};

function createEmptyTransactionsRepo(repo: TransactionsRepo): TransactionsRepo {
  const base = createEmptyRepository(repo);
  return {
    ...base,
    canEdit: tx => repo.canEdit(tx),
    listPage: (): TransactionPage => EMPTY_TRANSACTION_PAGE,
    listPageWithSummary: (): TransactionPageWithSummary => ({
      ...EMPTY_TRANSACTION_PAGE,
      summary: EMPTY_TRANSACTION_SUMMARY,
    }),
    getSummary: (): TransactionSummary => EMPTY_TRANSACTION_SUMMARY,
    getSpendSeries: (): SpendSeriesPoint[] => [],
    getCalendarMarks: (): CalendarMarkRow[] => [],
  };
}

function createEmptyAutomationImportsRepo(repo: AutomationImportsRepo): AutomationImportsRepo {
  const base = createEmptyRepository(repo);
  return {
    ...base,
    listPending: () => [],
  };
}
