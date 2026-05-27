import {
  DEFAULT_MONTHLY_BUDGET,
  DEFAULT_MONTHLY_INCOME,
  SEED_MONTH_BUDGETS,
  SEED_PERIOD_DATA,
  SEED_SPARK_7D,
  SEED_SPEND_GROUPS,
  SEED_TREND,
} from '../data';
import type { Budget, Income, SpendGroup, Transaction, MonthBudget } from '../repositories/types';
import type { PeriodData, TrendConfig } from './types';

export type Period = 'Week' | 'Month' | 'Year';

const roundMoney = (n: number) => Math.round(n * 100) / 100;

export function monthlyIncome(incomes: Income[]): number {
  return incomes[0]?.amount ?? DEFAULT_MONTHLY_INCOME;
}

export function currentMonthlyBudget(budgets: Budget[]): number {
  const monthly = budgets.find(b => b.month === '2026-05' && b.meta?.kind === 'monthly-budget');
  return monthly?.amount ?? DEFAULT_MONTHLY_BUDGET;
}

export function periodTotals(
  transactions: Transaction[],
  range: Period,
  budget = DEFAULT_MONTHLY_BUDGET,
): PeriodData {
  const seed = SEED_PERIOD_DATA[range];
  if (!seed) return SEED_PERIOD_DATA.Month;

  if (range === 'Week' || range === 'Month') {
    const included = range === 'Week'
      ? transactions.filter(t => t.when === 'today' || t.when === 'yesterday')
      : transactions;
    const byCatMap = included.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.cat] = (acc[tx.cat] ?? 0) + tx.amount;
      return acc;
    }, {});
    const seedOrder = new Map(seed.byCat.map((item, idx) => [item.cat, idx]));
    const byCat = Object.entries(byCatMap)
      .map(([cat, value]) => ({ cat, value: roundMoney(value) }))
      .sort((a, b) => {
        const ai = seedOrder.get(a.cat) ?? Number.MAX_SAFE_INTEGER;
        const bi = seedOrder.get(b.cat) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi || b.value - a.value;
      });
    const spent = roundMoney(included.reduce((sum, tx) => sum + tx.amount, 0));
    const periodBudget = range === 'Month' ? budget : seed.budget;
    return {
      ...seed,
      spent,
      budget: periodBudget,
      remaining: roundMoney(periodBudget - spent),
      byCat,
    };
  }

  return { ...seed, byCat: seed.byCat.map(item => ({ ...item })), prevByCat: seed.prevByCat.map(item => ({ ...item })) };
}

export function trendSeries(_transactions: Transaction[], range: Period): TrendConfig {
  const seed = SEED_TREND[range] ?? SEED_TREND.Month;
  return {
    ...seed,
    data: seed.data.map(point => ({ ...point })),
  };
}

export function spark7d(_transactions: Transaction[], _today = new Date()): number[] {
  return [...SEED_SPARK_7D];
}

export function groupSpent(
  transactions: Transaction[],
  groupKey: SpendGroup['key'],
  budgets: Budget[] = [],
): SpendGroup | undefined {
  return spendGroups(transactions, budgets).find(group => group.key === groupKey);
}

export function spendGroups(_transactions: Transaction[], budgets: Budget[] = []): SpendGroup[] {
  return SEED_SPEND_GROUPS.map(group => ({
    ...group,
    subs: group.subs.map(sub => {
      const budget = budgets.find(b => b.group === group.key && b.label === sub.label);
      return {
        ...sub,
        budget: budget?.amount ?? sub.budget,
        spent: budget?.spent ?? sub.spent,
      };
    }),
  }));
}

export function monthSpent(
  _transactions: Transaction[],
  monthKey: string,
  budgets: Budget[] = [],
): MonthBudget | undefined {
  return monthBudgets(_transactions, budgets).find(month => month.key === monthKey);
}

export function monthBudgets(transactions: Transaction[], budgets: Budget[] = []): MonthBudget[] {
  const monthlyBudget = currentMonthlyBudget(budgets);
  return SEED_MONTH_BUDGETS.map((month, idx) => {
    if (idx !== 0) return { ...month };
    const spent = roundMoney(transactions.reduce((sum, tx) => sum + tx.amount, 0));
    return {
      ...month,
      spent,
      budget: monthlyBudget,
    };
  });
}
