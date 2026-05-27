import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  ImageBackground,
  Animated,
  Easing,
} from 'react-native';
import { Swipeable, ScrollView as GHScrollView, TapGestureHandler, State } from 'react-native-gesture-handler';

const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, GROUP_COLORS, OVER_DOT, HERO_AVAIL } from '../theme';
import { Icon } from '../components/Icon';
import { ThemeToggle } from '../components/ThemeToggle';
import { TYPE } from '../typography';
import { makeP, DARK_TEXT_SHADOW, makeScrim } from '../wallpaperPalette';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryGroupFor } from '../repositories/categoryUtils';
import type { Bill, Category, GroupKey, SpendGroup, SpendSub } from '../repositories/types';
import { monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import { CATEGORY_ICON_OPTIONS, inferCategoryIcon } from '../categoryIcons';
import {
  BottomSheet,
  Group,
  Picker,
  Text as SwiftText,
  Host,
  RNHostView,
} from '@expo/ui/swift-ui';
import {
  tint,
  pickerStyle,
  tag,
  fixedSize,
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
const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'Mo', label: 'Monthly' },
  { value: '2w', label: 'Bi-weekly' },
  { value: 'Wk', label: 'Weekly' },
  { value: 'Yr', label: 'Annual' },
];

const INCOME_DETENT: PresentationDetent = { fraction: 0.42 };
const CATEGORY_DETENT: PresentationDetent = { fraction: 0.74 };
const CURRENT_MONTH = '2026-05';

interface BudgetTemplate {
  id: string; label: string; subtitle: string;
  needs: number; wants: number; savings: number;
}
const BUDGET_TEMPLATES: BudgetTemplate[] = [
  { id: '50-30-20', label: '50 / 30 / 20', subtitle: 'Classic — needs, wants, savings', needs: 0.50, wants: 0.30, savings: 0.20 },
  { id: '70-20-10', label: '70 / 20 / 10', subtitle: 'Essential-heavy, minimal extras',  needs: 0.70, wants: 0.20, savings: 0.10 },
  { id: '60-25-15', label: '60 / 25 / 15', subtitle: 'Balanced lifestyle',               needs: 0.60, wants: 0.25, savings: 0.15 },
  { id: '40-30-30', label: '40 / 30 / 30', subtitle: 'Aggressive savings focus',         needs: 0.40, wants: 0.30, savings: 0.30 },
];

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

const slugify = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';

const toMonthly = (v: number, c: Cadence): number => {
  switch (c) {
    case '2w': return Math.round(v * 26 / 12);
    case 'Wk': return Math.round(v * 52 / 12);
    case 'Yr': return Math.round(v / 12);
    default:   return Math.round(v);
  }
};
const fromMonthly = (monthly: number, c: Cadence): number => {
  switch (c) {
    case '2w': return Math.round(monthly * 12 / 26);
    case 'Wk': return Math.round(monthly * 12 / 52);
    case 'Yr': return monthly * 12;
    default:   return monthly;
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
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [72, 0] });
    return (
      <Animated.View style={{ width: 72, transform: [{ translateX }] }}>
        <TouchableOpacity
          onPress={onRemove}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OVER_DOT }}
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
      onSwipeableOpen={() => onOpen(swipeRef.current!)}
      onSwipeableClose={onClose}
    >
      {children}
    </Swipeable>
  );
}

function AmountField({ theme, dark, amount, onChange, label, onFocusChange }: {
  theme: Theme; dark: boolean; amount: number; onChange: (v: number) => void; label: string;
  onFocusChange: (focused: boolean, dismiss?: () => void) => void;
}) {
  const p = makeP(dark);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(`$${fmtAmt(amount)}`);
  const [invalid, setInvalid] = useState(false);
  const commitGuard = useRef(false);
  const fieldRef = useRef<TextInput>(null);

  // When not editing, keep the displayed text in sync with the canonical amount.
  useEffect(() => {
    if (!editing) {
      setDraft(`$${fmtAmt(amount)}`);
    }
  }, [amount, editing]);

  const handleChange = (text: string) => {
    setDraft(text);
    setInvalid(parseAmountDraft(text) === null);
  };

  const commit = () => {
    if (commitGuard.current) return;
    commitGuard.current = true;
    const v = parseAmountDraft(draft);
    if (v === null) {
      setDraft(`$${fmtAmt(amount)}`);
      setInvalid(false);
      setEditing(false);
      return;
    }
    if (v !== amount) {
      onChange(v);
    }
    setDraft(`$${fmtAmt(v)}`);
    setInvalid(false);
    setEditing(false);
  };

  const restBg = theme.dark ? 'rgba(235,225,255,0.07)' : 'rgba(14,12,24,0.045)';
  const restBorder = theme.dark ? 'rgba(235,225,255,0.14)' : 'rgba(14,12,24,0.08)';
  const fieldBg = editing
    ? (invalid ? (theme.dark ? 'rgba(212,82,42,0.14)' : 'rgba(212,82,42,0.10)') : theme.accent.fill)
    : restBg;
  const borderColor = editing
    ? (invalid ? OVER_DOT : theme.accent.dot)
    : restBorder;
  const textColor = invalid ? OVER_DOT : p.text;

  return (
    <View>
      <View style={[styles.amountField, { backgroundColor: fieldBg as any, borderColor: borderColor as any }]}>
        <TextInput
          ref={fieldRef}
          value={draft}
          onChangeText={handleChange}
          onFocus={() => {
            setEditing(true);
            commitGuard.current = false;
            onFocusChange(true, () => fieldRef.current?.blur());
          }}
          onBlur={() => {
            commit();
            onFocusChange(false);
          }}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={`Edit ${label} budget amount`}
          accessibilityHint="Use the Done button above the keyboard to finish editing"
          style={[styles.amountInput, { color: textColor }]}
        />
      </View>
      {invalid && (
        <Text style={[TYPE.labelSm, styles.amountError, { color: OVER_DOT }]}>Use dollars</Text>
      )}
    </View>
  );
}

function AddSubRow({ dark, theme, onAdd, onCancel }: {
  dark: boolean; theme: Theme; onAdd: (label: string) => void; onCancel: () => void;
}) {
  const p = makeP(dark);
  const [label, setLabel] = useState('');
  const commit = () => {
    const t = label.trim();
    if (t.length > 0) onAdd(t); else onCancel();
  };
  return (
    <View style={[styles.addSubRow, { borderTopColor: p.hairline }]}>
      <View style={[styles.rowIcon, { backgroundColor: dark ? 'rgba(180,160,240,0.12)' : 'rgba(14,12,24,0.06)' }]}>
        <Icon name="tag" size={14} color={p.textSec} stroke={1.5} />
      </View>
      <TextInput value={label} onChangeText={setLabel} onBlur={commit} onSubmitEditing={commit}
        placeholder="Category name" placeholderTextColor={p.textTer} autoFocus
        style={[TYPE.body, { flex: 1, color: p.text }]}
      />
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="close" size={14} color={p.textSec} stroke={1.8} />
      </TouchableOpacity>
    </View>
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
  const visibleSpendGroups = useMemo(
    () => spendGroups(transactions, budgetRecords, categories),
    [transactions, budgetRecords, categories],
  );
  const initialIncome = useMemo(() => monthlyIncome(incomes), [incomes]);
  const irregularIncomeThisMonth = useMemo(() => (
    incomes
      .filter(item => item.kind === 'irregular')
      .filter(item => (item.receivedAt ?? item.startDate).slice(0, 7) === CURRENT_MONTH)
      .reduce((sum, item) => sum + item.amount, 0)
  ), [incomes]);
  const insets = useSafeAreaInsets();
  const { wallpaper } = useTheme();
  const pWallpaper = makeP(true);
  const p = makeP(theme.dark);
  const shadow = DARK_TEXT_SHADOW;
  const scrim = makeScrim(theme.dark);

  // ── Scroll-driven sticky morph ────────────────────────────────
  const scrollRaw = useRef(new Animated.Value(0)).current;
  const stickyAnim = useRef(new Animated.Value(0)).current;
  const barYRef = useRef(160);
  const barHeightRef = useRef(120);
  const [headerH, setHeaderH] = useState(0);

  useEffect(() => {
    const id = scrollRaw.addListener(({ value }) => {
      const start = barYRef.current;
      const range = Math.max(barHeightRef.current, 1);
      const progress = Math.max(0, Math.min(1, (value - start) / range));
      stickyAnim.setValue(progress);
    });
    return () => scrollRaw.removeListener(id);
  }, [scrollRaw, stickyAnim]);

  const stickyPaddingH = stickyAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const stickyRadius   = stickyAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const stickyOpacity  = stickyAnim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.15, 1] });

  // ── Budget state ──────────────────────────────────────────────
  const [income, setIncome] = useState(initialIncome);
  const [cadence, setCadence] = useState<Cadence>('Mo');
  const [incomeKind, setIncomeKind] = useState<'regular' | 'irregular'>('regular');
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState('');
  const [budgets, setBudgets] = useState<Record<string, number>>(() => initBudgets(visibleSpendGroups, upcomingBills, categories));
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [templatePromptVisible, setTemplatePromptVisible] = useState(true);
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoLabel, setUndoLabel] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activeAmountDismiss, setActiveAmountDismiss] = useState<(() => void) | null>(null);

  const [customSubs, setCustomSubs] = useState<Record<string, { label: string }[]>>({
    needs: [], wants: [], savings: [],
  });
  const [removedSubs, setRemovedSubs] = useState<Set<string>>(new Set());
  const [removedBills, setRemovedBills] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryLabelDraft, setCategoryLabelDraft] = useState('');
  const [categoryIconDraft, setCategoryIconDraft] = useState('tag');
  const [categoryGroupDraft, setCategoryGroupDraft] = useState<GroupKey>('needs');

  const scrollViewRef = useRef<GHScrollView>(null);
  const outerTapRef = useRef<any>(null);
  const openSwipeRef = useRef<Swipeable | null>(null);

  useEffect(() => {
    setIncome(initialIncome);
  }, [initialIncome]);

  useEffect(() => {
    setBudgets(initBudgets(visibleSpendGroups, upcomingBills, categories));
  }, [visibleSpendGroups, upcomingBills, categories]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setActiveAmountDismiss(null);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleAmountFocusChange = useCallback((focused: boolean, dismiss?: () => void) => {
    if (focused && dismiss) {
      setActiveAmountDismiss(() => dismiss);
    } else {
      setActiveAmountDismiss(null);
    }
  }, []);

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

  const prevActionSnapshot = useRef<{
    budgets: Record<string, number>;
    removedSubs: Set<string>;
    removedBills: Set<string>;
    customSubs: Record<string, { label: string }[]>;
    activeTemplate: string | null;
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

  const displayIncome = fromMonthly(income, cadence);

  const openIncomeSheet = () => {
    setIncomeKind('regular');
    setIncomeDraft(String(displayIncome));
    setIncomeSheetOpen(true);
  };

  useEffect(() => {
    if (incomeSheetToken > 0) openIncomeSheet();
  }, [incomeSheetToken]);

  const commitIncome = () => {
    const v = parseAmountDraft(incomeDraft);
    if (v === null || v <= 0) return;
    if (incomeKind === 'irregular') {
      incomeRepo.create({
        kind: 'irregular',
        amount: v,
        source: 'Irregular income',
        cadence: 'oneTime',
        startDate: new Date().toISOString().slice(0, 10),
        receivedAt: new Date().toISOString(),
        createdByUserId: 'local',
        updatedByUserId: 'local',
      });
      setIncomeSheetOpen(false);
      return;
    }
    const monthly = toMonthly(v, cadence);
    const primary = incomes.find(item => (item.kind ?? 'regular') === 'regular');
    if (primary) {
      incomeRepo.update(primary.id, { amount: monthly, kind: 'regular', cadence: 'monthly', updatedByUserId: 'local' });
    } else {
      incomeRepo.create({
        kind: 'regular',
        amount: monthly,
        source: 'Primary income',
        cadence: 'monthly',
        startDate: new Date().toISOString().slice(0, 10),
        createdByUserId: 'local',
        updatedByUserId: 'local',
      });
    }
    setIncome(monthly);
    setIncomeSheetOpen(false);
  };

  const markBudgetTouched = useCallback(() => {
    setBudgetTouched(true);
    setTemplatePromptVisible(false);
  }, []);

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
    ) && b.month === CURRENT_MONTH);
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
        month: CURRENT_MONTH,
        group: groupKey,
        category: sub?.cat,
        label,
        icon: sub?.icon ?? 'tag',
        amount: v,
      });
    }
  };

  const updateBudget = (key: string, v: number) => {
    markBudgetTouched();
    syncBudgetRecord(key, v);
    setBudgets(b => ({ ...b, [key]: v }));
  };

  const saveSnapshot = () => {
    prevActionSnapshot.current = {
      budgets: { ...budgets },
      removedSubs: new Set(removedSubs),
      removedBills: new Set(removedBills),
      customSubs: Object.fromEntries(Object.entries(customSubs).map(([k, v]) => [k, [...v]])),
      activeTemplate,
    };
  };

  const removeSub = (gKey: string, sub: Pick<SpendSub, 'cat' | 'label'>) => {
    const label = sub.label;
    markBudgetTouched();
    categoriesRepo.delete(sub.cat);
    budgetRecords
      .filter(b => (b.category === sub.cat || (b.group === gKey && b.label === label)) && b.month === CURRENT_MONTH)
      .forEach(budget => budgetsRepo.delete(budget.id));
    setBudgets(b => { const n = { ...b }; delete n[bKey(gKey, label)]; return n; });
  };

  const removeBill = (bill: Bill) => {
    markBudgetTouched();
    setRemovedBills(prev => new Set([...prev, bill.id]));
    const ruleId = typeof bill.meta?.recurringRuleId === 'string' ? bill.meta.recurringRuleId : ruleIdFromBillId(bill.id);
    recurringRulesRepo.delete(ruleId);
  };

  const addSub = (gKey: string, label: string) => {
    const origGroup = visibleSpendGroups.find(g => g.key === gKey);
    const taken = new Set([
      ...(origGroup?.subs.map(s => s.label.toLowerCase()) ?? []),
      ...(customSubs[gKey] ?? []).map(s => s.label.toLowerCase()),
    ]);
    if (taken.has(label.toLowerCase())) return;
    markBudgetTouched();
    const icon = inferCategoryIcon(label);
    const created = categoriesRepo.create({
      label,
      icon,
      group: gKey as GroupKey,
      defaultBudget: 0,
      sortOrder: Math.max(0, ...categories.map(cat => cat.sortOrder)) + 10,
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    budgetsRepo.create({
      month: CURRENT_MONTH,
      group: gKey as GroupKey,
      category: created.id,
      label,
      icon,
      amount: 0,
      meta: { custom: true },
    });
    setBudgets(b => ({ ...b, [bKey(gKey, label)]: 0 }));
    setAddingFor(null);
  };

  const openCategoryEditor = (catId: string) => {
    const category = categories.find(cat => cat.id === catId);
    if (!category) return;
    setEditingCategory(category);
    setCategoryLabelDraft(category.label);
    setCategoryIconDraft(category.icon);
    setCategoryGroupDraft(category.group);
  };

  const closeCategoryEditor = () => {
    setEditingCategory(null);
    setCategoryLabelDraft('');
    setCategoryIconDraft('tag');
    setCategoryGroupDraft('needs');
  };

  const saveCategoryEdit = () => {
    if (!editingCategory) return;
    const label = categoryLabelDraft.trim();
    if (!label) return;
    const duplicate = categories.some(cat => (
      cat.id !== editingCategory.id &&
      !cat.archived &&
      cat.label.toLowerCase() === label.toLowerCase()
    ));
    if (duplicate) return;
    categoriesRepo.update(editingCategory.id, {
      label,
      icon: categoryIconDraft,
      group: categoryGroupDraft,
      defaultBudget: budgets[bKey(editingCategory.group, editingCategory.label)] ?? editingCategory.defaultBudget,
      updatedByUserId: 'local',
    });
    budgetRecords
      .filter(b => b.category === editingCategory.id || (b.group === editingCategory.group && b.label === editingCategory.label))
      .forEach(budget => budgetsRepo.update(budget.id, {
        group: categoryGroupDraft,
        category: editingCategory.id,
        label,
        icon: categoryIconDraft,
      }));
    setBudgets(prev => {
      const next = { ...prev };
      const oldKey = bKey(editingCategory.group, editingCategory.label);
      const nextKey = bKey(categoryGroupDraft, label);
      if (oldKey in next && oldKey !== nextKey) {
        next[nextKey] = next[oldKey];
        delete next[oldKey];
      }
      return next;
    });
    closeCategoryEditor();
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

  const activeTemplateName = BUDGET_TEMPLATES.find(t => t.id === activeTemplate)?.label;
  const balanceDotColor = isOver ? OVER_DOT : HERO_AVAIL;
  const balanceLabel = `$${fmtMoney(Math.abs(remaining))} ${isOver ? 'over budget' : 'under budget'}`;
  const needsShare = totalBudgeted > 0 ? needsTotal / totalBudgeted : 0;
  const wantsShare = totalBudgeted > 0 ? wantsTotal / totalBudgeted : 0;
  const savingsShare = totalBudgeted > 0 ? savingsTotal / totalBudgeted : 0;

  const showUndo = useCallback((label: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoLabel(label);
    setUndoVisible(true);
    undoTimer.current = setTimeout(() => setUndoVisible(false), 7000);
  }, []);

  const handleUndo = useCallback(() => {
    if (prevActionSnapshot.current) {
      const snap = prevActionSnapshot.current;
      setBudgets(snap.budgets);
      setRemovedSubs(snap.removedSubs);
      setRemovedBills(snap.removedBills);
      setCustomSubs(snap.customSubs);
      setActiveTemplate(snap.activeTemplate);
      prevActionSnapshot.current = null;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoVisible(false);
  }, []);

  const applyTemplate = (template: BudgetTemplate) => {
    markBudgetTouched();
    saveSnapshot();
    const next: Record<string, number> = { ...budgets };
    visibleSpendGroups.forEach(g => {
      const pct = (template as any)[g.key] as number;
      const target = income * pct;
      const subSum = g.subs.reduce((s, sub) => s + sub.budget, 0);
      g.subs.forEach(sub => {
        const ratio = subSum > 0 ? sub.budget / subSum : 1 / g.subs.length;
        const amount = Math.round(target * ratio);
        const key = bKey(g.key, sub.label);
        next[key] = amount;
        syncBudgetRecord(key, amount);
      });
    });
    setBudgets(next);
    setActiveTemplate(template.id);
    showUndo(`Applied ${template.label}`);
  };


  const legendItems = [
    { label: 'Needs',                  dotColor: needsCol,                          amount: needsTotal   },
    { label: 'Wants',                  dotColor: wantsCol,                          amount: wantsTotal   },
    { label: 'Savings',                dotColor: savingsCol,                        amount: savingsTotal },
    { label: isOver ? 'Over' : 'Free', dotColor: isOver ? OVER_DOT : p.textTer,    amount: Math.abs(remaining) },
  ];

  const allocationContent = (textColor: string, trackBg: string) => (
    <>
      <AllocationBar
        needsFrac={needsFrac} wantsFrac={wantsFrac} savingsFrac={savingsFrac}
        trackBg={trackBg} needsCol={needsCol} wantsCol={wantsCol} savingsCol={savingsCol}
      />
      <View style={styles.legendRow}>
        {legendItems.map(item => (
          <View key={item.label} style={styles.legendItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.dotColor }} />
              <Text style={[TYPE.label, { color: item.dotColor }]}>{item.label}</Text>
            </View>
            <Text style={[TYPE.subsectionTitle, { color: textColor }]}>
              ${Math.round(item.amount).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    </>
  );

  const stickyBorderColor = theme.dark ? 'rgba(235,225,255,0.16)' : 'rgba(14,12,24,0.08)';

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? '#000' : '#F8F6FF' }}>

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

          {/* Sticky bar */}
          <Animated.View style={{
            position: 'absolute',
            top: headerH,
            left: 0, right: 0,
            zIndex: 5,
            paddingHorizontal: stickyPaddingH,
            opacity: stickyOpacity,
          }}>
            <Animated.View style={{ borderRadius: stickyRadius, overflow: 'hidden' }}>
              <BlurView
                intensity={theme.dark ? 68 : 88}
                tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              >
                <View style={[styles.stickyBarInner, { borderColor: stickyBorderColor }]}>
                  {allocationContent(p.text, p.trackBg)}
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
              onLayout={e => { barYRef.current = e.nativeEvent.layout.y; }}
            >
              {/* Budget breakdown hero */}
              <View onLayout={e => { barHeightRef.current = e.nativeEvent.layout.height; }}>
                <SectionCard dark={theme.dark}>
                  <View style={styles.breakdownInner}>
                    <View style={[styles.balancePanel, { backgroundColor: p.trackBg }]}>
                      <View style={styles.balanceAmountRow}>
                        <View style={[styles.balanceDot, { backgroundColor: balanceDotColor }]} />
                        <Text style={[TYPE.headline, { color: p.text }]}>
                          {balanceLabel}
                        </Text>
                      </View>
                      <AllocationBar
                        needsFrac={needsFrac} wantsFrac={wantsFrac} savingsFrac={savingsFrac}
                        trackBg={p.hairline} needsCol={needsCol} wantsCol={wantsCol} savingsCol={savingsCol}
                        height={9}
                      />
                      <View style={styles.barPctRow}>
                        {[
                          { label: 'Needs', pct: needsShare, color: needsCol },
                          { label: 'Wants', pct: wantsShare, color: wantsCol },
                          { label: 'Savings', pct: savingsShare, color: savingsCol },
                        ].map(item => (
                          <View key={item.label} style={styles.barPctItem}>
                            <View style={[styles.barPctDot, { backgroundColor: item.color }]} />
                            <Text style={[TYPE.label, { color: p.textSec }]}>
                              {item.label} {fmtPct(item.pct)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={[styles.comparisonStrip, { borderTopColor: p.hairline }]}>
                      <TouchableOpacity
                        onPress={openIncomeSheet}
                        activeOpacity={0.65}
                        style={styles.comparisonLine}
                        accessibilityRole="button"
                        accessibilityLabel="Edit planned income"
                        accessibilityHint="Opens income settings"
                      >
                        <Text numberOfLines={1} style={[TYPE.captionEm, { color: p.textSec }]}>Planned Income</Text>
                        <View style={styles.comparisonValue}>
                          <Text numberOfLines={1} style={[TYPE.captionEm, styles.comparisonValueText, { color: p.text }]}>
                            ${fmtMoney(displayIncome)} / {cadence}
                          </Text>
                          <View style={styles.comparisonChevronSlot}>
                            <Icon name="chevR" size={13} color={p.textTer} stroke={1.9} />
                          </View>
                        </View>
                      </TouchableOpacity>
                      {irregularIncomeThisMonth > 0 && (
                        <View style={[styles.comparisonLine, { borderTopColor: p.hairline, borderTopWidth: 1 }]}>
                          <Text numberOfLines={1} style={[TYPE.captionEm, { color: p.textSec }]}>Extra Income</Text>
                          <View style={styles.comparisonValue}>
                            <Text numberOfLines={1} style={[TYPE.captionEm, styles.comparisonValueText, { color: p.text }]}>
                              ${fmtMoney(irregularIncomeThisMonth)} / Mo
                            </Text>
                            <View style={styles.comparisonChevronSlot} />
                          </View>
                        </View>
                      )}
                      <View style={[styles.comparisonLine, { borderTopColor: p.hairline, borderTopWidth: 1 }]}>
                        <Text numberOfLines={1} style={[TYPE.captionEm, { color: p.textSec }]}>Planned Expenses</Text>
                        <View style={styles.comparisonValue}>
                          <Text numberOfLines={1} style={[TYPE.captionEm, styles.comparisonValueText, { color: p.text }]}>${fmtMoney(totalBudgeted)} / Mo</Text>
                          <View style={styles.comparisonChevronSlot} />
                        </View>
                      </View>
                    </View>
                  </View>
                </SectionCard>
              </View>

              {templatePromptVisible && !budgetTouched && (
                <SectionCard dark={theme.dark}>
                  <View style={styles.templatePrompt}>
                    <View style={styles.templatePromptHead}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[TYPE.subsectionTitle, { color: p.text }]}>New to budgeting?</Text>
                        <Text style={[TYPE.caption, styles.templatePromptCopy, { color: p.textSec }]}>
                          Start with a recommended template, then tune the categories.
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setTemplatePromptVisible(false)}
                        pointerEvents="box-only"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[styles.templateDismiss, { backgroundColor: p.trackBg }]}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss template suggestion"
                      >
                        <Icon name="close" size={13} color={p.textSec} stroke={1.8} />
                      </Pressable>
                    </View>
                    <View style={[styles.templatePickerRow, { borderTopColor: p.hairline }]}>
                      <Text style={[TYPE.captionEm, { color: p.textSec }]}>Recommended template</Text>
                      <Host matchContents>
                        <Picker
                          selection={activeTemplate ?? ''}
                          onSelectionChange={(val) => {
                            const t = BUDGET_TEMPLATES.find(t => t.id === val);
                            if (t) applyTemplate(t);
                          }}
                          modifiers={[
                            pickerStyle('menu'),
                            tint(p.text),
                            fixedSize({ horizontal: true, vertical: false }),
                          ]}
                        >
                          <SwiftText modifiers={[tag('')]}>{activeTemplateName ?? 'Choose'}</SwiftText>
                          {BUDGET_TEMPLATES.map(t => (
                            <SwiftText key={t.id} modifiers={[tag(t.id)]}>{t.label}</SwiftText>
                          ))}
                        </Picker>
                      </Host>
                    </View>
                  </View>
                </SectionCard>
              )}

              {/* Spending group cards */}
              {visibleSpendGroups.map(g => {
                const groupColor = gCol(g.key);
                const groupTotal = Math.round(groupTotals[g.key] ?? 0);
                const groupTarget = Math.round(income * g.targetPct);
                const groupDelta = groupTotal - groupTarget;
                const groupIsOver = groupDelta > 0;
                const visibleOrigSubs = g.subs.filter(s => !removedSubs.has(bKey(g.key, s.label)));
                const customs = customSubs[g.key] ?? [];
                const groupBills = (billsByGroup[g.key] ?? []).filter(b => !removedBills.has(b.id));

                return (
                  <SectionCard key={g.key} dark={theme.dark}>
                    <View style={styles.cardHead}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.groupTitleRow}>
                          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: groupColor }} />
                          <Text style={[TYPE.sectionTitle, { color: p.text }]}>{g.label}</Text>
                        </View>
                        <Text style={[TYPE.caption, { color: groupIsOver ? OVER_DOT : p.textSec }]}>
                          {groupIsOver ? `Over by $${fmtMoney(groupDelta)}` : `Target ${fmtPct(g.targetPct)} · $${fmtMoney(groupTarget)}`}
                        </Text>
                      </View>
                      <Text style={[TYPE.subsectionTitle, { color: groupColor }]}>${groupTotal.toLocaleString()}</Text>
                    </View>

                    {visibleOrigSubs.map((sub, si) => {
                      const isLast = si === visibleOrigSubs.length - 1 && customs.length === 0 && groupBills.length === 0 && addingFor !== g.key;
                      return (
                        <SwipeRow key={sub.cat} onRemove={() => removeSub(g.key, sub)} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                          <View style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}>
                            <TouchableOpacity
                              onPress={() => openCategoryEditor(sub.cat)}
                              activeOpacity={0.68}
                              style={styles.rowCategoryButton}
                            >
                              <View style={[styles.rowIcon, { backgroundColor: groupColor }]}>
                                <Icon name={sub.icon} size={15} color="#FBF8FF" stroke={1.6} />
                              </View>
                              <Text style={[TYPE.body, { flex: 1, color: p.text, minWidth: 0 }]}>{sub.label}</Text>
                            </TouchableOpacity>
                            <AmountField theme={theme} dark={theme.dark}
                              label={sub.label}
                              amount={budgets[bKey(g.key, sub.label)] ?? sub.budget}
                              onChange={v => updateBudget(bKey(g.key, sub.label), v)}
                              onFocusChange={handleAmountFocusChange}
                            />
                          </View>
                        </SwipeRow>
                      );
                    })}

                    {customs.map((sub, ci) => {
                      const isLast = ci === customs.length - 1 && groupBills.length === 0 && addingFor !== g.key;
                      return (
                        <SwipeRow key={sub.label} onRemove={() => removeSub(g.key, { cat: slugify(sub.label), label: sub.label })} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                          <View style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}>
                            <View style={[styles.rowIcon, { backgroundColor: theme.dark ? 'rgba(180,160,240,0.18)' : 'rgba(14,12,24,0.08)' }]}>
                              <Icon name="tag" size={14} color={groupColor} stroke={1.5} />
                            </View>
                            <Text style={[TYPE.body, { flex: 1, color: p.text, minWidth: 0 }]}>{sub.label}</Text>
                            <AmountField theme={theme} dark={theme.dark}
                              label={sub.label}
                              amount={budgets[bKey(g.key, sub.label)] ?? 0}
                              onChange={v => updateBudget(bKey(g.key, sub.label), v)}
                              onFocusChange={handleAmountFocusChange}
                            />
                          </View>
                        </SwipeRow>
                      );
                    })}

                    {groupBills.length > 0 && (
                      <>
                        <View style={[styles.billsDivider, { borderTopColor: p.hairline }]}>
                          <Icon name="repeat" size={11} color={p.textTer} stroke={1.6} />
                          <Text style={[TYPE.labelSm, { color: p.textTer }]}>Recurring</Text>
                        </View>
                        {groupBills.map((bill, bi) => {
                          const isLast = bi === groupBills.length - 1 && addingFor !== g.key;
                          return (
                            <SwipeRow key={bill.id} onRemove={() => removeBill(bill)} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                              <View style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}>
                                <View style={[styles.rowIcon, { backgroundColor: categoryGroupColor(bill.cat, categories, theme.dark) }]}>
                                  <Icon name={bill.icon} size={15} color="#FBF8FF" stroke={1.6} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={[TYPE.body, { color: p.text }]}>{bill.name}</Text>
                                  <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]}>
                                    {bill.dueDate}{bill.estimate ? ' · est.' : ''}
                                  </Text>
                                </View>
                                <AmountField theme={theme} dark={theme.dark}
                                  label={bill.name}
                                  amount={budgets[billKey(g.key, bill.id)] ?? bill.amount}
                                  onChange={v => updateBudget(billKey(g.key, bill.id), v)}
                                  onFocusChange={handleAmountFocusChange}
                                />
                              </View>
                            </SwipeRow>
                          );
                        })}
                      </>
                    )}

                    {addingFor === g.key ? (
                      <AddSubRow dark={theme.dark} theme={theme} onAdd={label => addSub(g.key, label)} onCancel={() => setAddingFor(null)} />
                    ) : (
                      <TouchableOpacity onPress={() => setAddingFor(g.key)} activeOpacity={0.7}
                        style={[styles.addCatBtn, { borderTopWidth: (visibleOrigSubs.length + customs.length + groupBills.length) > 0 ? 1 : 0, borderTopColor: p.hairline }]}
                      >
                        <Icon name="plus" size={13} color={theme.accent.dot} stroke={2} />
                        <Text style={[TYPE.captionEm, { color: theme.accent.dot }]}>Add category</Text>
                      </TouchableOpacity>
                    )}
                  </SectionCard>
                );
              })}

              {(!templatePromptVisible || budgetTouched) && (
                <SectionCard dark={theme.dark}>
                  <View style={styles.bottomTemplateRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[TYPE.captionEm, { color: p.textSec }]}>Budget template</Text>
                      <Text numberOfLines={1} style={[TYPE.bodySmEm, { color: p.text, marginTop: 2 }]}>
                        {activeTemplateName ?? 'Manual setup'}
                      </Text>
                    </View>
                    <Host matchContents>
                      <Picker
                        selection={activeTemplate ?? ''}
                        onSelectionChange={(val) => {
                          const t = BUDGET_TEMPLATES.find(t => t.id === val);
                          if (t) applyTemplate(t);
                        }}
                        modifiers={[
                          pickerStyle('menu'),
                          tint(p.text),
                          fixedSize({ horizontal: true, vertical: false }),
                        ]}
                      >
                        <SwiftText modifiers={[tag('')]}>{activeTemplateName ?? 'Change'}</SwiftText>
                        {BUDGET_TEMPLATES.map(t => (
                          <SwiftText key={t.id} modifiers={[tag(t.id)]}>{t.label}</SwiftText>
                        ))}
                      </Picker>
                    </Host>
                  </View>
                </SectionCard>
              )}

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

          {activeAmountDismiss && keyboardHeight > 0 && (
            <View
              pointerEvents="box-none"
              style={styles.keyboardDismissWrap}
            >
              <Pressable
                onPress={activeAmountDismiss}
                pointerEvents="box-only"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.keyboardDismissButton, {
                  backgroundColor: theme.dark ? 'rgba(235,225,255,0.16)' : 'rgba(255,255,255,0.94)',
                  borderColor: theme.dark ? 'rgba(235,225,255,0.18)' : 'rgba(14,12,24,0.10)',
                }]}
              >
                <Text style={[TYPE.bodySmEm, { color: theme.text }]}>Done</Text>
              </Pressable>
            </View>
          )}

        </View>
        </TapGestureHandler>
      </KeyboardAvoidingView>

      <Host style={{ width: 0, height: 0, position: 'absolute' }}>
        <BottomSheet
          isPresented={incomeSheetOpen}
          onIsPresentedChange={(v) => { if (!v) setIncomeSheetOpen(false); }}
        >
          <Group modifiers={[
            presentationDetents([INCOME_DETENT]),
            presentationDragIndicator('visible'),
            environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
          ]}>
            <RNHostView>
              <View style={[styles.incomeNativeSheet, {
                backgroundColor: theme.dark ? 'rgba(14,12,26,0.92)' : 'rgba(255,255,255,0.52)',
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              }]}>
                <View style={styles.sheetHead}>
                  <Text style={[TYPE.sectionTitle, { color: theme.text }]}>Income settings</Text>
                  <Pressable onPress={() => setIncomeSheetOpen(false)}
                    pointerEvents="box-only"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.sheetCloseBtn, { backgroundColor: theme.chipBg }]}
                  >
                    <Icon name="close" size={15} color={theme.textSec} stroke={1.8} />
                  </Pressable>
                </View>

                <View style={[styles.sheetField, { backgroundColor: theme.chipBg }]}>
                  <Text style={[TYPE.label, { color: theme.textTer }]}>Amount</Text>
                  <View style={styles.sheetAmountRow}>
                    <Text style={[TYPE.headline, { color: theme.textSec }]}>$</Text>
                    <TextInput
                      value={incomeDraft}
                      onChangeText={setIncomeDraft}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                      style={[TYPE.headline, styles.sheetAmountInput, { color: theme.text }]}
                    />
                  </View>
                </View>

                <View style={[styles.incomeTypeRow, { backgroundColor: theme.chipBg }]}>
                  {(['regular', 'irregular'] as const).map(kind => {
                    const active = incomeKind === kind;
                    return (
                      <Pressable
                        key={kind}
                        onPress={() => {
                          setIncomeKind(kind);
                          setIncomeDraft(kind === 'regular' ? String(displayIncome) : '');
                        }}
                        pointerEvents="box-only"
                        style={[styles.incomeTypeButton, {
                          backgroundColor: active ? theme.text : 'transparent',
                        }]}
                      >
                        <Text style={[TYPE.captionEm, { color: active ? theme.bg : theme.textSec }]}>
                          {kind === 'regular' ? 'Regular' : 'One-time'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {incomeKind === 'regular' && (
                  <View style={[styles.sheetOptionRow, { borderTopColor: theme.hairline }]}>
                    <Text style={[TYPE.body, { color: theme.text }]}>Cadence</Text>
                    <Host matchContents>
                      <Picker
                        selection={cadence}
                        onSelectionChange={(val) => {
                          const next = val as Cadence;
                          setCadence(next);
                          setIncomeDraft(String(fromMonthly(income, next)));
                        }}
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
                )}

                <Pressable onPress={commitIncome}
                  pointerEvents="box-only"
                  style={[styles.sheetSaveBtn, { backgroundColor: theme.text }]}
                >
                  <Text style={[TYPE.subsectionTitle, { color: theme.bg }]}>
                    {incomeKind === 'regular' ? 'Save income' : 'Log income'}
                  </Text>
                </Pressable>
              </View>
            </RNHostView>
          </Group>
        </BottomSheet>
      </Host>

      <CategoryEditSheet
        theme={theme}
        category={editingCategory}
        label={categoryLabelDraft}
        icon={categoryIconDraft}
        group={categoryGroupDraft}
        onLabelChange={setCategoryLabelDraft}
        onIconChange={setCategoryIconDraft}
        onGroupChange={setCategoryGroupDraft}
        onClose={closeCategoryEditor}
        onSave={saveCategoryEdit}
        onDelete={deleteEditingCategory}
      />

    </View>
  );
}

function CategoryEditSheet({
  theme,
  category,
  label,
  icon,
  group,
  onLabelChange,
  onIconChange,
  onGroupChange,
  onClose,
  onSave,
  onDelete,
}: {
  theme: Theme;
  category: Category | null;
  label: string;
  icon: string;
  group: GroupKey;
  onLabelChange: (v: string) => void;
  onIconChange: (v: string) => void;
  onGroupChange: (v: GroupKey) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
      <BottomSheet
        isPresented={category !== null}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}
      >
        <Group modifiers={[
          presentationDetents([CATEGORY_DETENT]),
          presentationDragIndicator('visible'),
          environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
        ]}>
          <RNHostView>
            <View style={[styles.categorySheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
              <View style={styles.sheetHead}>
                <Text style={[TYPE.sectionTitle, { color: theme.text }]}>Category</Text>
                <Pressable
                  onPress={onClose}
                  pointerEvents="box-only"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[styles.sheetCloseBtn, { backgroundColor: theme.chipBg }]}
                >
                  <Icon name="close" size={15} color={theme.textSec} stroke={1.8} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={[styles.sheetField, { backgroundColor: theme.chipBg }]}>
                  <Text style={[TYPE.label, { color: theme.textTer }]}>Name</Text>
                  <TextInput
                    value={label}
                    onChangeText={(next) => {
                      onLabelChange(next);
                      if (icon === category?.icon) onIconChange(inferCategoryIcon(next));
                    }}
                    placeholder="Category name"
                    placeholderTextColor={theme.textTer}
                    style={[TYPE.subsectionTitle, styles.categoryNameInput, { color: theme.text }]}
                  />
                </View>

                <Text style={[TYPE.labelLg, styles.categorySheetLabel, { color: theme.textTer }]}>Group</Text>
                <View style={styles.categoryGroupGrid}>
                  {(Object.keys(GROUP_META) as GroupKey[]).map(key => {
                    const active = group === key;
                    const color = theme.dark ? GROUP_COLORS[key].dark : GROUP_COLORS[key].light;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => onGroupChange(key)}
                        pointerEvents="box-only"
                        style={[styles.categoryGroupButton, {
                          backgroundColor: active ? color : theme.chipBg,
                          borderColor: active ? color : theme.hairline,
                        }]}
                      >
                        <Icon name={GROUP_META[key].icon} size={14} color={active ? theme.bg : theme.textSec} stroke={1.6} />
                        <Text style={[TYPE.captionEm, { color: active ? theme.bg : theme.textSec }]}>
                          {GROUP_META[key].label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[TYPE.labelLg, styles.categorySheetLabel, { color: theme.textTer }]}>Icon</Text>
                <View style={styles.iconGrid}>
                  {CATEGORY_ICON_OPTIONS.map(option => {
                    const active = icon === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => onIconChange(option)}
                        pointerEvents="box-only"
                        style={[styles.iconGridButton, {
                          backgroundColor: active ? theme.text : theme.chipBg,
                          borderColor: active ? theme.text : theme.hairline,
                        }]}
                      >
                        <Icon name={option} size={17} color={active ? theme.bg : theme.textSec} stroke={1.55} />
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={onSave}
                  pointerEvents="box-only"
                  style={[styles.sheetSaveBtn, { backgroundColor: theme.text, marginTop: 18 }]}
                >
                  <Text style={[TYPE.subsectionTitle, { color: theme.bg }]}>Save category</Text>
                </Pressable>
                <Pressable
                  onPress={onDelete}
                  pointerEvents="box-only"
                  style={styles.categoryDeleteButton}
                >
                  <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Delete category</Text>
                </Pressable>
              </ScrollView>
            </View>
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
  stickyBarInner: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 11,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  breakdownInner: {
    gap: 14,
  },
  comparisonStrip: {
    paddingTop: 14,
  },
  comparisonLine: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 7,
  },
  balancePanel: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 11,
  },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  comparisonValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 126,
    flexShrink: 0,
  },
  comparisonValueText: {
    flex: 1,
    textAlign: 'right',
  },
  comparisonChevronSlot: {
    width: 18,
    alignItems: 'flex-end',
  },
  barPctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  barPctItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  barPctDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
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
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendItem: {
    alignItems: 'center',
  },
  templatePrompt: {
    gap: 14,
  },
  templatePromptHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  templatePromptCopy: {
    marginTop: 5,
  },
  templateDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  templatePickerRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bottomTemplateRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  incomeNativeSheet: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 16,
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
  sheetField: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 7,
  },
  sheetAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  sheetAmountInput: {
    flex: 1,
    paddingVertical: 0,
  },
  incomeTypeRow: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  incomeTypeButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  sheetSaveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
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
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
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
  addSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  categorySheet: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  categoryNameInput: {
    paddingVertical: 0,
  },
  categorySheetLabel: {
    marginTop: 18,
    marginBottom: 10,
  },
  categoryGroupGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryGroupButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconGridButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});
