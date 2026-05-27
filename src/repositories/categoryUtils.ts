import { CATS } from '../data';
import { CAT_TO_GROUP, GROUP_COLORS } from '../theme';
import type { Category, GroupKey } from './types';

export function categoryMap(categories: Category[]): Record<string, { label: string; icon: string; budget: number }> {
  if (categories.length === 0) return CATS;
  return Object.fromEntries(categories.filter(cat => !cat.archived).map(cat => [
      cat.id,
      { label: cat.label, icon: cat.icon, budget: cat.defaultBudget },
    ]));
}

export function categoryGroupMap(categories: Category[]) {
  if (categories.length === 0) return CAT_TO_GROUP;
  return {
    ...Object.fromEntries(categories.filter(cat => !cat.archived).map(cat => [cat.id, cat.group])),
  };
}

export function categoryGroupFor(catId: string, categories: Category[]): GroupKey {
  return categories.find(cat => cat.id === catId)?.group ?? CAT_TO_GROUP[catId] ?? 'wants';
}

export function categoryGroupColor(catId: string, categories: Category[], dark: boolean): string {
  const group = categoryGroupFor(catId, categories);
  return dark ? GROUP_COLORS[group].dark : GROUP_COLORS[group].light;
}
