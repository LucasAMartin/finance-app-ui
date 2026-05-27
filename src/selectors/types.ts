export interface PeriodData {
  label: string;
  spentLabel: string;
  spent: number;
  budget: number;
  remaining: number;
  expectedPct: number;
  remainingLabel: string;
  byCat: { cat: string; value: number }[];
  prevTotal: number;
  prevByCat: { cat: string; value: number }[];
}

export interface TrendPoint {
  label: string;
  v: number;
}

export interface TrendConfig {
  data: TrendPoint[];
  budget: number;
  prev: number;
  periodLabel: string;
  span: string;
}
