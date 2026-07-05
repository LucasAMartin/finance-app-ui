import { GROUP_COLORS } from '../theme';
import type { Budget, Category, Income, RecurringRule, Transaction } from '../repositories/types';
import { monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import { formatMoney } from '../selectors/format';
import type { FinanceWidgetSnapshot } from './types';

interface SnapshotInput {
  transactions: Transaction[];
  budgets: Budget[];
  incomes: Income[];
  categories: Category[];
  recurringRules: RecurringRule[];
  dark: boolean;
  currencyCode?: string;
  now?: Date;
}

export function buildWidgetSnapshot({
  transactions,
  budgets,
  incomes,
  categories,
  recurringRules,
  dark,
  currencyCode = 'active',
  now = new Date(),
}: SnapshotInput): FinanceWidgetSnapshot {
  const monthKey = toMonthKey(now);
  const currentMonthTransactions = transactions.filter(tx => (tx.occurredAt ?? tx.fullDate ?? '').slice(0, 7) === monthKey);
  const income = monthlyIncome(incomes, monthKey);
  const spent = currentMonthTransactions
    .filter(tx => tx.type !== 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const remaining = income - spent;
  const budgetProgress = income > 0 ? clamp01(spent / income) : 0;
  const groups = spendGroups(currentMonthTransactions, budgets, categories, monthKey);
  const bills = upcomingBillsFromRecurring(recurringRules, categories, now).slice(0, 3);

  return {
    version: 1,
    updatedAt: now.toISOString(),
    available: {
      amount: formatMoney(Math.abs(remaining), false, currencyCode),
      label: income <= 0 ? 'Set income to start' : remaining >= 0 ? 'available this month' : 'over this month',
      spent: formatMoney(spent, false, currencyCode),
      budget: formatMoney(income, false, currencyCode),
      progress: budgetProgress,
      state: income <= 0 ? 'empty' : remaining >= 0 ? 'available' : 'over',
    },
    budget: {
      title: '50/30/20 plan',
      groups: groups.map(group => {
        const groupSpent = group.subs.reduce((sum, sub) => sum + sub.spent, 0);
        const groupBudget = group.subs.reduce((sum, sub) => sum + sub.budget, 0);
        return {
          key: group.key,
          label: group.label,
          spent: formatMoney(groupSpent, false, currencyCode),
          budget: formatMoney(groupBudget, false, currencyCode),
          progress: groupBudget > 0 ? clamp01(groupSpent / groupBudget) : 0,
          tint: GROUP_COLORS[group.key][dark ? 'dark' : 'light'],
        };
      }),
    },
    bills: {
      title: 'Upcoming bills',
      items: bills.map(bill => ({
        title: bill.merchant || bill.name,
        amount: formatMoney(bill.amount, false, currencyCode),
        due: bill.daysUntil === 0 ? 'Due today' : bill.daysUntil === 1 ? 'Tomorrow' : `${bill.daysUntil} days`,
        daysUntil: bill.daysUntil,
      })),
      emptyText: 'No bills due soon',
    },
    quickAdd: {
      title: 'Quick add',
      actions: [
        {
          id: 'expense',
          title: 'Expense',
          subtitle: 'Manual entry',
          url: 'financeapp:///expense?mode=manual',
        },
        {
          id: 'income',
          title: 'Income',
          subtitle: 'Log money in',
          url: 'financeapp:///income',
        },
        {
          id: 'text',
          title: 'Voice',
          subtitle: 'Speak an expense',
          url: 'financeapp:///expense?mode=voice',
        },
      ],
    },
  };
}

function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
