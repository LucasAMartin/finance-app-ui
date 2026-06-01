import {
  DEFAULT_MONTHLY_BUDGET,
  SEED_MONTH_BUDGETS,
  SEED_PERIOD_DATA,
  SEED_SPARK_7D,
  SEED_SPEND_GROUPS,
  SEED_TREND,
} from '../data';
import type { Bill, Budget, Category, CreateTransactionInput, GroupKey, Income, RecurringRule, SpendGroup, Transaction, MonthBudget } from '../repositories/types';
import type { PeriodData, TrendConfig } from './types';

export type Period = 'Week' | 'Month' | 'Year';

// Snapshot a transaction back into a create-input so a deleted row can be
// re-created verbatim for undo. The new row gets a fresh id (invisible to the
// user); `occurredAt` carries the original date/time so derived fields rebuild.
export function txToCreateInput(t: Transaction): CreateTransactionInput {
  return {
    merchant: t.merchant,
    cat: t.cat,
    amount: t.amount,
    type: t.type ?? 'expense',
    note: t.note,
    occurredAt: t.occurredAt,
    recurring: t.recurring,
    recurringRuleId: t.recurringRuleId,
    visibility: t.visibility,
    createdByUserId: t.createdByUserId,
    updatedByUserId: t.updatedByUserId,
    meta: t.meta,
  };
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

function categoryTotal(transactions: Transaction[], cat: string | undefined): number {
  if (!cat) return 0;
  return transactions
    .filter(tx => tx.type !== 'income' && tx.cat === cat)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function incomeActiveInMonth(income: Income, monthKey: string): boolean {
  const { start, end } = monthBounds(monthKey);
  const startsBeforeMonthEnds = income.startDate.slice(0, 10) <= end;
  const endsAfterMonthStarts = !income.endDate || income.endDate.slice(0, 10) >= start;
  return startsBeforeMonthEnds && endsAfterMonthStarts;
}

export function monthlyIncome(incomes: Income[], monthKey = currentMonthKey()): number {
  const regular = incomes.filter(income => (
    (income.kind ?? 'regular') === 'regular' && incomeActiveInMonth(income, monthKey)
  ));
  return regular.reduce((sum, income) => {
    switch (income.cadence) {
      case 'weekly': return sum + Math.round(income.amount * 52 / 12);
      case 'biweekly': return sum + Math.round(income.amount * 26 / 12);
      case 'annual': return sum + Math.round(income.amount / 12);
      default: return sum + income.amount;
    }
  }, 0);
}

export function currentMonthlyBudget(budgets: Budget[], monthKey = currentMonthKey()): number {
  const monthly = budgets.find(b => b.month === monthKey && b.meta?.kind === 'monthly-budget')
    ?? budgets.find(b => b.meta?.kind === 'monthly-budget');
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
  groupKey: GroupKey,
  budgets: Budget[] = [],
  categories: Category[] = [],
): SpendGroup | undefined {
  return spendGroups(transactions, budgets, categories).find(group => group.key === groupKey);
}

export function spendGroups(transactions: Transaction[], budgets: Budget[] = [], categories: Category[] = [], month = '2026-05'): SpendGroup[] {
  const activeCategories = categories.length > 0
    ? categories.filter(cat => !cat.archived)
    : SEED_SPEND_GROUPS.flatMap(g => g.subs.map((sub, idx) => ({
      id: sub.cat,
      label: sub.label,
      icon: sub.icon,
      group: g.key,
      defaultBudget: sub.budget,
      sortOrder: idx,
    } as Category)));

  const groupLabels: Record<GroupKey, string> = { needs: 'Needs', wants: 'Wants', savings: 'Savings' };
  const targetPct: Record<GroupKey, number> = { needs: 0.5, wants: 0.3, savings: 0.2 };
  return (['needs', 'wants', 'savings'] as GroupKey[]).map(groupKey => ({
    key: groupKey,
    label: groupLabels[groupKey],
    targetPct: targetPct[groupKey],
    subs: activeCategories
      .filter(cat => cat.group === groupKey)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map(cat => {
      const budget = budgets.find(b => (b.category === cat.id || b.label === cat.label) && b.month === month);
      return {
        cat: cat.id,
        label: cat.label,
        icon: cat.icon,
        budget: budget?.amount ?? cat.defaultBudget,
        spent: roundMoney(categoryTotal(transactions, cat.id)),
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function upcomingBillsFromRecurring(rules: RecurringRule[], categories: Category[], today = new Date()): Bill[] {
  const categoryMap = Object.fromEntries(categories.map(cat => [cat.id, cat]));
  return rules
    .filter(rule => rule.active)
    .map(rule => {
      const due = nextDueDate(rule, today);
      const daysUntil = Math.max(0, Math.ceil((startOfDay(due).getTime() - startOfDay(today).getTime()) / 86_400_000));
      const cat = categoryMap[rule.cat];
      const partialPaid = (rule.meta?.partialPaid as number | undefined) ?? 0;
      return {
        id: `bill-${rule.id}`,
        name: rule.merchant,
        merchant: rule.merchant,
        icon: cat?.icon ?? 'repeat',
        cat: rule.cat,
        amount: Math.max(0, rule.amount - partialPaid),
        dueDate: `${MONTHS[due.getMonth()]} ${due.getDate()}`,
        daysUntil,
        recurring: true,
        estimate: rule.estimate,
        meta: { recurringRuleId: rule.id },
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function advanceDueDate(rule: RecurringRule): string {
  const d = new Date(rule.nextDueDate);
  if (rule.cadence === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (rule.cadence === 'annual') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
    if (rule.dayOfMonth) d.setDate(Math.min(rule.dayOfMonth, 28));
  }
  return d.toISOString();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nextDueDate(rule: RecurringRule, today: Date): Date {
  const due = new Date(rule.nextDueDate);
  if (due >= startOfDay(today)) return due;

  const next = new Date(due);
  while (next < startOfDay(today)) {
    if (rule.cadence === 'weekly') next.setDate(next.getDate() + 7);
    else if (rule.cadence === 'annual') next.setFullYear(next.getFullYear() + 1);
    else {
      next.setMonth(next.getMonth() + 1);
      if (rule.dayOfMonth) next.setDate(Math.min(rule.dayOfMonth, 28));
    }
  }
  return next;
}

export function monthBudgets(transactions: Transaction[], budgets: Budget[] = []): MonthBudget[] {
  const monthKey = currentMonthKey();
  const monthlyBudget = currentMonthlyBudget(budgets, monthKey);
  const transactionTotal = transactions
    .filter(tx => tx.type !== 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - now.getDate());
  const currentMonthLabel = now.toLocaleString('en-US', { month: 'long' });
  return SEED_MONTH_BUDGETS.map((month, idx) => {
    if (idx !== 0) {
      const d = new Date(now.getFullYear(), now.getMonth() - idx, 1);
      return {
        ...month,
        key: d.toISOString().slice(0, 7),
        month: d.toLocaleString('en-US', { month: 'long' }),
      };
    }
    const spent = roundMoney(transactionTotal);
    return {
      ...month,
      key: monthKey,
      month: currentMonthLabel,
      spent,
      budget: monthlyBudget,
      expectedPct: now.getDate() / daysInMonth,
      remainingLabel: daysRemaining === 0
        ? 'Month complete'
        : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`,
    };
  });
}
