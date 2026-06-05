import type { AppSettings, Bill, Budget, Category, Income, RecurringRule, SpendGroup, Transaction, MonthBudget } from './repositories/types';
import type { PeriodData, TrendConfig } from './selectors/types';

export const SEED_CATEGORIES: Category[] = [
  { id: 'groceries',     label: 'Groceries',     icon: 'cart', group: 'needs',   defaultBudget: 500, sortOrder: 10 },
  { id: 'transport',     label: 'Transport',     icon: 'car',  group: 'needs',   defaultBudget: 360, sortOrder: 20 },
  { id: 'bills',         label: 'Bills',         icon: 'doc',  group: 'needs',   defaultBudget: 500, sortOrder: 30 },
  { id: 'housing',       label: 'Housing',       icon: 'home', group: 'needs',   defaultBudget: 1350, sortOrder: 40 },
  { id: 'dining',        label: 'Dining',        icon: 'fork', group: 'wants',   defaultBudget: 440, sortOrder: 50 },
  { id: 'shopping',      label: 'Shopping',      icon: 'bag',  group: 'wants',   defaultBudget: 300, sortOrder: 60 },
  { id: 'entertainment', label: 'Entertainment', icon: 'film', group: 'wants',   defaultBudget: 180, sortOrder: 70 },
  { id: 'emergency-fund', label: 'Emergency fund', icon: 'tag', group: 'savings', defaultBudget: 650, sortOrder: 80 },
  { id: 'retirement',    label: 'Retirement',    icon: 'repeat', group: 'savings', defaultBudget: 415, sortOrder: 90 },
];

export const CATS: Record<string, { label: string; icon: string; budget: number }> = Object.fromEntries(
  SEED_CATEGORIES.map(cat => [cat.id, { label: cat.label, icon: cat.icon, budget: cat.defaultBudget }]),
);

// ─────────────────────────────────────────────────────────────
// Transactions — ~6 months of realistic day-to-day activity.
//
// Authored relative to a fixed anchor (2026-05-13); `shiftedSeedDate`
// re-anchors the newest row to "today" at seed time, so the set always spans
// roughly the last six months ending today. Generated deterministically with a
// seeded PRNG so occurredAt values — and every figure derived from them — stay
// stable across runs.
// ─────────────────────────────────────────────────────────────
const SEED_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildSeedTransactions(): Transaction[] {
  const anchor = new Date(2026, 4, 13, 12, 0, 0); // newest row → today after shifting
  const start = new Date(2025, 10, 13, 12, 0, 0); // ~6 months earlier
  const dayMs = 86_400_000;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Tiny deterministic LCG so the seed (and all derived totals) is reproducible.
  let s = 0x9e3779b9 >>> 0;
  const rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const amt = (min: number, max: number) => Math.round((min + rng() * (max - min)) * 100) / 100;
  const hit = (p: number) => rng() < p;

  const txs: Transaction[] = [];
  let id = 0;

  const add = (
    day: Date,
    hour: number,
    cat: string,
    merchant: string,
    amount: number,
    note: string,
    fixed = false,
    ruleId?: string,
  ) => {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(rng() * 60));
    const days = Math.round((startOfDay(anchor).getTime() - startOfDay(at).getTime()) / dayMs);
    const when: Transaction['when'] = days <= 0 ? 'today' : days === 1 ? 'yesterday' : 'earlier';
    const fullDate = `${SEED_MONTHS[at.getMonth()]} ${at.getDate()}`;
    txs.push({
      id: `s${++id}`,
      merchant,
      cat,
      amount,
      type: 'expense',
      note,
      date: when === 'today' ? 'Today' : when === 'yesterday' ? 'Yesterday' : fullDate,
      time: at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      when,
      fullDate,
      occurredAt: at.toISOString(),
      ...(fixed ? { recurring: true } : {}),
      ...(ruleId ? { recurringRuleId: ruleId } : {}),
    });
  };

  const COFFEE = ['Blue Bottle', 'Sightglass', 'Philz Coffee', 'Ritual Coffee', 'Verve'];
  const LUNCH = ['Sweetgreen', 'Chipotle', 'Mixt', 'Souvla', 'Tartine', 'Curry Up Now'];
  const DINNER = ['Nopa', 'Zuni Café', 'Foreign Cinema', 'Delfina', 'Rintaro', 'State Bird'];
  const GROCERS = ['Whole Foods', "Trader Joe's", 'Safeway', 'Berkeley Bowl', 'Bi-Rite'];
  const RIDES = ['Lyft', 'Uber'];
  const SHOPS = ['Amazon', 'Apple Store', 'Uniqlo', 'REI', 'Target', 'Muji', 'Nike'];
  const FUN = ['AMC Theatres', 'Steam', 'Kindle Store', 'Ticketmaster', 'PlayStation Store'];
  const GAS = ['Shell', 'Chevron'];

  // Discretionary day-to-day spend (step by calendar day so DST never drifts).
  for (const t = new Date(start); t <= anchor; t.setDate(t.getDate() + 1)) {
    const weekend = t.getDay() === 0 || t.getDay() === 6;
    // A daily coffee, always — guarantees every day (incl. today after the
    // shift) has at least one transaction, so no period ever reads empty.
    add(t, 8, 'dining', pick(COFFEE), amt(3.75, 6.75), 'Coffee');
    if (hit(0.34)) add(t, 12, 'dining', pick(LUNCH), amt(11, 21), 'Lunch');
    if (hit(weekend ? 0.42 : 0.16)) add(t, 19, 'dining', pick(DINNER), amt(38, 96), 'Dinner');
    if (hit(0.24)) add(t, 17, 'groceries', pick(GROCERS), amt(28, 124), 'Groceries');
    if (hit(weekend ? 0.3 : 0.42)) add(t, 9, 'transport', pick(RIDES), amt(7.5, 27), 'Ride');
    if (hit(weekend ? 0.26 : 0.12)) add(t, 15, 'shopping', pick(SHOPS), amt(16, 190), 'Purchase');
    if (hit(0.07)) add(t, 20, 'entertainment', pick(FUN), amt(9, 58), 'Night out');
    if (t.getDate() === 6 || t.getDate() === 21) add(t, 18, 'transport', pick(GAS), amt(34, 58), 'Gas');
  }

  // Fixed monthly bills + subscriptions on stable days each month. The big three
  // carry their recurring rule id so the fixed/variable split stays clean.
  const monthly: { day: number; cat: string; merchant: string; min: number; max: number; note: string; ruleId?: string }[] = [
    { day: 1, cat: 'housing', merchant: 'Rent', min: 1200, max: 1200, note: 'Monthly rent', ruleId: 'r1' },
    { day: 5, cat: 'entertainment', merchant: 'Spotify', min: 10.99, max: 10.99, note: 'Premium', ruleId: 'r2' },
    { day: 8, cat: 'bills', merchant: 'PG&E', min: 78, max: 116, note: 'Electric + gas', ruleId: 'r3' },
    { day: 12, cat: 'bills', merchant: 'AT&T', min: 75, max: 75, note: 'Phone' },
    { day: 15, cat: 'bills', merchant: 'Comcast', min: 80, max: 80, note: 'Internet' },
    { day: 18, cat: 'entertainment', merchant: 'Netflix', min: 15.49, max: 15.49, note: 'Standard' },
  ];
  for (let y = 2025; y <= 2026; y++) {
    for (let m = 0; m < 12; m++) {
      for (const b of monthly) {
        const d = new Date(y, m, b.day, 9, 0, 0);
        if (d < start || d > anchor) continue;
        add(d, 9, b.cat, b.merchant, amt(b.min, b.max), b.note, true, b.ruleId);
      }
    }
  }

  // Newest first, matching the rest of the app's ordering.
  return txs.sort((a, b) => (a.occurredAt! < b.occurredAt! ? 1 : -1));
}

export const SEED_TRANSACTIONS: Transaction[] = buildSeedTransactions();

// ─────────────────────────────────────────────────────────────
// Upcoming bills (forward-looking)
// ─────────────────────────────────────────────────────────────
export const SEED_BILLS: Bill[] = [
  { id: 'b1', name: 'Rent',    merchant: 'Rent',    icon: 'home', cat: 'bills',         amount: 1200,  dueDate: 'May 28', daysUntil: 14, recurring: true },
  { id: 'b2', name: 'Spotify', merchant: 'Spotify', icon: 'film', cat: 'entertainment', amount: 10.99, dueDate: 'May 30', daysUntil: 16, recurring: true },
  { id: 'b3', name: 'PG&E',    merchant: 'PG&E',    icon: 'doc',  cat: 'bills',         amount: 95,    dueDate: 'Jun 8',  daysUntil: 25, recurring: true, estimate: true },
];

export const SEED_RECURRING_RULES: RecurringRule[] = [
  { id: 'r1', merchant: 'Rent',    cat: 'housing',       amount: 1200,  cadence: 'customMonthly', startDate: '2026-05-01', nextDueDate: '2026-05-28', dayOfMonth: 28, active: true },
  { id: 'r2', merchant: 'Spotify', cat: 'entertainment', amount: 10.99, cadence: 'customMonthly', startDate: '2026-05-01', nextDueDate: '2026-05-30', dayOfMonth: 30, active: true },
  { id: 'r3', merchant: 'PG&E',    cat: 'bills',         amount: 95,    cadence: 'customMonthly', startDate: '2026-05-01', nextDueDate: '2026-06-08', dayOfMonth: 8, active: true, estimate: true },
];

// Last 7 days sparkline data
export const SEED_SPARK_7D = [42, 18, 95, 38, 12, 28, 67];

// Current month context (May 2026)
export const DAYS_REMAINING = 17;
export const DAYS_IN_MONTH = 31;

// ─────────────────────────────────────────────────────────────
// Per-period totals + category breakdown
// Drives the Week/Month/Year toggle on Home.
// ─────────────────────────────────────────────────────────────
export const SEED_PERIOD_DATA: Record<string, PeriodData> = {
  Week: {
    label: 'this week',
    spentLabel: 'Spent this week',
    spent: 167.90,
    budget: 600,
    remaining: 432.10,
    expectedPct: 4 / 7,
    remainingLabel: '3 days left in week',
    byCat: [
      { cat: 'groceries', value: 84.20 },
      { cat: 'dining',    value: 68.90 },
      { cat: 'transport', value: 14.80 },
    ],
    prevTotal: 212.50,
    prevByCat: [
      { cat: 'groceries', value: 120.50 },
      { cat: 'dining',    value: 53.20  },
      { cat: 'transport', value: 12.60  },
    ],
  },
  Month: {
    label: 'this month',
    spentLabel: 'Spent this month',
    spent: 400.07,
    budget: 2400,
    remaining: 1999.93,
    expectedPct: 14 / 31,
    remainingLabel: '17 days remaining',
    byCat: [
      { cat: 'shopping',      value: 129.00 },
      { cat: 'bills',         value: 92.18  },
      { cat: 'groceries',     value: 84.20  },
      { cat: 'dining',        value: 68.90  },
      { cat: 'transport',     value: 14.80  },
      { cat: 'entertainment', value: 10.99  },
    ],
    prevTotal: 485.20,
    prevByCat: [
      { cat: 'shopping',      value: 79.20  },
      { cat: 'bills',         value: 92.18  },
      { cat: 'groceries',     value: 94.30  },
      { cat: 'dining',        value: 94.30  },
      { cat: 'transport',     value: 12.00  },
      { cat: 'entertainment', value: 13.99  },
    ],
  },
  Year: {
    label: 'this year',
    spentLabel: 'Spent this year',
    spent: 12450,
    budget: 28800,
    remaining: 16350,
    expectedPct: 4.5 / 12,
    remainingLabel: '7 months remaining',
    byCat: [
      { cat: 'bills',         value: 4200 },
      { cat: 'groceries',     value: 2800 },
      { cat: 'dining',        value: 2300 },
      { cat: 'shopping',      value: 1450 },
      { cat: 'transport',     value: 980  },
      { cat: 'entertainment', value: 720  },
    ],
    prevTotal: 11500,
    prevByCat: [
      { cat: 'bills',         value: 3900 },
      { cat: 'groceries',     value: 2600 },
      { cat: 'dining',        value: 2680 },
      { cat: 'shopping',      value: 1200 },
      { cat: 'transport',     value: 1100 },
      { cat: 'entertainment', value: 820  },
    ],
  },
};

export const SEED_TREND: Record<string, TrendConfig> = {
  Week: {
    data: [{label:'M',v:84},{label:'T',v:62},{label:'W',v:28},{label:'T',v:41},{label:'F',v:95},{label:'S',v:38},{label:'S',v:12}],
    budget: 80, prev: 412, periodLabel: 'day', span: 'past 7 days',
  },
  Month: {
    data: [{label:'Wk 1',v:580},{label:'Wk 2',v:720},{label:'Wk 3',v:490},{label:'Wk 4',v:610}],
    budget: 600, prev: 1975, periodLabel: 'week', span: 'this month',
  },
  Year: {
    data: [{label:'Dec',v:2180},{label:'Jan',v:2480},{label:'Feb',v:1920},{label:'Mar',v:2310},{label:'Apr',v:1840},{label:'May',v:1400}],
    budget: 2400, prev: 1840, periodLabel: 'month', span: 'past 6 months',
  },
};

// ─────────────────────────────────────────────────────────────
// 50/30/20 spending groups — Needs / Wants / Savings.
// Each group has a target share of monthly income; subcategories
// carry their own spent vs budget figures.
// ─────────────────────────────────────────────────────────────
export const DEFAULT_MONTHLY_INCOME = 5200;

export const SEED_SPEND_GROUPS: SpendGroup[] = [
  {
    key: 'needs',
    label: 'Needs',
    targetPct: 0.5,
    subs: [
      { cat: 'housing', label: 'Housing',        icon: 'home', spent: 1350, budget: 1350 },
      { cat: 'groceries', label: 'Groceries',      icon: 'cart', spent: 412,  budget: 500  },
      { cat: 'transport', label: 'Transportation', icon: 'car',  spent: 286,  budget: 360  },
      { cat: 'bills', label: 'Utilities',      icon: 'doc',  spent: 198,  budget: 240  },
    ],
  },
  {
    key: 'wants',
    label: 'Wants',
    targetPct: 0.3,
    subs: [
      { cat: 'dining', label: 'Dining',        icon: 'fork', spent: 318, budget: 440 },
      { cat: 'shopping', label: 'Shopping',      icon: 'bag',  spent: 240, budget: 300 },
      { cat: 'entertainment', label: 'Entertainment', icon: 'film', spent: 142, budget: 180 },
    ],
  },
  {
    key: 'savings',
    label: 'Savings',
    targetPct: 0.2,
    subs: [
      { cat: 'emergency-fund', label: 'Emergency fund', icon: 'tag',    spent: 600, budget: 650 },
      { cat: 'retirement', label: 'Retirement',     icon: 'repeat', spent: 415, budget: 415 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Month-by-month budget history — drives the home Budget switcher.
// Index 0 is the current month; later indices step into the past.
// ─────────────────────────────────────────────────────────────
export const SEED_MONTH_BUDGETS: MonthBudget[] = [
  { key: '2026-05', month: 'May',      spent: 400.07,  budget: 2400, expectedPct: 14 / 31, remainingLabel: '17 days remaining' },
  { key: '2026-04', month: 'April',    spent: 2180.50, budget: 2400, expectedPct: 1, remainingLabel: 'Month complete' },
  { key: '2026-03', month: 'March',    spent: 2540.00, budget: 2400, expectedPct: 1, remainingLabel: 'Month complete' },
  { key: '2026-02', month: 'February', spent: 1975.30, budget: 2300, expectedPct: 1, remainingLabel: 'Month complete' },
  { key: '2026-01', month: 'January',  spent: 2410.00, budget: 2400, expectedPct: 1, remainingLabel: 'Month complete' },
];

export const SEED_INCOME: Income[] = [
  {
    id: 'income-primary',
    amount: DEFAULT_MONTHLY_INCOME,
    source: 'Primary income',
    kind: 'regular',
    cadence: 'monthly',
    startDate: '2026-05-01',
  },
];

export const SEED_BUDGETS: Budget[] = SEED_SPEND_GROUPS.flatMap(group =>
  group.subs.map(sub => ({
    id: `budget-2026-05-${group.key}-${sub.label.toLowerCase().replace(/\s+/g, '-')}`,
    month: '2026-05',
    group: group.key,
    category: sub.cat,
    label: sub.label,
    icon: sub.icon,
    amount: sub.budget,
    spent: sub.spent,
  })),
);

export const SEED_SETTINGS: AppSettings = {
  id: 'settings',
  themeDark: true,
  accentKey: 'ink',
  cardStyle: 'flat',
};
