import type { Category } from '../repositories/types';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface GoalContribution {
  id: string;
  amount: number;
  date: string;
  note?: string;
  transactionId?: string;
}

export interface Goal {
  id: string;
  label: string;
  icon: string;
  target: number;
  startingBalance: number;
  saved: number;
  deadline?: string;
  monthlyContribution?: number;
  contributions: GoalContribution[];
  status: GoalStatus;
  completedAt?: string;
  archivedAt?: string;
  category: Category;
}

export interface GoalHealth {
  label: string;
  tone: 'good' | 'caution' | 'neutral';
  subtext?: string;
}

interface GoalOptions {
  includeArchived?: boolean;
}

export const todayKey = () => new Date().toISOString().slice(0, 10);
export const money0 = (n: number) => `$${Math.round(n).toLocaleString()}`;
export const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export const parseAmount = (value: string): number | null => {
  const cleaned = value.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export const parseGoalDate = (value?: string): Date | null => {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const monthDistance = (deadline?: string): number | null => {
  const target = parseGoalDate(deadline);
  if (!target) return null;
  const now = new Date();
  const raw = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth();
  return Math.max(1, raw + 1);
};

export const deadlineLabel = (deadline?: string): string => {
  const d = parseGoalDate(deadline);
  if (!d) return deadline ?? 'No date';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export const contributionDateLabel = (date: string): string => {
  const d = parseGoalDate(date);
  if (!d) return date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const contributionTotal = (contributions: GoalContribution[]) =>
  contributions.reduce((sum, item) => sum + Math.max(0, item.amount), 0);

export const goalSavedFromParts = (
  target: number,
  startingBalance: number,
  contributions: GoalContribution[],
) => Math.min(target, Math.max(0, startingBalance) + contributionTotal(contributions));

export const goalStartingBalanceFromMeta = (
  meta: Record<string, unknown> | undefined,
  contributions: GoalContribution[],
) => {
  if (typeof meta?.goalStartingBalance === 'number') {
    return Math.max(0, meta.goalStartingBalance);
  }

  // Migration bridge: older goals stored only the total saved amount. Back out
  // logged contributions so future progress has a stable, auditable base.
  if (typeof meta?.goalSaved === 'number') {
    return Math.max(0, meta.goalSaved - contributionTotal(contributions));
  }

  return 0;
};

const goalContributionsFromMeta = (meta: Record<string, unknown> | undefined): GoalContribution[] => {
  if (!Array.isArray(meta?.goalContributions)) return [];
  return meta.goalContributions
    .filter((item): item is GoalContribution => (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as GoalContribution).id === 'string' &&
      typeof (item as GoalContribution).amount === 'number' &&
      typeof (item as GoalContribution).date === 'string'
    ))
    .map(item => ({
      id: item.id,
      amount: Math.max(0, item.amount),
      date: item.date,
      note: typeof item.note === 'string' ? item.note : undefined,
      transactionId: typeof item.transactionId === 'string' ? item.transactionId : undefined,
    }));
};

const goalStatusFromMeta = (
  meta: Record<string, unknown> | undefined,
  saved: number,
  target: number,
): GoalStatus => {
  const raw = meta?.goalStatus;
  if (raw === 'paused' || raw === 'archived') return raw;
  if (raw === 'completed' || typeof meta?.goalCompletedAt === 'string' || saved >= target) return 'completed';
  return 'active';
};

export const goalFromCategory = (category: Category, options: GoalOptions = {}): Goal | null => {
  const meta = category.meta ?? {};
  if (
    category.archived ||
    category.group !== 'savings' ||
    typeof meta.goalTarget !== 'number' ||
    meta.goalTarget <= 0
  ) {
    return null;
  }

  const target = meta.goalTarget;
  const contributions = goalContributionsFromMeta(meta);
  const startingBalance = goalStartingBalanceFromMeta(meta, contributions);
  const saved = goalSavedFromParts(target, startingBalance, contributions);
  const status = goalStatusFromMeta(meta, saved, target);
  if (status === 'archived' && !options.includeArchived) return null;

  const monthlyContribution =
    typeof meta.goalMonthlyContribution === 'number' && meta.goalMonthlyContribution > 0
      ? meta.goalMonthlyContribution
      : typeof category.defaultBudget === 'number' && category.defaultBudget > 0
        ? category.defaultBudget
        : undefined;

  return {
    id: category.id,
    label: category.label,
    icon: category.icon,
    target,
    startingBalance,
    saved,
    deadline: typeof meta.goalDeadline === 'string' ? meta.goalDeadline : undefined,
    monthlyContribution,
    contributions,
    status,
    completedAt: typeof meta.goalCompletedAt === 'string' ? meta.goalCompletedAt : undefined,
    archivedAt: typeof meta.goalArchivedAt === 'string' ? meta.goalArchivedAt : undefined,
    category,
  };
};

export const goalsFromCategories = (categories: Category[]) =>
  categories
    .map(category => goalFromCategory(category))
    .filter((goal): goal is Goal => goal !== null)
    .sort((a, b) => {
      const aStatus = statusFor(a).tone === 'caution' ? 1 : 0;
      const bStatus = statusFor(b).tone === 'caution' ? 1 : 0;
      if (aStatus !== bStatus) return bStatus - aStatus;
      return a.saved / a.target - b.saved / b.target;
    });

export const archivedGoalsFromCategories = (categories: Category[]) =>
  categories
    .map(category => goalFromCategory(category, { includeArchived: true }))
    .filter((goal): goal is Goal => goal !== null && goal.status === 'archived')
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));

export const goalMeta = (goal: Goal, patch: Record<string, unknown>) => ({
  ...(goal.category.meta ?? {}),
  ...patch,
});

export const suggestedMonthly = (target: number, saved: number, deadline?: string): number => {
  const months = monthDistance(deadline);
  if (!months) return 0;
  return Math.max(0, Math.ceil((target - saved) / months));
};

export const projectedFinishDate = (goal: Goal): { label: string; months: number } | null => {
  if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
  const remaining = Math.max(0, goal.target - goal.saved);
  if (remaining <= 0) return null;
  const months = Math.ceil(remaining / goal.monthlyContribution);
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + months, 1);
  return {
    label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    months,
  };
};

export const monthDeltaVsDeadline = (goal: Goal): number | null => {
  const proj = projectedFinishDate(goal);
  if (!proj || !goal.deadline) return null;
  const target = parseGoalDate(goal.deadline);
  if (!target) return null;
  const now = new Date();
  const targetMonths =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return proj.months - targetMonths;
};

export const statusFor = (goal: Goal): GoalHealth => {
  if (goal.status === 'archived') return { label: 'Archived', tone: 'neutral' };
  if (goal.status === 'paused') return { label: 'Paused', tone: 'neutral' };
  const remaining = Math.max(0, goal.target - goal.saved);
  if (remaining <= 0 || goal.status === 'completed') return { label: 'Complete', tone: 'good' };
  const needed = suggestedMonthly(goal.target, goal.saved, goal.deadline);
  if (!goal.deadline) return { label: 'No deadline', tone: 'neutral' };
  if (!goal.monthlyContribution || goal.monthlyContribution <= 0) {
    return {
      label: 'No monthly',
      tone: 'neutral',
      subtext: needed > 0 ? `${money0(needed)}/mo needed` : undefined,
    };
  }
  const deficit = needed - goal.monthlyContribution;
  if (goal.monthlyContribution + 1 < needed) {
    return {
      label: 'Behind',
      tone: 'caution',
      subtext: deficit > 0 ? `${money0(Math.ceil(deficit))}/mo short` : undefined,
    };
  }
  if (goal.monthlyContribution > needed * 1.18) {
    const delta = monthDeltaVsDeadline(goal);
    return {
      label: 'Ahead',
      tone: 'good',
      subtext: delta !== null && delta < 0 ? `${Math.abs(delta)}mo early` : undefined,
    };
  }
  return { label: 'On pace', tone: 'good' };
};

export const goalProgressPct = (goal: Goal) =>
  goal.target > 0 ? clampPct(Math.round((goal.saved / goal.target) * 100)) : 0;

export const goalRemaining = (goal: Goal) => Math.max(0, goal.target - goal.saved);
