import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { NativeTransactionSheet, type NativeTransactionSheetPayload } from '../../modules/glass-card/src/NativeTransactionSheet';
import { formatActiveCurrencyAmount, getActiveCurrency } from '../currency';
import { useTheme } from '../ThemeProvider';
import { useLedgerMembers, useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { appendMemberLabel, memberDisplayName } from '../repositories/memberLabels';
import { categoryGroupColor, categoryGroupFor, categoryMap, UNCATEGORIZED_LABEL } from '../repositories/categoryUtils';
import type { Category, GroupKey, Transaction } from '../repositories/types';
import { merchantLogoKey, transactionUsesMerchantLogo, useMerchantLogoMapForMerchants } from '../merchantLogos';

export interface NativeTransactionSheetHandle {
  prepare: (tx: Transaction) => void;
  open: (tx: Transaction) => void;
}

const GROUP_ORDER: GroupKey[] = ['needs', 'wants', 'savings'];

const CATEGORY_SF_SYMBOL: Record<string, string> = {
  cart: 'cart',
  fork: 'fork.knife',
  car: 'car',
  bag: 'bag',
  doc: 'doc',
  film: 'film',
  home: 'house',
  wallet: 'wallet.pass',
  receipt: 'receipt',
  cards: 'creditcard',
  repeat: 'repeat',
  tag: 'tag',
  sparkle: 'sparkles',
  cup: 'cup.and.saucer',
  cal: 'calendar',
  note: 'note.text',
  chart: 'chart.bar',
  profile: 'person',
  bell: 'bell',
  target: 'target',
};

function isGoalContributionTx(tx: Transaction): boolean {
  return tx.meta?.kind === 'goal-contribution';
}

export const NativeTransactionSheetMount = forwardRef<NativeTransactionSheetHandle, {
  onDeleted?: (tx: Transaction) => void;
}>(function NativeTransactionSheetMount({ onDeleted }, ref) {
  const { theme } = useTheme();
  const { transactionsRepo, categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const ledgerMembers = useLedgerMembers();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [pendingOpenTxId, setPendingOpenTxId] = useState<string | null>(null);
  const [presentationToken, setPresentationToken] = useState(0);
  const categoryInfo = useMemo(() => categoryMap(categories), [categories]);
  const currency = getActiveCurrency();
  const logoMerchants = useMemo(() => {
    if (!tx || isGoalContributionTx(tx) || !transactionUsesMerchantLogo(tx)) return [];
    return [tx.merchant];
  }, [tx]);
  const merchantLogos = useMerchantLogoMapForMerchants(logoMerchants, !!tx);

  useImperativeHandle(ref, () => ({
    prepare: (next) => {
      setTx(next);
    },
    open: (next) => {
      setTx(next);
      setPendingOpenTxId(next.id);
    },
  }), []);

  const payload = useMemo<NativeTransactionSheetPayload | null>(() => {
    if (!tx) return null;

    const cat = categoryInfo[tx.cat];
    const isGoalContribution = isGoalContributionTx(tx);
    const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
    const categoryLabel = appendMemberLabel(cat?.label ?? UNCATEGORIZED_LABEL, ledgerMembers, tx.createdByUserId);
    const title = isGoalContribution && cat?.label ? `${cat.label} contribution` : tx.merchant;
    const metaPrefix = isGoalContribution ? `Goal contribution · ${categoryLabel}` : categoryLabel;
    const metaLine = `${metaPrefix} · ${tx.fullDate} · ${tx.time}`;
    const canEdit = transactionsRepo.canEdit(tx);
    const ownerName = memberDisplayName(ledgerMembers, tx.createdByUserId);
    const txMonth = tx.occurredAt ? new Date(tx.occurredAt) : new Date();
    const catTotal = transactionsRepo.getSummary({
      categoryIds: [tx.cat],
      from: new Date(txMonth.getFullYear(), txMonth.getMonth(), 1).toISOString(),
      to: new Date(txMonth.getFullYear(), txMonth.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(),
    }).expenseTotal;
    const catBudget = cat?.budget ?? 0;
    const categoryProgress = catBudget > 0 ? Math.min(1, catTotal / catBudget) : 0;
    const activeCategories = categories.length > 0
      ? categories.filter(category => !category.archived)
      : Object.entries(categoryInfo).map(([id, info]) => ({
        id,
        label: info.label,
        group: categoryGroupFor(id, categories),
      } as Category));
    const logo = tx && !isGoalContribution ? merchantLogos.get(merchantLogoKey(tx.merchant)) : undefined;
    const fallbackSystemName = CATEGORY_SF_SYMBOL[cat?.icon ?? (isGoalContribution ? 'target' : 'tag')] ?? 'tag';

    return {
      id: tx.id,
      title,
      merchant: tx.merchant,
      note: tx.note ?? '',
      amount: tx.amount,
      amountDraft: tx.amount.toFixed(currency.decimals),
      occurredAtISO: tx.occurredAt ?? new Date().toISOString(),
      metaLine,
      canEdit,
      lockedOwnerName: ownerName,
      currencySymbol: currency.symbol,
      categoryId: tx.cat,
      categoryLabel,
      categorySpendText: formatActiveCurrencyAmount(catTotal, 0),
      categoryBudgetText: formatActiveCurrencyAmount(catBudget, 0),
      categoryProgress,
      categoryColor: groupColor,
      fallbackSystemName,
      iconColor: groupColor,
      iconBgColor: hexToRgba(groupColor, 0.14),
      logoUrl: logo?.logoUrl,
      logoBgColor: logo?.bgColor,
      categories: activeCategories
        .filter(category => GROUP_ORDER.includes(category.group))
        .map(category => ({
          id: category.id,
          label: category.label,
          group: category.group,
        })),
      surface: theme.surface,
      sheetBg: theme.dark ? theme.surface : '#FFFFFF',
      chipBg: theme.chipBg,
      text: theme.text,
      textSec: theme.textSec,
      textTer: theme.textTer,
      sep: theme.sep,
      hairline: theme.hairline,
      accent: theme.accent.dot,
    };
  }, [categories, categoryInfo, currency.decimals, currency.symbol, ledgerMembers, merchantLogos, theme, transactionsRepo, tx]);

  useEffect(() => {
    if (!tx || !payload || pendingOpenTxId !== tx.id) return;
    setPresentationToken(token => token + 1);
    setPendingOpenTxId(null);
  }, [payload, pendingOpenTxId, tx]);

  const handleSave = (patch: {
    id: string;
    amount: number;
    categoryId: string;
    merchant: string;
    note: string;
    occurredAtISO: string;
  }) => {
    const current = transactionsRepo.get(patch.id) ?? tx;
    if (!current || !transactionsRepo.canEdit(current)) return;
    if (!Number.isFinite(patch.amount) || patch.amount <= 0) return;
    const nextMerchant = patch.merchant.trim() || current.merchant;

    transactionsRepo.update(current.id, {
      amount: patch.amount,
      cat: patch.categoryId,
      merchant: nextMerchant,
      note: patch.note,
      occurredAt: patch.occurredAtISO,
      recurring: current.recurring,
      type: current.type ?? 'expense',
      recurringRuleId: current.recurringRuleId,
      visibility: current.visibility ?? 'shared',
      createdByUserId: current.createdByUserId,
      updatedByUserId: 'local',
      meta: {
        ...current.meta,
        merchantSource: nextMerchant !== current.merchant || current.meta?.merchantSource === 'user'
          ? 'user'
          : current.meta?.merchantSource,
      },
    });
    setTx(null);
    setPendingOpenTxId(null);
  };

  const handleDelete = (id: string) => {
    const current = transactionsRepo.get(id) ?? tx;
    if (!current || !transactionsRepo.canEdit(current)) return;
    if (onDeleted) onDeleted(current);
    else transactionsRepo.delete(current.id);
    setTx(null);
    setPendingOpenTxId(null);
  };

  return (
    <NativeTransactionSheet
      presentationToken={presentationToken}
      payload={payload}
      isDark={theme.dark}
      onSave={handleSave}
      onDelete={handleDelete}
      onDismiss={() => {
        setTx(null);
        setPendingOpenTxId(null);
      }}
    />
  );
});

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return hex;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}
