import React, { useCallback } from 'react';
import { router, useLocalSearchParams, usePreventZoomTransitionDismissal } from 'expo-router';

import { useAppFeedback } from '../src/AppFeedbackProvider';
import { ExpenseFlow, type SavedExpenseInfo } from '../src/components/ExpenseFlow';
import { useRepositories } from '../src/repositories/RepositoryProvider';
import { useTheme } from '../src/ThemeProvider';

export default function ExpenseRoute() {
  const { theme } = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { transactionsRepo } = useRepositories();
  const { showToast } = useAppFeedback();
  const initialMode = mode === 'manual' ? 'manual' : 'voice';
  usePreventZoomTransitionDismissal();

  const close = useCallback(() => {
    router.back();
  }, []);

  const handleSaved = useCallback((info: SavedExpenseInfo) => {
    showToast(
      `Added $${info.amount.toFixed(2)} to ${info.catLabel}`,
      () => transactionsRepo.delete(info.id),
    );
  }, [showToast, transactionsRepo]);

  return (
    <ExpenseFlow
      theme={theme}
      initialMode={initialMode}
      onClose={close}
      onSaved={handleSaved}
    />
  );
}
