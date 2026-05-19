export interface Category {
  label: string;
  icon: string;
  budget: number;
}

export const CATS: Record<string, Category> = {
  groceries:     { label: 'Groceries',     icon: 'cart',    budget: 400 },
  dining:        { label: 'Dining',        icon: 'fork',    budget: 300 },
  transport:     { label: 'Transport',     icon: 'car',     budget: 200 },
  shopping:      { label: 'Shopping',      icon: 'bag',     budget: 250 },
  coffee:        { label: 'Coffee',        icon: 'cup',     budget: 80  },
  bills:         { label: 'Bills',         icon: 'doc',     budget: 500 },
  entertainment: { label: 'Entertainment', icon: 'film',    budget: 150 },
};

export interface Transaction {
  id: string;
  merchant: string;
  cat: string;
  amount: number;
  note: string;
  date: string;
  time: string;
  when: 'today' | 'yesterday' | 'earlier';
  fullDate: string;
}

export const TRANSACTIONS: Transaction[] = [
  { id:'t1', merchant:'Whole Foods',  cat:'groceries',     amount:84.20,  note:'Weekly shop',        date:'Today',     time:'5:42 PM',  when:'today',     fullDate:'May 13' },
  { id:'t2', merchant:'Blue Bottle',  cat:'coffee',        amount:6.50,   note:'Cortado',            date:'Today',     time:'8:14 AM',  when:'today',     fullDate:'May 13' },
  { id:'t3', merchant:'Lyft',         cat:'transport',     amount:14.80,  note:'Ride home',          date:'Yesterday', time:'11:02 PM', when:'yesterday', fullDate:'May 12' },
  { id:'t4', merchant:'Nopa',         cat:'dining',        amount:62.40,  note:'Dinner with M',      date:'Yesterday', time:'8:30 PM',  when:'yesterday', fullDate:'May 12' },
  { id:'t5', merchant:'Apple Store',  cat:'shopping',      amount:129.00, note:'USB-C cable + case', date:'May 9',     time:'2:18 PM',  when:'earlier',   fullDate:'May 9'  },
  { id:'t6', merchant:'PG&E',         cat:'bills',         amount:92.18,  note:'Electric, April',    date:'May 8',     time:'9:00 AM',  when:'earlier',   fullDate:'May 8'  },
  { id:'t7', merchant:'Spotify',      cat:'entertainment', amount:10.99,  note:'Monthly',            date:'May 7',     time:'6:30 AM',  when:'earlier',   fullDate:'May 7'  },
];

export const MONTHLY_BUDGET = 2400;

// ─────────────────────────────────────────────────────────────
// Upcoming bills (forward-looking)
// ─────────────────────────────────────────────────────────────
export interface UpcomingBill {
  id: string;
  name: string;
  icon: string;
  cat: string;
  amount: number;
  dueDate: string;
  daysUntil: number;
  estimate?: boolean;
}

export const UPCOMING_BILLS: UpcomingBill[] = [
  { id: 'b1', name: 'Rent',    icon: 'home', cat: 'bills',         amount: 1200,  dueDate: 'May 28', daysUntil: 14 },
  { id: 'b2', name: 'Spotify', icon: 'film', cat: 'entertainment', amount: 10.99, dueDate: 'May 30', daysUntil: 16 },
  { id: 'b3', name: 'PG&E',    icon: 'doc',  cat: 'bills',         amount: 95,    dueDate: 'Jun 8',  daysUntil: 25, estimate: true },
];

// Last 7 days sparkline data
export const SPARK_7D = [42, 18, 95, 38, 12, 28, 67];

// Current month context (May 2026)
export const DAYS_REMAINING = 17;
export const DAYS_IN_MONTH = 31;

// ─────────────────────────────────────────────────────────────
// Per-period totals + category breakdown
// Drives the Week/Month/Year toggle on Home.
// ─────────────────────────────────────────────────────────────
export interface PeriodData {
  label: string;          // "this week" | "this month" | "this year"
  spentLabel: string;     // "Spent this week" etc.
  spent: number;
  budget: number;
  remaining: number;
  expectedPct: number;    // 0–1, where we should be by now
  remainingLabel: string; // "4 days left in week" etc.
  byCat: { cat: string; value: number }[];
  prevTotal: number;
  prevByCat: { cat: string; value: number }[];
}

export const PERIOD_DATA: Record<string, PeriodData> = {
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
      { cat: 'dining',    value: 62.40 },
      { cat: 'transport', value: 14.80 },
      { cat: 'coffee',    value: 6.50  },
    ],
    prevTotal: 212.50,
    prevByCat: [
      { cat: 'groceries', value: 120.50 },
      { cat: 'dining',    value: 45.20  },
      { cat: 'transport', value: 12.60  },
      { cat: 'coffee',    value: 8.00   },
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
      { cat: 'dining',        value: 62.40  },
      { cat: 'transport',     value: 14.80  },
      { cat: 'entertainment', value: 10.99  },
      { cat: 'coffee',        value: 6.50   },
    ],
    prevTotal: 485.20,
    prevByCat: [
      { cat: 'shopping',      value: 79.20  },
      { cat: 'bills',         value: 92.18  },
      { cat: 'groceries',     value: 94.30  },
      { cat: 'dining',        value: 88.50  },
      { cat: 'transport',     value: 12.00  },
      { cat: 'entertainment', value: 13.99  },
      { cat: 'coffee',        value: 5.80   },
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
      { cat: 'dining',        value: 1800 },
      { cat: 'shopping',      value: 1450 },
      { cat: 'transport',     value: 980  },
      { cat: 'entertainment', value: 720  },
      { cat: 'coffee',        value: 500  },
    ],
    prevTotal: 11500,
    prevByCat: [
      { cat: 'bills',         value: 3900 },
      { cat: 'groceries',     value: 2600 },
      { cat: 'dining',        value: 2200 },
      { cat: 'shopping',      value: 1200 },
      { cat: 'transport',     value: 1100 },
      { cat: 'entertainment', value: 820  },
      { cat: 'coffee',        value: 480  },
    ],
  },
};

export interface TrendPoint { label: string; v: number; }
export interface TrendConfig {
  data: TrendPoint[];
  budget: number;
  prev: number;
  periodLabel: string;
  span: string;
}

export const TREND: Record<string, TrendConfig> = {
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
export interface SpendSub {
  label: string;
  icon: string;
  spent: number;
  budget: number;
}
export interface SpendGroup {
  key: 'needs' | 'wants' | 'savings';
  label: string;
  targetPct: number; // 0.5 / 0.3 / 0.2 — the 50/30/20 rule
  subs: SpendSub[];
}

export const MONTHLY_INCOME = 5200;

export const SPEND_GROUPS: SpendGroup[] = [
  {
    key: 'needs',
    label: 'Needs',
    targetPct: 0.5,
    subs: [
      { label: 'Housing',        icon: 'home', spent: 1350, budget: 1350 },
      { label: 'Groceries',      icon: 'cart', spent: 412,  budget: 500  },
      { label: 'Transportation', icon: 'car',  spent: 286,  budget: 360  },
      { label: 'Utilities',      icon: 'doc',  spent: 198,  budget: 240  },
    ],
  },
  {
    key: 'wants',
    label: 'Wants',
    targetPct: 0.3,
    subs: [
      { label: 'Dining',        icon: 'fork', spent: 318, budget: 400 },
      { label: 'Shopping',      icon: 'bag',  spent: 240, budget: 300 },
      { label: 'Entertainment', icon: 'film', spent: 142, budget: 180 },
      { label: 'Coffee',        icon: 'cup',  spent: 88,  budget: 90  },
    ],
  },
  {
    key: 'savings',
    label: 'Savings',
    targetPct: 0.2,
    subs: [
      { label: 'Emergency fund', icon: 'tag',    spent: 600, budget: 650 },
      { label: 'Retirement',     icon: 'repeat', spent: 415, budget: 415 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Month-by-month budget history — drives the home Budget switcher.
// Index 0 is the current month; later indices step into the past.
// ─────────────────────────────────────────────────────────────
export interface MonthBudget {
  key: string;
  month: string;
  spent: number;
  budget: number;
  expectedPct: number;     // 1 for completed months
  remainingLabel: string;
}

export const MONTH_BUDGETS: MonthBudget[] = [
  { key: '2026-05', month: 'May',      spent: 400.07,  budget: 2400, expectedPct: 14 / 31, remainingLabel: '17 days remaining' },
  { key: '2026-04', month: 'April',    spent: 2180.50, budget: 2400, expectedPct: 1, remainingLabel: 'Month complete' },
  { key: '2026-03', month: 'March',    spent: 2540.00, budget: 2400, expectedPct: 1, remainingLabel: 'Month complete' },
  { key: '2026-02', month: 'February', spent: 1975.30, budget: 2300, expectedPct: 1, remainingLabel: 'Month complete' },
  { key: '2026-01', month: 'January',  spent: 2410.00, budget: 2400, expectedPct: 1, remainingLabel: 'Month complete' },
];
