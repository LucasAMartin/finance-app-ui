import { SQLiteAttachmentsRepo } from './attachments';
import { SQLiteBillsRepo } from './bills';
import { SQLiteBudgetsRepo } from './budgets';
import { SQLiteCategoriesRepo } from './categories';
import { SQLiteIncomeRepo } from './income';
import { SQLiteMerchantLogosRepo } from './merchantLogos';
import { SQLiteRecurringRulesRepo } from './recurringRules';
import { SQLiteSettingsRepo } from './settings';
import { SQLiteTransactionsRepo } from './transactions';
import { isDevSeedDataEnabled, setDevSeedDataEnabled } from './db';
import type { DevDataRepo, RepoListener, Repositories } from '../types';

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
  };
}
