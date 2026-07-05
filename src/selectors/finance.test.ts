import assert from 'node:assert/strict';
import test from 'node:test';

import type { Category, RecurringRule } from '../repositories/types';
import { advanceDueDate, upcomingBillsFromRecurring } from './finance';

function recurringRule(patch: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    merchant: 'Rent',
    cat: 'housing',
    amount: 1200,
    cadence: 'monthly',
    startDate: '2026-05-30',
    nextDueDate: '2026-05-30T12:00:00.000Z',
    active: true,
    dayOfMonth: 30,
    ...patch,
  };
}

const categories: Category[] = [{
  id: 'housing',
  label: 'Housing',
  icon: 'home',
  group: 'needs',
  defaultBudget: 0,
  sortOrder: 0,
}];

test('advanceDueDate preserves monthly day-of-month when the target month has it', () => {
  const next = advanceDueDate(recurringRule({
    nextDueDate: '2026-06-30T12:00:00.000Z',
    dayOfMonth: 30,
  }));

  assert.equal(next.slice(0, 10), '2026-07-30');
});

test('advanceDueDate clamps monthly day-of-month only for shorter months', () => {
  const next = advanceDueDate(recurringRule({
    nextDueDate: '2026-01-31T12:00:00.000Z',
    dayOfMonth: 31,
  }));

  assert.equal(next.slice(0, 10), '2026-02-28');
});

test('upcomingBillsFromRecurring keeps projected monthly bills on their intended day', () => {
  const bills = upcomingBillsFromRecurring(
    [recurringRule()],
    categories,
    new Date('2026-07-03T12:00:00.000Z'),
  );

  assert.equal(bills[0]?.dueDate, 'Jul 30');
});

