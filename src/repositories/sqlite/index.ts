import { SQLiteAttachmentsRepo } from './attachments';
import { SQLiteBillsRepo } from './bills';
import { SQLiteBudgetsRepo } from './budgets';
import { SQLiteCategoriesRepo } from './categories';
import { SQLiteIncomeRepo } from './income';
import { SQLiteMerchantLogosRepo } from './merchantLogos';
import { SQLiteRecurringRulesRepo } from './recurringRules';
import { SQLiteSettingsRepo } from './settings';
import { SQLiteTransactionsRepo } from './transactions';
import {
  canEditRecord,
  bindLedgerToCloudIdentity,
  getSession,
  isDevSeedDataEnabled,
  listLedgerMembers,
  listLedgers,
  ensureLedgerMember,
  setCurrentUserId,
  setDevSeedDataEnabled,
  subscribeSession,
  updateLedgerLocalMeta,
  updateLedger as updateLedgerRow,
  updateLedgerMember,
} from './db';
import type { DevDataRepo, Ledger, LedgerMember, RepoListener, Repositories, SessionRepo } from '../types';

class SQLiteDevDataRepo implements DevDataRepo {
  private listeners = new Set<RepoListener>();

  constructor(private onDataChanged: () => void) {}

  isSeedDataEnabled(): boolean {
    return isDevSeedDataEnabled();
  }

  setSeedDataEnabled(enabled: boolean): void {
    setDevSeedDataEnabled(enabled);
    this.onDataChanged();
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: RepoListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class SQLiteSessionRepo implements SessionRepo {
  private listeners = new Set<RepoListener>();

  constructor(private onSessionChanged: () => void) {
    subscribeSession(() => {
      this.onSessionChanged();
      this.listeners.forEach(listener => listener());
    });
  }

  getSession() {
    return getSession();
  }

  setCurrentUserId(userId: string): void {
    setCurrentUserId(userId);
  }

  listLedgers() {
    return listLedgers();
  }

  updateLedger(id: string, patch: Partial<Omit<Ledger, 'id'>>) {
    const ledger = updateLedgerRow(id, patch);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return ledger;
  }

  updateLedgerLocalMeta(id: string, meta: Record<string, unknown> | undefined) {
    const ledger = updateLedgerLocalMeta(id, meta);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return ledger;
  }

  listMembers(ledgerId?: string) {
    return listLedgerMembers(ledgerId);
  }

  ensureMember(input: Parameters<typeof ensureLedgerMember>[0]) {
    const member = ensureLedgerMember(input);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return member;
  }

  bindCloudIdentity(input: Parameters<typeof bindLedgerToCloudIdentity>[0]) {
    const member = bindLedgerToCloudIdentity(input);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return member;
  }

  updateMember(id: string, patch: Partial<Omit<LedgerMember, 'id' | 'ledgerId' | 'userId'>>) {
    const member = updateLedgerMember(id, patch);
    this.onSessionChanged();
    this.listeners.forEach(listener => listener());
    return member;
  }

  canEdit(createdByUserId?: string, ledgerId?: string): boolean {
    return canEditRecord(createdByUserId, ledgerId);
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

export function createSQLiteRepositories(): Repositories {
  const transactionsRepo = new SQLiteTransactionsRepo();
  const incomeRepo = new SQLiteIncomeRepo();
  const billsRepo = new SQLiteBillsRepo();
  const budgetsRepo = new SQLiteBudgetsRepo();
  const settingsRepo = new SQLiteSettingsRepo();
  const categoriesRepo = new SQLiteCategoriesRepo();
  const recurringRulesRepo = new SQLiteRecurringRulesRepo();
  const attachmentsRepo = new SQLiteAttachmentsRepo();
  const merchantLogosRepo = new SQLiteMerchantLogosRepo();
  const refreshDomainRepos = () => {
    transactionsRepo.refresh();
    incomeRepo.refresh();
    billsRepo.refresh();
    budgetsRepo.refresh();
    categoriesRepo.refresh();
    recurringRulesRepo.refresh();
    attachmentsRepo.refresh();
  };
  const sessionRepo = new SQLiteSessionRepo(refreshDomainRepos);

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
    devDataRepo: new SQLiteDevDataRepo(refreshDomainRepos),
    sessionRepo,
  };
}
