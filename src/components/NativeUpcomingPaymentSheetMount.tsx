import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  NativeUpcomingPaymentSheet,
  type NativeUpcomingPaymentSheetPayload,
} from '../../modules/glass-card/src/NativeUpcomingPaymentSheet';
import { useTheme } from '../ThemeProvider';
import { formatActiveCurrencyAmount, getActiveCurrency } from '../currency';
import { advanceDueDate } from '../selectors/finance';
import { useLedgerMembers, useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import { memberDisplayName } from '../repositories/memberLabels';
import type { Bill } from '../repositories/types';
import { merchantLogoKey, useMerchantLogoMapForMerchants } from '../merchantLogos';

export interface NativeUpcomingPaymentSheetHandle {
  open: (bill: Bill) => void;
}

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Yearly',
  customMonthly: 'Monthly',
};

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
};

export const NativeUpcomingPaymentSheetMount = forwardRef<NativeUpcomingPaymentSheetHandle, {}>(
  function NativeUpcomingPaymentSheetMount(_props, ref) {
    const { theme } = useTheme();
    const {
      transactionsRepo,
      recurringRulesRepo,
      categoriesRepo,
      sessionRepo,
    } = useRepositories();
    const categories = useRepositoryList(categoriesRepo);
    const recurringRules = useRepositoryList(recurringRulesRepo);
    const ledgerMembers = useLedgerMembers();
    const [bill, setBill] = useState<Bill | null>(null);
    const [pendingOpenBillId, setPendingOpenBillId] = useState<string | null>(null);
    const [presentationToken, setPresentationToken] = useState(0);
    const logoMerchants = useMemo(() => (bill ? [bill.merchant] : []), [bill]);
    const merchantLogos = useMerchantLogoMapForMerchants(logoMerchants, !!bill);

    useImperativeHandle(ref, () => ({
      open: (next) => {
        setBill(next);
        setPendingOpenBillId(next.id);
      },
    }), []);

    const ruleId = bill?.id.startsWith('bill-') ? bill.id.slice(5) : (bill?.id ?? '');
    const rule = useMemo(
      () => recurringRules.find(item => item.id === ruleId),
      [recurringRules, ruleId],
    );
    const categoryInfo = useMemo(() => categoryMap(categories), [categories]);
    const currency = getActiveCurrency();

    const payload = useMemo<NativeUpcomingPaymentSheetPayload | null>(() => {
      if (!bill) return null;

      const cat = categoryInfo[bill.cat];
      const groupColor = categoryGroupColor(bill.cat, categories, theme.dark);
      const partialPaid = (rule?.meta?.partialPaid as number | undefined) ?? 0;
      const canEdit = sessionRepo.canEdit(rule?.createdByUserId ?? bill.createdByUserId, rule?.ledgerId ?? bill.ledgerId);
      const ownerName = memberDisplayName(ledgerMembers, rule?.createdByUserId ?? bill.createdByUserId);
      const logo = merchantLogos.get(merchantLogoKey(bill.merchant));
      const totalAmountText = partialPaid > 0 && rule
        ? formatActiveCurrencyAmount(rule.amount, true)
        : undefined;

      return {
        id: bill.id,
        merchant: bill.merchant,
        categoryLabel: cat?.label,
        cadenceLabel: rule ? (CADENCE_LABEL[rule.cadence] ?? 'Recurring') : 'Recurring',
        totalAmountText,
        amount: bill.amount,
        editAmount: bill.amount.toFixed(currency.decimals),
        amountText: `${bill.estimate ? '~' : ''}${formatActiveCurrencyAmount(bill.amount, true)}`,
        dueDateText: bill.dueDate,
        dueDateISO: rule?.nextDueDate ?? new Date().toISOString(),
        canEdit,
        lockedOwnerName: ownerName,
        currencySymbol: currency.symbol,
        fallbackSystemName: CATEGORY_SF_SYMBOL[bill.icon] ?? 'calendar',
        iconColor: groupColor,
        iconBgColor: hexToRgba(groupColor, 0.14),
        logoUrl: logo?.logoUrl,
        logoBgColor: logo?.bgColor,
        surface: theme.surface,
        sheetBg: theme.dark ? theme.surface : '#FFFFFF',
        chipBg: theme.chipBg,
        text: theme.text,
        textSec: theme.textSec,
        textTer: theme.textTer,
        sep: theme.sep,
        accent: theme.accent.dot,
      };
    }, [bill, categories, categoryInfo, currency.decimals, currency.symbol, ledgerMembers, merchantLogos, rule, sessionRepo, theme]);

    useEffect(() => {
      if (!bill || !payload || pendingOpenBillId !== bill.id) return;
      setPresentationToken(token => token + 1);
      setPendingOpenBillId(null);
    }, [bill, payload, pendingOpenBillId]);

    const handlePay = (amount: number) => {
      if (!bill) return;
      if (!Number.isFinite(amount) || amount <= 0) return;
      const latestRule = ruleId ? recurringRulesRepo.get(ruleId) : undefined;
      const canEdit = sessionRepo.canEdit(latestRule?.createdByUserId ?? bill.createdByUserId, latestRule?.ledgerId ?? bill.ledgerId);
      if (!canEdit) return;

      transactionsRepo.create({
        merchant: bill.merchant,
        cat: bill.cat,
        amount,
        recurring: true,
        recurringRuleId: ruleId,
        occurredAt: new Date().toISOString(),
        type: 'expense',
        visibility: 'shared',
        createdByUserId: 'local',
        updatedByUserId: 'local',
      });

      if (latestRule) {
        const isFullPayment = amount >= bill.amount;
        if (isFullPayment) {
          recurringRulesRepo.update(ruleId, {
            nextDueDate: advanceDueDate(latestRule),
            meta: { ...latestRule.meta, partialPaid: undefined },
            updatedByUserId: 'local',
          });
        } else {
          const existing = (latestRule.meta?.partialPaid as number | undefined) ?? 0;
          recurringRulesRepo.update(ruleId, {
            meta: { ...latestRule.meta, partialPaid: existing + amount },
            updatedByUserId: 'local',
          });
        }
      }

      setBill(null);
      setPendingOpenBillId(null);
    };

    const handleDelete = () => {
      if (!bill || !ruleId) return;
      const latestRule = recurringRulesRepo.get(ruleId);
      const canEdit = sessionRepo.canEdit(latestRule?.createdByUserId ?? bill.createdByUserId, latestRule?.ledgerId ?? bill.ledgerId);
      if (!canEdit) return;
      recurringRulesRepo.delete(ruleId);
      setBill(null);
      setPendingOpenBillId(null);
    };

    const handleDueDateChange = (dueDateISO: string) => {
      if (!bill || !ruleId) return;
      const nextDate = new Date(dueDateISO);
      if (Number.isNaN(nextDate.getTime())) return;
      const latestRule = recurringRulesRepo.get(ruleId);
      const canEdit = sessionRepo.canEdit(latestRule?.createdByUserId ?? bill.createdByUserId, latestRule?.ledgerId ?? bill.ledgerId);
      if (!canEdit) return;
      recurringRulesRepo.update(ruleId, {
        nextDueDate: dueDateISO,
        dayOfMonth: nextDate.getDate(),
        updatedByUserId: 'local',
      });
    };

    return (
      <NativeUpcomingPaymentSheet
        presentationToken={presentationToken}
        payload={payload}
        isDark={theme.dark}
        onPay={handlePay}
        onDelete={handleDelete}
        onDueDateChange={handleDueDateChange}
        onDismiss={() => {
          setBill(null);
          setPendingOpenBillId(null);
        }}
      />
    );
  },
);

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
