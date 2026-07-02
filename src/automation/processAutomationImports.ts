import type {
  AutomationImport,
  AutomationImportsRepo,
  CategoriesRepo,
  SettingsRepo,
  Transaction,
  TransactionsRepo,
} from '../repositories/types';
import {
  explainTransactionIntakeRejection,
  type TransactionIntakeDraft,
} from './parseTransactionIntake';
import {
  automationRunMeta,
  draftFromAutomationHints,
  saveAutomationTransaction,
} from './saveAutomationTransaction';

export interface AutomationImportProcessorDeps {
  automationImportsRepo: AutomationImportsRepo;
  transactionsRepo: TransactionsRepo;
  categoriesRepo: CategoriesRepo;
  settingsRepo: SettingsRepo;
}

export interface AutomationImportProcessorResult {
  pendingCount: number;
  firstSource?: AutomationImport['source'];
  savedTransactions: Transaction[];
  duplicateTransactions: Transaction[];
  duplicateCount: number;
  ignoredCount: number;
  failedCount: number;
}

function ignoredDraft(row: AutomationImport, error: string): TransactionIntakeDraft {
  return {
    amount: row.amountHint ?? 0,
    merchant: row.merchantHint ?? '',
    cat: row.categoryHint ?? 'shopping',
    source: row.source,
    note: row.source === 'sms' ? 'Ignored text alert' : 'Ignored Wallet transaction',
    cardLast4: row.cardLast4Hint,
    occurredAt: row.occurredAtHint,
    rawText: row.rawText,
    confidence: 0,
  };
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'automation_import_failed';
}

export function automationImportSavedSummary(savedTransactions: Transaction[]): string {
  if (savedTransactions.length !== 1) {
    return `Imported ${savedTransactions.length} queued transactions`;
  }

  const tx = savedTransactions[0];
  const date = tx.fullDate || (tx.occurredAt ? new Date(tx.occurredAt).toLocaleDateString() : '');
  return date ? `Imported ${tx.merchant} · ${date}` : `Imported ${tx.merchant}`;
}

export async function processPendingAutomationImports(
  deps: AutomationImportProcessorDeps,
  limit = 20,
): Promise<AutomationImportProcessorResult> {
  const {
    automationImportsRepo,
    transactionsRepo,
    categoriesRepo,
    settingsRepo,
  } = deps;
  const pending = automationImportsRepo.listPending(limit);
  const savedTransactions: Transaction[] = [];
  const duplicateTransactions: Transaction[] = [];
  let duplicateCount = 0;
  let ignoredCount = 0;
  let failedCount = 0;

  for (const row of pending) {
    const current = automationImportsRepo.get(row.id);
    if (!current || current.status !== 'pending') continue;

    const attempts = current.attempts + 1;
    automationImportsRepo.update(current.id, {
      status: 'processing',
      attempts,
      error: undefined,
    });

    const draft = draftFromAutomationHints({
      source: current.source,
      rawText: current.rawText,
      amountHint: current.amountHint,
      merchantHint: current.merchantHint,
      categoryHint: current.categoryHint,
      occurredAtHint: current.occurredAtHint,
      cardLast4Hint: current.cardLast4Hint,
    });

    if (!draft) {
      const error = current.source === 'sms'
        ? explainTransactionIntakeRejection(current.rawText ?? '', 'sms') ?? 'Could not parse this text transaction.'
        : 'Could not parse this Wallet transaction.';
      automationImportsRepo.update(current.id, {
        status: 'ignored',
        attempts,
        error,
      });
      const settings = settingsRepo.get('settings');
      settingsRepo.update('settings', {
        meta: automationRunMeta(settings?.meta, 'ignored', ignoredDraft(current, error), {
          error,
          background: true,
        }),
      });
      ignoredCount += 1;
      continue;
    }

    try {
      const result = await saveAutomationTransaction(draft, {
        settings: settingsRepo.get('settings'),
        settingsRepo,
        transactionsRepo,
        transactions: transactionsRepo.list(),
        categories: categoriesRepo.list(),
      }, {
        background: true,
        initialDraft: draft,
        ledgerId: current.ledgerId,
        createdByUserId: current.createdByUserId,
      });

      if (result.status === 'duplicate') {
        automationImportsRepo.update(current.id, {
          status: 'duplicate',
          attempts,
          processedTransactionId: result.duplicate?.id,
          error: undefined,
        });
        if (result.duplicate) duplicateTransactions.push(result.duplicate);
        duplicateCount += 1;
      } else {
        const tx = result.transaction;
        automationImportsRepo.update(current.id, {
          status: 'processed',
          attempts,
          processedTransactionId: tx?.id,
          error: undefined,
        });
        if (tx) savedTransactions.push(tx);
      }
    } catch (error) {
      const message = failureMessage(error);
      automationImportsRepo.update(current.id, {
        status: 'failed',
        attempts,
        error: message,
      });
      const settings = settingsRepo.get('settings');
      settingsRepo.update('settings', {
        meta: automationRunMeta(settings?.meta, 'failed', draft, {
          error: message,
          background: true,
        }),
      });
      failedCount += 1;
    }
  }

  if (savedTransactions.length > 0) {
    transactionsRepo.refresh?.();
  }

  return {
    pendingCount: pending.length,
    firstSource: pending[0]?.source,
    savedTransactions,
    duplicateTransactions,
    duplicateCount,
    ignoredCount,
    failedCount,
  };
}
