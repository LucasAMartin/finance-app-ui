import React, { useMemo, useState, useRef, useCallback, useEffect, useContext, useSyncExternalStore } from 'react';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  Switch,
  ImageBackground,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');
import { Swipeable, ScrollView as GHScrollView, TapGestureHandler, State } from 'react-native-gesture-handler';

const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, GROUP_COLORS, OVER_DOT } from '../theme';
import { Icon } from '../components/Icon';
import { ScreenExitButton, EXIT_FLOAT_STYLE } from '../components/GlassButton';
import { applyKeypadKey, type KeypadKey } from '../components/NumericKeypad';
import { PopupNumericKeypad } from '../components/PopupNumericKeypad';
import { Collapsible } from '../components/Collapsible';
import { SheetPrimaryButton } from '../components/shared';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionCard } from '../components/SectionCard';
import { makeBgTranslateY, BG_PARALLAX_MAX } from '../components/headerScroll';
import { TYPE } from '../typography';
import { makeP, DARK_TEXT_SHADOW, makeScrim, deriveFloor, MEDIA } from '../wallpaperPalette';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryGroupFor } from '../repositories/categoryUtils';
import type { Bill, Category, GroupKey, Income, RecurringRule, SpendGroup, SpendSub, Transaction, TransactionCursor } from '../repositories/types';
import { monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import { CATEGORY_ICON_OPTIONS, ICON_DISPLAY_NAMES, inferCategoryIcon } from '../categoryIcons';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import {
  Button as SwiftButton,
  DatePicker,
  Menu,
  Picker,
  Text as SwiftText,
  Host,
} from '@expo/ui/swift-ui';
import {
  datePickerStyle,
  tint,
  pickerStyle,
  tag,
  fixedSize,
  environment,
} from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../ThemeProvider';

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
  onOpenIncome?: (ref: View) => void;
  // Fired when the inline amount keypad opens/closes so the app can hide the tab bar.
  onKeypadOpenChange?: (open: boolean) => void;
}

type Cadence = 'Mo' | '2w' | 'Wk' | 'Yr';
type CategoryRecurringCadence = RecurringRule['cadence'];
const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'Mo', label: 'Monthly' },
  { value: '2w', label: 'Bi-weekly' },
  { value: 'Wk', label: 'Weekly' },
  { value: 'Yr', label: 'Annual' },
];
const RECURRING_CADENCES: { value: CategoryRecurringCadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'annual', label: 'Annual' },
  { value: 'customMonthly', label: 'Custom monthly' },
];

const CURRENT_MONTH = '2026-05';
// Height reserved above the keypad surface for the floating Done button.
const KEYPAD_DONE_AREA = 76;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Cap Dynamic Type growth on dense, multi-column rows so large accessibility text
// sizes can't clip or collide. Full-width prose is intentionally left uncapped.
const MAX_FONT_SCALE = 1.4;

const monthKeyFromOffset = (baseKey: string, offset: number): string => {
  const [y, m] = baseKey.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
const dateFromYMD = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day || 1);
};
const monthStartDate = (monthKey: string): Date => dateFromYMD(`${monthKey}-01`);
const monthEndDate = (monthKey: string): Date => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0);
};
const toYMD = (date: Date): string => date.toISOString().slice(0, 10);
const toISODateTime = (date: Date): string => date.toISOString();
const defaultIncomeDateForMonth = (monthKey: string): Date => {
  const today = new Date();
  return today.toISOString().slice(0, 7) === monthKey ? today : monthStartDate(monthKey);
};
const formatDateShort = (value?: string): string => {
  if (!value) return 'Not set';
  const date = dateFromYMD(value);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

const bKey = (gKey: string, label: string) => `${gKey}:${label}`;
const billKey = (gKey: string, billId: string) => `bill:${gKey}:${billId}`;
const ruleIdFromBillId = (billId: string) => billId.startsWith('bill-') ? billId.slice(5) : billId;

const initBudgets = (groups: SpendGroup[], bills: Bill[], categories: Category[]): Record<string, number> => {
  const out: Record<string, number> = {};
  groups.forEach(g => g.subs.forEach(s => { out[bKey(g.key, s.label)] = s.budget; }));
  bills.forEach(bill => {
    const gKey = categoryGroupFor(bill.cat, categories);
    out[billKey(gKey, bill.id)] = bill.amount;
  });
  return out;
};

const GROUP_META: Record<GroupKey, { label: string; icon: string }> = {
  needs: { label: 'Needs', icon: 'home' },
  wants: { label: 'Wants', icon: 'sparkle' },
  savings: { label: 'Savings', icon: 'wallet' },
};

const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: 'needs', label: 'Needs' },
  { value: 'wants', label: 'Wants' },
  { value: 'savings', label: 'Savings' },
];

const slugify = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';

const CADENCE_TO_INCOME: Record<Cadence, Income['cadence']> = {
  Mo: 'monthly', '2w': 'biweekly', Wk: 'weekly', Yr: 'annual',
};
const INCOME_TO_CADENCE: Partial<Record<Income['cadence'], Cadence>> = {
  monthly: 'Mo', biweekly: '2w', weekly: 'Wk', annual: 'Yr',
};
const INCOME_CADENCE_LABEL: Record<Income['cadence'], string> = {
  monthly: 'Monthly',
  biweekly: 'Bi-weekly',
  weekly: 'Weekly',
  annual: 'Annual',
  oneTime: 'One-time',
};
// Monthly-equivalent of a single income source, matching monthlyIncome()'s math.
const incomeMonthly = (inc: Income): number => {
  switch (inc.cadence) {
    case 'weekly':   return Math.round(inc.amount * 52 / 12);
    case 'biweekly': return Math.round(inc.amount * 26 / 12);
    case 'annual':   return Math.round(inc.amount / 12);
    case 'oneTime':  return 0;
    default:         return inc.amount;
  }
};

const fmtAmt = (n: number) => n % 1 !== 0 ? n.toFixed(2) : n.toLocaleString();
const fmtMoney = (n: number) => Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

// Groups the live keypad draft exactly like fmtMoney so the amount keeps an
// identical width between display and edit (the leading "$" never shifts).
// Preserves a decimal point / digits the user is still typing.
const formatDraft = (draft: string): string => {
  if (!draft) return '0';
  const dot = draft.indexOf('.');
  const intRaw = dot === -1 ? draft : draft.slice(0, dot);
  const intGrouped = intRaw ? Number(intRaw).toLocaleString() : '0';
  return dot === -1 ? intGrouped : `${intGrouped}.${draft.slice(dot + 1)}`;
};

const parseAmountDraft = (text: string): number | null => {
  const clean = text.replace(/[$,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === '' || clean === '.') return null;
  const v = Number(clean);
  return Number.isFinite(v) && v >= 0 ? v : null;
};

function RotatingChevron({ open, color }: { open: boolean; color: string }) {
  const rot = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rot, {
      toValue: open ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open]);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Icon name="chevDown" size={11} color={color} stroke={2} />
    </Animated.View>
  );
}

function IconBtn({ onPress, children, size = 40 }: { onPress?: () => void; children: React.ReactNode; size?: number }) {
  return (
    <Pressable onPress={onPress} pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </Pressable>
  );
}


function SwipeRow({ children, onRemove, onOpen, onClose, scrollRef, tapRef }: {
  children: React.ReactNode;
  onRemove: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
  scrollRef: React.RefObject<any>;
  tapRef: React.RefObject<any>;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
    return (
      <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
        <TouchableOpacity
          onPress={onRemove}
          style={{ flex: 1, marginLeft: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: OVER_DOT }}
        >
          <Icon name="trash" size={18} color="#FBF8FF" stroke={1.6} />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      simultaneousHandlers={[scrollRef, tapRef]}
      friction={1}
      overshootRight={false}
      rightThreshold={30}
      activeOffsetX={[-15, 15]}
      failOffsetY={[-15, 15]}
      onSwipeableWillOpen={() => onOpen(swipeRef.current!)}
      onSwipeableClose={onClose}
    >
      {children}
    </Swipeable>
  );
}

function CollapsingRow({ removing, children }: { removing: boolean; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(1)).current;
  const [measuredH, setMeasuredH] = useState<number | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (removing && !hasStarted.current) {
      hasStarted.current = true;
      Animated.timing(anim, {
        toValue: 0,
        duration: 300,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }).start();
    }
  }, [removing]);

  const expandedH = measuredH ?? 60;
  const containerStyle: any = removing
    ? { overflow: 'hidden', opacity: anim, height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, expandedH] }) }
    : { overflow: 'hidden' };

  return (
    <Animated.View style={containerStyle}>
      <View onLayout={e => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && measuredH === null) setMeasuredH(h);
      }}>
        {children}
      </View>
    </Animated.View>
  );
}

// Allocation bar segments
function AllocationBar({ needsFrac, wantsFrac, savingsFrac, trackBg, needsCol, wantsCol, savingsCol, height = 8 }: {
  needsFrac: number; wantsFrac: number; savingsFrac: number;
  trackBg: string; needsCol: string; wantsCol: string; savingsCol: string;
  height?: number;
}) {
  const r = height / 2;
  return (
    <View style={{ height, borderRadius: r, overflow: 'hidden', flexDirection: 'row', backgroundColor: trackBg }}>
      {needsFrac > 0 && <View style={{ height: '100%', width: `${(needsFrac * 100).toFixed(2)}%` as any, backgroundColor: needsCol }} />}
      {wantsFrac > 0 && <View style={{ height: '100%', width: `${(wantsFrac * 100).toFixed(2)}%` as any, backgroundColor: wantsCol }} />}
      {savingsFrac > 0 && <View style={{ height: '100%', width: `${(savingsFrac * 100).toFixed(2)}%` as any, backgroundColor: savingsCol }} />}
    </View>
  );
}

// External store for the live keypad draft. Keeping it out of BudgetScreen's
// render means a keypress only repaints the active amount field (LiveDraftText)
// — not the whole screen (groups, rows, blur, SVG) — so the digit appears instantly.
type DraftStore = { subscribe: (cb: () => void) => () => void; getSnapshot: () => string };
const DraftContext = React.createContext<DraftStore | null>(null);

// Live amount text for the row being edited. The only thing that re-renders per
// keystroke. Subscribes to the draft store via useSyncExternalStore.
function LiveDraftText({ color }: { color: string }) {
  const store = useContext(DraftContext);
  const draft = useSyncExternalStore(store!.subscribe, store!.getSnapshot);
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.catBudgetText, { color }]}>
      ${formatDraft(draft)}
    </Text>
  );
}

// Blinking caret shown after the live amount while the custom keypad is open.
function EditCaret({ color }: { color: string }) {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 480, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return <Animated.View style={[styles.editCaret, { backgroundColor: color, opacity: blink }]} />;
}

// Category budget amount — tap to edit inline via the custom keypad. The
// underline signals it's editable; the inner tap target pre-empts the whole-row
// tap (which opens the editor sheet). Editing state lives in the parent so the
// shared keypad can drive the live draft and commit.
function EditableBudgetAmount({ value, active, color, accentColor, underlineColor, onStartEdit, onMeasured, accessibilityLabel }: {
  value: number;
  active: boolean;
  color: string;
  accentColor: string;
  underlineColor: string;
  onStartEdit: () => void;
  onMeasured: (top: number, height: number) => void;
  accessibilityLabel?: string;
}) {
  const ref = useRef<View>(null);

  const startEdit = () => {
    // Begin editing synchronously; measure afterwards purely for scroll-into-view.
    onStartEdit();
    ref.current?.measureInWindow((_x, y, _w, h) => onMeasured(y, h));
  };

  // Display and edit share one fixed-metric row: a "$" prefix glued to the
  // leading digit, a constant-width caret slot, and the underline on the row
  // itself. Only the text content, underline color, and caret↔spacer swap — the
  // box never changes size, so the number stays put when the keypad opens. The
  // live value comes from LiveDraftText (store-subscribed) so only it repaints.
  if (active) {
    return (
      <View style={[styles.catBudgetWrap, { borderBottomColor: accentColor }]}>
        <LiveDraftText color={color} />
        <EditCaret color={accentColor} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      ref={ref}
      onPress={startEdit}
      activeOpacity={0.6}
      hitSlop={{ top: 10, bottom: 10, left: 12, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.catBudgetWrap, { borderBottomColor: underlineColor }]}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={1}
          style={[styles.catBudgetText, { color }]}
        >
          ${fmtMoney(value)}
        </Text>
        <View style={styles.catBudgetCaretSpacer} />
      </View>
    </TouchableOpacity>
  );
}

export function BudgetScreen({ theme, onOpenDrawer, onOpenIncome, onKeypadOpenChange }: Props) {
  const { transactionsRepo, incomeRepo, budgetsRepo, categoriesRepo, recurringRulesRepo } = useRepositories();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [repoVersion, setRepoVersion] = useState(0);
  const incomes = useRepositoryList(incomeRepo);
  const budgetRecords = useRepositoryList(budgetsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const upcomingBills = useMemo(
    () => upcomingBillsFromRecurring(recurringRules, categories),
    [recurringRules, categories],
  );
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  useEffect(() => transactionsRepo.subscribe(() => setRepoVersion(v => v + 1)), [transactionsRepo]);
  useEffect(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const baseQuery = {
      from: new Date(year, month - 1, 1).toISOString(),
      to: new Date(year, month, 0, 23, 59, 59, 999).toISOString(),
      sort: 'date-desc',
      limit: 200,
    } as const;
    const rows: Transaction[] = [];
    let cursor: TransactionCursor | undefined;
    do {
      const page = transactionsRepo.listPage({ ...baseQuery, cursor });
      rows.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);
    setTransactions(rows);
  }, [selectedMonth, transactionsRepo, repoVersion]);
  const visibleSpendGroups = useMemo(
    () => spendGroups(transactions, budgetRecords, categories, selectedMonth),
    [transactions, budgetRecords, categories, selectedMonth],
  );
  const regularMonthlyIncome = useMemo(() => monthlyIncome(incomes, selectedMonth), [incomes, selectedMonth]);
  const oneTimeIncomeThisMonth = useMemo(() => (
    incomes
      .filter(item => item.kind === 'irregular')
      .filter(item => (item.receivedAt ?? item.startDate).slice(0, 7) === selectedMonth)
      .reduce((sum, item) => sum + item.amount, 0)
  ), [incomes, selectedMonth]);
  const initialIncome = regularMonthlyIncome + oneTimeIncomeThisMonth;
  const insets = useSafeAreaInsets();
  const { wallpaper, wallpaperFloorBase } = useTheme();
  const pWallpaper = makeP(true);
  const p = makeP(theme.dark);
  const shadow = DARK_TEXT_SHADOW;
  const scrim = makeScrim(theme.dark);
  const floorColor = deriveFloor(wallpaperFloorBase, theme.dark);

  // ── Scroll-driven sticky pin ──────────────────────────────────
  // When the allocation card meets the header it's replaced by a full-bleed
  // pinned bar. The geometry snaps (no per-frame width/radius animation) so fast
  // flings stay smooth; a one-shot, fully-native opacity + rise gives it a clean
  // settle so the swap reads as intentional rather than abrupt.
  const sectionStackYRef = useRef(0);
  const allocCardYRef = useRef(0);
  const allocCardHRef = useRef(0);
  const [headerH, setHeaderH] = useState(0);
  // The pinned overlay only intercepts touches once it's actually pinned;
  // before that it's invisible and must let the hero region stay tappable.
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  const pinAnim = useRef(new Animated.Value(0)).current;

  // Native-driven scroll position for the wallpaper parallax. handleScroll still
  // runs as the JS listener to drive the (layout-dependent) pin state.
  const scrollY = useRef(new Animated.Value(0)).current;
  const bgTranslateY = makeBgTranslateY(scrollY);
  const floorOpacity = scrollY.interpolate({
    inputRange: [0, SCREEN_H * 0.6],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Latest content offset, mirrored for the keypad's scroll-into-view math.
  const scrollOffsetRef = useRef(0);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = y;
    const cardAbsY = sectionStackYRef.current + allocCardYRef.current;
    // 4px hysteresis so the pin doesn't jitter when you hover right on the line.
    const isPinned = pinnedRef.current ? y > cardAbsY - 4 : y > cardAbsY + 4;
    if (isPinned !== pinnedRef.current) {
      pinnedRef.current = isPinned;
      setPinned(isPinned);
    }
  }, []);

  useEffect(() => {
    // One-shot, fully native (opacity + transform) — no layout work per frame.
    Animated.timing(pinAnim, {
      toValue: pinned ? 1 : 0,
      duration: pinned ? 220 : 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pinned, pinAnim]);

  const stickyOpacity    = pinAnim;
  const stickyTranslateY = pinAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const allocCardOpacity = pinAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  // ── Budget state ──────────────────────────────────────────────
  const [income, setIncome] = useState(initialIncome);
  const [budgets, setBudgets] = useState<Record<string, number>>(() => initBudgets(visibleSpendGroups, upcomingBills, categories));
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoLabel, setUndoLabel] = useState('');

  const [customSubs, setCustomSubs] = useState<Record<string, { label: string }[]>>({
    needs: [], wants: [], savings: [],
  });
  const [removedSubs, setRemovedSubs] = useState<Set<string>>(new Set());
  const [removedBills, setRemovedBills] = useState<Set<string>>(new Set());
  const [pendingRemoveKeys, setPendingRemoveKeys] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [addingForGroup, setAddingForGroup] = useState<string | null>(null);

  // ── Inline amount keypad ──────────────────────────────────────
  // editingKey is the budget key whose amount the custom keypad is editing.
  // The live draft lives in an external store (not state) so keypresses repaint
  // only the active field, not this whole screen — see DraftContext / LiveDraftText.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const draftStore = useRef<{ value: string; subs: Set<() => void> }>({ value: '', subs: new Set() }).current;
  const subscribeDraft = useCallback((cb: () => void) => {
    draftStore.subs.add(cb);
    return () => { draftStore.subs.delete(cb); };
  }, [draftStore]);
  const getDraftSnapshot = useCallback(() => draftStore.value, [draftStore]);
  const setDraft = useCallback((next: string) => {
    draftStore.value = next;
    draftStore.subs.forEach(cb => cb());
  }, [draftStore]);
  const draftContextValue = useMemo<DraftStore>(
    () => ({ subscribe: subscribeDraft, getSnapshot: getDraftSnapshot }),
    [subscribeDraft, getDraftSnapshot],
  );
  const [keypadH, setKeypadH] = useState(340);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryLabelDraft, setCategoryLabelDraft] = useState('');
  const [categoryIconDraft, setCategoryIconDraft] = useState('tag');
  const [categoryGroupDraft, setCategoryGroupDraft] = useState<GroupKey>('needs');
  const [categoryGoalTarget, setCategoryGoalTarget] = useState('');
  const [categoryGoalSaved, setCategoryGoalSaved] = useState('');
  const [categoryBudgetDraft, setCategoryBudgetDraft] = useState('');
  const [categoryRecurring, setCategoryRecurring] = useState(false);
  const [categoryRecurringDate, setCategoryRecurringDate] = useState('');
  const [categoryRecurringCadence, setCategoryRecurringCadence] = useState<CategoryRecurringCadence>('monthly');
  const [categoryGoalDeadline, setCategoryGoalDeadline] = useState('');
  const [duplicateNameError, setDuplicateNameError] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState('');
  const [categoryNotes, setCategoryNotes] = useState('');

  const scrollViewRef = useRef<GHScrollView>(null);
  const outerTapRef = useRef<any>(null);
  const openSwipeRef = useRef<Swipeable | null>(null);
  const pendingDeleteRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIncome(initialIncome);
  }, [initialIncome]);

  useEffect(() => {
    setBudgets(initBudgets(visibleSpendGroups, upcomingBills, categories));
  }, [visibleSpendGroups, upcomingBills, categories]);

  const handleSwipeOpen = useCallback((ref: Swipeable) => {
    if (openSwipeRef.current && openSwipeRef.current !== ref) {
      openSwipeRef.current.close();
    }
    openSwipeRef.current = ref;
  }, []);

  const handleSwipeClose = useCallback(() => {
    openSwipeRef.current = null;
  }, []);

  const dismissOpenSwipe = useCallback(() => {
    openSwipeRef.current?.close();
  }, []);

  const toggleGroupCollapsed = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const prevActionSnapshot = useRef<{
    budgets: Record<string, number>;
    removedSubs: Set<string>;
    removedBills: Set<string>;
    customSubs: Record<string, { label: string }[]>;
    deletedIncome?: Income;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const billsByGroup = useMemo(() => {
    const map: Record<string, Bill[]> = {};
    upcomingBills.forEach(bill => {
      const gKey = categoryGroupFor(bill.cat, categories);
      if (!map[gKey]) map[gKey] = [];
      map[gKey].push(bill);
    });
    return map;
  }, [upcomingBills, categories]);

  const regularIncomes = useMemo(
    () => incomes.filter(item => (item.kind ?? 'regular') === 'regular'),
    [incomes],
  );
  const oneTimeIncomesForSelectedMonth = useMemo(
    () => incomes
      .filter(item => item.kind === 'irregular')
      .filter(item => (item.receivedAt ?? item.startDate).slice(0, 7) === selectedMonth)
      .sort((a, b) => (b.receivedAt ?? b.startDate).localeCompare(a.receivedAt ?? a.startDate)),
    [incomes, selectedMonth],
  );


  // ── Month control ─────────────────────────────────────────────
  const monthOptions = useMemo(
    () => Array.from({ length: 25 }, (_, idx) => monthKeyFromOffset(CURRENT_MONTH, idx - 12)),
    [],
  );
  const selectedMonthHasBudgets = useMemo(
    () => budgetRecords.some(b => b.month === selectedMonth),
    [budgetRecords, selectedMonth],
  );
  const copyFromPreviousMonth = () => {
    const prevKey = monthKeyFromOffset(selectedMonth, -1);
    budgetRecords
      .filter(b => b.month === prevKey)
      .forEach(rec => {
        const exists = budgetRecords.some(b => b.month === selectedMonth && (
          (rec.category && b.category === rec.category) || (b.group === rec.group && b.label === rec.label)
        ));
        if (!exists) {
          budgetsRepo.create({
            month: selectedMonth,
            group: rec.group,
            category: rec.category,
            label: rec.label,
            icon: rec.icon,
            amount: rec.amount,
            meta: rec.meta,
          });
        }
      });
  };



  const syncBudgetRecord = (key: string, v: number) => {
    if (key.startsWith('bill:')) {
      const [, , billId] = key.split(':');
      if (billId) recurringRulesRepo.update(ruleIdFromBillId(billId), { amount: v, updatedByUserId: 'local' });
      return;
    }
    const [groupKey, label] = key.split(':') as [SpendGroup['key'] | undefined, string | undefined];
    if (!groupKey || !label) return;
    const sub = visibleSpendGroups.find(g => g.key === groupKey)?.subs.find(s => s.label === label);
    const existing = budgetRecords.find(b => (
      (sub?.cat && b.category === sub.cat) || (b.group === groupKey && b.label === label)
    ) && b.month === selectedMonth);
    if (existing) {
      budgetsRepo.update(existing.id, {
        amount: v,
        group: groupKey,
        category: sub?.cat,
        label,
        icon: sub?.icon ?? 'tag',
      });
    } else {
      budgetsRepo.create({
        month: selectedMonth,
        group: groupKey,
        category: sub?.cat,
        label,
        icon: sub?.icon ?? 'tag',
        amount: v,
      });
    }
  };

  const commitBudget = (key: string, value: number) => {
    setBudgets(b => ({ ...b, [key]: value }));
    syncBudgetRecord(key, value);
  };

  // Persist whatever the keypad has built for the active row, if it parses.
  // Plain functions (not memoized) so each call uses the live commit closure —
  // syncBudgetRecord reads budgetRecords/visibleSpendGroups/selectedMonth.
  const flushEditDraft = (key: string, draft: string) => {
    const parsed = parseAmountDraft(draft);
    if (parsed !== null) commitBudget(key, parsed);
  };

  // Mirror of editingKey kept in sync synchronously so the tap-to-dismiss check
  // (which runs a frame later) can tell "tapped empty space" from "switched rows".
  const editingKeyRef = useRef<string | null>(null);

  const slideKeypad = useCallback((open: boolean) => {
    onKeypadOpenChange?.(open);
  }, [onKeypadOpenChange]);

  const startAmountEdit = (key: string, value: number) => {
    const wasOpen = editingKeyRef.current !== null;
    // Switching rows mid-edit: commit the one we're leaving first. editingKey goes
    // straight from one key to the next (never null), so the keypad and tab bar
    // don't blink between rows.
    if (editingKey && editingKey !== key) flushEditDraft(editingKey, draftStore.value);
    editingKeyRef.current = key;
    setDraft(value > 0 ? String(value) : '');
    setEditingKey(key);
    if (!wasOpen) slideKeypad(true);
  };

  // A keypress mutates the live draft only — no screen-level state changes, so
  // only LiveDraftText repaints.
  const handleKeypadKey = useCallback((k: KeypadKey) => {
    setDraft(applyKeypadKey(draftStore.value, k));
  }, [setDraft, draftStore]);

  // Lift the tapped row above the keypad if the pad would cover it.
  const scrollEditIntoView = (top: number, height: number) => {
    const keypadTop = SCREEN_H - keypadH - KEYPAD_DONE_AREA;
    const delta = (top + height) - (keypadTop - 16);
    if (delta > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo?.({ y: scrollOffsetRef.current + delta, animated: true });
      });
    }
  };

  const closeAmountEdit = () => {
    if (!editingKeyRef.current) return;
    // Start the slide-down first so it begins this frame, before the (heavier)
    // commit + state updates re-render the screen.
    slideKeypad(false);
    flushEditDraft(editingKeyRef.current, draftStore.value);
    editingKeyRef.current = null;
    setEditingKey(null);
  };

  // A tap anywhere in the content closes the keypad — but a tap on another amount
  // reopens it synchronously, so defer the close one frame and skip it if the
  // active row changed in the meantime (a switch, not a dismiss).
  const dismissKeypadFromTap = () => {
    if (!editingKey) return;
    const keyAtTap = editingKey;
    requestAnimationFrame(() => {
      if (editingKeyRef.current === keyAtTap) closeAmountEdit();
    });
  };

  const syncCategoryRecurringRule = (
    catId: string,
    label: string,
    amount: number,
    enabled: boolean,
    nextDateValue: string,
    cadenceValue: CategoryRecurringCadence,
  ) => {
    const existing = recurringRules.find(rule => (
      rule.cat === catId && rule.meta?.source === 'budget-category'
    ));
    if (!enabled) {
      if (existing) recurringRulesRepo.update(existing.id, { active: false, updatedByUserId: 'local' });
      return;
    }
    const nextDate = nextDateValue || toYMD(defaultIncomeDateForMonth(selectedMonth));
    const due = dateFromYMD(nextDate);
    const payload = {
      merchant: label,
      cat: catId,
      amount: Math.max(0, amount),
      cadence: cadenceValue,
      startDate: nextDate,
      nextDueDate: nextDate,
      dayOfMonth: cadenceValue === 'monthly' || cadenceValue === 'customMonthly'
        ? Math.max(1, Math.min(28, due.getDate()))
        : undefined,
      active: true,
      estimate: false,
      updatedByUserId: 'local',
      meta: { source: 'budget-category' },
    };
    if (existing) {
      recurringRulesRepo.update(existing.id, payload);
    } else {
      recurringRulesRepo.create({
        ...payload,
        createdByUserId: 'local',
      });
    }
  };

  const saveSnapshot = (extra?: { deletedIncome?: Income }) => {
    prevActionSnapshot.current = {
      budgets: { ...budgets },
      removedSubs: new Set(removedSubs),
      removedBills: new Set(removedBills),
      customSubs: Object.fromEntries(Object.entries(customSubs).map(([k, v]) => [k, [...v]])),
      ...extra,
    };
  };

  const removeSub = (gKey: string, sub: Pick<SpendSub, 'cat' | 'label'>) => {
    const label = sub.label;
    saveSnapshot();
    setRemovedSubs(prev => new Set([...prev, bKey(gKey, label)]));
    setBudgets(b => { const n = { ...b }; delete n[bKey(gKey, label)]; return n; });
    showUndo(`Removed ${label}`, () => {
      const category = categories.find(cat => cat.id === sub.cat);
      if (category) categoriesRepo.update(category.id, { archived: true, updatedByUserId: 'local' });
    });
  };

  const removeBill = (bill: Bill) => {
    const ruleId = typeof bill.meta?.recurringRuleId === 'string' ? bill.meta.recurringRuleId : ruleIdFromBillId(bill.id);
    saveSnapshot();
    setRemovedBills(prev => new Set([...prev, bill.id]));
    showUndo(`Removed ${bill.name}`, () => {
      recurringRulesRepo.delete(ruleId);
    });
  };

  const addSub = (
    gKey: string,
    label: string,
    iconOverride?: string,
    budget?: number,
    recurring?: boolean,
    recurringDate?: string,
    recurringCadence: CategoryRecurringCadence = 'monthly',
    goalTarget?: number,
    goalSaved?: number,
    goalDeadline?: string,
  ): boolean => {
    const origGroup = visibleSpendGroups.find(g => g.key === gKey);
    const taken = new Set([
      ...(origGroup?.subs.map(s => s.label.toLowerCase()) ?? []),
      ...(customSubs[gKey] ?? []).map(s => s.label.toLowerCase()),
    ]);
    if (taken.has(label.toLowerCase())) {
      setDuplicateNameError(true);
      setCategoryFormError('A category with this name already exists');
      return false;
    }
    const icon = iconOverride ?? inferCategoryIcon(label);
    const catMeta: Record<string, unknown> = { custom: true };
    if (recurring) {
      catMeta.recurring = true;
      catMeta.recurringCadence = recurringCadence;
      if (recurringDate) catMeta.recurringDate = recurringDate;
    }
    if (goalTarget && goalTarget > 0) {
      catMeta.goalTarget = goalTarget;
      catMeta.goalSaved = goalSaved ?? 0;
      if (goalDeadline) catMeta.goalDeadline = goalDeadline;
    }
    const created = categoriesRepo.create({
      label,
      icon,
      group: gKey as GroupKey,
      defaultBudget: budget ?? 0,
      meta: catMeta,
      sortOrder: Math.max(0, ...categories.map(cat => cat.sortOrder)) + 10,
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    budgetsRepo.create({
      month: selectedMonth,
      group: gKey as GroupKey,
      category: created.id,
      label,
      icon,
      amount: budget ?? 0,
      meta: catMeta,
    });
    syncCategoryRecurringRule(
      created.id,
      label,
      budget ?? 0,
      Boolean(recurring),
      recurringDate ?? '',
      recurringCadence,
    );
    setBudgets(b => ({ ...b, [bKey(gKey, label)]: budget ?? 0 }));
    setDuplicateNameError(false);
    setCategoryFormError('');
    return true;
  };

  const handleRemoveSub = useCallback((gKey: string, sub: Pick<SpendSub, 'cat' | 'label'>) => {
    const key = bKey(gKey, sub.label);
    setPendingRemoveKeys(prev => new Set([...prev, key]));
    setTimeout(() => {
      setPendingRemoveKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      removeSub(gKey, sub);
    }, 300);
  }, [removeSub]);

  const handleRemoveBill = useCallback((bill: Bill) => {
    setPendingRemoveKeys(prev => new Set([...prev, bill.id]));
    setTimeout(() => {
      setPendingRemoveKeys(prev => { const n = new Set(prev); n.delete(bill.id); return n; });
      removeBill(bill);
    }, 300);
  }, [removeBill]);

  const openCategoryEditor = (catId: string) => {
    const category = categories.find(cat => cat.id === catId);
    if (!category) return;
    closeAmountEdit();
    setEditingCategory(category);
    setCategoryLabelDraft(category.label);
    setCategoryIconDraft(category.icon);
    const meta = category.meta ?? {};
    setCategoryGoalTarget(typeof meta.goalTarget === 'number' ? String(meta.goalTarget) : '');
    setCategoryGoalSaved(typeof meta.goalSaved === 'number' ? String(meta.goalSaved) : '');
    setCategoryRecurring(meta.recurring === true);
    setCategoryRecurringDate(typeof meta.recurringDate === 'string' ? meta.recurringDate : '');
    setCategoryRecurringCadence(
      RECURRING_CADENCES.some(item => item.value === meta.recurringCadence)
        ? meta.recurringCadence as CategoryRecurringCadence
        : 'monthly',
    );
    setCategoryGoalDeadline(typeof meta.goalDeadline === 'string' ? meta.goalDeadline : '');
    const amt = budgets[bKey(category.group, category.label)] ?? category.defaultBudget ?? 0;
    setCategoryBudgetDraft(amt > 0 ? String(amt) : '');
    setCategoryNotes(typeof meta.notes === 'string' ? meta.notes : '');
    setCategoryGroupDraft(category.group);
    setDuplicateNameError(false);
    setCategoryFormError('');
  };

  const closeCategoryEditor = () => {
    setEditingCategory(null);
    setCategoryLabelDraft('');
    setCategoryIconDraft('tag');
    setCategoryGroupDraft('needs');
    setCategoryGoalTarget('');
    setCategoryGoalSaved('');
    setCategoryRecurring(false);
    setCategoryRecurringDate('');
    setCategoryRecurringCadence('monthly');
    setCategoryGoalDeadline('');
    setCategoryBudgetDraft('');
    setCategoryNotes('');
    setDuplicateNameError(false);
    setCategoryFormError('');
  };

  const saveCategoryEdit = (): boolean => {
    if (!editingCategory) return false;
    const label = categoryLabelDraft.trim();
    if (!label) {
      setCategoryFormError('Category name is required');
      return false;
    }
    const duplicate = categories.some(cat => (
      cat.id !== editingCategory.id &&
      !cat.archived &&
      cat.label.toLowerCase() === label.toLowerCase()
    ));
    if (duplicate) {
      setDuplicateNameError(true);
      setCategoryFormError('A category with this name already exists');
      return false;
    }
    setDuplicateNameError(false);
    const actualGroup: GroupKey = categoryGroupDraft;
    const goalTarget = parseAmountDraft(categoryGoalTarget);
    const goalSaved = parseAmountDraft(categoryGoalSaved);
    if (categoryGroupDraft === 'savings' && goalTarget !== null && goalSaved !== null && goalTarget > 0 && goalSaved > goalTarget) {
      setCategoryFormError('Saved amount cannot be greater than the target');
      return false;
    }
    if (categoryGroupDraft === 'savings' && goalSaved !== null && goalSaved > 0 && (!goalTarget || goalTarget <= 0)) {
      setCategoryFormError('Add a target before entering saved so far');
      return false;
    }
    setCategoryFormError('');
    const nextMeta: Record<string, unknown> = { ...(editingCategory.meta ?? {}) };
    if (categoryGroupDraft === 'savings' && goalTarget && goalTarget > 0) {
      nextMeta.goalTarget = goalTarget;
      nextMeta.goalSaved = goalSaved && goalSaved > 0 ? goalSaved : 0;
      if (categoryGoalDeadline.trim()) {
        nextMeta.goalDeadline = categoryGoalDeadline.trim();
      } else {
        delete nextMeta.goalDeadline;
      }
    } else {
      delete nextMeta.goalTarget;
      delete nextMeta.goalSaved;
      delete nextMeta.goalDeadline;
    }
    if (categoryRecurring) {
      nextMeta.recurring = true;
      nextMeta.recurringCadence = categoryRecurringCadence;
      if (categoryRecurringDate.trim()) {
        nextMeta.recurringDate = categoryRecurringDate.trim();
      } else {
        delete nextMeta.recurringDate;
      }
    } else {
      delete nextMeta.recurring;
      delete nextMeta.recurringCadence;
      delete nextMeta.recurringDate;
    }
    if (categoryNotes.trim()) {
      nextMeta.notes = categoryNotes.trim();
    } else {
      delete nextMeta.notes;
    }
    const budgetValue = parseAmountDraft(categoryBudgetDraft);
    const nextDefaultBudget = budgetValue !== null
      ? budgetValue
      : budgets[bKey(editingCategory.group, editingCategory.label)] ?? editingCategory.defaultBudget;
    categoriesRepo.update(editingCategory.id, {
      label,
      icon: categoryIconDraft,
      group: actualGroup,
      defaultBudget: nextDefaultBudget,
      meta: nextMeta,
      updatedByUserId: 'local',
    });
    budgetRecords
      .filter(b => b.category === editingCategory.id || (b.group === editingCategory.group && b.label === editingCategory.label))
      .forEach(b => budgetsRepo.update(b.id, {
        group: actualGroup,
        category: editingCategory.id,
        label,
        icon: categoryIconDraft,
    }));
    const oldKey = bKey(editingCategory.group, editingCategory.label);
    const newKey = bKey(actualGroup, label);
    setBudgets(prev => {
      const next = { ...prev };
      if (oldKey in next && oldKey !== newKey) {
        next[newKey] = next[oldKey];
        delete next[oldKey];
      }
      if (budgetValue !== null) next[newKey] = budgetValue;
      return next;
    });
    if (budgetValue !== null) {
      syncBudgetRecord(newKey, budgetValue);
    }
    syncCategoryRecurringRule(
      editingCategory.id,
      label,
      nextDefaultBudget,
      categoryRecurring,
      categoryRecurringDate,
      categoryRecurringCadence,
    );
    return true;
  };

  const deleteEditingCategory = () => {
    if (!editingCategory) return;
    removeSub(editingCategory.group, { cat: editingCategory.id, label: editingCategory.label });
    closeCategoryEditor();
  };

  const groupTotals = useMemo(() => {
    const t: Record<string, number> = {};
    visibleSpendGroups.forEach(g => {
      const orig = g.subs
        .filter(s => !removedSubs.has(bKey(g.key, s.label)))
        .reduce((s, sub) => s + (budgets[bKey(g.key, sub.label)] ?? 0), 0);
      const custom = (customSubs[g.key] ?? [])
        .reduce((s, sub) => s + (budgets[bKey(g.key, sub.label)] ?? 0), 0);
      const bills = (billsByGroup[g.key] ?? [])
        .filter(bill => !removedBills.has(bill.id))
        .reduce((s, bill) => s + (budgets[billKey(g.key, bill.id)] ?? bill.amount), 0);
      t[g.key] = orig + custom + bills;
    });
    return t;
  }, [budgets, removedSubs, customSubs, removedBills, billsByGroup, visibleSpendGroups]);

  const needsTotal    = groupTotals.needs    ?? 0;
  const wantsTotal    = groupTotals.wants    ?? 0;
  const savingsTotal  = groupTotals.savings  ?? 0;
  const totalBudgeted = needsTotal + wantsTotal + savingsTotal;
  const remaining     = income - totalBudgeted;
  const isOver        = remaining < 0;

  const barMax      = Math.max(totalBudgeted, income);
  const needsFrac   = barMax > 0 ? needsTotal   / barMax : 0;
  const wantsFrac   = barMax > 0 ? wantsTotal   / barMax : 0;
  const savingsFrac = barMax > 0 ? savingsTotal / barMax : 0;

  const gCol = (key: string) =>
    (theme.dark ? GROUP_COLORS[key]?.dark : GROUP_COLORS[key]?.light) ?? theme.textTer;
  const needsCol   = gCol('needs');
  const wantsCol   = gCol('wants');
  const savingsCol = gCol('savings');

  const showUndo = useCallback((label: string, onCommit?: () => void) => {
    if (pendingDeleteRef.current) {
      pendingDeleteRef.current();
      pendingDeleteRef.current = null;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoLabel(label);
    setUndoVisible(true);
    pendingDeleteRef.current = onCommit ?? null;
    undoTimer.current = setTimeout(() => {
      setUndoVisible(false);
      if (pendingDeleteRef.current) {
        pendingDeleteRef.current();
        pendingDeleteRef.current = null;
      }
    }, 7000);
  }, []);

  const handleUndo = useCallback(() => {
    pendingDeleteRef.current = null;
    if (prevActionSnapshot.current) {
      const snap = prevActionSnapshot.current;
      setBudgets(snap.budgets);
      setRemovedSubs(snap.removedSubs);
      setRemovedBills(snap.removedBills);
      setCustomSubs(snap.customSubs);
      if (snap.deletedIncome) {
        const recreated = incomeRepo.create({
          kind: snap.deletedIncome.kind,
          amount: snap.deletedIncome.amount,
          source: snap.deletedIncome.source,
          cadence: snap.deletedIncome.cadence,
          startDate: snap.deletedIncome.startDate,
          endDate: snap.deletedIncome.endDate,
          receivedAt: snap.deletedIncome.receivedAt,
          createdByUserId: snap.deletedIncome.createdByUserId ?? 'local',
          updatedByUserId: 'local',
          meta: snap.deletedIncome.meta,
        });
      }
      prevActionSnapshot.current = null;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoVisible(false);
  }, []);


  const _base = Math.max(income, totalBudgeted, 1);
  const _needsPct   = Math.round(needsTotal   / _base * 100);
  const _wantsPct   = Math.round(wantsTotal   / _base * 100);
  const _savingsPct = Math.round(savingsTotal / _base * 100);
  const _remainPct  = 100 - _needsPct - _wantsPct - _savingsPct;

  const legendItems = [
    { label: 'Needs',                        dotColor: needsCol,                           amount: needsTotal,   pct: _needsPct            },
    { label: 'Wants',                         dotColor: wantsCol,                           amount: wantsTotal,   pct: _wantsPct            },
    { label: 'Savings',                       dotColor: savingsCol,                         amount: savingsTotal, pct: _savingsPct          },
    { label: isOver ? 'Over' : 'Unassigned', dotColor: isOver ? OVER_DOT : p.textTer, amount: Math.abs(remaining), pct: isOver ? null : Math.abs(_remainPct) },
  ];

  // Shared allocation-card body — rendered identically by both the in-scroll
  // card and the pinned overlay so the hand-off is a seamless swap, not a fade.
  // Only the bar + legend animates — the income button lives in its own card below.
  const allocationBarBody = () => (
    <>
      <AllocationBar
        needsFrac={needsFrac} wantsFrac={wantsFrac} savingsFrac={savingsFrac}
        trackBg={p.trackBg} needsCol={needsCol} wantsCol={wantsCol} savingsCol={savingsCol}
        height={7}
      />
      <View style={styles.legendRow}>
        {legendItems.map(item => (
          <View key={item.label} style={styles.legendItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.dotColor }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TYPE.label, { color: item.dotColor }]}>{item.label}</Text>
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TYPE.subsectionTitle, { color: p.text }]}>
              ${Math.round(item.amount).toLocaleString()}
            </Text>
            {item.pct !== null && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TYPE.caption, { color: p.textSec }]}>{item.pct}%</Text>}
          </View>
        ))}
      </View>
    </>
  );

  const incomeBtnRef = useRef<View>(null);

  const stickyBorderColor = theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';

  return (
    <DraftContext.Provider value={draftContextValue}>
    <View style={{ flex: 1, backgroundColor: floorColor }}>

      {/* Wallpaper + scrim — outside KAV so the keyboard never shifts it.
          Photo drifts up at half the scroll speed; container extends below the
          screen so the upward shift never reveals a gap. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { bottom: -BG_PARALLAX_MAX, transform: [{ translateY: bgTranslateY }] },
        ]}
      >
        <ImageBackground source={wallpaper.source} resizeMode="cover" style={{ flex: 1 }} />
      </Animated.View>

      {/* Scrim — fixed to the screen so its gradient stays tuned to screen height
          while the photo behind it parallaxes. */}
      <LinearGradient pointerEvents="none"
        colors={[scrim.top, scrim.mid, scrim.lower, scrim.bottom]}
        locations={[0, 0.28, 0.60, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floor — fades in over the wallpaper as the user scrolls down */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: floorColor, opacity: floorOpacity }]}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Layout column — TapGestureHandler fires on touch start (State.BEGAN) anywhere
            on screen when a row is open. simultaneousHandlers lets scroll and swipe
            gestures proceed normally at the same time. */}
        <TapGestureHandler
          ref={outerTapRef}
          simultaneousHandlers={scrollViewRef}
          maxDist={10}
          onHandlerStateChange={({ nativeEvent }) => {
            if (nativeEvent.state === State.END) {
              dismissOpenSwipe();
              dismissKeypadFromTap();
            }
          }}
        >
        <View style={{ flex: 1 }}>

          {/* Header */}
          <View
            style={[styles.header, { paddingTop: insets.top + 8 }]}
            onLayout={e => setHeaderH(e.nativeEvent.layout.height)}
          >
            <IconBtn onPress={onOpenDrawer}>
              <Icon name="menu" size={22} color={pWallpaper.text} stroke={1.7} />
            </IconBtn>
            <Text style={[TYPE.pageTitle, { color: pWallpaper.text }, shadow]}>Budget</Text>
            <ThemeToggle />
          </View>

          {/* Pinned copy — same body as the in-scroll card; takes over at the pin
              line and grows edge-to-edge. pointerEvents gated so the hero stays
              tappable while this is still invisible above it. */}
          <Animated.View
            pointerEvents={pinned ? 'auto' : 'none'}
            style={{
              position: 'absolute',
              top: headerH,
              left: 0, right: 0,
              zIndex: 5,
              opacity: stickyOpacity,
              transform: [{ translateY: stickyTranslateY }],
            }}
          >
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
            >
              <View style={[styles.stickyCardInner, { borderColor: stickyBorderColor }]}>
                {allocationBarBody()}
              </View>
            </BlurView>
          </Animated.View>

          {/* Scrollable content */}
          <AnimatedGHScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: editingKey ? keypadH + KEYPAD_DONE_AREA + 24 : 140 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScrollBeginDrag={() => { dismissOpenSwipe(); closeAmountEdit(); }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true, listener: handleScroll },
            )}
          >

            <View
              style={styles.sectionStack}
              onLayout={e => { sectionStackYRef.current = e.nativeEvent.layout.y; }}
            >
              {/* Budget hero — open on the wallpaper, rhymes with Home */}
              <View
                style={styles.hero}
              >
                <View style={styles.heroTopRow}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => { if (incomeBtnRef.current) onOpenIncome?.(incomeBtnRef.current); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Income $${fmtMoney(income)}, assigned $${fmtMoney(totalBudgeted)}. Edit income`}
                  >
                    <View ref={incomeBtnRef} collapsable={false} style={styles.heroStatusRow}>
                      <Text style={[TYPE.onMediaStatus, { color: pWallpaper.text }, shadow]}>${fmtMoney(income)}</Text>
                      <Text style={[TYPE.onMediaStatusSub, { color: pWallpaper.textSec }, shadow]}> Income · </Text>
                      <Text style={[TYPE.onMediaStatus, { color: pWallpaper.text }, shadow]}>${fmtMoney(totalBudgeted)}</Text>
                      <Text style={[TYPE.onMediaStatusSub, { color: pWallpaper.textSec }, shadow]}> Assigned</Text>
                    </View>
                  </TouchableOpacity>
                  <Host ignoreSafeArea="all" style={styles.monthPickerHost}>
                    <Menu
                      label={
                        <View
                          style={styles.heroMonthBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Change month, currently ${monthLabel(selectedMonth)}`}
                        >
                          <Text style={[styles.heroMonthText, { color: pWallpaper.text }, shadow]}>{monthLabel(selectedMonth)}</Text>
                          <Icon name="chevDown" size={11} color={pWallpaper.text} stroke={2} />
                        </View>
                      }
                    >
                      {monthOptions.map(key => (
                        <SwiftButton
                          key={key}
                          systemImage={key === selectedMonth ? 'checkmark' : undefined}
                          onPress={() => setSelectedMonth(key)}
                          label={monthLabel(key)}
                        />
                      ))}
                    </Menu>
                  </Host>
                </View>

              </View>

              {/* Allocation bar card — animated sticky */}
              <Animated.View
                onLayout={e => {
                  allocCardYRef.current = e.nativeEvent.layout.y;
                  allocCardHRef.current = e.nativeEvent.layout.height;
                }}
                style={{ opacity: allocCardOpacity }}
              >
                <SectionCard dark={theme.dark}>
                  {allocationBarBody()}
                </SectionCard>
              </Animated.View>

              {/* Spending group cards */}
              {visibleSpendGroups.map(g => {
                const groupColor = gCol(g.key);
                const groupTotal = Math.round(groupTotals[g.key] ?? 0);
                const groupTarget = Math.round(income * g.targetPct);
                const groupDelta = groupTotal - groupTarget;
                const groupIsOver = groupDelta > 0;
                const visibleOrigSubs = g.subs.filter(s => !removedSubs.has(bKey(g.key, s.label)));
                const regularOrigSubs = visibleOrigSubs.filter(s => {
                  const c = categories.find(x => x.id === s.cat);
                  return !c?.meta?.recurring;
                });
                const recurringOrigSubs = visibleOrigSubs.filter(s => {
                  const c = categories.find(x => x.id === s.cat);
                  return c?.meta?.recurring === true;
                });
                const customs = customSubs[g.key] ?? [];
                const regularCustoms = customs.filter(s => {
                  const c = categories.find(x => x.group === (g.key as GroupKey) && x.label.toLowerCase() === s.label.toLowerCase());
                  return !c?.meta?.recurring;
                });
	                const recurringCustoms = customs.filter(s => {
	                  const c = categories.find(x => x.group === (g.key as GroupKey) && x.label.toLowerCase() === s.label.toLowerCase());
	                  return c?.meta?.recurring === true;
	                });
	                const groupBills = (billsByGroup[g.key] ?? []).filter(b => !removedBills.has(b.id));
	                const hasRecurringSection = recurringOrigSubs.length > 0 || recurringCustoms.length > 0 || groupBills.length > 0;
	                const isCollapsed = collapsedGroups.has(g.key);
	                const visibleItemCount = visibleOrigSubs.length + customs.length + groupBills.length;

	                return (
	                  <SectionCard key={g.key} dark={theme.dark}>
	                    <Pressable
	                      onPress={() => toggleGroupCollapsed(g.key)}
	                      pointerEvents="box-only"
	                      accessibilityRole="button"
	                      accessibilityState={{ expanded: !isCollapsed }}
	                      accessibilityLabel={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.label} budget group`}
	                      style={styles.cardHead}
	                    >
	                      <View style={{ flex: 1, minWidth: 0 }}>
	                        <View style={styles.groupTitleRow}>
	                          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: groupColor }} />
	                          <Text style={[TYPE.sectionTitle, { color: p.text }]}>{g.label}</Text>
	                        </View>
	                        <Text style={[TYPE.caption, { color: groupIsOver ? OVER_DOT : p.textSec }]}>
	                          {groupIsOver ? `\$${fmtMoney(groupDelta)} over target of ${fmtPct(g.targetPct)}` : `\$${fmtMoney(groupTarget)} target · ${fmtPct(g.targetPct)}`}
	                        </Text>
	                      </View>
	                      <View style={styles.groupHeadAmount}>
	                        <Text style={[TYPE.subsectionTitle, { color: groupColor }]}>${groupTotal.toLocaleString()}</Text>
	                        <RotatingChevron open={!isCollapsed} color={p.textTer} />
	                      </View>
	                    </Pressable>

	                    <Collapsible open={!isCollapsed}>
	                    <View>
	                    {regularOrigSubs.map((sub, si) => {
                      const isLast = si === regularOrigSubs.length - 1 && regularCustoms.length === 0 && !hasRecurringSection;
                      const rowKey = bKey(g.key, sub.label);
                      const isRemoving = pendingRemoveKeys.has(rowKey);
	                      const subCat = categories.find(c => c.id === sub.cat);
	                      const subGoalTarget = subCat && typeof subCat.meta?.goalTarget === 'number' ? subCat.meta.goalTarget as number : 0;
	                      const subGoalSaved = subCat && typeof subCat.meta?.goalSaved === 'number' ? subCat.meta.goalSaved as number : 0;
	                      const subGoalPct = subGoalTarget > 0 ? Math.min(100, Math.round(subGoalSaved / subGoalTarget * 100)) : 0;
	                      const subBudget = budgets[rowKey] ?? sub.budget;
	                      return (
                        <CollapsingRow key={sub.cat} removing={isRemoving}>
                          <SwipeRow onRemove={() => handleRemoveSub(g.key, sub)} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                            <TouchableOpacity
                              onPress={() => openCategoryEditor(sub.cat)}
                              activeOpacity={0.68}
                              style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit ${sub.label} category`}
                            >
                              <View style={[styles.rowIcon, { backgroundColor: `${groupColor}26` }]}>
                                <Icon name={sub.icon} size={15} color={groupColor} stroke={1.6} />
                              </View>
	                              <View style={{ flex: 1, minWidth: 0 }}>
	                                <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>{sub.label}</Text>
	                                {subGoalTarget > 0 && (
                                  <>
                                    <View style={[styles.subGoalTrack, { backgroundColor: p.hairline, marginTop: 5, width: '100%' }]}>
                                      <View style={{ height: '100%', borderRadius: 2, width: `${subGoalPct}%`, backgroundColor: groupColor }} />
                                    </View>
                                    <Text style={[TYPE.caption, { color: p.textSec, marginTop: 3 }]}>
                                      {subGoalPct}% · ${Math.max(0, subGoalTarget - subGoalSaved).toLocaleString()} to go
                                    </Text>
                                  </>
                                )}
                              </View>
	                              <EditableBudgetAmount
                                value={subBudget}
                                active={editingKey === rowKey}
                                color={p.textSec}
                                accentColor={theme.accent.dot}
                                underlineColor={p.hairline}
                                onStartEdit={() => startAmountEdit(rowKey, subBudget)}
                                onMeasured={scrollEditIntoView}
                                accessibilityLabel={`Edit ${sub.label} budget`}
                              />
                            </TouchableOpacity>
                          </SwipeRow>
                        </CollapsingRow>
                      );
                    })}

	                    {regularCustoms.map((sub, ci) => {
                      const isLast = ci === regularCustoms.length - 1 && !hasRecurringSection;
	                      const rowKey = bKey(g.key, sub.label);
	                      const isRemoving = pendingRemoveKeys.has(rowKey);
	                      const customCat = categories.find(c => c.group === (g.key as GroupKey) && c.label.toLowerCase() === sub.label.toLowerCase());
	                      const spendSub = visibleSpendGroups.find(group => group.key === g.key)?.subs.find(item => item.label.toLowerCase() === sub.label.toLowerCase());
	                      const subBudget = budgets[rowKey] ?? spendSub?.budget ?? 0;
	                      return (
                        <CollapsingRow key={sub.label} removing={isRemoving}>
                          <SwipeRow onRemove={() => handleRemoveSub(g.key, { cat: slugify(sub.label), label: sub.label })} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                            <TouchableOpacity
                              onPress={() => customCat && openCategoryEditor(customCat.id)}
                              activeOpacity={customCat ? 0.68 : 1}
                              style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
                            >
                              <View style={[styles.rowIcon, { backgroundColor: theme.dark ? 'rgba(180,160,240,0.18)' : 'rgba(14,12,24,0.08)' }]}>
                                <Icon name={customCat?.icon ?? 'tag'} size={14} color={groupColor} stroke={1.5} />
                              </View>
	                              <View style={{ flex: 1, minWidth: 0 }}>
	                                <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>{sub.label}</Text>
	                              </View>
	                              <EditableBudgetAmount
                                value={subBudget}
                                active={editingKey === rowKey}
                                color={p.textSec}
                                accentColor={theme.accent.dot}
                                underlineColor={p.hairline}
                                onStartEdit={() => startAmountEdit(rowKey, subBudget)}
                                onMeasured={scrollEditIntoView}
                                accessibilityLabel={`Edit ${sub.label} budget`}
                              />
                            </TouchableOpacity>
                          </SwipeRow>
                        </CollapsingRow>
                      );
                    })}

	                    {hasRecurringSection && (
                      <>
                        <View style={[styles.billsDivider, { borderTopColor: p.hairline }]}>
                          <Icon name="repeat" size={11} color={p.textTer} stroke={1.6} />
                          <Text style={[TYPE.labelSm, { color: p.textTer }]}>Recurring</Text>
                        </View>
                        {recurringOrigSubs.map((sub, ri) => {
                          const isLast = ri === recurringOrigSubs.length - 1 && recurringCustoms.length === 0 && groupBills.length === 0;
                          const rowKey = bKey(g.key, sub.label);
	                          const isRemoving = pendingRemoveKeys.has(rowKey);
	                          const subCat = categories.find(c => c.id === sub.cat);
	                          const nextDate = subCat && typeof subCat.meta?.recurringDate === 'string' ? subCat.meta.recurringDate as string : null;
	                          const subBudget = budgets[rowKey] ?? sub.budget;
	                          return (
                            <CollapsingRow key={sub.cat} removing={isRemoving}>
	                              <SwipeRow onRemove={() => handleRemoveSub(g.key, sub)} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
	                                <TouchableOpacity
                                  onPress={() => openCategoryEditor(sub.cat)}
                                  activeOpacity={0.68}
                                  style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
                                >
                                  <View style={[styles.rowIcon, { backgroundColor: `${groupColor}26` }]}>
                                    <Icon name={sub.icon} size={15} color={groupColor} stroke={1.6} />
                                  </View>
	                                  <View style={{ flex: 1, minWidth: 0 }}>
	                                    <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>{sub.label}</Text>
	                                    {nextDate && <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]} numberOfLines={1}>{formatDateShort(nextDate)}</Text>}
	                                  </View>
	                                  <EditableBudgetAmount
                                value={subBudget}
                                active={editingKey === rowKey}
                                color={p.textSec}
                                accentColor={theme.accent.dot}
                                underlineColor={p.hairline}
                                onStartEdit={() => startAmountEdit(rowKey, subBudget)}
                                onMeasured={scrollEditIntoView}
                                accessibilityLabel={`Edit ${sub.label} budget`}
                              />
	                                </TouchableOpacity>
	                              </SwipeRow>
                            </CollapsingRow>
                          );
                        })}
                        {recurringCustoms.map((sub, ci) => {
                          const isLast = ci === recurringCustoms.length - 1 && groupBills.length === 0;
                          const rowKey = bKey(g.key, sub.label);
	                          const isRemoving = pendingRemoveKeys.has(rowKey);
	                          const customCat = categories.find(c => c.group === (g.key as GroupKey) && c.label.toLowerCase() === sub.label.toLowerCase());
	                          const nextDate = customCat && typeof customCat.meta?.recurringDate === 'string' ? customCat.meta.recurringDate as string : null;
	                          const spendSub = visibleSpendGroups.find(group => group.key === g.key)?.subs.find(item => item.label.toLowerCase() === sub.label.toLowerCase());
	                          const subBudget = budgets[rowKey] ?? spendSub?.budget ?? 0;
	                          return (
                            <CollapsingRow key={sub.label} removing={isRemoving}>
                              <SwipeRow onRemove={() => handleRemoveSub(g.key, { cat: slugify(sub.label), label: sub.label })} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                                <TouchableOpacity
                                  onPress={() => customCat && openCategoryEditor(customCat.id)}
                                  activeOpacity={customCat ? 0.68 : 1}
                                  style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
                                >
                                  <View style={[styles.rowIcon, { backgroundColor: theme.dark ? 'rgba(180,160,240,0.18)' : 'rgba(14,12,24,0.08)' }]}>
                                    <Icon name={customCat?.icon ?? 'repeat'} size={14} color={groupColor} stroke={1.5} />
                                  </View>
	                                  <View style={{ flex: 1, minWidth: 0 }}>
	                                    <Text style={[TYPE.body, { color: p.text }]}>{sub.label}</Text>
	                                    {nextDate && <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]} numberOfLines={1}>{formatDateShort(nextDate)}</Text>}
	                                  </View>
	                                  <EditableBudgetAmount
                                value={subBudget}
                                active={editingKey === rowKey}
                                color={p.textSec}
                                accentColor={theme.accent.dot}
                                underlineColor={p.hairline}
                                onStartEdit={() => startAmountEdit(rowKey, subBudget)}
                                onMeasured={scrollEditIntoView}
                                accessibilityLabel={`Edit ${sub.label} budget`}
                              />
                                </TouchableOpacity>
                              </SwipeRow>
                            </CollapsingRow>
                          );
                        })}
                        {groupBills.map((bill, bi) => {
                          const isLast = bi === groupBills.length - 1;
                          const isBillRemoving = pendingRemoveKeys.has(bill.id);
                          return (
                            <CollapsingRow key={bill.id} removing={isBillRemoving}>
                            <SwipeRow onRemove={() => handleRemoveBill(bill)} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                              <TouchableOpacity
                                onPress={() => openCategoryEditor(bill.cat)}
                                activeOpacity={0.68}
                                style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
                              >
                                <View style={[styles.rowIcon, { backgroundColor: `${categoryGroupColor(bill.cat, categories, theme.dark)}26` }]}>
                                  <Icon name={bill.icon} size={15} color={categoryGroupColor(bill.cat, categories, theme.dark)} stroke={1.6} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={[TYPE.body, { color: p.text }]}>{bill.name}</Text>
                                  <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]}>{bill.dueDate}</Text>
                                </View>
                                <EditableBudgetAmount
                                  value={budgets[billKey(g.key, bill.id)] ?? bill.amount}
                                  active={editingKey === billKey(g.key, bill.id)}
                                  color={p.textSec}
                                  accentColor={theme.accent.dot}
                                  underlineColor={p.hairline}
                                  onStartEdit={() => startAmountEdit(billKey(g.key, bill.id), budgets[billKey(g.key, bill.id)] ?? bill.amount)}
                                  onMeasured={scrollEditIntoView}
                                  accessibilityLabel={`Edit ${bill.name} budget`}
                                />
                              </TouchableOpacity>
                            </SwipeRow>
                            </CollapsingRow>
                          );
                        })}
                      </>
	                    )}

	                    <TouchableOpacity
                      onPress={() => {
                        setAddingForGroup(g.key);
                        setCategoryGroupDraft(g.key as GroupKey);
                        setCategoryLabelDraft('');
                        setCategoryIconDraft('tag');
                        setCategoryGoalTarget('');
                        setCategoryGoalSaved('');
                        setCategoryBudgetDraft('');
                        setCategoryRecurring(false);
                        setCategoryRecurringDate('');
                        setCategoryRecurringCadence('monthly');
                        setCategoryGoalDeadline('');
                        setCategoryNotes('');
                        setDuplicateNameError(false);
                        setCategoryFormError('');
                      }}
                      activeOpacity={0.7}
                      style={[styles.addCatBtn, { borderTopWidth: (visibleOrigSubs.length + customs.length + groupBills.length) > 0 ? 1 : 0, borderTopColor: p.hairline }]}
                    >
                      <Icon name="plus" size={13} color={theme.accent.dot} stroke={2} />
                      <Text style={[TYPE.captionEm, { color: theme.accent.dot }]}>Add category</Text>
	                    </TouchableOpacity>
	                    </View>
	                    </Collapsible>
                  </SectionCard>
                );
              })}

            </View>
          </AnimatedGHScrollView>

          {/* Floating undo toast */}
          {undoVisible && (
            <View style={{
              position: 'absolute',
              bottom: insets.bottom + 90,
              left: 16,
              right: 16,
              zIndex: 10,
            }}>
              <BlurView
                intensity={theme.dark ? 70 : 100}
                tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
                style={{ borderRadius: 14, overflow: 'hidden' }}
              >
                <View style={[styles.undoToast, { borderColor: stickyBorderColor }]}>
                  <Text style={[TYPE.bodySm, { flex: 1, color: p.text }]}>{undoLabel}</Text>
                  <TouchableOpacity onPress={handleUndo} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
                    <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>Undo</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          )}


        </View>
        </TapGestureHandler>
      </KeyboardAvoidingView>

      <PopupNumericKeypad
        visible={editingKey !== null}
        theme={theme}
        borderColor={stickyBorderColor}
        onHeightChange={setKeypadH}
        onKey={handleKeypadKey}
        onDone={closeAmountEdit}
      />

      <CategoryEditSheet
        theme={theme}
        category={editingCategory}
        addingForGroup={addingForGroup}
        label={categoryLabelDraft}
        icon={categoryIconDraft}
        group={categoryGroupDraft}
        goalTarget={categoryGoalTarget}
        goalSaved={categoryGoalSaved}
        budget={categoryBudgetDraft}
        recurring={categoryRecurring}
        recurringDate={categoryRecurringDate}
        recurringCadence={categoryRecurringCadence}
        goalDeadline={categoryGoalDeadline}
        nameError={duplicateNameError}
        formError={categoryFormError}
        notes={categoryNotes}
        onLabelChange={(v) => { setCategoryLabelDraft(v); if (duplicateNameError) setDuplicateNameError(false); if (categoryFormError) setCategoryFormError(''); }}
        onIconChange={setCategoryIconDraft}
        onGroupChange={setCategoryGroupDraft}
        onGoalTargetChange={setCategoryGoalTarget}
        onGoalSavedChange={setCategoryGoalSaved}
        onBudgetChange={setCategoryBudgetDraft}
        onRecurringChange={setCategoryRecurring}
        onRecurringDateChange={setCategoryRecurringDate}
        onRecurringCadenceChange={setCategoryRecurringCadence}
        onGoalDeadlineChange={setCategoryGoalDeadline}
        onNotesChange={(v) => { setCategoryNotes(v); if (categoryFormError) setCategoryFormError(''); }}
        onClose={() => { closeCategoryEditor(); setAddingForGroup(null); }}
        onSave={saveCategoryEdit}
        onDelete={deleteEditingCategory}
        onAddNew={(lbl, icn, grp, bgt, rec, recDate, recCadence, gt, gs, gd) => {
          return addSub(grp, lbl, icn, bgt, rec, recDate, recCadence, gt, gs, gd);
          // The sheet owns dismissal; parent drafts reset after native onDismiss.
        }}
      />

    </View>
    </DraftContext.Provider>
  );
}

const guardDollar = (t: string): string => {
  if (t === '' || t === '$') return t;
  return t.startsWith('$') ? t : `$${t.replace(/\$/g, '')}`;
};

const parseDeadline = (s: string): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const [m, y] = s.split('/').map(Number);
  if (m >= 1 && m <= 12 && y > 2000) return new Date(y, m - 1, 1);
  return null;
};

// Inline numeric amount field for the category sheet — identical look to the
// budget-screen rows (catBudgetWrap / catBudgetText + underline + caret).
// Tap to focus; when active the custom keypad drives the value.
function SheetNumericField({ displayValue, draft, active, placeholder, color, accentColor, underlineColor, onActivate }: {
  displayValue: string;
  draft: string;       // live keypad draft — only used when active
  active: boolean;
  placeholder: string;
  color: string;
  accentColor: string;
  underlineColor: string;
  onActivate: () => void;
}) {
  // displayValue may arrive as "500" or "$500" depending on which path set it.
  const raw = displayValue.replace(/[$,\s]/g, '');
  const num = raw !== '' ? Number(raw) : NaN;
  const isPlaceholder = !displayValue && !active;

  if (active) {
    return (
      <View style={[styles.catBudgetWrap, { borderBottomColor: accentColor }]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.catBudgetText, { color }]}>
          {draft ? `$${formatDraft(draft)}` : '$'}
        </Text>
        <EditCaret color={accentColor} />
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={onActivate} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 12, right: 6 }}>
      <View style={[styles.catBudgetWrap, { borderBottomColor: underlineColor }]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.catBudgetText, { color: isPlaceholder ? underlineColor : color }]}>
          {isPlaceholder ? placeholder : `$${fmtMoney(isNaN(num) ? 0 : num)}`}
        </Text>
        <View style={styles.catBudgetCaretSpacer} />
      </View>
    </TouchableOpacity>
  );
}

function CategoryEditSheet({
  theme, category, addingForGroup, label, icon, group, goalTarget, goalSaved,
  budget, recurring, recurringDate, recurringCadence, goalDeadline, nameError, formError, notes,
  onLabelChange, onIconChange, onGroupChange, onGoalTargetChange, onGoalSavedChange,
  onBudgetChange, onRecurringChange, onRecurringDateChange, onRecurringCadenceChange, onGoalDeadlineChange, onNotesChange,
  onClose, onSave, onDelete, onAddNew,
}: {
  theme: Theme;
  category: Category | null;
  addingForGroup: string | null;
  label: string;
  icon: string;
  group: GroupKey;
  goalTarget: string;
  goalSaved: string;
  budget: string;
  recurring: boolean;
  recurringDate: string;
  recurringCadence: CategoryRecurringCadence;
  goalDeadline: string;
  nameError: boolean;
  formError: string;
  notes: string;
  onLabelChange: (v: string) => void;
  onIconChange: (v: string) => void;
  onGroupChange: (v: GroupKey) => void;
  onGoalTargetChange: (v: string) => void;
  onGoalSavedChange: (v: string) => void;
  onBudgetChange: (v: string) => void;
  onRecurringChange: (v: boolean) => void;
  onRecurringDateChange: (v: string) => void;
  onRecurringCadenceChange: (v: CategoryRecurringCadence) => void;
  onGoalDeadlineChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onClose: () => void;
  onSave: () => boolean;
  onDelete: () => void;
  onAddNew: (label: string, icon: string, group: GroupKey, budget?: number, recurring?: boolean, recurringDate?: string, recurringCadence?: CategoryRecurringCadence, goalTarget?: number, goalSaved?: number, goalDeadline?: string) => boolean;
}) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const shouldPresent = category !== null || addingForGroup !== null;
  const isAddMode = addingForGroup !== null && category === null;
  const iconManuallySet = useRef(false);
  const showGoalFields = group === 'savings';
  const groupIconBg = theme.dark
    ? (GROUP_COLORS[group]?.dark ?? theme.chipBg)
    : (GROUP_COLORS[group]?.light ?? theme.chipBg);

  const [budgetDisplay, setBudgetDisplay] = useState('');
  const [goalTargetDisplay, setGoalTargetDisplay] = useState('');
  const [goalSavedDisplay, setGoalSavedDisplay] = useState('');
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [recurringDateVal, setRecurringDateVal] = useState<Date | null>(null);
  useEffect(() => {
    if (shouldPresent) {
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
  }, [shouldPresent]);
  useEffect(() => {
    if (category !== null || addingForGroup !== null) {
      iconManuallySet.current = false;
      setBudgetDisplay(budget ? `$${budget}` : '');
      setGoalTargetDisplay(goalTarget ? `$${goalTarget}` : '');
      setGoalSavedDisplay(goalSaved ? `$${goalSaved}` : '');
      setDeadlineDate(parseDeadline(goalDeadline));
      setRecurringDateVal(parseDeadline(recurringDate));
    }
  }, [category, addingForGroup]);

  const sep = { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth };

  const rawBudget = parseAmountDraft(budgetDisplay);
  const parsedGoalTarget = parseAmountDraft(goalTargetDisplay);
  const parsedGoalSaved = parseAmountDraft(goalSavedDisplay);
  const rawGoalTarget = parsedGoalTarget ?? 0;
  const rawGoalSaved = parsedGoalSaved ?? 0;
  const goalPct = rawGoalTarget > 0 ? Math.min(100, Math.round(rawGoalSaved / rawGoalTarget * 100)) : 0;
  const selectedGroupIdx = GROUP_OPTIONS.findIndex(o => o.value === group);
  const keyboardAppearance = theme.dark ? 'dark' : 'light';

  // ── Sheet numeric keypad ──────────────────────────────────────
  type NumField = 'budget' | 'target' | 'saved';
  const [activeNumField, setActiveNumField] = useState<NumField | null>(null);
  const [numDraft, setNumDraft] = useState('');
  const [sheetKbH, setSheetKbH] = useState(300);
  const sheetScrollRef = useRef<ScrollView>(null);
  const sheetScrollY = useRef(0);
  const fieldRowRefs: Record<NumField, React.RefObject<View | null>> = {
    budget: useRef<View | null>(null),
    target: useRef<View | null>(null),
    saved:  useRef<View | null>(null),
  };

  const scrollFieldIntoView = (ref: React.RefObject<View | null>, kbH: number) => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      // Window-space top edge of the keypad (incl. floating Done button). Scroll so
      // the field's bottom sits 24px above it. The big paddingBottom added while
      // editing guarantees there's enough scroll range to reach this.
      const keypadTop = SCREEN_H - kbH - KEYPAD_DONE_AREA;
      const delta = (y + h + 24) - keypadTop;
      if (delta > 0) {
        sheetScrollRef.current?.scrollTo({ y: sheetScrollY.current + delta, animated: true });
      }
    });
  };

  const activateNumFieldNow = (field: NumField, currentDisplay: string) => {
    if (activeNumField && activeNumField !== field) commitNumField(activeNumField);
    const raw = currentDisplay.replace(/[$,\s]/g, '');
    setNumDraft(raw);
    setActiveNumField(field);
    // Scroll after the keypad has risen enough to know its final height.
    setTimeout(() => scrollFieldIntoView(fieldRowRefs[field], sheetKbH), 180);
  };
  const activateNumField = (field: NumField, currentDisplay: string) => {
    Keyboard.dismiss();
    requestAnimationFrame(() => activateNumFieldNow(field, currentDisplay));
  };
  const commitNumField = (field: NumField = activeNumField!) => {
    if (!field) return;
    const parsed = parseAmountDraft(numDraft);
    const formatted = parsed !== null ? String(parsed) : '';
    if (field === 'budget') { setBudgetDisplay(formatted); onBudgetChange(formatted); }
    else if (field === 'target') { setGoalTargetDisplay(formatted); onGoalTargetChange(formatted); }
    else { setGoalSavedDisplay(formatted); onGoalSavedChange(formatted); }
  };
  const closeNumKeypad = () => {
    commitNumField();
    setActiveNumField(null);
  };
  const handleSheetKey = useCallback((k: KeypadKey) => {
    setNumDraft(prev => applyKeypadKey(prev, k));
  }, []);
  const requestDismiss = () => {
    Keyboard.dismiss();
    if (activeNumField) closeNumKeypad();
    onClose();
  };

  // Keep the sheet's top/hero/segmented spacing constant across all groups so
  // switching to Savings only appends the goal fields at the bottom — nothing
  // above them shifts up or down. (Detent is a fixed 'large', so there's room.)
  const compactSheet = true;
  const sheetTopPadding = compactSheet
    ? Math.max(insets.top, 10) + 8
    : Math.max(insets.top, 16) + 18;
  const sheetBottomPadding = compactSheet
    ? Math.max(insets.bottom, 10) + 8
    : Math.max(insets.bottom, 16) + 12;
  const fieldRowStyle = compactSheet ? styles.catFieldRowCompact : styles.catFieldRow;
  const trimmedLabel = label.trim();
  const budgetValid = budgetDisplay.trim() === '' || rawBudget !== null;
  const goalTargetValid = goalTargetDisplay.trim() === '' || parsedGoalTarget !== null;
  const goalSavedValid = goalSavedDisplay.trim() === '' || parsedGoalSaved !== null;
  const goalRelationshipError = showGoalFields && rawGoalSaved > 0 && rawGoalTarget <= 0
    ? 'Add a target before entering saved so far'
    : showGoalFields && rawGoalTarget > 0 && rawGoalSaved > rawGoalTarget
      ? 'Saved amount cannot be greater than the target'
      : '';
  const categoryValidationError = !trimmedLabel
    ? 'Category name is required'
    : !budgetValid
      ? 'Enter a valid monthly budget'
      : !goalTargetValid
        ? 'Enter a valid savings target'
        : !goalSavedValid
          ? 'Enter a valid saved amount'
          : goalRelationshipError || formError;
  const canSaveCategory = categoryValidationError.length === 0 && !nameError;
  const showCategoryError = categoryValidationError.length > 0 && (
    formError.length > 0
    || nameError
    || label.length > 0
    || budgetDisplay.length > 0
    || goalTargetDisplay.length > 0
    || goalSavedDisplay.length > 0
  );

  const handleSave = () => {
    if (!canSaveCategory) return;
    if (isAddMode) {
      const added = onAddNew(
        trimmedLabel, icon, group,
        rawBudget ?? undefined,
        recurring || undefined,
        recurring && recurringDateVal ? recurringDateVal.toISOString().slice(0, 10) : undefined,
        recurringCadence,
        rawGoalTarget > 0 ? rawGoalTarget : undefined,
        rawGoalSaved > 0 ? rawGoalSaved : undefined,
        deadlineDate ? deadlineDate.toISOString().slice(0, 10) : undefined,
      );
      if (!added) return;
    } else {
      const saved = onSave();
      if (!saved) return;
    }
    requestDismiss();
  };

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    Keyboard.dismiss();
    if (activeNumField) closeNumKeypad();
    onClose();
  }, [activeNumField, closeNumKeypad, onClose]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.4}
      pressBehavior="close"
    />
  ), []);

  const handleIndicatorStyle = useMemo(() => ({ backgroundColor: theme.textTer }), [theme.textTer]);
  const backgroundStyle = useMemo(() => ({ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }), [theme.surface]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['92%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); if (activeNumField) closeNumKeypad(); }} accessible={false}>
      <View style={[styles.categorySheet, {
        backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.40)',
      }]}>
        {/* Floating close — matches every other sheet's top-left placement */}
        <ScreenExitButton
          variant="close"
          onPress={requestDismiss}
          tint={theme.textSec}
          fallbackBg={theme.chipBg}
          accessibilityLabel="Close category editor"
          style={EXIT_FLOAT_STYLE}
        />
        <BottomSheetScrollView
          ref={sheetScrollRef}
          style={styles.categorySheetScroll}
          contentContainerStyle={[
            styles.categorySheetContent,
            {
              paddingTop: sheetTopPadding,
              // While editing, pad far past the keypad so the content is
              // genuinely taller than the frame — that's the only thing that
              // creates scroll range to lift a bottom field above the pad.
              paddingBottom: activeNumField
                ? sheetKbH + KEYPAD_DONE_AREA + 200
                : sheetBottomPadding,
              minHeight: '100%',
            },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={activeNumField !== null}
          onScroll={e => { sheetScrollY.current = e.nativeEvent.contentOffset.y; }}
          onScrollBeginDrag={() => { if (activeNumField) closeNumKeypad(); }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero — tap circle to open native popup menu */}
          <View style={[styles.catHero, compactSheet && styles.catHeroCompact]}>
            <Host ignoreSafeArea="all" style={{ width: 52, height: 52 }}>
              <Menu
                label={
                  <View
                    style={{ width: 52, height: 52 }}
                    accessibilityRole="button"
                    accessibilityLabel="Choose category icon"
                  >
                    <View style={[styles.catHeroCircle, { backgroundColor: groupIconBg }]}>
                      <Icon name={icon} size={22} color="#FBF8FF" stroke={1.5} />
                    </View>
                    <View style={[styles.iconPickerBadge, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                      <Icon name="chevDown" size={7} color="rgba(0,0,0,0.55)" stroke={2.4} />
                    </View>
                  </View>
                }
              >
                {CATEGORY_ICON_OPTIONS.map(opt => (
                  <SwiftButton
                    key={opt}
                    systemImage={opt === icon ? 'checkmark' : undefined}
                    onPress={() => {
                      iconManuallySet.current = true;
                      onIconChange(opt);
                    }}
                    label={ICON_DISPLAY_NAMES[opt] ?? opt}
                  />
                ))}
              </Menu>
            </Host>
            <Text style={[TYPE.headline, { color: theme.text, textAlign: 'center', marginTop: compactSheet ? 4 : 8 }]} numberOfLines={1}>
              {label.trim() || (isAddMode ? 'New category' : category?.label ?? 'Category')}
            </Text>
          </View>

          {/* Group — segmented control */}
          <SegmentedControl
            values={GROUP_OPTIONS.map(o => o.label)}
            selectedIndex={selectedGroupIdx >= 0 ? selectedGroupIdx : 0}
            onChange={(e) => {
              const opt = GROUP_OPTIONS[e.nativeEvent.selectedSegmentIndex];
              if (opt) onGroupChange(opt.value);
            }}
            tintColor={theme.accent.dot}
            appearance={theme.dark ? 'dark' : 'light'}
            backgroundColor={theme.dark ? 'rgba(242,244,245,0.08)' : 'rgba(11,13,16,0.045)'}
            fontStyle={{ color: theme.dark ? 'rgba(242,244,245,0.68)' : 'rgba(11,13,16,0.62)' }}
            activeFontStyle={{ color: theme.dark ? '#080A0D' : '#F2F4F5', fontWeight: '600' }}
            style={[styles.catGroupSegmented, compactSheet && styles.catGroupSegmentedCompact]}
          />

          {/* Primary field card: Name, Budget, Recurring, Notes */}
          <View style={[styles.catFieldCard, { backgroundColor: theme.chipBg, marginTop: compactSheet ? 8 : 12 }]}>
            <View style={[fieldRowStyle, sep]}>
              <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Name</Text>
              <BottomSheetTextInput
                value={label}
                accessibilityLabel="Category name"
                onChangeText={(next) => {
                  onLabelChange(next);
                  if (!iconManuallySet.current) onIconChange(inferCategoryIcon(next));
                }}
                onFocus={() => { if (activeNumField) closeNumKeypad(); }}
                placeholder="Category name"
                placeholderTextColor={theme.textTer}
                autoFocus={isAddMode}
                keyboardAppearance={keyboardAppearance}
                returnKeyType="done"
                selectTextOnFocus
                style={[styles.catFieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
              />
            </View>
            <View ref={fieldRowRefs.budget} style={[fieldRowStyle, sep]}>
              <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Monthly budget</Text>
              <SheetNumericField
                displayValue={budgetDisplay}
                draft={activeNumField === 'budget' ? numDraft : ''}
                active={activeNumField === 'budget'}
                placeholder="$0"
                color={theme.text}
                accentColor={theme.accent.dot}
                underlineColor={theme.hairline}
                onActivate={() => activateNumField('budget', budgetDisplay)}
              />
            </View>
            <View style={[fieldRowStyle, recurring ? sep : {}]}>
              <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Recurring</Text>
              <Switch
                value={recurring}
                accessibilityLabel="Recurring expense"
                onValueChange={onRecurringChange}
                trackColor={{ false: theme.hairline, true: theme.accent.dot }}
                thumbColor="#FBF8FF"
              />
            </View>
            {recurring && (
              <>
                <View style={[fieldRowStyle, sep]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Frequency</Text>
                  <Host matchContents ignoreSafeArea="all">
                    <Picker
                      selection={recurringCadence}
                      onSelectionChange={(val) => onRecurringCadenceChange(val as CategoryRecurringCadence)}
                      modifiers={[
                        pickerStyle('menu'),
                        tint(theme.text),
                        fixedSize({ horizontal: true, vertical: false }),
                      ]}
                    >
                      {RECURRING_CADENCES.map(item => (
                        <SwiftText key={item.value} modifiers={[tag(item.value)]}>{item.label}</SwiftText>
                      ))}
                    </Picker>
                  </Host>
                </View>
                <View style={[fieldRowStyle, sep, styles.catFieldRowFixed]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Next payment</Text>
                  {recurringDateVal ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Host ignoreSafeArea="all" style={styles.catDatePickerHost}>
                        <DatePicker
                          selection={recurringDateVal}
                          onDateChange={(d) => { setRecurringDateVal(d); onRecurringDateChange(d.toISOString().slice(0, 10)); }}
                          displayedComponents={['date']}
                          modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' })]}
                        />
                      </Host>
                      <Pressable onPress={() => { setRecurringDateVal(null); onRecurringDateChange(''); }} pointerEvents="box-only" hitSlop={8}>
                        <Icon name="close" size={11} color={theme.textTer} stroke={2} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => { const d = new Date(); d.setMonth(d.getMonth() + 1); setRecurringDateVal(d); onRecurringDateChange(d.toISOString().slice(0, 10)); }} pointerEvents="box-only">
                      <Text style={[TYPE.bodySm, { color: theme.accent.dot }]}>Set date</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
            <View style={fieldRowStyle}>
              <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Notes</Text>
              <BottomSheetTextInput
                value={notes}
                accessibilityLabel="Category notes"
                onChangeText={onNotesChange}
                onFocus={() => { if (activeNumField) closeNumKeypad(); }}
                placeholder=""
                placeholderTextColor={theme.textTer}
                keyboardAppearance={keyboardAppearance}
                returnKeyType="done"
                selectTextOnFocus
                style={[styles.catFieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
              />
            </View>
          </View>
          {showCategoryError && (
            <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: 8 }]}>
              {categoryValidationError}
            </Text>
          )}

          {/* Goal fields — compact date pickers, no inline expansion */}
          {showGoalFields && (
            <>
              <View style={[styles.catFieldCard, { backgroundColor: theme.chipBg, marginTop: compactSheet ? 10 : 14 }]}>
                <View ref={fieldRowRefs.target} style={[fieldRowStyle, sep]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Target</Text>
                  <SheetNumericField
                    displayValue={goalTargetDisplay}
                    draft={activeNumField === 'target' ? numDraft : ''}
                    active={activeNumField === 'target'}
                    placeholder="$0"
                    color={theme.text}
                    accentColor={theme.accent.dot}
                    underlineColor={theme.hairline}
                    onActivate={() => activateNumField('target', goalTargetDisplay)}
                  />
                </View>
                <View ref={fieldRowRefs.saved} style={[fieldRowStyle, sep]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Saved so far</Text>
                  <SheetNumericField
                    displayValue={goalSavedDisplay}
                    draft={activeNumField === 'saved' ? numDraft : ''}
                    active={activeNumField === 'saved'}
                    placeholder="$0"
                    color={theme.text}
                    accentColor={theme.accent.dot}
                    underlineColor={theme.hairline}
                    onActivate={() => activateNumField('saved', goalSavedDisplay)}
                  />
                </View>
                {/* Target date — fixed-height row so the picker never shifts layout */}
                <View style={[fieldRowStyle, styles.catFieldRowFixed]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Target date</Text>
                  {deadlineDate ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Host ignoreSafeArea="all" style={styles.catDatePickerHost}>
                        <DatePicker
                          selection={deadlineDate}
                          onDateChange={(d) => { setDeadlineDate(d); onGoalDeadlineChange(d.toISOString().slice(0, 10)); }}
                          displayedComponents={['date']}
                          modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' })]}
                        />
                      </Host>
                      <Pressable onPress={() => { setDeadlineDate(null); onGoalDeadlineChange(''); }} pointerEvents="box-only" hitSlop={8}>
                        <Icon name="close" size={11} color={theme.textTer} stroke={2} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); setDeadlineDate(d); onGoalDeadlineChange(d.toISOString().slice(0, 10)); }} pointerEvents="box-only">
                      <Text style={[TYPE.bodySm, { color: theme.accent.dot }]}>Set date</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {rawGoalTarget > 0 && (
                <View style={[styles.categoryGoalPreview, { marginTop: compactSheet ? 8 : 10 }]}>
                  <View style={[styles.goalTrack, { backgroundColor: theme.hairline }]}>
                    <View style={{
                      height: '100%', borderRadius: 3,
                      width: `${goalPct}%` as any,
                      backgroundColor: GROUP_COLORS.savings[theme.dark ? 'dark' : 'light'],
                    }} />
                  </View>
                  <Text style={[TYPE.caption, { color: theme.textSec }]}>
                    {goalPct}% · ${Math.max(0, rawGoalTarget - rawGoalSaved).toLocaleString()} to go
                  </Text>
                </View>
              )}
            </>
          )}

          <View style={styles.catSheetFooter}>
            <SheetPrimaryButton
              label={isAddMode ? 'Add category' : 'Save category'}
              onPress={handleSave}
              theme={theme}
              disabled={!canSaveCategory}
            />
            {!isAddMode && (
              <Pressable
                onPress={onDelete}
                pointerEvents="box-only"
                accessibilityRole="button"
                accessibilityLabel="Delete category"
                style={styles.categoryDeleteButton}
              >
                <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Delete category</Text>
              </Pressable>
            )}
          </View>
        </BottomSheetScrollView>

        <PopupNumericKeypad
          visible={activeNumField !== null}
          theme={theme}
          borderColor={theme.hairline}
          onHeightChange={setSheetKbH}
          onKey={handleSheetKey}
          onDone={closeNumKeypad}
          zIndex={20}
        />
      </View>
      </TouchableWithoutFeedback>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  stickyCardInner: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  hero: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 30,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    flexShrink: 1,
    flexWrap: 'nowrap',
  },
  monthPickerHost: {
    height: 30,
    width: 130,
  },
  heroMonthBtn: {
    width: 130,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 2,
  },
  heroMonthText: {
    ...TYPE.onMediaStatusSub,
    fontWeight: '500' as const,
  },
  sectionStack: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
    gap: 16,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  groupHeadAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
  },
  legendItem: {
    alignItems: 'center',
    flex: 1,
  },
  incomeNativeSheet: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 16,
  },
  incomeHero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
  incomeHeroCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeSegmented: {
    marginTop: 2,
  },
  incomeFeedback: {
    minHeight: 34,
    borderRadius: 17,
    marginTop: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  incomeAmountInput: {
    minWidth: 60,
    textAlign: 'right',
  },
  undoToast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  subGoalTrack: {
    width: 56,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  billsDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 2,
    borderTopWidth: 1,
  },
  addCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 2,
  },
  categorySheet: {
    flex: 1,
  },
  categorySheetScroll: {
    flex: 1,
  },
  categorySheetContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  categoryGoalPreview: {
    marginTop: 12,
    gap: 8,
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  catSheetFooter: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: 16,
  },
  categoryDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  catHero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
  },
  catHeroCompact: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  catHeroCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickerBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  // One fixed-metric row for both display and edit so the amount never shifts
  // when the keypad opens. The underline lives here (constant width/padding);
  // only its color changes. catBudgetCaretSpacer reserves the caret's exact
  // footprint (width 2 + marginLeft 1) in display mode so the right-pinned row
  // is the same width in both states.
  catBudgetWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexShrink: 0,
    borderBottomWidth: 1,
    paddingBottom: 1,
  },
  catBudgetText: {
    ...TYPE.subsectionTitle,
  },
  catBudgetCaretSpacer: {
    width: 3,
  },
  editCaret: {
    width: 2,
    height: 17,
    borderRadius: 1,
    marginLeft: 1,
  },
  // Fixes date picker row height — prevents Host from expanding when a picker
  // appears (it would shift layout otherwise since matchContents auto-sizes).
  catFieldRowFixed: {
    height: 44,
  },
  catDatePickerHost: {
    width: 130,
    height: 34,
  },
  catGroupSegmented: {
    marginTop: 4,
  },
  catGroupSegmentedCompact: {
    marginTop: 2,
  },
  catFieldCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  catFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  catFieldRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  catFieldLabel: {
    ...TYPE.body,
    flexShrink: 0,
  },
  catFieldInput: {
    ...TYPE.subsectionTitle,
    fontWeight: '500' as const,
    padding: 0,
  },
});
