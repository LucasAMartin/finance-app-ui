import { CAT_TO_GROUP } from '../theme';
import type { Category, Income, TransactionsRepo } from '../repositories/types';
import { monthlyIncome, type Period } from './finance';
import { spendSeriesToBuckets } from './spending';

export interface SavedMetric {
  categoryIds: string[];
  intentional: number;
  extra: number;
  total: number;
  intentionalSeries: number[];
  extraSeries: number[];
  totalSeries: number[];
  cumulativeSeries: number[];
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function monthEnd(year: number, month: number): Date {
  return endOfDay(new Date(year, month + 1, 0));
}

function savingsCategoryIds(categories: Category[]): string[] {
  const ids = categories
    .filter(cat => !cat.archived && cat.group === 'savings')
    .map(cat => cat.id);
  if (ids.length > 0) return ids;
  return Object.entries(CAT_TO_GROUP)
    .filter(([, group]) => group === 'savings')
    .map(([id]) => id);
}

function completedMonthExtra(
  transactionsRepo: TransactionsRepo,
  incomes: Income[],
  start: Date,
  now: Date,
): number {
  const end = monthEnd(start.getFullYear(), start.getMonth());
  if (end > now) return 0;
  const income = monthlyIncome(incomes, monthKey(start));
  if (income <= 0) return 0;
  const expenseTotal = transactionsRepo.getSummary({
    from: start.toISOString(),
    to: end.toISOString(),
  }).expenseTotal;
  return Math.max(0, income - expenseTotal);
}

export function buildSavedMetric({
  transactionsRepo,
  categories,
  incomes,
  period,
  from,
  to,
  now,
}: {
  transactionsRepo: TransactionsRepo;
  categories: Category[];
  incomes: Income[];
  period: Period;
  from: Date;
  to: Date;
  now: Date;
}): SavedMetric {
  const categoryIds = savingsCategoryIds(categories);
  const bucket = period === 'Year' ? 'month' : 'day';
  const points = transactionsRepo.getSpendSeries({
    from: from.toISOString(),
    to: to.toISOString(),
    bucket,
    categoryIds,
  });
  const intentionalSeries = spendSeriesToBuckets(points, period, from, to);
  const extraSeries = new Array(intentionalSeries.length).fill(0);

  if (period === 'Month' && intentionalSeries.length > 0) {
    extraSeries[extraSeries.length - 1] = completedMonthExtra(
      transactionsRepo,
      incomes,
      monthStart(from.getFullYear(), from.getMonth()),
      now,
    );
  } else if (period === 'Year') {
    const year = from.getFullYear();
    for (let month = 0; month < extraSeries.length; month++) {
      extraSeries[month] = completedMonthExtra(
        transactionsRepo,
        incomes,
        monthStart(year, month),
        now,
      );
    }
  }

  const totalSeries = intentionalSeries.map((value, idx) => value + (extraSeries[idx] ?? 0));
  let running = 0;
  const cumulativeSeries = totalSeries.map(value => (running += value));
  const intentional = intentionalSeries.reduce((sum, value) => sum + value, 0);
  const extra = extraSeries.reduce((sum, value) => sum + value, 0);

  return {
    categoryIds,
    intentional,
    extra,
    total: intentional + extra,
    intentionalSeries,
    extraSeries,
    totalSeries,
    cumulativeSeries,
  };
}
