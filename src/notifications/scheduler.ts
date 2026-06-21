import { useEffect } from 'react';

import { formatActiveCurrencyAmount } from '../currency';
import type { AppSettings, Budget, Category, Income, RecurringRule, Transaction } from '../repositories/types';
import { goalsFromCategories } from '../selectors/goals';
import { monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import {
  getNotificationPrefs,
  notificationsEnabled,
  type NotificationPrefs,
} from './preferences';
import {
  cancelFinanceNotifications,
  configureLocalNotifications,
  ensureNotificationChannel,
  getNotificationPermissionState,
  nextLocalDateAfterDays,
  scheduleDateNotification,
  scheduleMonthlyNotification,
  scheduleWeeklyNotification,
} from './service';

interface SchedulerInput {
  settings?: AppSettings;
  transactions: Transaction[];
  budgets: Budget[];
  categories: Category[];
  recurringRules: RecurringRule[];
  incomes: Income[];
}

export function useLocalNotificationScheduler(input: SchedulerInput) {
  const scheduleKey = schedulerKey(input);

  useEffect(() => {
    configureLocalNotifications();

    let cancelled = false;
    const run = async () => {
      const prefs = getNotificationPrefs(input.settings);
      if (!notificationsEnabled(prefs)) {
        await cancelFinanceNotifications();
        return;
      }

      const permission = await getNotificationPermissionState();
      if (!permission.granted) {
        await cancelFinanceNotifications();
        return;
      }

      await ensureNotificationChannel();
      await cancelFinanceNotifications();
      if (cancelled) return;
      await scheduleFromPrefs(prefs, input);
    };

    run().catch(() => {});
    return () => { cancelled = true; };
    // scheduleKey deliberately tracks only fields that change notification output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey]);
}

async function scheduleFromPrefs(
  prefs: NotificationPrefs,
  input: SchedulerInput,
) {
  const jobs: Promise<void>[] = [];
  if (prefs.billReminders.enabled) {
    jobs.push(scheduleBillReminders(prefs, input));
  }
  if (prefs.weeklySummary.enabled) {
    jobs.push(scheduleWeeklySummary(prefs, input));
  }
  if (prefs.budgetAlerts.enabled) {
    jobs.push(scheduleBudgetPaceCheck(prefs, input));
  }
  if (prefs.goalReminders.enabled) {
    jobs.push(scheduleGoalReminder(prefs, input));
  }
  await Promise.all(jobs);
}

async function scheduleBillReminders(
  prefs: NotificationPrefs,
  { recurringRules, categories }: SchedulerInput,
) {
  const { leadDays, time } = prefs.billReminders;
  const bills = upcomingBillsFromRecurring(recurringRules, categories)
    .filter(bill => bill.daysUntil >= leadDays)
    .slice(0, 8);

  await Promise.all(bills.map(bill => {
    const daysFromToday = bill.daysUntil - leadDays;
    const date = nextLocalDateAfterDays(daysFromToday, time.hour, time.minute);
    const dueWord = leadDays === 0 ? 'today' : leadDays === 1 ? 'tomorrow' : `in ${leadDays} days`;
    return scheduleDateNotification({
      identifier: `bill:${bill.id}:${bill.daysUntil}:${leadDays}`,
      title: `${bill.name} is due ${dueWord}`,
      body: `${money0(bill.amount)} due ${bill.dueDate}`,
      date,
      data: { kind: 'bill', billId: bill.id },
    });
  }));
}

async function scheduleWeeklySummary(
  prefs: NotificationPrefs,
  { transactions, recurringRules, categories, incomes }: SchedulerInput,
) {
  const { weekday, time } = prefs.weeklySummary;
  const monthKey = currentMonthKey();
  const spent = monthExpenseTotal(transactions, monthKey);
  const income = monthlyIncome(incomes, monthKey);
  const billsDue = upcomingBillsFromRecurring(recurringRules, categories)
    .filter(bill => bill.daysUntil <= 7).length;
  const remaining = Math.max(0, income - spent);
  const body = income > 0
    ? `${money0(spent)} spent this month, ${money0(remaining)} unassigned, ${billsDue} bills due soon.`
    : `${money0(spent)} spent this month, ${billsDue} bills due soon.`;

  await scheduleWeeklyNotification({
    identifier: 'weekly-summary',
    title: 'Weekly finance check-in',
    body,
    weekday,
    hour: time.hour,
    minute: time.minute,
    data: { kind: 'weekly-summary' },
  });
}

async function scheduleBudgetPaceCheck(
  prefs: NotificationPrefs,
  { transactions, budgets, categories }: SchedulerInput,
) {
  const monthKey = currentMonthKey();
  const groups = spendGroups(transactions, budgets, categories, monthKey);
  const subs = groups.flatMap(group => group.subs.map(sub => ({ ...sub, groupKey: group.key })));
  const issue = subs
    .filter(sub => sub.budget > 0)
    .map(sub => {
      const ratio = sub.spent / sub.budget;
      const over = ratio >= 1;
      const near = ratio >= 0.9;
      return { ...sub, ratio, over, near };
    })
    .filter(sub => prefs.budgetAlerts.mode === 'over-only' ? sub.over : (sub.over || sub.near))
    .sort((a, b) => b.ratio - a.ratio)[0];

  if (!issue) return;
  const date = nextLocalDateAfterDays(0, prefs.budgetAlerts.time.hour, prefs.budgetAlerts.time.minute);
  const title = issue.over ? `${issue.label} is over plan` : `${issue.label} is close to plan`;
  const body = `${money0(issue.spent)} of ${money0(issue.budget)} planned.`;
  await scheduleDateNotification({
    identifier: `budget:${monthKey}:${issue.cat}:${issue.over ? 'over' : 'near'}`,
    title,
    body,
    date,
    data: { kind: 'budget-alert', categoryId: issue.cat },
  });
}

async function scheduleGoalReminder(
  prefs: NotificationPrefs,
  { categories }: SchedulerInput,
) {
  const activeGoals = goalsFromCategories(categories).filter(goal => goal.status === 'active');
  if (activeGoals.length === 0) return;
  const monthlyTotal = activeGoals.reduce((sum, goal) => sum + (goal.monthlyContribution ?? 0), 0);
  const body = monthlyTotal > 0
    ? `${money0(monthlyTotal)} planned across ${activeGoals.length} active ${activeGoals.length === 1 ? 'goal' : 'goals'}.`
    : `Review ${activeGoals.length} active ${activeGoals.length === 1 ? 'goal' : 'goals'} this month.`;

  await scheduleMonthlyNotification({
    identifier: 'goal-reminder',
    title: 'Goal contribution check',
    body,
    day: prefs.goalReminders.dayOfMonth,
    hour: prefs.goalReminders.time.hour,
    minute: prefs.goalReminders.time.minute,
    data: { kind: 'goal-reminder' },
  });
}

function schedulerKey({
  settings,
  transactions,
  budgets,
  categories,
  recurringRules,
  incomes,
}: SchedulerInput) {
  const prefs = getNotificationPrefs(settings);
  return JSON.stringify({
    prefs,
    tx: transactions.map(tx => [tx.id, tx.amount, tx.cat, tx.type, tx.occurredAt, tx.updatedAt]),
    budgets: budgets.map(budget => [budget.id, budget.amount, budget.month, budget.category, budget.updatedAt]),
    categories: categories.map(cat => [cat.id, cat.label, cat.defaultBudget, cat.group, cat.archived, cat.updatedAt, cat.meta]),
    rules: recurringRules.map(rule => [rule.id, rule.merchant, rule.amount, rule.nextDueDate, rule.active, rule.updatedAt, rule.meta]),
    incomes: incomes.map(income => [income.id, income.amount, income.cadence, income.startDate, income.endDate, income.updatedAt]),
  });
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function monthExpenseTotal(transactions: Transaction[], monthKey: string) {
  return transactions
    .filter(tx => tx.type !== 'income' && (tx.occurredAt ?? '').slice(0, 7) === monthKey)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function money0(n: number) {
  return formatActiveCurrencyAmount(n, 0);
}
