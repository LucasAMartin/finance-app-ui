import type { Transaction, Category, Budget } from '../repositories/types';
import type { Period } from './finance';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PeriodRange {
  from: Date;
  to: Date;
  label: string;
}

export interface SpendingRanges {
  current: PeriodRange;
  prev: PeriodRange;
}

/** Handed off from SpendingScreen → App.tsx → ActivityScreen to pre-apply filters on drill-in. */
export interface ActivityInitialFilter {
  catIds?: string[];
  merchantQuery?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface CatRow {
  cat: string;
  label: string;
  icon: string;
  spent: number;
  prevSpent: number;
  budget: number;   // prorated to the period (0 = unknown)
  pct: number;      // fraction of period total
  txCount: number;
}

export interface MerchantRow {
  merchant: string;
  cat: string;
  icon: string;
  spent: number;
  prevSpent: number;
  pct: number;
  txCount: number;
}

export interface TrendBin {
  label: string;
  v: number;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, n: number): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Monday-anchored week start
function startOfWeekMon(d: Date): Date {
  const dow = d.getDay(); // 0=Sun
  return addDays(d, -(dow === 0 ? 6 : dow - 1));
}

function weekLabel(from: Date): string {
  const to = addDays(from, 6);
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()}–${to.getDate()} ${MONTHS_ABBR[from.getMonth()]}`;
  }
  return `${from.getDate()} ${MONTHS_ABBR[from.getMonth()]}–${to.getDate()} ${MONTHS_ABBR[to.getMonth()]}`;
}

// ─── Period range derivation ──────────────────────────────────────────────────

export function derivePeriodRanges(
  period: Period,
  dateIdx: number,
  now = new Date(),
): SpendingRanges {
  if (period === 'Week') {
    const weekStart = startOfWeekMon(now);
    const currentFrom = addDays(weekStart, -dateIdx * 7);
    const currentTo   = endOfDay(addDays(currentFrom, 6));
    const prevFrom    = addDays(currentFrom, -7);
    const prevTo      = endOfDay(addDays(prevFrom, 6));
    return {
      current: { from: currentFrom, to: currentTo, label: weekLabel(currentFrom) },
      prev:    { from: prevFrom,    to: prevTo,    label: weekLabel(prevFrom)    },
    };
  }

  if (period === 'Month') {
    const base = new Date(now.getFullYear(), now.getMonth() - dateIdx, 1);
    const currentFrom = new Date(base.getFullYear(), base.getMonth(), 1);
    const currentTo   = endOfDay(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    const prevFrom    = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const prevTo      = endOfDay(new Date(base.getFullYear(), base.getMonth(), 0));
    return {
      current: { from: currentFrom, to: currentTo, label: `${MONTHS_FULL[currentFrom.getMonth()]} ${currentFrom.getFullYear()}` },
      prev:    { from: prevFrom,    to: prevTo,    label: `${MONTHS_FULL[prevFrom.getMonth()]} ${prevFrom.getFullYear()}` },
    };
  }

  // Year
  const year = now.getFullYear() - dateIdx;
  return {
    current: { from: new Date(year, 0, 1),     to: endOfDay(new Date(year, 11, 31)),     label: String(year)     },
    prev:    { from: new Date(year - 1, 0, 1), to: endOfDay(new Date(year - 1, 11, 31)), label: String(year - 1) },
  };
}

export function generateDateOptions(period: Period, now = new Date()): string[] {
  const counts: Record<Period, number> = { Week: 6, Month: 12, Year: 3 };
  return Array.from({ length: counts[period] }, (_, i) =>
    derivePeriodRanges(period, i, now).current.label,
  );
}

// ─── Transaction filtering ────────────────────────────────────────────────────

export function filterByRange(
  transactions: Transaction[],
  from: Date,
  to: Date,
): Transaction[] {
  return transactions.filter(t => {
    if (!t.occurredAt) return false;
    const d = new Date(t.occurredAt);
    return d >= from && d <= to;
  });
}

// ─── Budget proration ─────────────────────────────────────────────────────────

export function proratedBudget(monthlyBudget: number, period: Period): number {
  if (period === 'Month') return monthlyBudget;
  if (period === 'Week')  return Math.round(monthlyBudget * 7 / 30.44);
  return monthlyBudget * 12;
}

// ─── Category breakdown ───────────────────────────────────────────────────────

export function categorySpending(
  transactions: Transaction[],
  categories: Category[],
  budgets: Budget[],
  ranges: SpendingRanges,
  period: Period,
): { total: number; prevTotal: number; rows: CatRow[] } {
  const curr = filterByRange(transactions, ranges.current.from, ranges.current.to);
  const prev = filterByRange(transactions, ranges.prev.from,    ranges.prev.to);

  const tally = (txs: Transaction[]) =>
    txs.reduce<Record<string, { sum: number; count: number }>>((acc, t) => {
      if (!acc[t.cat]) acc[t.cat] = { sum: 0, count: 0 };
      acc[t.cat].sum += t.amount;
      acc[t.cat].count++;
      return acc;
    }, {});

  const currMap  = tally(curr);
  const prevMap  = tally(prev);
  const catById  = Object.fromEntries(categories.map(c => [c.id, c]));

  const total     = Object.values(currMap).reduce((s, v) => s + v.sum, 0);
  const prevTotal = Object.values(prevMap).reduce((s, v) => s + v.sum, 0);

  const rows: CatRow[] = Object.keys(currMap).map(catId => {
    const cat = catById[catId];
    // Look for an explicit per-category budget entry first; fall back to defaultBudget.
    const monthlyBudget =
      budgets.find(b => b.category === catId && b.meta?.kind !== 'monthly-budget')?.amount
      ?? cat?.defaultBudget
      ?? 0;
    const spent = currMap[catId].sum;
    return {
      cat:       catId,
      label:     cat?.label  ?? catId,
      icon:      cat?.icon   ?? 'tag',
      spent,
      prevSpent: prevMap[catId]?.sum ?? 0,
      budget:    proratedBudget(monthlyBudget, period),
      pct:       total > 0 ? spent / total : 0,
      txCount:   currMap[catId].count,
    };
  }).sort((a, b) => b.spent - a.spent);

  return { total, prevTotal, rows };
}

// ─── Merchant breakdown ───────────────────────────────────────────────────────

export function merchantSpending(
  transactions: Transaction[],
  categories: Category[],
  ranges: SpendingRanges,
): { total: number; prevTotal: number; rows: MerchantRow[] } {
  const curr = filterByRange(transactions, ranges.current.from, ranges.current.to);
  const prev = filterByRange(transactions, ranges.prev.from,    ranges.prev.to);

  const tally = (txs: Transaction[]) =>
    txs.reduce<Record<string, { sum: number; count: number; cat: string }>>((acc, t) => {
      if (!acc[t.merchant]) acc[t.merchant] = { sum: 0, count: 0, cat: t.cat };
      acc[t.merchant].sum += t.amount;
      acc[t.merchant].count++;
      return acc;
    }, {});

  const currMap  = tally(curr);
  const prevMap  = tally(prev);
  const catById  = Object.fromEntries(categories.map(c => [c.id, c]));

  const total     = Object.values(currMap).reduce((s, v) => s + v.sum, 0);
  const prevTotal = Object.values(prevMap).reduce((s, v) => s + v.sum, 0);

  const rows: MerchantRow[] = Object.keys(currMap).map(merchant => {
    const d   = currMap[merchant];
    const cat = catById[d.cat];
    return {
      merchant,
      cat:       d.cat,
      icon:      cat?.icon ?? 'tag',
      spent:     d.sum,
      prevSpent: prevMap[merchant]?.sum ?? 0,
      pct:       total > 0 ? d.sum / total : 0,
      txCount:   d.count,
    };
  }).sort((a, b) => b.spent - a.spent);

  return { total, prevTotal, rows };
}

// ─── Trend data for charts ────────────────────────────────────────────────────

export function spendingTrend(
  transactions: Transaction[],
  ranges: SpendingRanges,
  period: Period,
  monthlyBudget: number,
): { data: TrendBin[]; budget: number } {
  const curr = filterByRange(transactions, ranges.current.from, ranges.current.to);

  if (period === 'Week') {
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = DAY_LABELS.map((label, i) => {
      const dayFrom = addDays(ranges.current.from, i);
      const dayTo   = endOfDay(dayFrom);
      const v = filterByRange(curr, dayFrom, dayTo).reduce((s, t) => s + t.amount, 0);
      return { label, v };
    });
    const dailyBudget = Math.round(proratedBudget(monthlyBudget, 'Week') / 7);
    return { data, budget: dailyBudget };
  }

  if (period === 'Month') {
    const data: TrendBin[] = [];
    let cursor = startOfDay(ranges.current.from);
    let wk = 1;
    while (cursor <= ranges.current.to && wk <= 5) {
      const weekEnd = endOfDay(addDays(cursor, 6));
      const clampedEnd = weekEnd > ranges.current.to ? ranges.current.to : weekEnd;
      const v = filterByRange(curr, cursor, clampedEnd).reduce((s, t) => s + t.amount, 0);
      data.push({ label: `Wk${wk}`, v });
      cursor = addDays(cursor, 7);
      wk++;
    }
    return { data, budget: Math.round(monthlyBudget / 4) };
  }

  // Year — monthly bins
  const year = ranges.current.from.getFullYear();
  const data = MONTHS_ABBR.map((label, m) => {
    const from = new Date(year, m, 1);
    const to   = endOfDay(new Date(year, m + 1, 0));
    const v    = filterByRange(curr, from, to).reduce((s, t) => s + t.amount, 0);
    return { label, v };
  });
  return { data, budget: monthlyBudget };
}
