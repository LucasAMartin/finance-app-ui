import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFooter,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import Reanimated, {
  Easing as ReEasing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, environment, tint } from '@expo/ui/swift-ui/modifiers';
import { Theme } from '../theme';
import { useLedgerMembers, useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import { memberDisplayName } from '../repositories/memberLabels';
import type { Bill } from '../repositories/types';
import { advanceDueDate } from '../selectors/finance';
import { MerchantMark } from './MerchantMark';
import { ScreenExitButton, EXIT_FLOAT_STYLE } from './GlassButton';
import { Money, SheetPrimaryButton, SheetTextButton } from './shared';
import { PopupNumericKeypad } from './PopupNumericKeypad';
import { applyKeypadKey } from './NumericKeypad';
import { TYPE } from '../typography';
import { LAYOUT } from '../spacing';

const SCREEN_H = Dimensions.get('window').height;
const COMPACT_SNAP_PCT = 60;
// Distance from sheet top to the bottom of the Amount row in the field card:
// paddingTop(20) + hero(197) + cardMargin(16) + amountRow(54) = 287
const CONTENT_DEPTH = 287;
const KEYPAD_DONE_AREA = 76;
const SHEET_EXPAND_MS = 300;
const KEYPAD_OPEN_DELAY_MS = 200;
const KEYPAD_OPEN_ANIM_MS = 280;
const KEYPAD_CLOSE_MS = 260;
const SHEET_COLLAPSE_MS = KEYPAD_CLOSE_MS;
const SHEET_EASING = ReEasing.out(ReEasing.cubic);
const EXPANDED_BUFFER_PX = -24;

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Yearly',
  customMonthly: 'Monthly',
};

export function BillSheet({
  bill,
  theme,
  onClose,
}: {
  bill: Bill | null;
  theme: Theme;
  onClose: () => void;
}) {
  const { transactionsRepo, recurringRulesRepo, categoriesRepo, sessionRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const ledgerMembers = useLedgerMembers();
  const cats = categoryMap(categories);
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const animatedIndex = useSharedValue(0);
  const animatedPosition = useSharedValue(SCREEN_H);

  const lastBill = useRef<Bill | null>(null);
  if (bill) lastBill.current = bill;
  const b = lastBill.current;
  const ruleId = b?.id.startsWith('bill-') ? b.id.slice(5) : (b?.id ?? '');
  const rule = ruleId ? recurringRulesRepo.get(ruleId) : undefined;
  const canEditBill = b
    ? sessionRepo.canEdit(rule?.createdByUserId ?? b.createdByUserId, rule?.ledgerId ?? b.ledgerId)
    : false;
  const ownerName = memberDisplayName(ledgerMembers, rule?.createdByUserId ?? b?.createdByUserId);
  const partialPaid = (rule?.meta?.partialPaid as number | undefined) ?? 0;

  const [editAmt, setEditAmt] = useState('');
  const [editDueDate, setEditDueDate] = useState<Date>(new Date());
  const [amountKeypadOpen, setAmountKeypadOpen] = useState(false);
  const [keypadH, setKeypadH] = useState(300);

  const keypadOpenRef = useRef(false);
  const keypadExpandedRef = useRef(false);
  const keypadOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearKeypadOpenTimer = useCallback(() => {
    if (keypadOpenTimerRef.current) {
      clearTimeout(keypadOpenTimerRef.current);
      keypadOpenTimerRef.current = null;
    }
  }, []);

  const expandAnimation = useBottomSheetTimingConfigs({ duration: SHEET_EXPAND_MS, easing: SHEET_EASING });
  const collapseAnimation = useBottomSheetTimingConfigs({ duration: SHEET_COLLAPSE_MS, easing: SHEET_EASING });

  const expandedSnapPct = useMemo(() => {
    const required = keypadH + KEYPAD_DONE_AREA + insets.bottom + CONTENT_DEPTH + EXPANDED_BUFFER_PX;
    return Math.min(94, Math.ceil((required / SCREEN_H) * 100));
  }, [keypadH, insets.bottom]);

  const snapPoints = useMemo(
    () => [`${COMPACT_SNAP_PCT}%`, `${expandedSnapPct}%`],
    [expandedSnapPct],
  );
  const actionTravel = useMemo(
    () => Math.max(0, ((expandedSnapPct - COMPACT_SNAP_PCT) / 100) * SCREEN_H),
    [expandedSnapPct],
  );
  const actionDockStyle = useAnimatedStyle(() => {
    const compactPosition = SCREEN_H - (COMPACT_SNAP_PCT / 100) * SCREEN_H;
    const progress = Math.max(0, compactPosition - animatedPosition.value);
    return { transform: [{ translateY: Math.min(actionTravel, progress) }] };
  }, [actionTravel, animatedPosition]);

  const openAmountKeypad = useCallback(() => {
    if (!canEditBill) return;
    keypadOpenRef.current = true;
    clearKeypadOpenTimer();
    sheetRef.current?.snapToIndex(1, expandAnimation);
    keypadOpenTimerRef.current = setTimeout(() => {
      keypadOpenTimerRef.current = null;
      if (keypadOpenRef.current) setAmountKeypadOpen(true);
    }, KEYPAD_OPEN_DELAY_MS);
  }, [canEditBill, clearKeypadOpenTimer, expandAnimation]);

  const closeAmountKeypad = useCallback(() => {
    keypadOpenRef.current = false;
    keypadExpandedRef.current = false;
    clearKeypadOpenTimer();
    setAmountKeypadOpen(false);
    sheetRef.current?.snapToIndex(0, collapseAnimation);
  }, [clearKeypadOpenTimer, collapseAnimation]);

  const closeKeypadForSwipe = useCallback(() => {
    if (!keypadOpenRef.current || !keypadExpandedRef.current) return;
    keypadOpenRef.current = false;
    keypadExpandedRef.current = false;
    clearKeypadOpenTimer();
    setAmountKeypadOpen(false);
  }, [clearKeypadOpenTimer]);

  useAnimatedReaction(
    () => animatedIndex.value,
    (index, previous) => {
      if (previous !== null && previous > 0.98 && index < previous && index < 0.96) {
        runOnJS(closeKeypadForSwipe)();
      }
    },
    [closeKeypadForSwipe],
  );

  const handleAmountKey = useCallback((key: Parameters<typeof applyKeypadKey>[1]) => {
    setEditAmt(prev => applyKeypadKey(prev, key));
  }, []);

  useEffect(() => {
    if (bill !== null) {
      setEditAmt(bill.amount.toFixed(2));
      const rId = bill.id.startsWith('bill-') ? bill.id.slice(5) : bill.id;
      const r = recurringRulesRepo.get(rId);
      setEditDueDate(r ? new Date(r.nextDueDate) : new Date());
    }
    keypadOpenRef.current = false;
    keypadExpandedRef.current = false;
    clearKeypadOpenTimer();
    setAmountKeypadOpen(false);
  }, [bill, clearKeypadOpenTimer]); // recurringRulesRepo is stable

  useEffect(() => {
    if (!canEditBill) closeAmountKeypad();
  }, [canEditBill, closeAmountKeypad]);

  useEffect(() => clearKeypadOpenTimer, [clearKeypadOpenTimer]);

  useEffect(() => {
    if (bill !== null) {
      if (!presentedRef.current) {
        presentedRef.current = true;
        sheetRef.current?.present();
      }
    } else {
      if (presentedRef.current) {
        presentedRef.current = false;
        sheetRef.current?.dismiss();
      }
    }
  }, [bill]);

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    onClose();
  }, [onClose]);

  const handleAnimate = useCallback((_from: number, to: number) => {
    if (to <= 0 && keypadOpenRef.current) {
      keypadOpenRef.current = false;
      keypadExpandedRef.current = false;
      clearKeypadOpenTimer();
      setAmountKeypadOpen(false);
      return;
    }
    if (to === 1 && !keypadOpenRef.current) {
      requestAnimationFrame(() => sheetRef.current?.snapToIndex(0));
    }
  }, [clearKeypadOpenTimer]);

  const handleChange = useCallback((index: number) => {
    if (index >= 1 && keypadOpenRef.current) keypadExpandedRef.current = true;
    if (index <= 0 && keypadOpenRef.current) {
      keypadOpenRef.current = false;
      keypadExpandedRef.current = false;
      clearKeypadOpenTimer();
      setAmountKeypadOpen(false);
    }
  }, [clearKeypadOpenTimer]);

  // Auto-save due date changes directly to the rule.
  const handleDateChange = useCallback((date: Date) => {
    setEditDueDate(date);
    if (ruleId && canEditBill) {
      recurringRulesRepo.update(ruleId, {
        nextDueDate: date.toISOString(),
        dayOfMonth: date.getDate(),
        updatedByUserId: 'local',
      });
    }
  }, [ruleId, canEditBill, recurringRulesRepo]);

  const handlePay = useCallback(() => {
    if (!b || !canEditBill) return;
    const amount = parseFloat(editAmt.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;

    transactionsRepo.create({
      merchant: b.merchant,
      cat: b.cat,
      amount,
      recurring: true,
      recurringRuleId: ruleId,
      occurredAt: new Date().toISOString(),
      type: 'expense',
      visibility: 'shared',
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });

    if (rule) {
      const isFullPayment = amount >= b.amount; // b.amount is already the remaining
      if (isFullPayment) {
        recurringRulesRepo.update(ruleId, {
          nextDueDate: advanceDueDate(rule),
          meta: { ...rule.meta, partialPaid: undefined },
          updatedByUserId: 'local',
        });
      } else {
        const existing = (rule.meta?.partialPaid as number | undefined) ?? 0;
        recurringRulesRepo.update(ruleId, {
          meta: { ...rule.meta, partialPaid: existing + amount },
          updatedByUserId: 'local',
        });
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    keypadOpenRef.current = false;
    keypadExpandedRef.current = false;
    clearKeypadOpenTimer();
    setAmountKeypadOpen(false);
    onClose();
  }, [b, canEditBill, editAmt, ruleId, rule, transactionsRepo, recurringRulesRepo, clearKeypadOpenTimer, onClose]);

  const handleDelete = useCallback(() => {
    if (!ruleId || !canEditBill) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    recurringRulesRepo.delete(ruleId);
    onClose();
  }, [ruleId, canEditBill, recurringRulesRepo, onClose]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.4}
      pressBehavior="close"
    />
  ), []);

  const actionBottomPadding = Math.max(insets.bottom, 16) + 12;

  const renderFooter = useCallback((props: BottomSheetFooterProps) => (
    <BottomSheetFooter {...props} bottomInset={0}>
      <PopupNumericKeypad
        visible={amountKeypadOpen}
        theme={theme}
        onKey={handleAmountKey}
        onDone={closeAmountKeypad}
        onHeightChange={setKeypadH}
        openDuration={KEYPAD_OPEN_ANIM_MS}
        closeDuration={KEYPAD_CLOSE_MS}
      />
    </BottomSheetFooter>
  ), [amountKeypadOpen, closeAmountKeypad, handleAmountKey, theme]);

  const handleIndicatorStyle = useMemo(() => ({ backgroundColor: theme.textTer }), [theme.textTer]);
  const backgroundStyle = useMemo(() => ({
    backgroundColor: theme.surface,
    borderRadius: 32,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  }), [theme.surface]);
  const sheetStyle = useMemo(() => ({
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden' as const,
  }), []);

  const groupColor = b ? categoryGroupColor(b.cat, categories, theme.dark) : theme.accent.dot;
  const cat = b ? cats[b.cat] : undefined;
  const darkScheme = theme.dark ? 'dark' : 'light';
  const sep = { borderTopColor: theme.sep, borderTopWidth: StyleSheet.hairlineWidth };

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      animatedIndex={animatedIndex}
      animatedPosition={animatedPosition}
      enableDynamicSizing={false}
      enablePanDownToClose
      enableHandlePanningGesture={false}
      enableContentPanningGesture
      enableOverDrag={false}
      activeOffsetY={8}
      style={sheetStyle}
      handleComponent={null}
      onDismiss={handleDismiss}
      onAnimate={handleAnimate}
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
    >
      <View style={[S.content, {
        backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.40)',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
      }]}>
        {b && (
          <>
            <ScreenExitButton
              variant="close"
              onPress={onClose}
              tint={theme.textSec}
              fallbackBg={theme.chipBg}
              style={EXIT_FLOAT_STYLE}
            />

            <View style={S.hero}>
              <MerchantMark
                merchant={b.merchant}
                catIcon={b.icon}
                color={groupColor}
                size={52}
                iconSize={24}
              />
              <Text style={[S.merchant, { color: theme.text, marginTop: 12 }]}>{b.merchant}</Text>
              <Text style={[S.metaLine, { color: theme.textSec }]} numberOfLines={1}>
                {cat?.label}
                {cat?.label ? <Text style={{ color: theme.textTer }}> · </Text> : null}
                {rule ? (CADENCE_LABEL[rule.cadence] ?? 'Recurring') : 'Recurring'}
                {partialPaid > 0 && rule
                  ? <Text style={{ color: theme.textTer }}> · ${rule.amount.toFixed(2)} total</Text>
                  : null}
              </Text>
              <View style={{ marginTop: 16 }}>
                <Money value={b.amount} size={32} weight="600" prefix="$" theme={theme} />
              </View>
            </View>

            {/* Field card — matches IncomeFlow's fieldCard / fieldRow design */}
            <View style={[S.fieldCard, { backgroundColor: theme.chipBg, marginHorizontal: 20 }]}>
              {/* Amount row — tappable, opens keypad */}
              <Pressable
                onPress={openAmountKeypad}
                disabled={!canEditBill}
                accessibilityRole="button"
                accessibilityLabel="Edit amount to pay"
                style={[S.fieldRow, !canEditBill && S.lockedFields]}
              >
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Amount</Text>
                <Text style={[S.amountValue, { color: editAmt ? theme.text : theme.textTer }]}>
                  <Text style={{ color: theme.textSec }}>$</Text>{editAmt || '0.00'}
                </Text>
              </Pressable>

              {/* Due date row — compact picker, auto-saves */}
              <View style={[S.fieldRow, sep, !canEditBill && S.lockedFields]}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Due date</Text>
                <Host ignoreSafeArea="all" matchContents>
                  <DatePicker
                    selection={editDueDate}
                    onDateChange={canEditBill ? handleDateChange : () => {}}
                    displayedComponents={['date']}
                    modifiers={[
                      datePickerStyle('compact'),
                      tint(theme.accent.dot),
                      environment({ key: 'colorScheme', value: darkScheme }),
                    ]}
                  />
                </Host>
              </View>
            </View>

            <Reanimated.View
              style={[
                S.actionDock,
                { bottom: actionBottomPadding + actionTravel },
                actionDockStyle,
              ]}
            >
              <SheetPrimaryButton
                label={`Pay $${editAmt || '0.00'}`}
                onPress={handlePay}
                theme={theme}
                disabled={!canEditBill}
                style={S.primaryBtn}
              />
              {canEditBill ? (
                <SheetTextButton
                  label="Delete expense"
                  onPress={handleDelete}
                  theme={theme}
                  tone="danger"
                  style={S.deleteBtn}
                />
              ) : (
                <Text style={[TYPE.caption, S.lockedCopy, { color: theme.textSec }]}>
                  {ownerName ?? 'This member'} has locked edits for this bill.
                </Text>
              )}
            </Reanimated.View>
          </>
        )}
      </View>
    </BottomSheetModal>
  );
}

const S = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 20,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  merchant: {
    ...TYPE.headline,
    textAlign: 'center',
  },
  metaLine: {
    ...TYPE.bodySm,
    marginTop: 5,
    textAlign: 'center',
  },

  // Matches IncomeFlow's fieldCard + fieldRow pattern exactly.
  fieldCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldLabel: {
    ...TYPE.body,
    flexShrink: 0,
  },
  amountValue: {
    ...TYPE.subsectionTitle,
    textAlign: 'right',
  },
  lockedFields: {
    opacity: 0.58,
  },
  actionDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingTop: 8,
  },
  primaryBtn: {
    marginHorizontal: 20,
    marginTop: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  deleteBtn: {
    alignItems: 'center',
  },
  lockedCopy: {
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
});
