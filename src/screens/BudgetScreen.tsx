import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import {
  Alert,
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
  Easing,
} from 'react-native';
import { Swipeable, ScrollView as GHScrollView, TapGestureHandler, State } from 'react-native-gesture-handler';

const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MenuView } from '@react-native-menu/menu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, GROUP_COLORS, OVER_DOT } from '../theme';
import { Icon } from '../components/Icon';
import { SheetPrimaryButton } from '../components/shared';
import { ThemeToggle } from '../components/ThemeToggle';
import { TYPE } from '../typography';
import { makeP, DARK_TEXT_SHADOW, makeScrim } from '../wallpaperPalette';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryGroupFor } from '../repositories/categoryUtils';
import type { Bill, Category, GroupKey, Income, RecurringRule, SpendGroup, SpendSub } from '../repositories/types';
import { monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import { CATEGORY_ICON_OPTIONS, ICON_DISPLAY_NAMES, inferCategoryIcon } from '../categoryIcons';
import {
  BottomSheet,
  DatePicker,
  Group,
  Picker,
  Text as SwiftText,
  Host,
  RNHostView,
} from '@expo/ui/swift-ui';
import {
  background,
  datePickerStyle,
  tint,
  pickerStyle,
  tag,
  fixedSize,
  ignoreSafeArea,
  presentationDetents,
  presentationDragIndicator,
  environment,
  type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../ThemeProvider';

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
  incomeSheetToken?: number;
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

const INCOME_DETENT: PresentationDetent = 'large';
const CAT_DETENT: PresentationDetent = 'large';
const CAT_DETENTS: PresentationDetent[] = [CAT_DETENT];
const CURRENT_MONTH = '2026-05';
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const parseAmountDraft = (text: string): number | null => {
  const clean = text.replace(/[$,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === '' || clean === '.') return null;
  const v = Number(clean);
  return Number.isFinite(v) && v >= 0 ? v : null;
};

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

function SectionCard({ children, style, dark }: { children: React.ReactNode; style?: any; dark: boolean }) {
  const borderColor = dark ? 'rgba(235,225,255,0.20)' : 'rgba(14,12,24,0.08)';
  return (
    <BlurView intensity={dark ? 70 : 100} tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
      style={[styles.sectionCard, style]}
    >
      <View style={[styles.sectionCardBorder, { borderColor }]}>{children}</View>
    </BlurView>
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
          style={{ flex: 1, marginLeft: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: OVER_DOT }}
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

export function BudgetScreen({ theme, onOpenDrawer, incomeSheetToken = 0 }: Props) {
  const { transactionsRepo, incomeRepo, budgetsRepo, categoriesRepo, recurringRulesRepo } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const incomes = useRepositoryList(incomeRepo);
  const budgetRecords = useRepositoryList(budgetsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const upcomingBills = useMemo(
    () => upcomingBillsFromRecurring(recurringRules, categories),
    [recurringRules, categories],
  );
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
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
  const { wallpaper } = useTheme();
  const pWallpaper = makeP(true);
  const p = makeP(theme.dark);
  const shadow = DARK_TEXT_SHADOW;
  const scrim = makeScrim(theme.dark);

  // ── Scroll-driven sticky morph ────────────────────────────────
  const scrollRaw = useRef(new Animated.Value(0)).current;
  const stickyAnim = useRef(new Animated.Value(0)).current;
  const sectionStackYRef = useRef(0);
  const allocCardYRef = useRef(0);
  const allocCardHRef = useRef(0);
  const [headerH, setHeaderH] = useState(0);
  // The pinned overlay only intercepts touches once it's actually pinned;
  // before that it's invisible and must let the hero region stay tappable.
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);

  useEffect(() => {
    const id = scrollRaw.addListener(({ value }) => {
      // Pin fires the instant the card's top meets the header. progress then
      // drives the card→full-bleed "grow"; the visible/pinned swap is sharp so
      // it reads as the same card sticking, not a second one fading in.
      const cardAbsY = sectionStackYRef.current + allocCardYRef.current;
      const range = Math.max(allocCardHRef.current * 0.6, 1);
      const progress = Math.max(0, Math.min(1, (value - cardAbsY) / range));
      stickyAnim.setValue(progress);
      const isPinned = progress > 0;
      if (isPinned !== pinnedRef.current) {
        pinnedRef.current = isPinned;
        setPinned(isPinned);
      }
    });
    return () => scrollRaw.removeListener(id);
  }, [scrollRaw, stickyAnim]);

  // Pinned copy morphs from card-style → full-bleed (it "grows" to the edges).
  const stickyPaddingH   = stickyAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const stickyRadius     = stickyAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  // Sharp hand-off at the pin line — both renders are identical & aligned there.
  const stickyOpacity    = stickyAnim.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 1, 1] });
  const allocCardOpacity = stickyAnim.interpolate({ inputRange: [0, 0.001, 1], outputRange: [1, 0, 0] });

  // ── Budget state ──────────────────────────────────────────────
  const [income, setIncome] = useState(initialIncome);
  const [cadence, setCadence] = useState<Cadence>('Mo');
  const [incomeKind, setIncomeKind] = useState<'regular' | 'irregular'>('regular');
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState('');
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [incomeSource, setIncomeSource] = useState('');
  const [incomeStartDate, setIncomeStartDate] = useState<Date>(() => defaultIncomeDateForMonth(CURRENT_MONTH));
  const [incomeEndDate, setIncomeEndDate] = useState<Date | null>(null);
  const [incomeReceivedDate, setIncomeReceivedDate] = useState<Date>(() => defaultIncomeDateForMonth(CURRENT_MONTH));
  const [incomeFeedback, setIncomeFeedback] = useState('');
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

  const loadIncomeForEdit = (inc: Income) => {
    setIncomeKind('regular');
    setEditingIncomeId(inc.id);
    setIncomeSource(inc.source);
    setCadence(INCOME_TO_CADENCE[inc.cadence] ?? 'Mo');
    setIncomeDraft(`$${inc.amount}`);
    setIncomeStartDate(dateFromYMD(inc.startDate));
    setIncomeEndDate(inc.endDate ? dateFromYMD(inc.endDate) : null);
    setIncomeFeedback('');
  };

  const loadOneTimeIncomeForEdit = (inc: Income) => {
    setIncomeKind('irregular');
    setEditingIncomeId(inc.id);
    setIncomeSource(inc.source === 'One-time income' ? '' : inc.source);
    setIncomeDraft(`$${inc.amount}`);
    setIncomeReceivedDate(dateFromYMD(inc.receivedAt ?? inc.startDate));
    setIncomeFeedback('');
  };

  const startNewIncome = () => {
    setIncomeKind('regular');
    setEditingIncomeId(null);
    setIncomeSource('');
    setCadence('Mo');
    setIncomeDraft('');
    setIncomeStartDate(defaultIncomeDateForMonth(selectedMonth));
    setIncomeEndDate(null);
    setIncomeFeedback('');
  };

  const startNewOneTimeIncome = () => {
    setIncomeKind('irregular');
    setEditingIncomeId(null);
    setIncomeSource('');
    setIncomeDraft('');
    setIncomeReceivedDate(defaultIncomeDateForMonth(selectedMonth));
    setIncomeFeedback('');
  };

  const removeIncome = (id: string) => {
    const removed = incomes.find(item => item.id === id);
    if (!removed) return;
    saveSnapshot({ deletedIncome: removed });
    const nextRegularIncome = regularIncomes.find(item => item.id !== id) ?? null;
    const nextOneTimeIncome = oneTimeIncomesForSelectedMonth.find(item => item.id !== id) ?? null;
    incomeRepo.delete(id);
    if (editingIncomeId === id) {
      if ((removed.kind ?? 'regular') === 'regular') {
        if (nextRegularIncome) loadIncomeForEdit(nextRegularIncome); else startNewIncome();
      } else {
        if (nextOneTimeIncome) loadOneTimeIncomeForEdit(nextOneTimeIncome); else startNewOneTimeIncome();
      }
    }
    showUndo(`Removed ${removed.source}`);
  };

  const confirmRemoveIncome = (id: string) => {
    const inc = incomes.find(item => item.id === id);
    if (!inc) return;
    Alert.alert(
      'Remove income',
      `Remove "${inc.source}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeIncome(id) },
      ],
    );
  };

  const openIncomeSheet = () => {
    const primary = regularIncomes[0];
    if (primary) loadIncomeForEdit(primary); else startNewIncome();
    setIncomeSheetOpen(true);
  };

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

  useEffect(() => {
    if (incomeSheetToken > 0) openIncomeSheet();
  }, [incomeSheetToken]);

  const commitIncome = () => {
    const v = parseAmountDraft(incomeDraft);
    if (v === null || v <= 0) return;
    if (incomeKind === 'irregular') {
      const source = incomeSource.trim() || 'One-time income';
      const receivedAt = toISODateTime(incomeReceivedDate);
      if (editingIncomeId) {
        incomeRepo.update(editingIncomeId, {
          kind: 'irregular',
          amount: v,
          source,
          cadence: 'oneTime',
          startDate: toYMD(incomeReceivedDate),
          receivedAt,
          updatedByUserId: 'local',
        });
        setIncomeFeedback(`Updated one-time income for ${monthLabel(selectedMonth)}`);
      } else {
        incomeRepo.create({
          kind: 'irregular',
          amount: v,
          source,
          cadence: 'oneTime',
          startDate: toYMD(incomeReceivedDate),
          receivedAt,
          createdByUserId: 'local',
          updatedByUserId: 'local',
        });
        setIncomeFeedback(`Logged one-time income for ${monthLabel(selectedMonth)}`);
        setIncomeDraft('');
        setIncomeSource('');
        setIncomeReceivedDate(defaultIncomeDateForMonth(selectedMonth));
      }
      return;
    }
    // Regular: store the entered amount at its own cadence so monthlyIncome()
    // converts and sums every source. Multiple named sources are supported.
    const source = incomeSource.trim();
    if (!source) return;
    const incomeCadence = CADENCE_TO_INCOME[cadence];
    const payload = {
      amount: v,
      source,
      kind: 'regular' as const,
      cadence: incomeCadence,
      startDate: toYMD(incomeStartDate),
      endDate: incomeEndDate ? toYMD(incomeEndDate) : undefined,
      updatedByUserId: 'local',
    };
    if (editingIncomeId) {
      incomeRepo.update(editingIncomeId, payload);
      setIncomeFeedback(`Saved ${source}`);
    } else {
      const created = incomeRepo.create({
        ...payload,
        createdByUserId: 'local',
      });
      setEditingIncomeId(created.id);
      setIncomeFeedback(`Added ${source}`);
    }
    // income state resyncs from monthlyIncome(incomes) via the effect below.
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
    showUndo(`Archived ${label}`, () => {
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
    setAddingForGroup(null);
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

  const saveCategoryEdit = () => {
    if (!editingCategory) return;
    const label = categoryLabelDraft.trim();
    if (!label) {
      setCategoryFormError('Category name is required');
      return;
    }
    const duplicate = categories.some(cat => (
      cat.id !== editingCategory.id &&
      !cat.archived &&
      cat.label.toLowerCase() === label.toLowerCase()
    ));
    if (duplicate) {
      setDuplicateNameError(true);
      setCategoryFormError('A category with this name already exists');
      return;
    }
    setDuplicateNameError(false);
    const actualGroup: GroupKey = categoryGroupDraft;
    const goalTarget = parseAmountDraft(categoryGoalTarget);
    const goalSaved = parseAmountDraft(categoryGoalSaved);
    if (categoryGroupDraft === 'savings' && goalTarget !== null && goalSaved !== null && goalTarget > 0 && goalSaved > goalTarget) {
      setCategoryFormError('Saved amount cannot be greater than the target');
      return;
    }
    if (categoryGroupDraft === 'savings' && goalSaved !== null && goalSaved > 0 && (!goalTarget || goalTarget <= 0)) {
      setCategoryFormError('Add a target before entering saved so far');
      return;
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
    setEditingCategory(null); // drafts reset after sheet fully dismisses via onIsPresentedChange → onClose
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
    (theme.dark ? GROUP_COLORS[key]?.dark : GROUP_COLORS[key]?.light) ?? '#888888';
  const needsCol   = gCol('needs');
  const wantsCol   = gCol('wants');
  const savingsCol = gCol('savings');

  const needsShare = totalBudgeted > 0 ? needsTotal / totalBudgeted : 0;
  const wantsShare = totalBudgeted > 0 ? wantsTotal / totalBudgeted : 0;
  const savingsShare = totalBudgeted > 0 ? savingsTotal / totalBudgeted : 0;

  // Hero focal metric — zero-based "allocate to zero" framing.
  const fullyAssigned = remaining === 0;
  const heroEyebrow = isOver ? 'Over budget' : fullyAssigned ? 'Fully assigned' : 'Left to assign';

  const fullyAssignedPulseAnim = useRef(new Animated.Value(0)).current;
  const prevFullyAssigned = useRef(false);
  useEffect(() => {
    if (fullyAssigned && !prevFullyAssigned.current) {
      fullyAssignedPulseAnim.setValue(0);
      Animated.sequence([
        Animated.timing(fullyAssignedPulseAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.delay(360),
        Animated.timing(fullyAssignedPulseAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]).start();
    }
    prevFullyAssigned.current = fullyAssigned;
  }, [fullyAssigned]);

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
        if ((recreated.kind ?? 'regular') === 'regular') loadIncomeForEdit(recreated);
        else loadOneTimeIncomeForEdit(recreated);
      }
      prevActionSnapshot.current = null;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoVisible(false);
  }, []);


  const heroLabelColor = fullyAssignedPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FBF8FF', '#5CC4BA'],
  });

  const legendItems = [
    { label: 'Needs',                  dotColor: needsCol,   amount: needsTotal,   pct: Math.round(needsShare * 100)   },
    { label: 'Wants',                  dotColor: wantsCol,   amount: wantsTotal,   pct: Math.round(wantsShare * 100)   },
    { label: 'Savings',                dotColor: savingsCol, amount: savingsTotal, pct: Math.round(savingsShare * 100) },
    { label: isOver ? 'Over' : 'Unassigned', dotColor: isOver ? OVER_DOT : p.textTer, amount: Math.abs(remaining), pct: Math.round(Math.abs(remaining) / Math.max(income, 1) * 100) },
  ];

  // Shared allocation-card body — rendered identically by both the in-scroll
  // card and the pinned overlay so the hand-off is a seamless swap, not a fade.
  const allocationCardBody = () => (
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
              <Text style={[TYPE.label, { color: item.dotColor }]}>{item.label}</Text>
            </View>
            <Text style={[TYPE.subsectionTitle, { color: p.text }]}>
              ${Math.round(item.amount).toLocaleString()}
            </Text>
            <Text style={[TYPE.caption, { color: p.textSec }]}>{item.pct}%</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        onPress={openIncomeSheet}
        activeOpacity={0.7}
        style={[styles.allocationIncomeBtn, { backgroundColor: p.trackBg }]}
        accessibilityRole="button"
        accessibilityLabel={`Income $${fmtMoney(income)}, assigned $${fmtMoney(totalBudgeted)}`}
      >
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[TYPE.bodySmEm, { color: p.text }]}>${fmtMoney(income)}</Text>
          <Text style={[TYPE.labelSm, { color: p.textTer }]}>INCOME</Text>
        </View>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: p.textTer }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[TYPE.bodySmEm, { color: p.text }]}>${fmtMoney(totalBudgeted)}</Text>
          <Text style={[TYPE.labelSm, { color: p.textTer }]}>ASSIGNED</Text>
        </View>
      </TouchableOpacity>
    </>
  );

  const stickyBorderColor = theme.dark ? 'rgba(235,225,255,0.16)' : 'rgba(14,12,24,0.08)';
  const incomeAmountValue = parseAmountDraft(incomeDraft);
  const incomeDateRangeValid = !incomeEndDate || incomeEndDate >= incomeStartDate;
  const canCommitIncome = incomeAmountValue !== null
    && incomeAmountValue > 0
    && (incomeKind === 'irregular' || (incomeSource.trim().length > 0 && incomeDateRangeValid));
  const incomeSep = { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth };

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? '#0F0B1C' : '#F5F4F8' }}>

      {/* Wallpaper + scrim — outside KAV so the keyboard never shifts it */}
      <ImageBackground source={wallpaper.source} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
        <LinearGradient pointerEvents="none"
          colors={[scrim.top, scrim.mid, scrim.lower, scrim.bottom]}
          locations={[0, 0.28, 0.60, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </ImageBackground>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Layout column — TapGestureHandler fires on touch start (State.BEGAN) anywhere
            on screen when a row is open. simultaneousHandlers lets scroll and swipe
            gestures proceed normally at the same time. */}
        <TapGestureHandler
          ref={outerTapRef}
          simultaneousHandlers={scrollViewRef}
          maxDist={10}
          onHandlerStateChange={({ nativeEvent }) => {
            if (nativeEvent.state === State.END) dismissOpenSwipe();
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
              paddingHorizontal: stickyPaddingH,
              opacity: stickyOpacity,
            }}
          >
            <Animated.View style={{ borderRadius: stickyRadius, overflow: 'hidden' }}>
              <BlurView
                intensity={theme.dark ? 70 : 100}
                tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              >
                <View style={[styles.stickyCardInner, { borderColor: stickyBorderColor }]}>
                  {allocationCardBody()}
                </View>
              </BlurView>
            </Animated.View>
          </Animated.View>

          {/* Scrollable content */}
          <AnimatedGHScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={8}
            onScrollBeginDrag={dismissOpenSwipe}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollRaw } } }],
              { useNativeDriver: false },
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
                  <View style={styles.heroStatusRow}>
                    {isOver && <View style={[styles.heroOverDot, { backgroundColor: OVER_DOT }]} />}
                    <Animated.Text style={[TYPE.onMediaStatusSub, { color: heroLabelColor }, shadow]}>{heroEyebrow}</Animated.Text>
                    <Text style={[TYPE.onMediaStatusSub, { color: pWallpaper.textSec }, shadow]}> · </Text>
                    <Text style={[TYPE.onMediaStatus, { color: pWallpaper.text }, shadow]}
                      accessibilityLabel={`${heroEyebrow}, $${fmtMoney(Math.abs(remaining))}`}
                    >
                      {isOver ? '-' : ''}${fmtMoney(Math.abs(remaining))}
                    </Text>
                  </View>
                  <MenuView
                    shouldOpenOnLongPress={false}
                    themeVariant={theme.dark ? 'dark' : 'light'}
                    actions={monthOptions.map(key => ({
                      id: key,
                      title: monthLabel(key),
                      state: key === selectedMonth ? 'on' : 'off',
                    }))}
                    onPressAction={({ nativeEvent }) => setSelectedMonth(nativeEvent.event)}
                    style={styles.monthPickerHost}
                  >
                    <View style={styles.heroMonthBtn}>
                      <Text style={[styles.heroMonthText, { color: pWallpaper.text }, shadow]}>{monthLabel(selectedMonth)}</Text>
                      <Icon name="chevDown" size={11} color={pWallpaper.text} stroke={2} />
                    </View>
                  </MenuView>
                </View>

                {!selectedMonthHasBudgets && (
                  <TouchableOpacity onPress={copyFromPreviousMonth} activeOpacity={0.7} style={styles.heroCopyBtn}
                    accessibilityRole="button" accessibilityLabel={`Copy budget from ${monthLabel(monthKeyFromOffset(selectedMonth, -1))}`}>
                    <Icon name="repeat" size={12} color={pWallpaper.text} stroke={1.8} />
                    <Text style={[TYPE.captionEm, { color: pWallpaper.text }, shadow]}>
                      Copy {monthLabel(monthKeyFromOffset(selectedMonth, -1))}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Allocation card — budget bar + legend + income/assigned */}
              <Animated.View
                onLayout={e => {
                  allocCardYRef.current = e.nativeEvent.layout.y;
                  allocCardHRef.current = e.nativeEvent.layout.height;
                }}
                style={{ opacity: allocCardOpacity }}
              >
                <SectionCard dark={theme.dark}>
                  {allocationCardBody()}
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
	                          {`Target ${fmtPct(g.targetPct)} · $${fmtMoney(groupTarget)} · ${visibleItemCount} ${visibleItemCount === 1 ? 'category' : 'categories'}${groupIsOver ? ` · Over $${fmtMoney(groupDelta)}` : ''}`}
	                        </Text>
	                      </View>
	                      <View style={styles.groupHeadAmount}>
	                        <Text style={[TYPE.subsectionTitle, { color: groupColor }]}>${groupTotal.toLocaleString()}</Text>
	                        <Icon name={isCollapsed ? 'chevDown' : 'chevUp'} size={11} color={p.textTer} stroke={2} />
	                      </View>
	                    </Pressable>

	                    {!isCollapsed && regularOrigSubs.map((sub, si) => {
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
                              <View style={[styles.rowIcon, { backgroundColor: groupColor }]}>
                                <Icon name={sub.icon} size={15} color="#FBF8FF" stroke={1.6} />
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
	                              <Text style={[styles.catBudgetDisplay, { color: p.textSec }]}>
	                                ${fmtMoney(subBudget)}
	                              </Text>
                            </TouchableOpacity>
                          </SwipeRow>
                        </CollapsingRow>
                      );
                    })}

	                    {!isCollapsed && regularCustoms.map((sub, ci) => {
                      const isLast = ci === regularCustoms.length - 1 && !hasRecurringSection;
	                      const rowKey = bKey(g.key, sub.label);
	                      const isRemoving = pendingRemoveKeys.has(rowKey);
	                      const customCat = categories.find(c => c.group === (g.key as GroupKey) && c.label.toLowerCase() === sub.label.toLowerCase());
	                      const spendSub = visibleSpendGroups.find(group => group.key === g.key)?.subs.find(item => item.label.toLowerCase() === sub.label.toLowerCase());
	                      const subBudget = budgets[rowKey] ?? spendSub?.budget ?? 0;
	                      const subSpent = spendSub?.spent ?? 0;
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
	                              <Text style={[styles.catBudgetDisplay, { color: p.textSec }]}>
	                                ${fmtMoney(subBudget)}
	                              </Text>
                            </TouchableOpacity>
                          </SwipeRow>
                        </CollapsingRow>
                      );
                    })}

	                    {!isCollapsed && hasRecurringSection && (
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
                                  <View style={[styles.rowIcon, { backgroundColor: groupColor }]}>
                                    <Icon name={sub.icon} size={15} color="#FBF8FF" stroke={1.6} />
                                  </View>
	                                  <View style={{ flex: 1, minWidth: 0 }}>
	                                    <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>{sub.label}</Text>
	                                    {nextDate && <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]} numberOfLines={1}>{nextDate}</Text>}
	                                  </View>
	                                  <Text style={[styles.catBudgetDisplay, { color: p.textSec }]}>
	                                    ${fmtMoney(subBudget)}
	                                  </Text>
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
	                          const subSpent = spendSub?.spent ?? 0;
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
	                                    {nextDate && <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]} numberOfLines={1}>{nextDate}</Text>}
	                                  </View>
	                                  <Text style={[styles.catBudgetDisplay, { color: p.textSec }]}>
	                                    ${fmtMoney(subBudget)}
	                                  </Text>
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
                                <View style={[styles.rowIcon, { backgroundColor: categoryGroupColor(bill.cat, categories, theme.dark) }]}>
                                  <Icon name={bill.icon} size={15} color="#FBF8FF" stroke={1.6} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={[TYPE.body, { color: p.text }]}>{bill.name}</Text>
                                  <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]}>{bill.dueDate}</Text>
                                </View>
                                <Text style={[styles.catBudgetDisplay, { color: p.textSec }]}>
                                  ${fmtMoney(budgets[billKey(g.key, bill.id)] ?? bill.amount)}
                                </Text>
                              </TouchableOpacity>
                            </SwipeRow>
                            </CollapsingRow>
                          );
                        })}
                      </>
	                    )}

	                    {!isCollapsed && (
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
	                    )}
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

      <Host
        colorScheme={theme.dark ? 'dark' : 'light'}
        ignoreSafeArea="keyboard"
        style={{ width: 0, height: 0, position: 'absolute' }}
      >
        <BottomSheet
          isPresented={incomeSheetOpen}
          onIsPresentedChange={(v) => { if (!v) setIncomeSheetOpen(false); }}
        >
          <Group modifiers={[
            presentationDetents([INCOME_DETENT]),
            presentationDragIndicator('visible'),
            environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
            background(theme.surface),
            ignoreSafeArea({ regions: 'keyboard', edges: 'bottom' }),
          ]}>
            <RNHostView>
              <View style={[styles.incomeNativeSheet, {
                backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.52)',
              }]}>
                <View style={[styles.sheetHead, { justifyContent: 'flex-end' }]}>
                  <Pressable onPress={() => setIncomeSheetOpen(false)}
                    pointerEvents="box-only"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.sheetCloseBtn, { backgroundColor: theme.chipBg }]}
                  >
                    <Icon name="close" size={15} color={theme.textSec} stroke={1.8} />
                  </Pressable>
                </View>

                <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
                  <View style={styles.incomeHero}>
                    <View style={[styles.incomeHeroCircle, { backgroundColor: theme.accent.fill }]}>
                      <Icon name="wallet" size={18} color={theme.accent.ink} stroke={1.7} />
                    </View>
                    <Text style={[TYPE.labelLg, { color: theme.textTer, marginTop: 12 }]}>Monthly income</Text>
                    <Text style={[TYPE.headline, { color: theme.text, marginTop: 2 }]}>
                      ${fmtMoney(income)}
                    </Text>
                    <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2 }]}>
                      For {monthLabel(selectedMonth)}
                    </Text>
                    {oneTimeIncomeThisMonth > 0 && (
                      <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2, textAlign: 'center' }]}>
                        Includes ${fmtMoney(oneTimeIncomeThisMonth)} one-time in {monthLabel(selectedMonth)}
                      </Text>
                    )}
                  </View>

                  <SegmentedControl
                    values={['Regular', 'One-time']}
                    selectedIndex={incomeKind === 'regular' ? 0 : 1}
                    onChange={e => {
                      const idx = e.nativeEvent.selectedSegmentIndex;
                      if (idx === 0) {
                        if (incomeKind !== 'regular') startNewIncome();
                      } else {
                        startNewOneTimeIncome();
                      }
                    }}
                    tintColor={theme.accent.dot}
                    appearance={theme.dark ? 'dark' : 'light'}
                    style={styles.incomeSegmented}
                  />

                  {incomeFeedback.length > 0 && (
                    <View style={[styles.incomeFeedback, { backgroundColor: theme.accent.fill }]}>
                      <Icon name="check" size={13} color={theme.accent.ink} stroke={2} />
                      <Text style={[TYPE.captionEm, { color: theme.accent.ink }]}>{incomeFeedback}</Text>
                    </View>
                  )}

                  {incomeKind === 'regular' ? (
                    <>
                      <View style={[styles.catFieldCard, { backgroundColor: theme.chipBg, marginTop: 12 }]}>
                        {regularIncomes.length > 0 && (
                          <View style={[styles.catFieldRow, incomeSep]}>
                            <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Source</Text>
                            <Host matchContents>
                              <Picker
                                selection={editingIncomeId ?? '__new__'}
                                onSelectionChange={(val) => {
                                  const id = String(val);
                                  if (id === '__new__') startNewIncome();
                                  else {
                                    const inc = regularIncomes.find(i => i.id === id);
                                    if (inc) loadIncomeForEdit(inc);
                                  }
                                }}
                                modifiers={[pickerStyle('menu'), tint(theme.text), fixedSize({ horizontal: true, vertical: false })]}
                              >
                                {regularIncomes.map(inc => (
                                  <SwiftText key={inc.id} modifiers={[tag(inc.id)]}>{inc.source}</SwiftText>
                                ))}
                                <SwiftText key="__new__" modifiers={[tag('__new__')]}>New source</SwiftText>
                              </Picker>
                            </Host>
                          </View>
                        )}
                        <View style={[styles.catFieldRow, incomeSep]}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Name</Text>
                          <TextInput
                            value={incomeSource}
                            onChangeText={setIncomeSource}
                            placeholder="e.g. Salary, Weekend job"
                            placeholderTextColor={theme.textTer}
                            keyboardAppearance={theme.dark ? 'dark' : 'light'}
                            returnKeyType="done"
                            selectTextOnFocus
                            style={[styles.catFieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
                          />
                        </View>
                        <View style={[styles.catFieldRow, incomeSep]}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Amount</Text>
                          <TextInput
                            value={incomeDraft}
                            onChangeText={(t) => setIncomeDraft(guardDollar(t))}
                            keyboardType="decimal-pad"
                            keyboardAppearance={theme.dark ? 'dark' : 'light'}
                            placeholder="$0"
                            placeholderTextColor={theme.textTer}
                            returnKeyType="done"
                            selectTextOnFocus
                            style={[styles.catFieldInput, styles.incomeAmountInput, { color: theme.text }]}
                          />
                        </View>
                        <View style={styles.catFieldRow}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Cadence</Text>
                          <Host matchContents>
                            <Picker
                              selection={cadence}
                              onSelectionChange={(val) => setCadence(val as Cadence)}
                              modifiers={[
                                pickerStyle('menu'),
                                tint(theme.text),
                                fixedSize({ horizontal: true, vertical: false }),
                              ]}
                            >
                              {CADENCES.map(c => (
                                <SwiftText key={c.value} modifiers={[tag(c.value)]}>{c.label}</SwiftText>
                              ))}
                            </Picker>
                          </Host>
                        </View>
                        <View style={[styles.catFieldRow, incomeSep]}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Starts</Text>
                          <Host matchContents>
                            <DatePicker
                              selection={incomeStartDate}
                              onDateChange={setIncomeStartDate}
                              displayedComponents={['date']}
                              modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' })]}
                            />
                          </Host>
                        </View>
                        <View style={styles.catFieldRow}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Ends</Text>
                          {incomeEndDate ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Host matchContents>
                                <DatePicker
                                  selection={incomeEndDate}
                                  onDateChange={setIncomeEndDate}
                                  displayedComponents={['date']}
                                  modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' })]}
                                />
                              </Host>
                              <Pressable
                                onPress={() => setIncomeEndDate(null)}
                                pointerEvents="box-only"
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel="Clear income end date"
                              >
                                <Icon name="close" size={11} color={theme.textTer} stroke={2} />
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => setIncomeEndDate(monthEndDate(selectedMonth))}
                              pointerEvents="box-only"
                              accessibilityRole="button"
                              accessibilityLabel="Set income end date"
                            >
                              <Text style={[TYPE.bodySm, { color: theme.accent.dot }]}>No end date</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                      {!incomeDateRangeValid && (
                        <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: 6 }]}>
                          End date must be after the start date
                        </Text>
                      )}

                      <SheetPrimaryButton
                        label={editingIncomeId ? 'Save income' : 'Add income'}
                        onPress={commitIncome}
                        theme={theme}
                        disabled={!canCommitIncome}
                        style={{ marginTop: 16 }}
                      />
                      {editingIncomeId && regularIncomes.some(i => i.id === editingIncomeId) && (
                        <Pressable
                          onPress={() => { confirmRemoveIncome(editingIncomeId); }}
                          pointerEvents="box-only"
                          accessibilityRole="button"
                          accessibilityLabel="Remove income source"
                          style={[styles.categoryDeleteButton]}
                        >
                          <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Remove income source</Text>
                        </Pressable>
                      )}
                    </>
                  ) : (
                    <>
                      <View style={[styles.catFieldCard, { backgroundColor: theme.chipBg, marginTop: 12 }]}>
                        {oneTimeIncomesForSelectedMonth.length > 0 && (
                          <View style={[styles.catFieldRow, incomeSep]}>
                            <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Income</Text>
                            <Host matchContents>
                              <Picker
                                selection={editingIncomeId ?? '__new__'}
                                onSelectionChange={(val) => {
                                  const id = String(val);
                                  if (id === '__new__') startNewOneTimeIncome();
                                  else {
                                    const inc = oneTimeIncomesForSelectedMonth.find(i => i.id === id);
                                    if (inc) loadOneTimeIncomeForEdit(inc);
                                  }
                                }}
                                modifiers={[pickerStyle('menu'), tint(theme.text), fixedSize({ horizontal: true, vertical: false })]}
                              >
                                {oneTimeIncomesForSelectedMonth.map(inc => (
                                  <SwiftText key={inc.id} modifiers={[tag(inc.id)]}>
                                    {inc.source === 'One-time income' ? 'One-time income' : inc.source}
                                  </SwiftText>
                                ))}
                                <SwiftText key="__new__" modifiers={[tag('__new__')]}>New</SwiftText>
                              </Picker>
                            </Host>
                          </View>
                        )}
                        <View style={[styles.catFieldRow, incomeSep]}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Name</Text>
                          <TextInput
                            value={incomeSource}
                            onChangeText={setIncomeSource}
                            placeholder="Optional"
                            placeholderTextColor={theme.textTer}
                            keyboardAppearance={theme.dark ? 'dark' : 'light'}
                            returnKeyType="done"
                            selectTextOnFocus
                            style={[styles.catFieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
                          />
                        </View>
                        <View style={styles.catFieldRow}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Amount</Text>
                          <TextInput
                            value={incomeDraft}
                            onChangeText={(t) => setIncomeDraft(guardDollar(t))}
                            keyboardType="decimal-pad"
                            keyboardAppearance={theme.dark ? 'dark' : 'light'}
                            placeholder="$0"
                            placeholderTextColor={theme.textTer}
                            returnKeyType="done"
                            selectTextOnFocus
                            style={[styles.catFieldInput, styles.incomeAmountInput, { color: theme.text, textAlign: 'right' }]}
                          />
                        </View>
                        <View style={[styles.catFieldRow, { borderTopColor: theme.sep, borderTopWidth: StyleSheet.hairlineWidth }]}>
                          <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Received</Text>
                          <Host matchContents>
                            <DatePicker
                              selection={incomeReceivedDate}
                              onDateChange={setIncomeReceivedDate}
                              displayedComponents={['date']}
                              modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' })]}
                            />
                          </Host>
                        </View>
                      </View>

                      <SheetPrimaryButton
                        label={editingIncomeId ? 'Save one-time income' : 'Log income'}
                        onPress={commitIncome}
                        theme={theme}
                        disabled={!canCommitIncome}
                        style={{ marginTop: 16 }}
                      />
                      {editingIncomeId && oneTimeIncomesForSelectedMonth.some(i => i.id === editingIncomeId) && (
                        <Pressable
                          onPress={() => { confirmRemoveIncome(editingIncomeId); }}
                          pointerEvents="box-only"
                          accessibilityRole="button"
                          accessibilityLabel="Remove one-time income"
                          style={[styles.categoryDeleteButton]}
                        >
                          <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Remove income</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              </View>
            </RNHostView>
          </Group>
        </BottomSheet>
      </Host>

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
        onRequestClose={() => { setEditingCategory(null); setAddingForGroup(null); }}
        onSave={saveCategoryEdit}
        onDelete={deleteEditingCategory}
        onAddNew={(lbl, icn, grp, bgt, rec, recDate, recCadence, gt, gs, gd) => {
          return addSub(grp, lbl, icn, bgt, rec, recDate, recCadence, gt, gs, gd);
          // addSub calls setAddingForGroup(null); onIsPresentedChange → onClose resets drafts after dismiss
        }}
      />

    </View>
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

function CategoryEditSheet({
  theme, category, addingForGroup, label, icon, group, goalTarget, goalSaved,
  budget, recurring, recurringDate, recurringCadence, goalDeadline, nameError, formError, notes,
  onLabelChange, onIconChange, onGroupChange, onGoalTargetChange, onGoalSavedChange,
  onBudgetChange, onRecurringChange, onRecurringDateChange, onRecurringCadenceChange, onGoalDeadlineChange, onNotesChange,
  onClose, onRequestClose, onSave, onDelete, onAddNew,
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
  onRequestClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onAddNew: (label: string, icon: string, group: GroupKey, budget?: number, recurring?: boolean, recurringDate?: string, recurringCadence?: CategoryRecurringCadence, goalTarget?: number, goalSaved?: number, goalDeadline?: string) => boolean;
}) {
  const insets = useSafeAreaInsets();
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
  const compactSheet = showGoalFields;
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
      onSave();
    }
  };

  return (
    <Host
      colorScheme={theme.dark ? 'dark' : 'light'}
      ignoreSafeArea="keyboard"
      style={{ width: 0, height: 0, position: 'absolute' }}
    >
      <BottomSheet
        isPresented={category !== null || addingForGroup !== null}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}
      >
        <Group modifiers={[
          presentationDetents(CAT_DETENTS),
          presentationDragIndicator('visible'),
          environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
          background(theme.surface),
          ignoreSafeArea({ regions: 'keyboard', edges: 'bottom' }),
        ]}>
          <RNHostView>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={[styles.categorySheet, {
              backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.40)',
            }]}>
              <ScrollView
                style={styles.categorySheetScroll}
                contentContainerStyle={[
                  styles.categorySheetContent,
                  {
                    paddingTop: sheetTopPadding,
                    paddingBottom: sheetBottomPadding,
                  },
                ]}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
	                keyboardShouldPersistTaps="handled"
	              >
	              <View style={[styles.sheetHead, { justifyContent: 'flex-end' }]}>
	                <Pressable
	                  onPress={onRequestClose}
	                  pointerEvents="box-only"
	                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
	                  accessibilityRole="button"
	                  accessibilityLabel="Close category editor"
	                  style={[styles.sheetCloseBtn, { backgroundColor: theme.chipBg }]}
	                >
	                  <Icon name="close" size={15} color={theme.textSec} stroke={1.8} />
	                </Pressable>
	              </View>
	              {/* Hero — tap circle to open native popup menu */}
	              <View style={[styles.catHero, compactSheet && styles.catHeroCompact]}>
                <MenuView
                  shouldOpenOnLongPress={false}
                  themeVariant={theme.dark ? 'dark' : 'light'}
                  actions={CATEGORY_ICON_OPTIONS.map(opt => ({
                    id: opt,
                    title: ICON_DISPLAY_NAMES[opt] ?? opt,
                    state: (opt === icon ? 'on' : 'off') as 'on' | 'off',
                  }))}
                  onPressAction={({ nativeEvent }) => {
                    iconManuallySet.current = true;
                    onIconChange(nativeEvent.event);
                  }}
                >
                  <View style={{ width: 52, height: 52 }}>
                    <View style={[styles.catHeroCircle, { backgroundColor: groupIconBg }]}>
                      <Icon name={icon} size={22} color="#FBF8FF" stroke={1.5} />
                    </View>
                    <View style={styles.iconPickerBadge}>
                      <Icon name="chevDown" size={7} color="rgba(0,0,0,0.55)" stroke={2.4} />
                    </View>
                  </View>
                </MenuView>
                <Text style={[TYPE.headline, { color: theme.text, textAlign: 'center', marginTop: compactSheet ? 4 : 8 }]} numberOfLines={1}>
                  {label.trim() || (isAddMode ? 'New Category' : category?.label ?? 'Category')}
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
                style={[styles.catGroupSegmented, compactSheet && styles.catGroupSegmentedCompact]}
              />

              {/* Primary field card: Name, Budget, Recurring, Notes */}
              <View style={[styles.catFieldCard, { backgroundColor: theme.chipBg, marginTop: compactSheet ? 8 : 12 }]}>
                <View style={[fieldRowStyle, sep]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Name</Text>
                  <TextInput
                    value={label}
                    onChangeText={(next) => {
                      onLabelChange(next);
                      if (!iconManuallySet.current) onIconChange(inferCategoryIcon(next));
                    }}
                    placeholder="Category name"
                    placeholderTextColor={theme.textTer}
                    autoFocus={isAddMode}
                    keyboardAppearance={keyboardAppearance}
                    returnKeyType="done"
                    selectTextOnFocus
                    style={[styles.catFieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
                  />
                </View>
                <View style={[fieldRowStyle, sep]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Monthly budget</Text>
                  <TextInput
                    value={budgetDisplay}
                    onChangeText={(t) => {
                      const g = guardDollar(t);
                      setBudgetDisplay(g);
                      onBudgetChange(g.replace(/[$,\s]/g, ''));
                    }}
                    keyboardType="decimal-pad"
                    keyboardAppearance={keyboardAppearance}
                    placeholder="$0"
                    placeholderTextColor={theme.textTer}
                    selectTextOnFocus
                    style={[styles.catFieldInput, { color: theme.text, textAlign: 'right', minWidth: 60 }]}
                  />
                </View>
                <View style={[fieldRowStyle, recurring ? sep : {}]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Recurring</Text>
                  <Switch
                    value={recurring}
                    onValueChange={onRecurringChange}
                    trackColor={{ false: theme.hairline, true: theme.accent.dot }}
                    thumbColor="#FBF8FF"
                  />
                </View>
	                {recurring && (
	                  <>
	                    <View style={[fieldRowStyle, sep]}>
	                      <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Cadence</Text>
	                      <Host matchContents>
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
	                    <View style={[fieldRowStyle, sep]}>
	                      <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Next payment</Text>
	                      {recurringDateVal ? (
	                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
	                          <Host matchContents>
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
                  <TextInput
                    value={notes}
                    onChangeText={onNotesChange}
                    placeholder="Optional"
                    placeholderTextColor={theme.textTer}
                    keyboardAppearance={keyboardAppearance}
                    returnKeyType="done"
                    selectTextOnFocus
                    style={[styles.catFieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
                  />
                </View>
              </View>
	              {showCategoryError && (
	                <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: 6 }]}>
	                  {categoryValidationError}
	                </Text>
	              )}

              {/* Goal fields — compact date pickers, no inline expansion */}
              {showGoalFields && (
                <>
                  <View style={[styles.catFieldCard, { backgroundColor: theme.chipBg, marginTop: compactSheet ? 10 : 14 }]}>
                    <View style={[fieldRowStyle, sep]}>
                      <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Target</Text>
                      <TextInput
                        value={goalTargetDisplay}
                        onChangeText={(t) => {
                          const g = guardDollar(t);
                          setGoalTargetDisplay(g);
                          onGoalTargetChange(g.replace(/[$,\s]/g, ''));
                        }}
                        keyboardType="decimal-pad"
                        keyboardAppearance={keyboardAppearance}
                        placeholder="Optional"
                        placeholderTextColor={theme.textTer}
                        selectTextOnFocus
                        style={[styles.catFieldInput, { color: theme.text, textAlign: 'right', minWidth: 60 }]}
                      />
                    </View>
                    <View style={[fieldRowStyle, sep]}>
                      <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Saved so far</Text>
                      <TextInput
                        value={goalSavedDisplay}
                        onChangeText={(t) => {
                          const g = guardDollar(t);
                          setGoalSavedDisplay(g);
                          onGoalSavedChange(g.replace(/[$,\s]/g, ''));
                        }}
                        keyboardType="decimal-pad"
                        keyboardAppearance={keyboardAppearance}
                        placeholder="Optional"
                        placeholderTextColor={theme.textTer}
                        selectTextOnFocus
                        style={[styles.catFieldInput, { color: theme.text, textAlign: 'right', minWidth: 60 }]}
                      />
                    </View>
                    {/* Target date — fixed height so picker appearance doesn't shift layout */}
                    <View style={[fieldRowStyle, { minHeight: 56 }]}>
                      <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Target date</Text>
                      {deadlineDate ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Host matchContents>
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

              {/* Save — identical to TxSheet's SheetPrimaryButton */}
	              <SheetPrimaryButton
	                label={isAddMode ? 'Add category' : 'Save category'}
	                onPress={handleSave}
	                theme={theme}
	                disabled={!canSaveCategory}
	                style={{ marginTop: compactSheet ? 14 : 20 }}
	              />
	              {!isAddMode && (
	                <Pressable
	                  onPress={onDelete}
	                  pointerEvents="box-only"
	                  accessibilityRole="button"
	                  accessibilityLabel="Delete category"
	                  style={[styles.categoryDeleteButton, compactSheet && styles.categoryDeleteButtonCompact]}
	                >
	                  <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Delete category</Text>
	                </Pressable>
	              )}
              </ScrollView>
            </View>
            </TouchableWithoutFeedback>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  stickyCardInner: {
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  hero: {
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 10,
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
  heroOverDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  monthPickerHost: {
    height: 30,
    width: 130,
  },
  heroMonthBtn: {
    flex: 1,
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
  heroCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  heroFigure: {
    marginBottom: 12,
  },
  allocationIncomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  sectionStack: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
    gap: 16,
  },
  sectionCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  sectionCardBorder: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 14,
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
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  goalsEmpty: {
    paddingVertical: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  incomeNativeSheet: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 14,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeHero: {
    alignItems: 'center',
    paddingTop: 6,
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
    marginTop: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  incomeListHead: {
    marginTop: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  incomeAddPill: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  incomeSourceList: {
    gap: 8,
  },
  incomeSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  incomeSourceIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  incomeEmptyState: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  incomeInlineAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 0,
    flex: 1,
    minWidth: 90,
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
    gap: 10,
    paddingVertical: 12,
  },
  rowCategoryButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
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
    gap: 6,
    paddingTop: 10,
    paddingBottom: 2,
    borderTopWidth: 1,
  },
  amountField: {
    width: 92,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  amountInput: {
    width: 72,
    height: 30,
    paddingVertical: 0,
    ...TYPE.bodySmEm,
    textAlign: 'right',
    includeFontPadding: false,
  },
  amountError: {
    marginTop: 4,
    textAlign: 'right',
  },
  keyboardDismissWrap: {
    position: 'absolute',
    right: 16,
    bottom: 10,
    zIndex: 30,
    alignItems: 'flex-end',
  },
  keyboardDismissButton: {
    minWidth: 66,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  addCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  categoryNameInput: {
    paddingVertical: 0,
  },
  categoryGoalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryGoalPreview: {
    marginTop: 10,
    gap: 6,
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  categoryDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  categoryDeleteButtonCompact: {
    paddingVertical: 10,
  },
  catHero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
  },
  catHeroCompact: {
    paddingTop: 4,
    paddingBottom: 10,
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
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  catBudgetDisplay: {
    ...TYPE.bodySmEm,
    flexShrink: 0,
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
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 12,
  },
  catFieldRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 10,
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
