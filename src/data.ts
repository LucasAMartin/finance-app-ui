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

export const SEED_TRANSACTIONS: Transaction[] = [
  { id:'t1', merchant:'Whole Foods',  cat:'groceries',     amount:84.20,  note:'Weekly shop',        date:'Today',     time:'5:42 PM',  when:'today',     fullDate:'May 13', occurredAt: '2026-05-13T17:42:00-07:00' },
  { id:'t2', merchant:'Blue Bottle',  cat:'dining',        amount:6.50,   note:'Cortado',            date:'Today',     time:'8:14 AM',  when:'today',     fullDate:'May 13', occurredAt: '2026-05-13T08:14:00-07:00' },
  { id:'t3', merchant:'Lyft',         cat:'transport',     amount:14.80,  note:'Ride home',          date:'Yesterday', time:'11:02 PM', when:'yesterday', fullDate:'May 12', occurredAt: '2026-05-12T23:02:00-07:00' },
  { id:'t4', merchant:'Nopa',         cat:'dining',        amount:62.40,  note:'Dinner with M',      date:'Yesterday', time:'8:30 PM',  when:'yesterday', fullDate:'May 12', occurredAt: '2026-05-12T20:30:00-07:00' },
  { id:'t5', merchant:'Apple Store',  cat:'shopping',      amount:129.00, note:'USB-C cable + case', date:'May 9',     time:'2:18 PM',  when:'earlier',   fullDate:'May 9',  occurredAt: '2026-05-09T14:18:00-07:00' },
  { id:'t6', merchant:'PG&E',         cat:'bills',         amount:92.18,  note:'Electric, April',    date:'May 8',     time:'9:00 AM',  when:'earlier',   fullDate:'May 8',  occurredAt: '2026-05-08T09:00:00-07:00' },
  { id:'t7', merchant:'Spotify',      cat:'entertainment', amount:10.99,  note:'Monthly',            date:'May 7',     time:'6:30 AM',  when:'earlier',   fullDate:'May 7',  occurredAt: '2026-05-07T06:30:00-07:00' },
];

export const DEFAULT_MONTHLY_BUDGET = 2400;

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
  accentKey: 'plum',
  cardStyle: 'flat',
};
