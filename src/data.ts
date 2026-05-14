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
  amount: number;
  dueDate: string;
  daysUntil: number;
  estimate?: boolean;
}

export const UPCOMING_BILLS: UpcomingBill[] = [
  { id: 'b1', name: 'Rent',    icon: 'home',   amount: 1200,  dueDate: 'May 28', daysUntil: 14 },
  { id: 'b2', name: 'Spotify', icon: 'film',   amount: 10.99, dueDate: 'May 30', daysUntil: 16 },
  { id: 'b3', name: 'PG&E',    icon: 'doc',    amount: 95,    dueDate: 'Jun 8',  daysUntil: 25, estimate: true },
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
