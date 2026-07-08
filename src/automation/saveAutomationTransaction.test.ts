import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createSQLiteRepositories } from '../repositories/sqlite/index.ts';
import { resetSQLiteDatabaseForTests } from '../repositories/sqlite/db.ts';
import {
  draftFromAutomationHints,
  saveAutomationTransaction,
} from './saveAutomationTransaction.ts';
import { processPendingAutomationImports } from './processAutomationImports.ts';

const envSnapshot = {
  appKey: process.env.EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY,
  logoKey: process.env.EXPO_PUBLIC_MERCHANT_LOGO_APP_KEY,
};

before(() => {
  delete process.env.EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY;
  delete process.env.EXPO_PUBLIC_MERCHANT_LOGO_APP_KEY;
});

after(() => {
  if (envSnapshot.appKey === undefined) delete process.env.EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY;
  else process.env.EXPO_PUBLIC_TRANSACTION_NORMALIZATION_APP_KEY = envSnapshot.appKey;
  if (envSnapshot.logoKey === undefined) delete process.env.EXPO_PUBLIC_MERCHANT_LOGO_APP_KEY;
  else process.env.EXPO_PUBLIC_MERCHANT_LOGO_APP_KEY = envSnapshot.logoKey;
});

test('automation import queue dedupes by fingerprint', () => {
  resetSQLiteDatabaseForTests();
  const repos = createSQLiteRepositories();
  const first = repos.automationImportsRepo.create({
    source: 'sms',
    rawText: 'Discover Card Alert: A transaction of $9.27 at NORTHLAKE SMOOTHIE on June 30, 2026.',
    fingerprint: 'sms:queue:test:northlake',
  });
  const second = repos.automationImportsRepo.create({
    source: 'sms',
    rawText: 'Discover Card Alert: A transaction of $9.27 at NORTHLAKE SMOOTHIE on June 30, 2026.',
    fingerprint: 'sms:queue:test:northlake',
  });

  assert.equal(second.id, first.id);
  assert.equal(repos.automationImportsRepo.listPending().length, 1);
});

test('queued SMS payload is parsed and saved through the canonical JS automation flow', async () => {
  resetSQLiteDatabaseForTests();
  const repos = createSQLiteRepositories();
  const queued = repos.automationImportsRepo.create({
    source: 'sms',
    rawText: 'Discover Card Alert: A transaction of $9.27 at NORTHLAKE SMOOTHIE on June 30, 2026. No Action needed. See it at https://app.discover.com/ACTVT. Text STOP to end',
    amountHint: 9.27,
    merchantHint: 'NORTHLAKE SMOOTHIE',
    occurredAtHint: '2026-06-30T12:00:00.000Z',
    fingerprint: 'sms:queue:test:discover-northlake',
  });
  const draft = draftFromAutomationHints(queued);

  assert.ok(draft);
  assert.equal(draft.merchant, 'Northlake Smoothie');
  assert.equal(draft.amount, 9.27);
  assert.equal(draft.occurredAt, '2026-06-30T12:00:00.000Z');

  const result = await saveAutomationTransaction(draft, {
    settings: repos.settingsRepo.get('settings'),
    settingsRepo: repos.settingsRepo,
    transactionsRepo: repos.transactionsRepo,
    transactions: repos.transactionsRepo.list(),
    categories: repos.categoriesRepo.list(),
  }, {
    background: true,
    initialDraft: draft,
  });

  assert.equal(result.status, 'saved');
  assert.ok(result.transaction);
  assert.equal(result.transaction.merchant, 'Northlake Smoothie');
  assert.equal(result.transaction.amount, 9.27);
  assert.equal(result.transaction.occurredAt, '2026-06-30T12:00:00.000Z');
  assert.equal(result.transaction.meta?.automationSource, 'sms');
  assert.equal(result.transaction.meta?.backgroundImported, true);
  assert.equal(repos.settingsRepo.get('settings')?.meta?.textAutomationLastStatus, 'saved');

  repos.automationImportsRepo.update(queued.id, {
    status: 'processed',
    processedTransactionId: result.transaction.id,
  });
  assert.equal(repos.automationImportsRepo.listPending().length, 0);
});

test('queued Wallet payload prefers structured hints over text parsing', async () => {
  resetSQLiteDatabaseForTests();
  const repos = createSQLiteRepositories();
  const queued = repos.automationImportsRepo.create({
    source: 'wallet',
    rawText: 'Apple Pay: $48.13 at Shell',
    amountHint: 12.5,
    merchantHint: 'Lasang Pinoy',
    categoryHint: 'dining',
    occurredAtHint: '2026-06-29T19:15:00.000Z',
    fingerprint: 'wallet:queue:test:structured-hints',
  });
  const draft = draftFromAutomationHints(queued);

  assert.ok(draft);
  assert.equal(draft.amount, 12.5);
  assert.equal(draft.merchant, 'Lasang Pinoy');
  assert.equal(draft.cat, 'dining');
  assert.equal(draft.occurredAt, '2026-06-29T19:15:00.000Z');
  assert.equal(draft.rawText, 'Apple Pay: $48.13 at Shell');

  const result = await processPendingAutomationImports({
    automationImportsRepo: repos.automationImportsRepo,
    transactionsRepo: repos.transactionsRepo,
    categoriesRepo: repos.categoriesRepo,
    settingsRepo: repos.settingsRepo,
  });

  assert.equal(result.savedTransactions.length, 1);
  assert.equal(result.savedTransactions[0].amount, 12.5);
  assert.equal(result.savedTransactions[0].merchant, 'Lasang Pinoy');
  assert.equal(result.savedTransactions[0].cat, 'dining');
  assert.equal(result.savedTransactions[0].occurredAt, '2026-06-29T19:15:00.000Z');
  assert.equal(result.savedTransactions[0].meta?.automationSource, 'wallet');
});

test('queued import processor leaves the saved transaction visible in the active ledger', async () => {
  resetSQLiteDatabaseForTests();
  const repos = createSQLiteRepositories();
  const rawText = 'Discover Card Alert: A transaction of $9.27 at NORTHLAKE SMOOTHIE on June 30, 2026. No Action needed. See it at https://app.discover.com/ACTVT. Text STOP to end';
  const beforeCount = repos.transactionsRepo.list().length;
  let refreshCount = 0;
  const unsubscribe = repos.transactionsRepo.subscribe(() => {
    refreshCount += 1;
  });

  try {
    const queued = repos.automationImportsRepo.create({
      source: 'sms',
      rawText,
      amountHint: 9.27,
      merchantHint: 'NORTHLAKE SMOOTHIE',
      occurredAtHint: '2026-06-30T12:00:00.000Z',
      fingerprint: 'sms:queue:test:processor-visible',
    });

    const result = await processPendingAutomationImports({
      automationImportsRepo: repos.automationImportsRepo,
      transactionsRepo: repos.transactionsRepo,
      categoriesRepo: repos.categoriesRepo,
      settingsRepo: repos.settingsRepo,
    });

    assert.equal(result.pendingCount, 1);
    assert.equal(result.savedTransactions.length, 1);
    assert.equal(result.savedTransactions[0].merchant, 'Northlake Smoothie');
    assert.equal(repos.transactionsRepo.list().length, beforeCount + 1);
    assert.ok(repos.transactionsRepo.list().some(tx => tx.id === result.savedTransactions[0].id));
    assert.equal(repos.transactionsRepo.get(result.savedTransactions[0].id)?.merchant, 'Northlake Smoothie');
    assert.equal(
      repos.automationImportsRepo.get(queued.id)?.processedTransactionId,
      result.savedTransactions[0].id,
    );
    assert.ok(refreshCount >= 2);
  } finally {
    unsubscribe();
  }
});

test('queued import processor returns the existing transaction for duplicate replays', async () => {
  resetSQLiteDatabaseForTests();
  const repos = createSQLiteRepositories();
  const rawText = 'Discover Card Alert: A transaction of $26.20 at PANDA EXPRESS #1272 P on June 05, 2026. No Action needed. See it at https://app.discover.com/ACTVT. Text STOP to end';

  repos.automationImportsRepo.create({
    source: 'sms',
    rawText,
    fingerprint: 'sms:queue:test:panda-first',
  });
  const first = await processPendingAutomationImports({
    automationImportsRepo: repos.automationImportsRepo,
    transactionsRepo: repos.transactionsRepo,
    categoriesRepo: repos.categoriesRepo,
    settingsRepo: repos.settingsRepo,
  });
  assert.equal(first.savedTransactions.length, 1);

  repos.automationImportsRepo.create({
    source: 'sms',
    rawText,
    fingerprint: 'sms:queue:test:panda-replay',
  });
  const replay = await processPendingAutomationImports({
    automationImportsRepo: repos.automationImportsRepo,
    transactionsRepo: repos.transactionsRepo,
    categoriesRepo: repos.categoriesRepo,
    settingsRepo: repos.settingsRepo,
  });

  assert.equal(replay.savedTransactions.length, 0);
  assert.equal(replay.duplicateCount, 1);
  assert.equal(replay.duplicateTransactions[0]?.id, first.savedTransactions[0].id);
});

test('canonical automation save skips duplicate queued transactions', async () => {
  resetSQLiteDatabaseForTests();
  const repos = createSQLiteRepositories();
  const rawText = 'Discover Card Alert: A transaction of $26.20 at PANDA EXPRESS #1272 P on June 05, 2026. No Action needed. See it at https://app.discover.com/ACTVT. Text STOP to end';
  const draft = draftFromAutomationHints({
    source: 'sms',
    rawText,
  });

  assert.ok(draft);
  const first = await saveAutomationTransaction(draft, {
    settings: repos.settingsRepo.get('settings'),
    settingsRepo: repos.settingsRepo,
    transactionsRepo: repos.transactionsRepo,
    transactions: repos.transactionsRepo.list(),
    categories: repos.categoriesRepo.list(),
  }, { background: true });
  assert.equal(first.status, 'saved');

  const second = await saveAutomationTransaction(draft, {
    settings: repos.settingsRepo.get('settings'),
    settingsRepo: repos.settingsRepo,
    transactionsRepo: repos.transactionsRepo,
    transactions: repos.transactionsRepo.list(),
    categories: repos.categoriesRepo.list(),
  }, { background: true });

  assert.equal(second.status, 'duplicate');
  assert.equal(second.duplicate?.id, first.transaction?.id);
});
