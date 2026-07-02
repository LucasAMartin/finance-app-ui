import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, usePreventZoomTransitionDismissal } from 'expo-router';

import {
  explainTransactionIntakeRejection,
  parseTransactionIntake,
  transactionIntakeSourceLabel,
  type TransactionIntakeDraft,
  type TransactionIntakeSource,
} from '../src/automation/parseTransactionIntake';
import {
  automationDisplaySource,
  automationMetaPrefix,
  automationRunMeta,
  saveAutomationTransaction,
} from '../src/automation/saveAutomationTransaction';
import { useAppFeedback } from '../src/AppFeedbackProvider';
import { ExpenseFlow, type SavedExpenseInfo } from '../src/components/ExpenseFlow';
import { useRepositories, useRepositoryList } from '../src/repositories/RepositoryProvider';
import { useTheme } from '../src/ThemeProvider';
import { TYPE } from '../src/typography';
import { inferExpenseCategory } from '../src/voice/parseVoiceExpense';

function param(value?: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function validSource(value: string): TransactionIntakeSource {
  if (value === 'sms' || value === 'wallet' || value === 'shortcut' || value === 'url') return value;
  return 'unknown';
}

function amountFromParam(value: string): number {
  const normalized = value.replace(/[$,\s]/g, '');
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export default function ExpenseRoute() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    mode?: string;
    text?: string;
    body?: string;
    source?: string;
    amount?: string;
    merchant?: string;
    category?: string;
    cardLast4?: string;
    date?: string;
    occurredAt?: string;
    preview?: string;
    replay?: string;
  }>();
  const { transactionsRepo, categoriesRepo, settingsRepo } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const settings = useRepositoryList(settingsRepo)[0];
  const { showToast } = useAppFeedback();
  const autoSaveHandledRef = useRef(false);
  const issueHandledRef = useRef(false);
  const mode = param(params.mode);
  const initialMode = mode === 'manual' ? 'manual' : 'voice';
  const initialDraft = useMemo<TransactionIntakeDraft | null>(() => {
    const source = validSource(param(params.source));
    const text = param(params.text) || param(params.body);
    const amount = amountFromParam(param(params.amount));
    const merchant = param(params.merchant).trim();
    const categoryParam = param(params.category).trim();
    const cardLast4 = param(params.cardLast4).replace(/\D/g, '').slice(-4) || undefined;
    const occurredAtParam = param(params.occurredAt) || param(params.date);
    const occurredAt = occurredAtParam && Number.isFinite(new Date(occurredAtParam).getTime())
      ? new Date(occurredAtParam).toISOString()
      : undefined;
    const parsed = text ? parseTransactionIntake(text, source) : null;
    if (parsed) {
      const nextMerchant = source === 'sms' && text ? parsed.merchant : merchant || parsed.merchant;
      const nextCat = categoryParam || inferExpenseCategory(`${nextMerchant} ${text}`);
      return {
        ...parsed,
        amount: amount > 0 ? amount : parsed.amount,
        merchant: nextMerchant,
        cat: nextCat,
        cardLast4: cardLast4 ?? parsed.cardLast4,
        occurredAt: occurredAt ?? parsed.occurredAt,
        confidence: merchant || amount > 0 ? Math.max(parsed.confidence, 0.9) : parsed.confidence,
      };
    }

    if (source === 'sms') return null;
    if (amount <= 0) return null;

    const cat = categoryParam || inferExpenseCategory(merchant);
    return {
      amount,
      merchant,
      cat,
      source: source === 'unknown' ? 'url' : source,
      note: `Imported from ${transactionIntakeSourceLabel(source === 'unknown' ? 'url' : source)}`,
      cardLast4,
      occurredAt,
      confidence: merchant ? 0.9 : 0.55,
    };
  }, [
    params.amount,
    params.body,
    params.cardLast4,
    params.category,
    params.date,
    params.merchant,
    params.occurredAt,
    params.source,
    params.text,
  ]);
  const automationIssue = useMemo(() => {
    const source = validSource(param(params.source));
    if (source !== 'sms' || initialDraft) return null;
    const text = param(params.text) || param(params.body);
    return explainTransactionIntakeRejection(text, source);
  }, [
    initialDraft,
    params.body,
    params.source,
    params.text,
  ]);
  usePreventZoomTransitionDismissal();

  useEffect(() => {
    if (!automationIssue || issueHandledRef.current) return;
    issueHandledRef.current = true;
    const rawText = param(params.text) || param(params.body);
    settingsRepo.update('settings', {
      meta: automationRunMeta(settings?.meta, 'ignored', {
        amount: 0,
        merchant: '',
        cat: 'shopping',
        source: 'sms',
        note: 'Ignored text alert',
        rawText,
        confidence: 0,
      }, { error: automationIssue }),
    });
  }, [
    automationIssue,
    params.body,
    params.text,
    settings?.meta,
    settingsRepo,
  ]);

  const autoSaveAutomation = !!initialDraft
    && !!automationMetaPrefix(initialDraft.source)
    && param(params.preview) !== '1'
    && settings?.meta?.[`${automationMetaPrefix(initialDraft.source)}Mode`] === 'autosave';

  useEffect(() => {
    if (!autoSaveAutomation || !initialDraft || autoSaveHandledRef.current) return;
    autoSaveHandledRef.current = true;
    let cancelled = false;

    (async () => {
      const result = await saveAutomationTransaction(initialDraft, {
        settings,
        settingsRepo,
        transactionsRepo,
        transactions,
        categories,
      }, {
        background: false,
        initialDraft,
      });
      if (cancelled) return;

      if (result.status === 'duplicate') {
        showToast(`${automationDisplaySource(result.draft.source)} transaction already imported`);
        router.replace('/');
        return;
      }

      const draft = result.draft;
      const tx = result.transaction;
      if (!tx) return;
      showToast(
        `Added $${draft.amount.toFixed(2)} from ${automationDisplaySource(draft.source)}`,
        () => transactionsRepo.delete(tx.id),
      );
      router.replace('/');
    })().catch(error => {
      if (cancelled) return;
      settingsRepo.update('settings', {
        meta: automationRunMeta(settings?.meta, 'failed', initialDraft, {
          error: error instanceof Error ? error.message : 'automation_import_failed',
        }),
      });
      router.replace('/');
    });

    return () => {
      cancelled = true;
    };
  }, [
    autoSaveAutomation,
    categories,
    initialDraft,
    settings?.meta,
    settingsRepo,
    showToast,
    transactions,
    transactionsRepo,
  ]);

  const close = useCallback(() => {
    router.back();
  }, []);

  const handleSaved = useCallback((info: SavedExpenseInfo) => {
    showToast(
      `Added $${info.amount.toFixed(2)} to ${info.catLabel}`,
      () => transactionsRepo.delete(info.id),
    );
  }, [showToast, transactionsRepo]);

  if (autoSaveAutomation) {
    return (
      <View style={[styles.importingRoot, { backgroundColor: theme.bg }]}>
        <Text style={[TYPE.pageTitle, { color: theme.text }]}>
          Importing {initialDraft?.source === 'sms' ? 'text' : 'Apple Pay'} transaction
        </Text>
        <Text style={[TYPE.bodyRegular, styles.importingText, { color: theme.textSec }]}>
          This should only take a moment.
        </Text>
      </View>
    );
  }

  if (automationIssue) {
    return (
      <View style={[styles.importingRoot, { backgroundColor: theme.bg }]}>
        <Text style={[TYPE.pageTitle, { color: theme.text }]}>
          Text alert ignored
        </Text>
        <Text style={[TYPE.bodyRegular, styles.importingText, { color: theme.textSec }]}>
          {automationIssue}
        </Text>
      </View>
    );
  }

  return (
    <ExpenseFlow
      theme={theme}
      initialMode={initialDraft ? 'manual' : initialMode}
      initialDraft={initialDraft}
      onClose={close}
      onSaved={handleSaved}
    />
  );
}

const styles = StyleSheet.create({
  importingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  importingText: {
    marginTop: 8,
    textAlign: 'center',
  },
});
