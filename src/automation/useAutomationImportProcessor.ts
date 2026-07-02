import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAppFeedback } from '../AppFeedbackProvider';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import type { Transaction } from '../repositories/types';
import { automationDisplaySource } from './saveAutomationTransaction';
import {
  automationImportSavedSummary,
  processPendingAutomationImports,
  type AutomationImportProcessorResult,
} from './processAutomationImports';

interface UseAutomationImportProcessorOptions {
  onOpenTransaction?: (tx: Transaction) => void;
}

export function useAutomationImportProcessor(options: UseAutomationImportProcessorOptions = {}) {
  const {
    automationImportsRepo,
    transactionsRepo,
    categoriesRepo,
    settingsRepo,
  } = useRepositories();
  const imports = useRepositoryList(automationImportsRepo);
  const { showToast } = useAppFeedback();
  const processingRef = useRef(false);
  const onOpenTransaction = options.onOpenTransaction;

  const processPending = useCallback(async () => {
    if (processingRef.current) return;

    processingRef.current = true;
    let result: AutomationImportProcessorResult;

    try {
      result = await processPendingAutomationImports({
        automationImportsRepo,
        transactionsRepo,
        categoriesRepo,
        settingsRepo,
      });
    } finally {
      processingRef.current = false;
    }

    if (result.pendingCount === 0) return;

    if (result.savedTransactions.length > 0) {
      const firstSaved = result.savedTransactions[0];
      showToast(
        automationImportSavedSummary(result.savedTransactions),
        onOpenTransaction ? () => onOpenTransaction(firstSaved) : undefined,
        onOpenTransaction ? 'View' : undefined,
      );
      return;
    }
    if (result.failedCount > 0) {
      showToast('Queued automation import needs review');
      return;
    }
    if (result.ignoredCount > 0 && result.duplicateCount === 0) {
      showToast('Ignored a non-transaction automation message');
      return;
    }
    if (result.duplicateCount > 0 && result.pendingCount === result.duplicateCount) {
      const duplicate = result.duplicateTransactions[0];
      const source = result.firstSource ?? 'unknown';
      showToast(
        `${automationDisplaySource(source)} transaction already imported`,
        duplicate && onOpenTransaction ? () => onOpenTransaction(duplicate) : undefined,
        duplicate && onOpenTransaction ? 'View' : undefined,
      );
    }
  }, [
    automationImportsRepo,
    categoriesRepo,
    onOpenTransaction,
    settingsRepo,
    showToast,
    transactionsRepo,
  ]);

  useEffect(() => {
    void processPending();
  }, [imports, processPending]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      automationImportsRepo.refresh?.();
      void processPending();
    });
    return () => subscription.remove();
  }, [automationImportsRepo, processPending]);
}
