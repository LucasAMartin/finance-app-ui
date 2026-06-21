import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, View, Text, Pressable, StyleSheet, Keyboard, TextInput, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import Animated, { Easing as ReEasing, useAnimatedReaction, useSharedValue, runOnJS, FadeIn, FadeOut } from 'react-native-reanimated';
import { Button as SwiftButton, DatePicker, Host, Menu } from '@expo/ui/swift-ui';
import { datePickerStyle, environment } from '@expo/ui/swift-ui/modifiers';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { formatActiveCurrencyAmount, getActiveCurrency } from '../currency';

// Compact (~0.48 of the screen) and expanded (near-full) snap points, mirroring
// the old SwiftUI `{ fraction: 0.48 }` and `.large` detents. Index 0 = compact,
// index 1 = expanded edit mode.
const COMPACT_FRACTION = 0.48;
const EXPANDED_FRACTION = 0.92;
const SNAP_POINTS = [`${COMPACT_FRACTION * 100}%`, `${EXPANDED_FRACTION * 100}%`];
const COMPACT_INDEX = 0;
const EXPANDED_INDEX = 1;
// gorhom's content view spans the full sheet height and slides down to reveal
// the active detent, so to vertically center within the *visible* area we size
// the content box to the detent height minus the chrome above it (drag handle +
// content top padding).
const SHEET_CHROME = 44;
const DATE_PICKER_EXPANDED_HEIGHT = 236;
type SheetPhase = 'closed' | 'presenting' | 'open' | 'dismissing';
const EARLY_EXPAND_INTENT_THRESHOLD = 0.08;
// Manual-swipe settle timing — crisp ease-out so detent changes feel decisive
// instead of mushy. Matches BillSheet's feel.
const SHEET_ANIM_MS = 300;
const SHEET_EASING = ReEasing.out(ReEasing.cubic);
// Forgiving expand: if an upward drag from compact releases past this fraction of
// the way to expanded, honor the intent even when the fling was too weak for
// gorhom's velocity projection to commit on its own. (0 = compact, 1 = expanded.)
const EXPAND_COMMIT_THRESHOLD = 0.25;

import * as Haptics from 'expo-haptics';
import { useLedgerMembers, useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryGroupFor, categoryMap, UNCATEGORIZED_LABEL } from '../repositories/categoryUtils';
import { appendMemberLabel, memberDisplayName } from '../repositories/memberLabels';
import type { Category, GroupKey, LedgerMember, Transaction } from '../repositories/types';
import { Icon } from './Icon';
import { MerchantMark } from './MerchantMark';
import { transactionUsesMerchantLogo } from '../merchantLogos';
import { Money, SheetPrimaryButton, SheetTextButton, FIELD_CARD, FIELD_ROW } from './shared';
import { PopupNumericKeypad } from './PopupNumericKeypad';
import { applyKeypadKey } from './NumericKeypad';
import { ScreenExitButton, EXIT_FLOAT_STYLE } from './GlassButton';
import { Theme, GROUP_COLORS } from '../theme';
import { TYPE } from '../typography';
import { LAYOUT } from '../spacing';

const GROUP_KEYS: GroupKey[] = ['needs', 'wants', 'savings'];
const GROUP_LABELS: Record<GroupKey, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};

const dateFromIso = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const formatOccurredAt = (d: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);

function isGoalContributionTx(tx: Transaction): boolean {
  return tx.meta?.kind === 'goal-contribution';
}

export function TxSheet({
  tx,
  visible,
  openRequestId,
  theme,
  onClose,
  onDeleted,
}: {
  tx: Transaction | null;
  visible: boolean;
  openRequestId: number;
  theme: Theme;
  onClose: () => void;
  onDeleted?: (tx: Transaction) => void;
}) {
  const { transactionsRepo, categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const ledgerMembers = useLedgerMembers();
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);   // sheet is up (presented, not dismissed)
  const phaseRef = useRef<SheetPhase>('closed');
  const pendingReopenRef = useRef(false);
  const visibleRef = useRef(visible);
  const txRef = useRef<Transaction | null>(tx);
  // gorhom writes the live sheet position here (0 = compact, 1 = expanded). We
  // switch content off this single continuous source instead of the discrete
  // onAnimate/onChange callbacks, which raced and left stale content on manual
  // swipes between detents.
  const animatedIndex = useSharedValue(COMPACT_INDEX);
  const openingToCompact = useSharedValue(false);
  const sheetAnimationConfigs = useBottomSheetTimingConfigs({
    duration: SHEET_ANIM_MS,
    easing: SHEET_EASING,
  });
  const lastTx = useRef<Transaction | null>(null);
  const sheetHeightRef = useRef(0);
  const pendingEarlyExpandRef = useRef(false);
  const earlyExpandAppliedRef = useRef(false);
  // The detent the sheet last *settled* at (not the live drag index). Lets the
  // forgiving-expand logic tell "dragged up from compact" from "collapsing down
  // from expanded" at release time, independent of gorhom's ambiguous from-index.
  const settledIndexRef = useRef(COMPACT_INDEX);
  visibleRef.current = visible;
  txRef.current = tx;
  if (tx) lastTx.current = tx;
  const t = lastTx.current;
  const canEditTx = t ? transactionsRepo.canEdit(t) : false;
  const txOwnerName = memberDisplayName(ledgerMembers, t?.createdByUserId);

  const [sheetIndex, setSheetIndex] = useState(COMPACT_INDEX);
  const [editCat, setEditCat] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editAmt, setEditAmt] = useState('');
  const [amountKeypadOpen, setAmountKeypadOpen] = useState(false);
  const [editOccurredAt, setEditOccurredAt] = useState<Date>(new Date());
  const [datePickerInlineOpen, setDatePickerInlineOpen] = useState(false);
  const [catTotal, setCatTotal] = useState<number | null>(null);
  const [deferredTxId, setDeferredTxId] = useState<string | null>(null);

  useEffect(() => {
    if (!canEditTx) setAmountKeypadOpen(false);
  }, [canEditTx]);

  useEffect(() => {
    if (tx !== null) {
      setSheetIndex(COMPACT_INDEX);
      setEditCat(tx.cat);
      setEditMerchant(tx.merchant);
      setEditNote(tx.note ?? '');
      setEditAmt(tx.amount.toFixed(2));
      setAmountKeypadOpen(false);
      setEditOccurredAt(dateFromIso(tx.occurredAt));
      setDatePickerInlineOpen(false);
    }
  }, [tx]);

  useEffect(() => {
    if (!visible) setAmountKeypadOpen(false);
  }, [visible]);

  const isExpanded = sheetIndex >= EXPANDED_INDEX;
  const visibleContentH = (isExpanded ? EXPANDED_FRACTION : COMPACT_FRACTION) * winH - SHEET_CHROME;
  const deferredContentReady = tx !== null && deferredTxId === tx.id;

  const presentSheet = useCallback(() => {
    if (!txRef.current) return;
    pendingReopenRef.current = false;
    pendingEarlyExpandRef.current = false;
    earlyExpandAppliedRef.current = false;
    presentedRef.current = true;
    phaseRef.current = 'presenting';
    openingToCompact.value = true;
    animatedIndex.value = COMPACT_INDEX;
    setSheetIndex(COMPACT_INDEX);
    sheetRef.current?.present();
  }, [animatedIndex, openingToCompact]);

  // Keep the modal instance stable. `openRequestId` is incremented only by the
  // imperative open() call; prepare() may update tx on press-down but must not
  // queue a modal reopen while a swipe/close is still dismissing.
  useEffect(() => {
    if (visible) {
      if (!txRef.current) return;
      if (phaseRef.current === 'dismissing') {
        pendingReopenRef.current = true;
        return;
      }
      if (!presentedRef.current) {
        presentSheet();
        return;
      }
      pendingEarlyExpandRef.current = false;
      earlyExpandAppliedRef.current = false;
      openingToCompact.value = false;
      animatedIndex.value = COMPACT_INDEX;
      setSheetIndex(COMPACT_INDEX);
      sheetRef.current?.snapToIndex(COMPACT_INDEX);
      return;
    }

    pendingReopenRef.current = false;
    if (!presentedRef.current) {
      phaseRef.current = 'closed';
      return;
    }
    presentedRef.current = false;
    phaseRef.current = 'dismissing';
    pendingEarlyExpandRef.current = false;
    earlyExpandAppliedRef.current = false;
    openingToCompact.value = false;
    sheetRef.current?.dismiss();
  }, [animatedIndex, openRequestId, openingToCompact, presentSheet, visible]);

  useEffect(() => {
    if (!isExpanded && amountKeypadOpen) setAmountKeypadOpen(false);
  }, [amountKeypadOpen, isExpanded]);

  useEffect(() => {
    if (!tx) {
      setDeferredTxId(null);
      return;
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setDeferredTxId(tx.id);
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [tx]);

  useEffect(() => {
    if (!tx) {
      setCatTotal(null);
      return;
    }
    let cancelled = false;
    setCatTotal(null);
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const txMonth = tx.occurredAt ? new Date(tx.occurredAt) : new Date();
      const total = transactionsRepo.getSummary({
        categoryIds: [tx.cat],
        from: new Date(txMonth.getFullYear(), txMonth.getMonth(), 1).toISOString(),
        to: new Date(txMonth.getFullYear(), txMonth.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(),
      }).expenseTotal;
      if (!cancelled) setCatTotal(total);
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [tx, transactionsRepo]);

  const saveEdit = () => {
    if (!t || !canEditTx) return;
    const amount = parseFloat(editAmt.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const nextMerchant = editMerchant.trim() || t.merchant;
    transactionsRepo.update(t.id, {
      amount,
      cat: editCat,
      merchant: nextMerchant,
      note: editNote,
      occurredAt: Number.isNaN(editOccurredAt.getTime()) ? t.occurredAt : editOccurredAt.toISOString(),
      recurring: t.recurring,
      type: t.type ?? 'expense',
      recurringRuleId: t.recurringRuleId,
      visibility: t.visibility ?? 'shared',
      createdByUserId: t.createdByUserId,
      updatedByUserId: 'local',
      meta: {
        ...t.meta,
        merchantSource: nextMerchant !== t.merchant || t.meta?.merchantSource === 'user' ? 'user' : t.meta?.merchantSource,
      },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAmountKeypadOpen(false);
    onClose();
  };

  const deleteTx = () => {
    if (!t || !canEditTx) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (onDeleted) onDeleted(t);
    else transactionsRepo.delete(t.id);
    setAmountKeypadOpen(false);
    onClose();
  };

  const applySheetIndex = useCallback((index: number) => {
    setSheetIndex(index);
    if (index < EXPANDED_INDEX) setAmountKeypadOpen(false);
  }, []);

  // Switch content the moment the sheet passes the midpoint between detents, in
  // either direction — driven by the continuous animated position so it tracks
  // manual swipes reliably and reacts mid-animation (not only on settle).
  useAnimatedReaction(
    () => (animatedIndex.value >= 0.5 ? EXPANDED_INDEX : COMPACT_INDEX),
    (next, prev) => {
      if (next !== prev) runOnJS(applySheetIndex)(next);
    },
    [applySheetIndex],
  );

  const applyEarlyExpandIntent = useCallback(() => {
    if (phaseRef.current === 'dismissing') return;
    if (!presentedRef.current || earlyExpandAppliedRef.current) return;
    pendingEarlyExpandRef.current = true;
    earlyExpandAppliedRef.current = true;
    openingToCompact.value = false;
    sheetRef.current?.snapToIndex(EXPANDED_INDEX, sheetAnimationConfigs);
  }, [openingToCompact, sheetAnimationConfigs]);

  const markEarlyExpandIntent = useCallback(() => {
    applyEarlyExpandIntent();
  }, [applyEarlyExpandIntent]);

  const clearEarlyExpandIntent = useCallback(() => {
    pendingEarlyExpandRef.current = false;
    earlyExpandAppliedRef.current = false;
  }, []);

  // If the user starts dragging upward before the initial present-to-compact
  // animation settles, interrupt that opening animation immediately so the
  // sheet does not bounce back to compact before expanding.
  useAnimatedReaction(
    () => openingToCompact.value && animatedIndex.value > EARLY_EXPAND_INTENT_THRESHOLD,
    (hasIntent, hadIntent) => {
      if (hasIntent && !hadIntent) runOnJS(markEarlyExpandIntent)();
    },
    [markEarlyExpandIntent],
  );

  const handleSheetChange = useCallback((index: number) => {
    phaseRef.current = index >= COMPACT_INDEX ? 'open' : 'dismissing';
    if (index < COMPACT_INDEX) {
      openingToCompact.value = false;
      clearEarlyExpandIntent();
      return;
    }
    settledIndexRef.current = index;
    openingToCompact.value = false;
    if (index >= EXPANDED_INDEX) clearEarlyExpandIntent();
  }, [clearEarlyExpandIntent, openingToCompact]);

  const handleSheetAnimate = useCallback((_from: number, to: number) => {
    if (to >= EXPANDED_INDEX && openingToCompact.value) markEarlyExpandIntent();
    // Forgiving expand: the user was resting at compact and dragged up, but
    // released too gently for gorhom's velocity projection to commit — so it's
    // settling back to compact. If they pulled past the threshold, honor the
    // upward intent and finish the expand. `animatedIndex` at animate-start is the
    // release position. Gated on the last *settled* detent so collapsing down from
    // expanded (settled === expanded) and dismissing (to < compact) are untouched.
    if (
      to === COMPACT_INDEX &&
      settledIndexRef.current === COMPACT_INDEX &&
      !openingToCompact.value &&
      animatedIndex.value >= EXPAND_COMMIT_THRESHOLD
    ) {
      sheetRef.current?.snapToIndex(EXPANDED_INDEX, sheetAnimationConfigs);
    }
  }, [animatedIndex, markEarlyExpandIntent, openingToCompact, sheetAnimationConfigs]);

  // Fires after a dismiss fully completes (swipe or programmatic). If a new
  // transaction arrived while dismissing, present it now instead of letting the
  // old close callback flip the parent back to hidden.
  const handleModalDismiss = useCallback(() => {
    presentedRef.current = false;
    phaseRef.current = 'closed';
    openingToCompact.value = false;
    clearEarlyExpandIntent();
    if (pendingReopenRef.current && visibleRef.current && txRef.current) {
      presentSheet();
      return;
    }
    pendingReopenRef.current = false;
    onClose();
  }, [onClose, presentSheet]);

  const handleIndicatorStyle = useMemo(() => ({ backgroundColor: theme.textTer }), [theme.textTer]);
  const backgroundStyle = useMemo(() => ({ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }), [theme.surface]);

  const expandToEdit = useCallback(() => {
    sheetRef.current?.snapToIndex(EXPANDED_INDEX, sheetAnimationConfigs);
  }, [sheetAnimationConfigs]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={COMPACT_INDEX}
      disappearsOnIndex={-1}
      opacity={0.4}
      pressBehavior="close"
    />
  ), []);

  const handleContentLayout = (height: number) => {
    const previous = sheetHeightRef.current;
    sheetHeightRef.current = height;
    if (amountKeypadOpen && previous > 0 && Math.abs(height - previous) > 8) {
      setAmountKeypadOpen(false);
    }
  };

  const openAmountKeypad = () => {
    Keyboard.dismiss();
    requestAnimationFrame(() => setAmountKeypadOpen(true));
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={COMPACT_INDEX}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      animatedIndex={animatedIndex}
      animationConfigs={sheetAnimationConfigs}
      // Claim the vertical drag after a small, symmetric threshold so the gesture
      // commits to the sheet instead of being eaten by child press targets — the
      // cause of "swipe a little, it stops, swipe again."
      activeOffsetY={[-8, 8]}
      onAnimate={handleSheetAnimate}
      onChange={handleSheetChange}
      // Close on `onDismiss` (fires AFTER the dismiss animation completes), so
      // no React commit lands on top of the running dismiss — this is what kept
      // swipe-to-close stuttering on the old SwiftUI sheet.
      onDismiss={handleModalDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
      keyboardBehavior={"none" as any}
    >
      <View
        style={[S.content, { backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.40)' }]}
        onLayout={event => handleContentLayout(event.nativeEvent.layout.height)}
      >
        {t && (
          <>
            <ScreenExitButton
              variant="close"
              onPress={() => { setAmountKeypadOpen(false); onClose(); }}
              tint={theme.textSec}
              fallbackBg={theme.chipBg}
              style={[EXIT_FLOAT_STYLE, { zIndex: 50 }]}
              accessibilityLabel="Close"
            />
            <View
              style={{
                height: visibleContentH,
                justifyContent: isExpanded ? 'flex-start' : 'center',
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              }}
            >
              <SheetBody
                tx={t}
                theme={theme}
                isExpanded={isExpanded}
                logoEnabled={deferredContentReady}
                cats={cats}
                categories={categories}
                members={ledgerMembers}
              />
              {/* Cross-fade the differing lower section on detent change; the
                  hero above stays put, so the swap reads as a soft dissolve
                  rather than a hard cut. Keyed so enter/exit fire on switch. */}
              <Animated.View
                key={isExpanded ? 'edit' : 'compact'}
                entering={FadeIn.duration(120)}
                exiting={FadeOut.duration(120)}
              >
                {!isExpanded ? (
                  <View>
                    <CompactSummary tx={t} catTotal={catTotal} theme={theme} cats={cats} categories={categories} members={ledgerMembers} />
                    {!canEditTx ? (
                      <Text style={[TYPE.caption, S.lockedCopy, { color: theme.textSec }]}>
                        {txOwnerName ?? 'This member'} has locked edits for this transaction.
                      </Text>
                    ) : (
                      <Pressable
                        onPress={expandToEdit}
                        pointerEvents="box-only"
                        style={S.expandHint}
                        accessibilityRole="button"
                        accessibilityLabel="Edit transaction"
                      >
                        <Icon name="chevUp" size={13} color={theme.textSec} stroke={2} />
                        <Text style={[S.expandHintText, { color: theme.textSec }]}>Edit</Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <EditSection
                    theme={theme}
                    editCat={editCat}
                    setEditCat={setEditCat}
                    editMerchant={editMerchant}
                    setEditMerchant={setEditMerchant}
                    editNote={editNote}
                    setEditNote={setEditNote}
                    editAmt={editAmt}
                    setEditAmt={setEditAmt}
                    onOpenAmountKeypad={openAmountKeypad}
                    onDismissAmountKeypad={() => setAmountKeypadOpen(false)}
                    editOccurredAt={editOccurredAt}
                    datePickerInlineOpen={datePickerInlineOpen}
                    onToggleDatePicker={() => setDatePickerInlineOpen(v => !v)}
                    onDateChange={setEditOccurredAt}
                    cats={cats}
                    categories={categories}
                    canEdit={canEditTx}
                    ownerName={txOwnerName}
                    onSave={saveEdit}
                    onDelete={deleteTx}
                  />
                )}
              </Animated.View>
            </View>
          </>
        )}
        {/* Mount the keypad only in expanded edit mode — it contains a BlurView
            that would otherwise composite on every frame of the sheet animation. */}
        {isExpanded && (
          <PopupNumericKeypad
            visible={amountKeypadOpen}
            theme={theme}
            onKey={(key) => setEditAmt(prev => applyKeypadKey(prev, key))}
            onDone={() => setAmountKeypadOpen(false)}
            passthrough
          />
        )}
      </View>
    </BottomSheetModal>
  );
}

function SheetBody({
  tx,
  theme,
  isExpanded,
  logoEnabled,
  cats,
  categories,
  members,
}: {
  tx: Transaction;
  theme: Theme;
  isExpanded: boolean;
  logoEnabled: boolean;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  members: LedgerMember[];
}) {
  const cat = cats[tx.cat];
  const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
  const isGoalContribution = isGoalContributionTx(tx);
  const useLogo = logoEnabled && !isGoalContribution && transactionUsesMerchantLogo(tx);
  const categoryLabel = appendMemberLabel(cat?.label ?? UNCATEGORIZED_LABEL, members, tx.createdByUserId);
  const meta = isGoalContribution ? `Goal contribution · ${categoryLabel}` : categoryLabel;
  const title = isGoalContribution && cat?.label ? `${cat.label} contribution` : tx.merchant;

  return (
    <View style={[S.hero, isExpanded && S.heroCompact]}>
      <MerchantMark
        merchant={title}
        catIcon={isGoalContribution ? 'target' : cat?.icon}
        color={groupColor}
        iconSize={isExpanded ? 18 : 24}
        logoEnabled={useLogo}
        size={isExpanded ? 40 : 52}
      />
      <Text style={[S.merchant, isExpanded && S.merchantCompact, { color: theme.text }]}>{title}</Text>
      <Text style={[S.metaLine, isExpanded && S.metaLineCompact, { color: theme.textSec }]} numberOfLines={1}>
        {meta}
        <Text style={{ color: theme.textTer }}> · </Text>
        {tx.fullDate}
        <Text style={{ color: theme.textTer }}> · </Text>
        {tx.time}
      </Text>
      <View style={{ marginTop: isExpanded ? 12 : 18 }}>
        <Money value={tx.amount} size={isExpanded ? 28 : 32} weight="600" prefix="−$" theme={theme} />
      </View>
    </View>
  );
}

function CompactSummary({
  tx,
  catTotal,
  theme,
  cats,
  categories,
  members,
}: {
  tx: Transaction;
  catTotal: number | null;
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  members: LedgerMember[];
}) {
  const cat = cats[tx.cat];
  const isGoalContribution = isGoalContributionTx(tx);
  const categoryLabel = appendMemberLabel(cat?.label ?? UNCATEGORIZED_LABEL, members, tx.createdByUserId);
  const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
  const catBudget = cat?.budget ?? 0;
  const ready = catTotal !== null;
  const catPct = ready && catBudget > 0 ? Math.min(100, Math.round((catTotal / catBudget) * 100)) : 0;

  return (
    <>
      {tx.note ? (
        <View style={[S.noteRow, { backgroundColor: theme.chipBg }]}>
          <Text style={[S.noteLabel, { color: theme.textSec }]}>Note</Text>
          <Text style={[S.noteValue, { color: theme.text }]}>{tx.note}</Text>
        </View>
      ) : null}
      <View style={S.budgetBlock}>
        <View style={S.usageRow}>
          <Text style={[S.usageLabel, { color: theme.textSec }]}>{categoryLabel} this month</Text>
          <Text style={[S.usageAmount, { color: theme.textSec }]}>
            <Text style={[TYPE.bodySmEm, { color: theme.text }]}>
              {ready ? formatActiveCurrencyAmount(catTotal, 0) : '...'}
            </Text>
            {' of '}{formatActiveCurrencyAmount(catBudget, 0)}
          </Text>
        </View>
        <View style={[S.bar, { backgroundColor: theme.hairline }]}>
          <View style={[S.barFill, { width: `${catPct}%` as any, backgroundColor: groupColor }]} />
        </View>
      </View>
    </>
  );
}

function EditSection({
  theme, editCat, setEditCat, editMerchant, setEditMerchant,
  editNote, setEditNote, editAmt, setEditAmt, onOpenAmountKeypad, onDismissAmountKeypad,
  editOccurredAt, datePickerInlineOpen, onToggleDatePicker, onDateChange,
  cats, categories, canEdit, ownerName, onSave, onDelete,
}: {
  theme: Theme;
  editCat: string; setEditCat: (v: string) => void;
  editMerchant: string; setEditMerchant: (v: string) => void;
  editNote: string; setEditNote: (v: string) => void;
  editAmt: string; setEditAmt: (v: string) => void;
  onOpenAmountKeypad: () => void;
  onDismissAmountKeypad: () => void;
  editOccurredAt: Date;
  datePickerInlineOpen: boolean;
  onToggleDatePicker: () => void;
  onDateChange: (v: Date) => void;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  canEdit: boolean;
  ownerName?: string;
  onSave: () => void;
  onDelete: () => void;
}) {
  const selectedGroup = categoryGroupFor(editCat, categories);
  const selectedGroupIdx = Math.max(0, GROUP_KEYS.indexOf(selectedGroup));
  const subcats = categories.filter(cat => cat.group === selectedGroup && !cat.archived);
  const selectedSubIdx = Math.max(0, subcats.findIndex(cat => cat.id === editCat));
  const groupColors: Record<GroupKey, string> = {
    needs: theme.dark ? GROUP_COLORS.needs.dark : GROUP_COLORS.needs.light,
    wants: theme.dark ? GROUP_COLORS.wants.dark : GROUP_COLORS.wants.light,
    savings: theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light,
  };
  const selectedGroupColor = groupColors[selectedGroup] ?? theme.accent.dot;
  const lockedFieldStyle = !canEdit && S.lockedFields;
  const merchantRef = useRef<any>(null);
  const noteRef = useRef<any>(null);

  return (
    <View style={[S.editSection, { borderTopColor: theme.hairline }]}>
      <View pointerEvents={canEdit ? 'auto' : 'none'} style={[S.fieldCard, lockedFieldStyle, { backgroundColor: theme.chipBg }]}>
        <Pressable
          onPress={onOpenAmountKeypad}
          disabled={!canEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit transaction amount"
          style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}
        >
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Amount</Text>
          <View style={S.amountDisplay}>
            <Text numberOfLines={1} style={[S.amountValue, { color: editAmt ? theme.text : theme.textTer }]}>
              <Text style={{ color: theme.textSec }}>{getActiveCurrency().symbol}</Text>{editAmt || '0.00'}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onToggleDatePicker}
          disabled={!canEdit}
          style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}
        >
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Date & time</Text>
          <View style={S.dateTimeEditor}>
            <Text style={[S.fieldInput, { color: theme.text }]}>{formatOccurredAt(editOccurredAt)}</Text>
          </View>
        </Pressable>
        {datePickerInlineOpen ? (
          <View
            style={[
              S.inlineDatePickerClip,
              {
                height: DATE_PICKER_EXPANDED_HEIGHT,
                borderBottomColor: theme.sep,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={S.inlineDatePickerWrap}>
              <Host matchContents ignoreSafeArea="all">
                <DatePicker
                  selection={editOccurredAt}
                  onDateChange={canEdit ? onDateChange : () => {}}
                  displayedComponents={['date', 'hourAndMinute']}
                  modifiers={[
                    datePickerStyle('wheel'),
                    environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                  ]}
                />
              </Host>
            </View>
          </View>
        ) : null}
        <Pressable
          disabled={!canEdit}
          onPress={() => { onDismissAmountKeypad(); merchantRef.current?.focus(); }}
          style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}
        >
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Merchant</Text>
          <BottomSheetTextInput
            ref={merchantRef}
            value={editMerchant}
            onChangeText={setEditMerchant}
            editable={canEdit}
            placeholder="Merchant name"
            placeholderTextColor={theme.textTer}
            keyboardAppearance={theme.dark ? 'dark' : 'light'}
            returnKeyType="done"
            selectTextOnFocus
            onFocus={onDismissAmountKeypad}
            style={[S.fieldInput, { color: theme.text, flex: 1 }]}
          />
        </Pressable>
        <Pressable
          disabled={!canEdit}
          onPress={() => { onDismissAmountKeypad(); noteRef.current?.focus(); }}
          style={S.fieldRow}
        >
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Note</Text>
          <BottomSheetTextInput
            ref={noteRef}
            value={editNote}
            onChangeText={setEditNote}
            editable={canEdit}
            placeholder="Optional"
            placeholderTextColor={theme.textTer}
            keyboardAppearance={theme.dark ? 'dark' : 'light'}
            returnKeyType="done"
            selectTextOnFocus
            onFocus={onDismissAmountKeypad}
            style={[S.fieldInput, { color: theme.text, flex: 1 }]}
          />
        </Pressable>
      </View>

      {/* Category picker */}
      <View
        pointerEvents={canEdit ? 'auto' : 'none'}
        style={[
          S.categoryPanel,
          lockedFieldStyle,
          {
            backgroundColor: theme.chipBg,
            borderColor: theme.hairline,
            marginTop: 20,
          },
        ]}
      >
        <SegmentedControl
          values={GROUP_KEYS.map(key => GROUP_LABELS[key])}
          selectedIndex={selectedGroupIdx}
          onChange={(e) => {
            if (!canEdit) return;
            const nextGroup = GROUP_KEYS[e.nativeEvent.selectedSegmentIndex];
            if (!nextGroup) return;
            const nextSubcats = categories.filter(cat => cat.group === nextGroup && !cat.archived);
            if (nextSubcats.length === 0) return;
            const nextKeep = nextSubcats.find(cat => cat.id === editCat);
            setEditCat((nextKeep ?? nextSubcats[0]).id);
          }}
          tintColor={theme.accent.dot}
          appearance={theme.dark ? 'dark' : 'light'}
          backgroundColor={theme.dark ? 'rgba(242,244,245,0.08)' : 'rgba(11,13,16,0.045)'}
          fontStyle={{ color: theme.dark ? 'rgba(242,244,245,0.68)' : 'rgba(11,13,16,0.62)' }}
          activeFontStyle={{ color: theme.dark ? '#080A0D' : '#F2F4F5', fontWeight: '600' }}
          style={S.groupSegmented}
        />

        <View style={[S.subcategoryRow, { borderTopColor: theme.hairline }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Subcategory</Text>
          {subcats.length > 0 ? (
            <Host ignoreSafeArea="all" style={{ width: 180, height: 28 }}>
              <Menu
                label={
                  <View style={[S.subcatMenuTrigger, { width: 180, height: 28, justifyContent: 'flex-end' }]}>
                    <Text style={[S.subcatMenuText, { color: theme.text }]} numberOfLines={1}>
                      {cats[subcats[selectedSubIdx]?.id ?? '']?.label ?? subcats[selectedSubIdx]?.label}
                    </Text>
                    <Icon name="chevDown" size={11} color={theme.text} stroke={2} />
                  </View>
                }
              >
                {subcats.map((cat, idx) => (
                  <SwiftButton
                    key={String(idx)}
                    systemImage={idx === selectedSubIdx ? 'checkmark' : undefined}
                    onPress={() => { if (canEdit) setEditCat(cat.id); }}
                    label={cats[cat.id]?.label ?? cat.label}
                  />
                ))}
              </Menu>
            </Host>
          ) : (
            <Text style={[TYPE.bodySm, { color: theme.textTer }]}>No subcategories</Text>
          )}
        </View>
      </View>

      {/* Save */}
      <SheetPrimaryButton
        label="Save changes"
        onPress={onSave}
        theme={theme}
        disabled={!canEdit}
        style={S.saveBtn}
      />
      {!canEdit && (
        <Text style={[TYPE.caption, S.lockedCopy, { color: theme.textSec }]}>
          {ownerName ?? 'This member'} has locked edits for this transaction.
        </Text>
      )}
      {canEdit && (
        <SheetTextButton
          label="Delete transaction"
          onPress={onDelete}
          theme={theme}
          tone="danger"
          style={S.deleteBtn}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  content: {
    paddingTop: 20,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  heroCompact: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  catCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  catCircleCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  merchant: { ...TYPE.headline, textAlign: 'center' },
  merchantCompact: { ...TYPE.pageTitle, textAlign: 'center' },
  metaLine: { ...TYPE.bodySm, marginTop: 5, textAlign: 'center' },
  metaLineCompact: { ...TYPE.caption, marginTop: 3, textAlign: 'center' },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  noteLabel: { ...TYPE.bodySm },
  noteValue: { ...TYPE.bodySmEm, flex: 1, textAlign: 'right', marginLeft: 12 },
  budgetBlock: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 9,
  },
  usageLabel: { ...TYPE.bodySm },
  usageAmount: { ...TYPE.bodySm },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  expandHintText: { ...TYPE.captionEm },
  editSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  editTitle: {
    ...TYPE.labelLg,
    fontWeight: '600',
    marginBottom: 12,
  },
  fieldCard: FIELD_CARD,
  fieldRow: FIELD_ROW,
  fieldLabel: { ...TYPE.body, flexShrink: 0 },
  fieldInput: { ...TYPE.subsectionTitle, fontWeight: '500', textAlign: 'right', padding: 0 },
  amountDisplay: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  amountValue: {
    ...TYPE.subsectionTitle,
    textAlign: 'right',
  },
  dateTimeEditor: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  inlineDatePickerClip: {
    overflow: 'hidden',
  },
  inlineDatePickerWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryPanel: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupSegmented: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
  },
  subcategoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: LAYOUT.rowPadY,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subcatMenuTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingLeft: 8,
    flexShrink: 1,
  },
  subcatMenuText: {
    ...TYPE.body,
    fontWeight: '500',
    flexShrink: 1,
  },
  saveBtn: {
    marginTop: 28,
    alignItems: 'center',
  },
  lockedFields: {
    opacity: 0.58,
  },
  lockedCopy: {
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  deleteBtn: {
    alignItems: 'center',
  },
});
