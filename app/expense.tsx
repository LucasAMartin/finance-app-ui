import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, usePreventZoomTransitionDismissal } from 'expo-router';

import {
  parseTransactionIntake,
  transactionAutomationFingerprint,
  transactionIntakeSourceLabel,
  type TransactionIntakeDraft,
  type TransactionIntakeSource,
} from '../src/automation/parseTransactionIntake';
import { useAppFeedback } from '../src/AppFeedbackProvider';
import { ExpenseFlow, type SavedExpenseInfo } from '../src/components/ExpenseFlow';
import { useRepositories, useRepositoryList } from '../src/repositories/RepositoryProvider';
import { categoryMap } from '../src/repositories/categoryUtils';
import type { Transaction } from '../src/repositories/types';
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

function normalizedMerchant(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sameCents(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

function metaString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function likelyDuplicate(rows: Transaction[], draft: TransactionIntakeDraft): Transaction | undefined {
  const fingerprint = transactionAutomationFingerprint(draft);
  if (fingerprint) {
    const exact = rows.find(tx => tx.type !== 'income' && tx.meta?.automationFingerprint === fingerprint);
    if (exact) return exact;
  }

  const draftTime = draft.occurredAt ? new Date(draft.occurredAt).getTime() : Date.now();
  const merchant = normalizedMerchant(draft.merchant);
  return rows.find(tx => {
    if (tx.type === 'income') return false;
    if (!sameCents(tx.amount, draft.amount)) return false;
    if (merchant && normalizedMerchant(tx.merchant) !== merchant) return false;
    const txCard = metaString(tx.meta?.cardLast4);
    if (draft.cardLast4 && txCard && draft.cardLast4 !== txCard) return false;
    const txTime = tx.occurredAt ? new Date(tx.occurredAt).getTime() : draftTime;
    return Math.abs(txTime - draftTime) <= 5 * 60 * 1000;
  });
}

function applePayAutomationRunMeta(
  currentMeta: Record<string, unknown> | undefined,
  status: 'saved' | 'duplicate' | 'review' | 'failed',
  draft: TransactionIntakeDraft,
  options: { transactionId?: string; error?: string } = {},
): Record<string, unknown> {
  const occurredAt = draft.occurredAt ?? new Date().toISOString();
  const fingerprint = transactionAutomationFingerprint({ ...draft, occurredAt });
  const nextMeta: Record<string, unknown> = {
    ...(currentMeta ?? {}),
    applePayAutomationLastStatus: status,
    applePayAutomationLastRunAt: new Date().toISOString(),
    applePayAutomationLastMerchant: draft.merchant || 'Apple Pay',
    applePayAutomationLastAmount: draft.amount,
    applePayAutomationLastOccurredAt: occurredAt,
    applePayAutomationLastFingerprint: fingerprint,
    applePayAutomationLastTransactionId: options.transactionId,
    applePayAutomationLastError: options.error,
    applePayAutomationLastBackground: false,
  };

  if (__DEV__) {
    nextMeta.applePayAutomationLastReplayText = draft.rawText;
    nextMeta.applePayAutomationLastReplayAmount = draft.amount;
    nextMeta.applePayAutomationLastReplayMerchant = draft.merchant;
    nextMeta.applePayAutomationLastReplayOccurredAt = occurredAt;
    nextMeta.applePayAutomationLastReplayCategory = draft.cat;
    nextMeta.applePayAutomationLastReplayCardLast4 = draft.cardLast4;
  }

  Object.keys(nextMeta).forEach(key => {
    if (nextMeta[key] === undefined) delete nextMeta[key];
  });
  return nextMeta;
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
  const cats = categoryMap(categories);
  const { showToast } = useAppFeedback();
  const autoSaveHandledRef = useRef(false);
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
      const nextMerchant = merchant || parsed.merchant;
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
  usePreventZoomTransitionDismissal();

  const autoSaveApplePay = !!initialDraft
    && initialDraft.source === 'wallet'
    && param(params.preview) !== '1'
    && settings?.meta?.applePayAutomationMode === 'autosave';

  useEffect(() => {
    if (!autoSaveApplePay || !initialDraft || autoSaveHandledRef.current) return;
    autoSaveHandledRef.current = true;

    const duplicate = likelyDuplicate(transactions, initialDraft);
    if (duplicate) {
      settingsRepo.update('settings', {
        meta: applePayAutomationRunMeta(settings?.meta, 'duplicate', initialDraft, { transactionId: duplicate.id }),
      });
      showToast('Apple Pay transaction already imported');
      router.replace('/');
      return;
    }

    const cat = cats[initialDraft.cat] ? initialDraft.cat : categories[0]?.id ?? 'shopping';
    const rawMerchant = initialDraft.merchant.trim();
    const merchant = rawMerchant || cats[cat]?.label || 'Apple Pay';
    const occurredAt = initialDraft.occurredAt ?? new Date().toISOString();
    const automationFingerprint = transactionAutomationFingerprint({
      ...initialDraft,
      merchant,
      occurredAt,
    });
    const tx = transactionsRepo.create({
      amount: initialDraft.amount,
      cat,
      merchant,
      note: initialDraft.note,
      occurredAt,
      type: 'expense',
      visibility: 'shared',
      createdByUserId: 'local',
      updatedByUserId: 'local',
      meta: {
        merchantSource: rawMerchant ? 'automation' : 'fallback',
        automationSource: initialDraft.source,
        automationConfidence: initialDraft.confidence,
        cardLast4: initialDraft.cardLast4,
        automationOccurredAt: occurredAt,
        automationFingerprint,
      },
    });
    settingsRepo.update('settings', {
      meta: applePayAutomationRunMeta(settings?.meta, 'saved', { ...initialDraft, merchant, occurredAt }, { transactionId: tx.id }),
    });
    showToast(
      `Added $${initialDraft.amount.toFixed(2)} from Apple Pay`,
      () => transactionsRepo.delete(tx.id),
    );
    router.replace('/');
  }, [
    autoSaveApplePay,
    categories,
    cats,
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

  if (autoSaveApplePay) {
    return (
      <View style={[styles.importingRoot, { backgroundColor: theme.bg }]}>
        <Text style={[TYPE.pageTitle, { color: theme.text }]}>Importing Apple Pay transaction</Text>
        <Text style={[TYPE.bodyRegular, styles.importingText, { color: theme.textSec }]}>
          This should only take a moment.
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
