import { CATS } from '../data';
import { CAT_TO_GROUP, GROUP_COLORS } from '../theme';
import type { Category, GroupKey } from './types';

// Transactions can outlive their category (a deleted category is archived, so it
// drops out of the active list). Anything that can't be resolved to a live
// category is shown as "Uncategorized" with a neutral, group-less treatment —
// never its raw id, and never masquerading as one of the 50/30/20 groups.
export const UNCATEGORIZED_LABEL = 'Uncategorized';
const UNCATEGORIZED_COLOR = { light: '#9AA0A6', dark: '#8A9098' };

export function isUncategorized(catId: string, categories: Category[]): boolean {
  if (!catId) return true;
  if (categories.some(cat => cat.id === catId && !cat.archived)) return false;
  // Seed categories live in CAT_TO_GROUP even before the DB is populated.
  return !(catId in CAT_TO_GROUP);
}

export function uncategorizedColor(dark: boolean): string {
  return dark ? UNCATEGORIZED_COLOR.dark : UNCATEGORIZED_COLOR.light;
}

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
  if (isUncategorized(catId, categories)) return uncategorizedColor(dark);
  const group = categoryGroupFor(catId, categories);
  return dark ? GROUP_COLORS[group].dark : GROUP_COLORS[group].light;
}
