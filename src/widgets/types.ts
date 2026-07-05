import type { GroupKey } from '../repositories/types';

export type FinanceWidgetKind = 'available' | 'budget' | 'bills' | 'quickAdd';

export interface FinanceWidgetBudgetGroup {
  key: GroupKey;
  label: string;
  spent: string;
  budget: string;
  progress: number;
  tint: string;
}

export interface FinanceWidgetBill {
  title: string;
  amount: string;
  due: string;
  daysUntil: number;
}

export interface FinanceWidgetQuickAction {
  id: 'expense' | 'income' | 'text';
  title: string;
  subtitle: string;
  url: string;
}

export interface FinanceWidgetSnapshot {
  version: 1;
  updatedAt: string;
  available: {
    amount: string;
    label: string;
    spent: string;
    budget: string;
    progress: number;
    state: 'available' | 'over' | 'empty';
  };
  budget: {
    title: string;
    groups: FinanceWidgetBudgetGroup[];
  };
  bills: {
    title: string;
    items: FinanceWidgetBill[];
    emptyText: string;
  };
  quickAdd: {
    title: string;
    actions: FinanceWidgetQuickAction[];
  };
}
