import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Toast } from './components/Toast';

type ToastState = {
  message: string;
  onAction?: () => void;
  actionLabel?: string;
} | null;

interface AppFeedbackContextValue {
  showToast: (message: string, onAction?: () => void, actionLabel?: string) => void;
}

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((message: string, onAction?: () => void, actionLabel?: string) => {
    setToast({ message, onAction, actionLabel });
  }, []);

  const runToastAction = useCallback(() => {
    toast?.onAction?.();
    setToast(null);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <AppFeedbackContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <Toast
          theme={theme}
          message={toast?.message ?? null}
          actionLabel={toast?.actionLabel}
          onAction={toast?.onAction ? runToastAction : undefined}
          onDismiss={() => setToast(null)}
        />
      </View>
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) throw new Error('useAppFeedback must be used within AppFeedbackProvider');
  return ctx;
}
