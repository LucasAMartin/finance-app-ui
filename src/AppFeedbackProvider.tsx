import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Toast } from './components/Toast';

type ToastState = {
  message: string;
  onUndo?: () => void;
} | null;

interface AppFeedbackContextValue {
  showToast: (message: string, onUndo?: () => void) => void;
}

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    setToast({ message, onUndo });
  }, []);

  const runToastUndo = useCallback(() => {
    toast?.onUndo?.();
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
          onAction={toast?.onUndo ? runToastUndo : undefined}
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
