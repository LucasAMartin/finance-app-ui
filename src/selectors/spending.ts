import type { Transaction, Category, Budget, RecurringRule, SpendSeriesPoint, SpendBucket } from '../repositories/types';
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

/** Handed off from InsightsScreen → App.tsx → ActivityScreen to pre-apply filters on drill-in. */
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
  budget: number;        // prorated to the period (0 = unknown)
  pct: number;           // fraction of period total
  txCount: number;
  // Fixed = recurring bills/subscriptions; variable = discretionary. Split so
  // insights can compare like-for-like instead of letting a lumpy monthly bill
  // masquerade as a spending spike.
  fixedSpent: number;
  variableSpent: number;
  prevVariableSpent: number;
  recurring: boolean;    // category contains at least one recurring charge
}

export interface MerchantRow {
  merchant: string;
  cat: string;
  icon: string;
  spent: number;
  prevSpent: number;
  pct: number;
  txCount: number;
  recurring: boolean;    // merchant is a recurring bill/subscription
}

export interface TrendBin {
  label: string;
  v: number;
  // Even per-bin reference (monthly plan spread flat) — drives the bar chart's
  // dashed line and keeps its y-scale stable.
  budget: number;
  // Timing-aware plan: an even slice of the *variable* budget plus any fixed
  // charges actually scheduled inside the bin's date range. The cumulative pace
  // line uses this so it steps up on a bill day instead of assuming flat spend —
  // which is what stops a rent payment from faking an "above pace" alarm.
  plan: number;
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

// ─── Recurring / fixed-cost helpers ───────────────────────────────────────────

/**
 * A transaction is "fixed" if it's a recurring bill or subscription. We trust an
 * explicit flag/link first, then fall back to matching the merchant against an
 * active recurring rule (seed data predates the flag).
 */
export function makeRecurringMatcher(
  rules: RecurringRule[],
): (tx: Transaction) => boolean {
  const activeMerchants = new Set(
    rules.filter(r => r.active).map(r => r.merchant.trim().toLowerCase()),
  );
  return (tx) =>
    tx.recurring === true ||
    !!tx.recurringRuleId ||
    activeMerchants.has(tx.merchant.trim().toLowerCase());
}

/** Normalise a rule's charge to a per-month figure regardless of cadence. */
export function ruleMonthlyAmount(rule: RecurringRule): number {
  switch (rule.cadence) {
    case 'weekly': return rule.amount * 52 / 12;
    case 'annual': return rule.amount / 12;
    default:       return rule.amount; // monthly / customMonthly
  }
}

/** Total committed fixed spend per month across all active rules. */
export function fixedMonthlyTotal(rules: RecurringRule[]): number {
  return rules
    .filter(r => r.active)
    .reduce((sum, r) => sum + ruleMonthlyAmount(r), 0);
}

function stepRule(rule: RecurringRule, cursor: Date, dir: 1 | -1): void {
  if (rule.cadence === 'weekly') {
    cursor.setDate(cursor.getDate() + 7 * dir);
  } else if (rule.cadence === 'annual') {
    cursor.setFullYear(cursor.getFullYear() + dir);
  } else {
    cursor.setMonth(cursor.getMonth() + dir);
    if (rule.dayOfMonth) cursor.setDate(Math.min(rule.dayOfMonth, 28));
  }
}

/** Every due date for a rule that falls within [from, to]. */
function ruleOccurrencesInRange(rule: RecurringRule, from: Date, to: Date): Date[] {
  const cursor = new Date(rule.nextDueDate);
  let guard = 0;
  while (cursor > from && guard++ < 600) stepRule(rule, cursor, -1);
  const out: Date[] = [];
  guard = 0;
  while (cursor <= to && guard++ < 600) {
    if (cursor >= from && cursor <= to) out.push(new Date(cursor));
    stepRule(rule, cursor, 1);
  }
  return out;
}

/** Sum of fixed charges scheduled to land inside [from, to]. */
export function scheduledFixedInRange(
  rules: RecurringRule[],
  from: Date,
  to: Date,
): number {
  if (to < from) return 0;
  return rules
    .filter(r => r.active)
    .reduce(
      (sum, r) => sum + ruleOccurrencesInRange(r, from, to).length * r.amount,
      0,
    );
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

// ─── Spend series bucketing ───────────────────────────────────────────────────

/**
 * Fold the repository's ordered spend buckets into the fixed-length numeric
 * series the hero line chart expects: one slot per day (Week/Month) or per
 * month index 0–11 (Year). Mirrors the previous inline bucketing so the chart
 * renders identically, but without iterating every transaction.
 */
export function spendSeriesToBuckets(
  points: SpendSeriesPoint[],
  period: Period,
  from: Date,
  to: Date,
): number[] {
  if (period === 'Year') {
    const months = new Array(12).fill(0);
    points.forEach(pt => {
      const m = Number(pt.key.slice(5, 7)) - 1; // 'YYYY-MM'
      if (m >= 0 && m < 12) months[m] += pt.amount;
    });
    return months;
  }
  const dayMs = 86_400_000;
  const start = startOfDay(from);
  const days = Math.max(
    1,
    Math.round((startOfDay(to).getTime() - start.getTime()) / dayMs) + 1,
  );
  const arr = new Array(days).fill(0);
  points.forEach(pt => {
    const [y, m, d] = pt.key.split('-').map(Number); // 'YYYY-MM-DD'
    const idx = Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / dayMs);
    if (idx >= 0 && idx < days) arr[idx] += pt.amount;
  });
  return arr;
}

// ─── Spending-trend tile bucketing (timeframe-aware) ──────────────────────────

/**
 * The Insights "Spending trends" tile uses its own granularity — independent of
 * the screen's Week/Month/Year period — so each timeframe lands at a handful of
 * fat, legible bars in a half-width tile:
 *   1W → 7 daily bars · 1M → 4 weekly bars · 6M → 6 monthly bars · 1Y → 4 quarters
 * 6M and 1Y both map to the "Year" period elsewhere, so they're distinguished
 * here rather than reusing the shared period ranges.
 */
export type TrendTimeframe = '1W' | '1M' | '6M' | '1Y';

export interface TrendSlot {
  label: string;
  from: Date;
  to: Date;
}

export interface TrendConfig {
  /** Overall span to query (one getSpendSeries call covers every slot). */
  from: Date;
  to: Date;
  /** Granularity to request from the repo before folding into slots. */
  bucket: SpendBucket;
  slots: TrendSlot[];
}

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday-anchored

export function trendTimeframeConfig(
  timeframe: TrendTimeframe,
  now = new Date(),
): TrendConfig {
  if (timeframe === '1W') {
    const weekStart = startOfWeekMon(now);
    const slots = Array.from({ length: 7 }, (_, i) => {
      const from = addDays(weekStart, i);
      return { label: WEEKDAY_INITIALS[i], from, to: endOfDay(from) };
    });
    return { from: weekStart, to: endOfDay(addDays(weekStart, 6)), bucket: 'day', slots };
  }

  if (timeframe === '1M') {
    // Current calendar month split into 4 contiguous ~7–8 day slots.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const slots = Array.from({ length: 4 }, (_, i) => {
      const startDay = Math.round((daysInMonth * i) / 4);
      const endDay = Math.round((daysInMonth * (i + 1)) / 4) - 1;
      return {
        label: `W${i + 1}`,
        from: addDays(monthStart, startDay),
        to: endOfDay(addDays(monthStart, endDay)),
      };
    });
    return {
      from: monthStart,
      to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      bucket: 'day',
      slots,
    };
  }

  if (timeframe === '6M') {
    // Trailing 6 calendar months, oldest → current.
    const slots = Array.from({ length: 6 }, (_, i) => {
      const m = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        label: MONTHS_ABBR[m.getMonth()][0],
        from: new Date(m.getFullYear(), m.getMonth(), 1),
        to: endOfDay(new Date(m.getFullYear(), m.getMonth() + 1, 0)),
      };
    });
    return { from: slots[0].from, to: slots[5].to, bucket: 'month', slots };
  }

  // 1Y → current calendar year, split into four quarters.
  const year = now.getFullYear();
  const slots = Array.from({ length: 4 }, (_, i) => ({
    label: `Q${i + 1}`,
    from: new Date(year, i * 3, 1),
    to: endOfDay(new Date(year, i * 3 + 3, 0)),
  }));
  return {
    from: new Date(year, 0, 1),
    to: endOfDay(new Date(year, 11, 31)),
    bucket: 'month',
    slots,
  };
}

/** Fold the repo's ordered spend points into per-slot totals. */
export function foldTrendSeries(
  points: SpendSeriesPoint[],
  slots: TrendSlot[],
): number[] {
  const vals = new Array(slots.length).fill(0);
  points.forEach(pt => {
    const [y, m, d] = pt.key.split('-').map(Number); // 'YYYY-MM' or 'YYYY-MM-DD'
    const date = new Date(y, m - 1, d ?? 1);
    for (let i = 0; i < slots.length; i++) {
      if (date >= slots[i].from && date <= slots[i].to) {
        vals[i] += pt.amount;
        break;
      }
    }
  });
  return vals;
}

// ─── Trailing period-over-period trend (Insights "Spending trends" detail) ────

/**
 * The Spending-trends *detail* answers a different question from the Spent
 * chart: not "where am I in this period" but "is my spending rising or falling
 * across periods". So it plots a rolling window of whole past periods ending
 * now — one bar per week/month/quarter — rather than one period broken into
 * buckets. `count` is the maximum window; callers trim leading empty buckets
 * for users whose history doesn't fill it yet.
 */
export type TrendGrain = 'week' | 'month' | 'quarter';

export interface TrailingTrend {
  /** Repo granularity to query before folding into slots. */
  bucket: SpendBucket;
  from: Date;
  to: Date;
  slots: TrendSlot[];
}

export function trailingTrendBuckets(
  grain: TrendGrain,
  count: number,
  now = new Date(),
): TrailingTrend {
  const slots: TrendSlot[] = [];

  if (grain === 'week') {
    const thisWeek = startOfWeekMon(now);
    for (let i = count - 1; i >= 0; i--) {
      const from = addDays(thisWeek, -7 * i);
      const to = endOfDay(addDays(from, 6));
      slots.push({ from, to, label: `${from.getMonth() + 1}/${from.getDate()}` });
    }
    return { bucket: 'day', from: slots[0].from, to: slots[slots.length - 1].to, slots };
  }

  if (grain === 'month') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      slots.push({
        from: new Date(d.getFullYear(), d.getMonth(), 1),
        to: endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
        label: MONTHS_ABBR[d.getMonth()],
      });
    }
    return { bucket: 'month', from: slots[0].from, to: slots[slots.length - 1].to, slots };
  }

  // quarter
  const curQ = Math.floor(now.getMonth() / 3);
  for (let i = count - 1; i >= 0; i--) {
    const abs = now.getFullYear() * 4 + curQ - i;
    const qy = Math.floor(abs / 4);
    const q = ((abs % 4) + 4) % 4;
    slots.push({
      from: new Date(qy, q * 3, 1),
      to: endOfDay(new Date(qy, q * 3 + 3, 0)),
      label: `Q${q + 1}`,
    });
  }
  return { bucket: 'month', from: slots[0].from, to: slots[slots.length - 1].to, slots };
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

export interface CategoryBreakdown {
  total: number;
  prevTotal: number;
  /** Spend split so pace/comparison logic can isolate the controllable part. */
  fixedTotal: number;
  variableTotal: number;
  prevVariableTotal: number;
  rows: CatRow[];
}

export function categorySpending(
  transactions: Transaction[],
  categories: Category[],
  budgets: Budget[],
  ranges: SpendingRanges,
  period: Period,
  recurringRules: RecurringRule[] = [],
): CategoryBreakdown {
  const curr = filterByRange(transactions, ranges.current.from, ranges.current.to);
  const prev = filterByRange(transactions, ranges.prev.from,    ranges.prev.to);
  const isRecurring = makeRecurringMatcher(recurringRules);

  type Tally = { sum: number; count: number; fixed: number; variable: number; recurring: boolean };
  const tally = (txs: Transaction[]) =>
    txs.reduce<Record<string, Tally>>((acc, t) => {
      if (!acc[t.cat]) acc[t.cat] = { sum: 0, count: 0, fixed: 0, variable: 0, recurring: false };
      const bucket = acc[t.cat];
      bucket.sum += t.amount;
      bucket.count++;
      if (isRecurring(t)) { bucket.fixed += t.amount; bucket.recurring = true; }
      else                  bucket.variable += t.amount;
      return acc;
    }, {});

  const currMap  = tally(curr);
  const prevMap  = tally(prev);
  const catById  = Object.fromEntries(categories.map(c => [c.id, c]));

  const sumField = (map: Record<string, Tally>, field: keyof Tally) =>
    Object.values(map).reduce((s, v) => s + (v[field] as number), 0);

  const total             = sumField(currMap, 'sum');
  const prevTotal         = sumField(prevMap, 'sum');
  const fixedTotal        = sumField(currMap, 'fixed');
  const variableTotal     = sumField(currMap, 'variable');
  const prevVariableTotal = sumField(prevMap, 'variable');

  const rows: CatRow[] = Object.keys(currMap).map(catId => {
    const cat = catById[catId];
    // Look for an explicit per-category budget entry first; fall back to defaultBudget.
    const monthlyBudget =
      budgets.find(b => b.category === catId && b.meta?.kind !== 'monthly-budget')?.amount
      ?? cat?.defaultBudget
      ?? 0;
    const bucket = currMap[catId];
    return {
      cat:               catId,
      label:             cat?.label  ?? catId,
      icon:              cat?.icon   ?? 'tag',
      spent:             bucket.sum,
      prevSpent:         prevMap[catId]?.sum ?? 0,
      budget:            proratedBudget(monthlyBudget, period),
      pct:               total > 0 ? bucket.sum / total : 0,
      txCount:           bucket.count,
      fixedSpent:        bucket.fixed,
      variableSpent:     bucket.variable,
      prevVariableSpent: prevMap[catId]?.variable ?? 0,
      recurring:         bucket.recurring,
    };
  }).sort((a, b) => b.spent - a.spent);

  return { total, prevTotal, fixedTotal, variableTotal, prevVariableTotal, rows };
}

// ─── Merchant breakdown ───────────────────────────────────────────────────────

export function merchantSpending(
  transactions: Transaction[],
  categories: Category[],
  ranges: SpendingRanges,
  recurringRules: RecurringRule[] = [],
): { total: number; prevTotal: number; rows: MerchantRow[] } {
  const curr = filterByRange(transactions, ranges.current.from, ranges.current.to);
  const prev = filterByRange(transactions, ranges.prev.from,    ranges.prev.to);
  const isRecurring = makeRecurringMatcher(recurringRules);

  const tally = (txs: Transaction[]) =>
    txs.reduce<Record<string, { sum: number; count: number; cat: string; recurring: boolean }>>((acc, t) => {
      if (!acc[t.merchant]) acc[t.merchant] = { sum: 0, count: 0, cat: t.cat, recurring: false };
      acc[t.merchant].sum += t.amount;
      acc[t.merchant].count++;
      if (isRecurring(t)) acc[t.merchant].recurring = true;
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
      recurring: d.recurring,
    };
  }).sort((a, b) => b.spent - a.spent);

  return { total, prevTotal, rows };
}

// ─── Trend data for charts ────────────────────────────────────────────────────

/** Whole days spanned by [from, to] (endOfDay-inclusive). */
function dayCount(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - startOfDay(from).getTime()) / 86_400_000));
}

export function spendingTrend(
  transactions: Transaction[],
  ranges: SpendingRanges,
  period: Period,
  monthlyBudget: number,
  recurringRules: RecurringRule[] = [],
): { data: TrendBin[]; budget: number } {
  const curr = filterByRange(transactions, ranges.current.from, ranges.current.to);

  // Split the monthly plan into its committed (fixed) and discretionary
  // (variable) halves. Variable is spread evenly per day; fixed is dropped into
  // the exact bin where each bill is scheduled. The result: a plan line that
  // steps up on a rent/bill day instead of pretending spend is flat.
  const fixedMonthly = fixedMonthlyTotal(recurringRules);
  const variableMonthly = Math.max(0, monthlyBudget - fixedMonthly);
  const dailyVariable = variableMonthly / 30.44;
  const binPlan = (from: Date, to: Date) =>
    dailyVariable * dayCount(from, to) + scheduledFixedInRange(recurringRules, from, to);

  if (period === 'Week') {
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const flat = Math.round(proratedBudget(monthlyBudget, 'Week') / 7);
    const data = DAY_LABELS.map((label, i) => {
      const dayFrom = addDays(ranges.current.from, i);
      const dayTo   = endOfDay(dayFrom);
      const v = filterByRange(curr, dayFrom, dayTo).reduce((s, t) => s + t.amount, 0);
      return { label, v, budget: flat, plan: binPlan(dayFrom, dayTo) };
    });
    return { data, budget: flat };
  }

  if (period === 'Month') {
    const flat = Math.round(monthlyBudget / 4);
    const data: TrendBin[] = [];
    let cursor = startOfDay(ranges.current.from);
    let wk = 1;
    while (cursor <= ranges.current.to && wk <= 5) {
      const weekEnd = endOfDay(addDays(cursor, 6));
      const clampedEnd = weekEnd > ranges.current.to ? ranges.current.to : weekEnd;
      const v = filterByRange(curr, cursor, clampedEnd).reduce((s, t) => s + t.amount, 0);
      data.push({ label: `Wk${wk}`, v, budget: flat, plan: binPlan(cursor, clampedEnd) });
      cursor = addDays(cursor, 7);
      wk++;
    }
    return { data, budget: flat };
  }

  // Year — monthly bins
  const year = ranges.current.from.getFullYear();
  const data = MONTHS_ABBR.map((label, m) => {
    const from = new Date(year, m, 1);
    const to   = endOfDay(new Date(year, m + 1, 0));
    const v    = filterByRange(curr, from, to).reduce((s, t) => s + t.amount, 0);
    return { label, v, budget: monthlyBudget, plan: binPlan(from, to) };
  });
  return { data, budget: monthlyBudget };
}
