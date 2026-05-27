import { SQLiteBillsRepo } from './bills';
import { SQLiteBudgetsRepo } from './budgets';
import { SQLiteIncomeRepo } from './income';
import { SQLiteSettingsRepo } from './settings';
import { SQLiteTransactionsRepo } from './transactions';
import type { Repositories } from '../types';

export function createSQLiteRepositories(): Repositories {
  return {
    transactionsRepo: new SQLiteTransactionsRepo(),
    incomeRepo: new SQLiteIncomeRepo(),
    billsRepo: new SQLiteBillsRepo(),
    budgetsRepo: new SQLiteBudgetsRepo(),
    settingsRepo: new SQLiteSettingsRepo(),
  };
}
