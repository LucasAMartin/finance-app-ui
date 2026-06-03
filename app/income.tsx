import React, { useCallback } from 'react';
import { router, usePreventZoomTransitionDismissal } from 'expo-router';

import { useAppFeedback } from '../src/AppFeedbackProvider';
import { IncomeFlow, type SavedIncomeInfo } from '../src/components/IncomeFlow';
import { useRepositories } from '../src/repositories/RepositoryProvider';
import { useTheme } from '../src/ThemeProvider';

export default function IncomeRoute() {
  const { theme } = useTheme();
  const { incomeRepo } = useRepositories();
  const { showToast } = useAppFeedback();
  usePreventZoomTransitionDismissal();

  const close = useCallback(() => {
    router.back();
  }, []);

  const handleSaved = useCallback((info: SavedIncomeInfo) => {
    showToast(
      `Added $${info.amount.toFixed(2)} from ${info.source}`,
      () => incomeRepo.delete(info.id),
    );
  }, [incomeRepo, showToast]);

  return <IncomeFlow theme={theme} onClose={close} onSaved={handleSaved} />;
}
