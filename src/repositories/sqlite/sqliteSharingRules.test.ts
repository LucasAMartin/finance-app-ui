import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSQLiteRepositories } from './index.ts';
import { DEFAULT_LEDGER_ID, getDb, resetSQLiteDatabaseForTests } from './db.ts';
import type { Repositories } from '../types.ts';

function freshRepos(): Repositories {
  resetSQLiteDatabaseForTests();
  return createSQLiteRepositories();
}

function clearDomainRows() {
  getDb().execSync(`
    DELETE FROM attachments;
    DELETE FROM transactions;
    DELETE FROM incomes;
    DELETE FROM budgets;
    DELETE FROM bills;
    DELETE FROM recurring_rules;
    DELETE FROM categories;
  `);
}

function partnerMember(repos: Repositories) {
  const member = repos.sessionRepo.listMembers().find(item => item.userId === 'partner');
  assert.ok(member, 'expected seeded partner member');
  return member;
}

function alexMember(repos: Repositories) {
  const member = repos.sessionRepo.listMembers().find(item => item.userId === 'alex');
  assert.ok(member, 'expected seeded alex member');
  return member;
}

function lockPartnerRows(repos: Repositories) {
  repos.sessionRepo.updateMember(partnerMember(repos).id, { allowOthersToEditMyItems: false });
}

function unlockPartnerRows(repos: Repositories) {
  repos.sessionRepo.updateMember(partnerMember(repos).id, { allowOthersToEditMyItems: true });
}

function createPartnerTransaction(repos: Repositories) {
  repos.sessionRepo.setCurrentUserId('partner');
  return repos.transactionsRepo.create({
    merchant: 'Partner Market',
    cat: 'groceries',
    amount: 42,
    occurredAt: '2026-06-01T12:00:00.000Z',
  });
}

test('sqlite sample data reset clears and reloads ledger members plus ledger-scoped seed data', () => {
  const repos = freshRepos();

  repos.devDataRepo.setSeedDataEnabled(false);
  assert.equal(repos.transactionsRepo.list().length, 0);
  assert.equal(repos.incomeRepo.list().length, 0);
  assert.equal(repos.categoriesRepo.list().length, 0);
  assert.equal(repos.sessionRepo.listMembers().length, 0);

  repos.devDataRepo.setSeedDataEnabled(true);
  assert.ok(repos.transactionsRepo.list().length > 0);
  assert.ok(repos.incomeRepo.list().length > 0);
  assert.ok(repos.categoriesRepo.list().length > 0);
  assert.deepEqual(
    repos.sessionRepo.listMembers().map(member => member.userId).sort(),
    ['alex', 'partner'],
  );
  assert.ok(repos.transactionsRepo.list().every(row => row.ledgerId === DEFAULT_LEDGER_ID));
  assert.ok(repos.transactionsRepo.list().every(row => row.createdByUserId === 'alex'));
});

test('sqlite creates inject active ledger, current user ownership, timestamps, and pending sync status', () => {
  const repos = freshRepos();
  repos.sessionRepo.setCurrentUserId('partner');

  const tx = repos.transactionsRepo.create({
    merchant: 'Coffee',
    cat: 'dining',
    amount: 8,
    occurredAt: '2026-06-01T09:00:00.000Z',
    createdByUserId: 'local',
    updatedByUserId: 'local',
  });

  assert.equal(tx.ledgerId, DEFAULT_LEDGER_ID);
  assert.equal(tx.createdByUserId, 'partner');
  assert.equal(tx.updatedByUserId, 'partner');
  assert.equal(tx.syncStatus, 'pending');
  assert.match(tx.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.match(tx.updatedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('sqlite active ledger queries and summaries do not leak rows from another ledger', () => {
  const repos = freshRepos();
  clearDomainRows();

  repos.transactionsRepo.create({
    merchant: 'Visible',
    cat: 'groceries',
    amount: 20,
    occurredAt: '2026-06-01T12:00:00.000Z',
  });
  repos.transactionsRepo.create({
    merchant: 'Hidden',
    cat: 'groceries',
    amount: 999,
    occurredAt: '2026-06-01T12:00:00.000Z',
    ledgerId: 'ledger-other',
  });

  assert.deepEqual(repos.transactionsRepo.list().map(tx => tx.merchant), ['Visible']);
  assert.equal(repos.transactionsRepo.getSummary({}).expenseTotal, 20);
  assert.deepEqual(repos.transactionsRepo.listPage({ limit: 20 }).rows.map(tx => tx.merchant), ['Visible']);
});

test('sqlite budget and insight-style totals aggregate visible rows from both members', () => {
  const repos = freshRepos();
  clearDomainRows();

  repos.sessionRepo.setCurrentUserId('alex');
  repos.transactionsRepo.create({
    merchant: 'Alex Grocer',
    cat: 'groceries',
    amount: 30,
    occurredAt: '2026-06-01T12:00:00.000Z',
  });
  repos.sessionRepo.setCurrentUserId('partner');
  repos.transactionsRepo.create({
    merchant: 'Partner Grocer',
    cat: 'groceries',
    amount: 45,
    occurredAt: '2026-06-02T12:00:00.000Z',
  });

  const summary = repos.transactionsRepo.getSummary({
    from: '2026-06-01T00:00:00.000Z',
    to: '2026-06-30T23:59:59.999Z',
  });
  assert.equal(summary.expenseCount, 2);
  assert.equal(summary.expenseTotal, 75);
});

test('sqlite owner can always update and delete own locked transaction', () => {
  const repos = freshRepos();
  const tx = createPartnerTransaction(repos);
  lockPartnerRows(repos);

  repos.sessionRepo.setCurrentUserId('partner');
  assert.equal(repos.transactionsRepo.update(tx.id, { amount: 50 })?.amount, 50);
  repos.transactionsRepo.delete(tx.id);
  assert.equal(repos.transactionsRepo.get(tx.id), undefined);
});

test('sqlite other member can update and delete when creator allows edits', () => {
  const repos = freshRepos();
  const tx = createPartnerTransaction(repos);
  unlockPartnerRows(repos);

  repos.sessionRepo.setCurrentUserId('alex');
  assert.equal(repos.transactionsRepo.update(tx.id, { amount: 64 })?.amount, 64);
  repos.transactionsRepo.delete(tx.id);
  assert.equal(repos.transactionsRepo.get(tx.id), undefined);
});

test('sqlite other member cannot update or delete a locked transaction', () => {
  const repos = freshRepos();
  const tx = createPartnerTransaction(repos);
  lockPartnerRows(repos);

  repos.sessionRepo.setCurrentUserId('alex');
  assert.equal(repos.transactionsRepo.canEdit(tx), false);
  assert.equal(repos.transactionsRepo.update(tx.id, { amount: 99 }), undefined);
  repos.transactionsRepo.delete(tx.id);
  assert.equal(repos.transactionsRepo.get(tx.id)?.amount, 42);
});

test('sqlite unknown creator denies edits by default', () => {
  const repos = freshRepos();

  assert.equal(repos.sessionRepo.canEdit('ghost-user'), false);
  const tx = repos.transactionsRepo.create({
    merchant: 'Mystery',
    cat: 'shopping',
    amount: 12,
    occurredAt: '2026-06-01T12:00:00.000Z',
    createdByUserId: 'ghost-user',
  });
  assert.equal(repos.transactionsRepo.update(tx.id, { amount: 13 }), undefined);
});

test('sqlite non-owner member cannot change another member edit-lock setting', () => {
  const repos = freshRepos();
  repos.sessionRepo.setCurrentUserId('partner');
  const alex = alexMember(repos);

  assert.equal(repos.sessionRepo.updateMember(alex.id, { allowOthersToEditMyItems: false }), undefined);
  assert.equal(alexMember(repos).allowOthersToEditMyItems, true);
});

test('sqlite member can change their own edit-lock setting even if another member is locked', () => {
  const repos = freshRepos();
  repos.sessionRepo.setCurrentUserId('alex');
  repos.sessionRepo.updateMember(alexMember(repos).id, { allowOthersToEditMyItems: false });

  repos.sessionRepo.setCurrentUserId('partner');
  const partner = partnerMember(repos);
  assert.equal(repos.sessionRepo.updateMember(partner.id, { allowOthersToEditMyItems: false })?.allowOthersToEditMyItems, false);
});

test('sqlite locked member historical rows remain visible and counted after member removal', () => {
  const repos = freshRepos();
  const startingTotal = repos.transactionsRepo.getSummary({}).expenseTotal;
  const tx = createPartnerTransaction(repos);
  repos.sessionRepo.updateMember(partnerMember(repos).id, {
    status: 'removed',
    allowOthersToEditMyItems: false,
  });

  repos.sessionRepo.setCurrentUserId('alex');
  assert.equal(repos.transactionsRepo.get(tx.id)?.merchant, 'Partner Market');
  assert.equal(repos.transactionsRepo.getSummary({}).expenseTotal, startingTotal + 42);
  assert.equal(repos.transactionsRepo.update(tx.id, { amount: 100 }), undefined);
});

test('sqlite member edit locks apply across synced domain repos', () => {
  const repos = freshRepos();
  repos.sessionRepo.setCurrentUserId('partner');

  const income = repos.incomeRepo.create({
    kind: 'regular',
    amount: 5000,
    source: 'Partner Salary',
    cadence: 'monthly',
    startDate: '2026-06-01',
  });
  const category = repos.categoriesRepo.create({
    label: 'Partner Fun',
    icon: 'film',
    group: 'wants',
    defaultBudget: 200,
    sortOrder: 100,
  });
  const budget = repos.budgetsRepo.create({
    month: '2026-06',
    group: 'wants',
    category: category.id,
    label: category.label,
    icon: category.icon,
    amount: 200,
  });
  const rule = repos.recurringRulesRepo.create({
    merchant: 'Partner Subscription',
    cat: category.id,
    amount: 15,
    cadence: 'monthly',
    startDate: '2026-06-01',
    nextDueDate: '2026-07-01',
    active: true,
  });
  const bill = repos.billsRepo.create({
    name: 'Partner Subscription',
    merchant: 'Partner Subscription',
    icon: 'film',
    cat: category.id,
    amount: 15,
    dueDate: 'Jul 1',
    recurring: true,
    daysUntil: 25,
    meta: { recurringRuleId: rule.id },
  });
  const tx = repos.transactionsRepo.create({
    merchant: 'Partner Market',
    cat: category.id,
    amount: 10,
    occurredAt: '2026-06-03T12:00:00.000Z',
  });
  const attachment = repos.attachmentsRepo.create({
    transactionId: tx.id,
    localUri: 'file:///receipt.jpg',
    type: 'receipt',
    createdAt: '2026-06-03T12:01:00.000Z',
  });

  lockPartnerRows(repos);
  repos.sessionRepo.setCurrentUserId('alex');

  assert.equal(repos.incomeRepo.update(income.id, { amount: 1 }), undefined);
  assert.equal(repos.categoriesRepo.update(category.id, { label: 'Renamed' }), undefined);
  assert.equal(repos.budgetsRepo.update(budget.id, { amount: 1 }), undefined);
  assert.equal(repos.recurringRulesRepo.update(rule.id, { amount: 1 }), undefined);
  assert.equal(repos.billsRepo.update(bill.id, { amount: 1 }), undefined);
  assert.equal(repos.attachmentsRepo.update(attachment.id, { type: 'note' }), undefined);

  repos.incomeRepo.delete(income.id);
  repos.categoriesRepo.delete(category.id);
  repos.budgetsRepo.delete(budget.id);
  repos.recurringRulesRepo.delete(rule.id);
  repos.billsRepo.delete(bill.id);
  repos.attachmentsRepo.delete(attachment.id);

  assert.equal(repos.incomeRepo.get(income.id)?.amount, 5000);
  assert.equal(repos.categoriesRepo.get(category.id)?.label, 'Partner Fun');
  assert.equal(repos.budgetsRepo.get(budget.id)?.amount, 200);
  assert.equal(repos.recurringRulesRepo.get(rule.id)?.amount, 15);
  assert.equal(repos.billsRepo.get(bill.id)?.amount, 15);
  assert.equal(repos.attachmentsRepo.get(attachment.id)?.type, 'receipt');
});

test('sqlite tombstone-style deletes hide rows from get/list/page/summary', () => {
  const repos = freshRepos();
  clearDomainRows();
  const tx = repos.transactionsRepo.create({
    merchant: 'Delete Me',
    cat: 'shopping',
    amount: 19,
    occurredAt: '2026-06-01T12:00:00.000Z',
  });

  repos.transactionsRepo.delete(tx.id);

  assert.equal(repos.transactionsRepo.get(tx.id), undefined);
  assert.equal(repos.transactionsRepo.list().some(row => row.id === tx.id), false);
  assert.equal(repos.transactionsRepo.listPage({ limit: 10 }).rows.some(row => row.id === tx.id), false);
  assert.equal(repos.transactionsRepo.getSummary({}).expenseTotal, 0);
});
