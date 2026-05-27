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
  ImageBackground,
  Animated,
} from 'react-native';
import { Swipeable, ScrollView as GHScrollView, TapGestureHandler, State } from 'react-native-gesture-handler';

const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, GROUP_COLORS, catGroupColor, OVER_DOT, CAT_TO_GROUP } from '../theme';
import { SPEND_GROUPS, UPCOMING_BILLS, MONTHLY_INCOME } from '../data';
import { Icon } from '../components/Icon';
import { ThemeToggle } from '../components/ThemeToggle';
import { TYPE } from '../typography';
import { makeP, DARK_TEXT_SHADOW, makeScrim } from '../wallpaperPalette';
import { Picker, Text as SwiftText, Host } from '@expo/ui/swift-ui';
import { tint, pickerStyle, tag, fixedSize } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../ThemeProvider';

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
}

type Cadence = 'Mo' | '2w' | 'Wk' | 'Yr';
const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'Mo', label: 'Monthly' },
  { value: '2w', label: 'Bi-weekly' },
  { value: 'Wk', label: 'Weekly' },
  { value: 'Yr', label: 'Annual' },
];

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

const initBudgets = (): Record<string, number> => {
  const out: Record<string, number> = {};
  SPEND_GROUPS.forEach(g => g.subs.forEach(s => { out[bKey(g.key, s.label)] = s.budget; }));
  UPCOMING_BILLS.forEach(bill => {
    const gKey = CAT_TO_GROUP[bill.cat] ?? 'wants';
    out[billKey(gKey, bill.id)] = bill.amount;
  });
  return out;
};

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

// Amount field — underline-only affordance; no chip, no icon
function AmountField({ theme, dark, amount, onChange }: {
  theme: Theme; dark: boolean; amount: number; onChange: (v: number) => void;
}) {
  const p = makeP(dark);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fmtAmt(amount));

  useEffect(() => {
    if (!editing) setDraft(fmtAmt(amount));
  }, [amount, editing]);

  const handleChange = (text: string) => {
    setDraft(text);
    const v = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(v) && v >= 0) onChange(v);
  };

  const commit = () => {
    const v = parseFloat(draft.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(v) || v < 0) setDraft(fmtAmt(amount));
    setEditing(false);
  };

  return editing ? (
    <TextInput value={draft} onChangeText={handleChange} onBlur={commit} onSubmitEditing={commit}
      keyboardType="decimal-pad" autoFocus selectTextOnFocus
      style={[TYPE.bodySmEm, styles.amountInput, {
        color: p.text,
        borderBottomColor: theme.accent.dot,
      }]}
    />
  ) : (
    <TouchableOpacity onPress={() => { setDraft(fmtAmt(amount)); setEditing(true); }}
      activeOpacity={0.75}
    >
      <View style={{ borderBottomWidth: 1, borderBottomColor: theme.accent.dot + '55', paddingBottom: 2 }}>
        <Text style={[TYPE.bodySmEm, { color: p.text }]}>${fmtAmt(amount)}</Text>
      </View>
    </TouchableOpacity>
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

export function BudgetScreen({ theme, onOpenDrawer }: Props) {
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

  // ── Keyboard-driven done bar ───────────────────────────────────
  const kbBottom = useRef(new Animated.Value(0)).current;
  const kbVisible = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => {
      Animated.parallel([
        Animated.timing(kbBottom,  { toValue: e.endCoordinates.height, duration: e.duration ?? 250, useNativeDriver: false }),
        Animated.timing(kbVisible, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', e => {
      Animated.parallel([
        Animated.timing(kbBottom,  { toValue: 0, duration: e.duration ?? 200, useNativeDriver: false }),
        Animated.timing(kbVisible, { toValue: 0, duration: 80,  useNativeDriver: true }),
      ]).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [kbBottom, kbVisible]);

  // ── Budget state ──────────────────────────────────────────────
  const [income, setIncome] = useState(MONTHLY_INCOME);
  const [cadence, setCadence] = useState<Cadence>('Mo');
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState('');
  const [budgets, setBudgets] = useState<Record<string, number>>(initBudgets);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoLabel, setUndoLabel] = useState('');

  const [customSubs, setCustomSubs] = useState<Record<string, { label: string }[]>>({
    needs: [], wants: [], savings: [],
  });
  const [removedSubs, setRemovedSubs] = useState<Set<string>>(new Set());
  const [removedBills, setRemovedBills] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const scrollViewRef = useRef<GHScrollView>(null);
  const outerTapRef = useRef<any>(null);
  const openSwipeRef = useRef<Swipeable | null>(null);

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
    const map: Record<string, typeof UPCOMING_BILLS> = {};
    UPCOMING_BILLS.forEach(bill => {
      const gKey = CAT_TO_GROUP[bill.cat] ?? 'wants';
      if (!map[gKey]) map[gKey] = [];
      map[gKey].push(bill);
    });
    return map;
  }, []);

  const displayIncome = fromMonthly(income, cadence);

  const commitIncome = () => {
    const v = parseFloat(incomeDraft.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(v) && v > 0) setIncome(toMonthly(v, cadence));
    setEditingIncome(false);
  };

  const updateBudget = (key: string, v: number) =>
    setBudgets(b => ({ ...b, [key]: v }));

  const saveSnapshot = () => {
    prevActionSnapshot.current = {
      budgets: { ...budgets },
      removedSubs: new Set(removedSubs),
      removedBills: new Set(removedBills),
      customSubs: Object.fromEntries(Object.entries(customSubs).map(([k, v]) => [k, [...v]])),
      activeTemplate,
    };
  };

  const removeSub = (gKey: string, label: string, isCustom: boolean) => {
    saveSnapshot();
    if (isCustom) {
      setCustomSubs(prev => ({ ...prev, [gKey]: prev[gKey].filter(s => s.label !== label) }));
      setBudgets(b => { const n = { ...b }; delete n[bKey(gKey, label)]; return n; });
    } else {
      setRemovedSubs(prev => new Set([...prev, bKey(gKey, label)]));
    }
    showUndo(`Removed ${label}`);
  };

  const removeBill = (bill: typeof UPCOMING_BILLS[number]) => {
    saveSnapshot();
    setRemovedBills(prev => new Set([...prev, bill.id]));
    showUndo(`Removed ${bill.name}`);
  };

  const addSub = (gKey: string, label: string) => {
    const origGroup = SPEND_GROUPS.find(g => g.key === gKey);
    const taken = new Set([
      ...(origGroup?.subs.map(s => s.label.toLowerCase()) ?? []),
      ...(customSubs[gKey] ?? []).map(s => s.label.toLowerCase()),
    ]);
    if (taken.has(label.toLowerCase())) return;
    setCustomSubs(prev => ({ ...prev, [gKey]: [...(prev[gKey] ?? []), { label }] }));
    setBudgets(b => ({ ...b, [bKey(gKey, label)]: 0 }));
    setAddingFor(null);
  };

  const groupTotals = useMemo(() => {
    const t: Record<string, number> = {};
    SPEND_GROUPS.forEach(g => {
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
  }, [budgets, removedSubs, customSubs, removedBills, billsByGroup]);

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
    saveSnapshot();
    const next: Record<string, number> = { ...budgets };
    SPEND_GROUPS.forEach(g => {
      const pct = (template as any)[g.key] as number;
      const target = income * pct;
      const subSum = g.subs.reduce((s, sub) => s + sub.budget, 0);
      g.subs.forEach(sub => {
        const ratio = subSum > 0 ? sub.budget / subSum : 1 / g.subs.length;
        next[bKey(g.key, sub.label)] = Math.round(target * ratio);
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

            {/* Hero — read-only; shows budgeted vs income */}
            <View style={[styles.hero, { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }]}>
              <View>
                <View style={styles.heroAmountRow}>
                  <Text style={[TYPE.display, { color: pWallpaper.text }, shadow]}>
                    ${Math.round(totalBudgeted).toLocaleString()}
                  </Text>
                  <Text style={[TYPE.bodySm, { color: pWallpaper.text }, shadow]}>
                    of ${income.toLocaleString()}/mo
                  </Text>
                </View>
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
                    tint(pWallpaper.text),
                    fixedSize({ horizontal: true, vertical: false }),
                  ]}
                >
                  <SwiftText modifiers={[tag('')]}>{activeTemplateName ?? 'Template'}</SwiftText>
                  {BUDGET_TEMPLATES.map(t => (
                    <SwiftText key={t.id} modifiers={[tag(t.id)]}>{t.label}</SwiftText>
                  ))}
                </Picker>
              </Host>
            </View>

            <View
              style={styles.sectionStack}
              onLayout={e => { barYRef.current = e.nativeEvent.layout.y; }}
            >
              {/* Allocation card — bar, legend, and income editing in one place */}
              <View onLayout={e => { barHeightRef.current = e.nativeEvent.layout.height; }}>
                <SectionCard dark={theme.dark}>
                  <View style={styles.allocationCardInner}>
                    {allocationContent(p.text, p.trackBg)}

                    {/* Income row — edit inline, cadence via native action sheet */}
                    <View style={[styles.incomeInline, { borderTopColor: p.hairline }]}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[TYPE.captionEm, { color: p.textTer }]}>Income</Text>
                        {editingIncome ? (
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                            <Text style={[TYPE.bodySmEm, { color: p.textSec }]}>$</Text>
                            <TextInput value={incomeDraft} onChangeText={setIncomeDraft}
                              onBlur={commitIncome} onSubmitEditing={commitIncome}
                              keyboardType="decimal-pad" autoFocus selectTextOnFocus
                              style={[TYPE.body, {
                                color: p.text,
                                borderBottomWidth: 1.5,
                                borderBottomColor: theme.accent.dot,
                                paddingVertical: 1,
                                minWidth: 60,
                              }]}
                            />
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => { setIncomeDraft(String(displayIncome)); setEditingIncome(true); }}
                            activeOpacity={0.75}
                          >
                            <View style={{ borderBottomWidth: 1, borderBottomColor: theme.accent.dot + '55', paddingBottom: 1 }}>
                              <Text style={[TYPE.body, { color: p.text }]}>
                                ${displayIncome.toLocaleString()}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>

                      <Host matchContents>
                        <Picker
                          selection={cadence}
                          onSelectionChange={(val) => setCadence(val as Cadence)}
                          modifiers={[
                            pickerStyle('menu'),
                            tint(p.text),
                            fixedSize({ horizontal: true, vertical: false }),
                          ]}
                        >
                          {CADENCES.map(c => (
                            <SwiftText key={c.value} modifiers={[tag(c.value)]}>{c.label}</SwiftText>
                          ))}
                        </Picker>
                      </Host>
                    </View>
                  </View>
                </SectionCard>
              </View>


              {/* Spending group cards */}
              {SPEND_GROUPS.map(g => {
                const groupColor = gCol(g.key);
                const groupTotal = Math.round(groupTotals[g.key] ?? 0);
                const visibleOrigSubs = g.subs.filter(s => !removedSubs.has(bKey(g.key, s.label)));
                const customs = customSubs[g.key] ?? [];
                const groupBills = (billsByGroup[g.key] ?? []).filter(b => !removedBills.has(b.id));

                return (
                  <SectionCard key={g.key} dark={theme.dark}>
                    <View style={styles.cardHead}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: groupColor }} />
                        <Text style={[TYPE.sectionTitle, { color: p.text }]}>{g.label}</Text>
                      </View>
                      <Text style={[TYPE.subsectionTitle, { color: groupColor }]}>${groupTotal.toLocaleString()}</Text>
                    </View>

                    {visibleOrigSubs.map((sub, si) => {
                      const isLast = si === visibleOrigSubs.length - 1 && customs.length === 0 && groupBills.length === 0 && addingFor !== g.key;
                      return (
                        <SwipeRow key={sub.label} onRemove={() => removeSub(g.key, sub.label, false)} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                          <View style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}>
                            <View style={[styles.rowIcon, { backgroundColor: groupColor }]}>
                              <Icon name={sub.icon} size={15} color="#FBF8FF" stroke={1.6} />
                            </View>
                            <Text style={[TYPE.body, { flex: 1, color: p.text, minWidth: 0 }]}>{sub.label}</Text>
                            <AmountField theme={theme} dark={theme.dark}
                              amount={budgets[bKey(g.key, sub.label)] ?? sub.budget}
                              onChange={v => updateBudget(bKey(g.key, sub.label), v)}
                            />
                          </View>
                        </SwipeRow>
                      );
                    })}

                    {customs.map((sub, ci) => {
                      const isLast = ci === customs.length - 1 && groupBills.length === 0 && addingFor !== g.key;
                      return (
                        <SwipeRow key={sub.label} onRemove={() => removeSub(g.key, sub.label, true)} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                          <View style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}>
                            <View style={[styles.rowIcon, { backgroundColor: theme.dark ? 'rgba(180,160,240,0.18)' : 'rgba(14,12,24,0.08)' }]}>
                              <Icon name="tag" size={14} color={groupColor} stroke={1.5} />
                            </View>
                            <Text style={[TYPE.body, { flex: 1, color: p.text, minWidth: 0 }]}>{sub.label}</Text>
                            <AmountField theme={theme} dark={theme.dark}
                              amount={budgets[bKey(g.key, sub.label)] ?? 0}
                              onChange={v => updateBudget(bKey(g.key, sub.label), v)}
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
                                <View style={[styles.rowIcon, { backgroundColor: catGroupColor(bill.cat, theme.dark) }]}>
                                  <Icon name={bill.icon} size={15} color="#FBF8FF" stroke={1.6} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={[TYPE.body, { color: p.text }]}>{bill.name}</Text>
                                  <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]}>
                                    {bill.dueDate}{bill.estimate ? ' · est.' : ''}
                                  </Text>
                                </View>
                                <AmountField theme={theme} dark={theme.dark}
                                  amount={budgets[billKey(g.key, bill.id)] ?? bill.amount}
                                  onChange={v => updateBudget(billKey(g.key, bill.id), v)}
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

      {/* Custom Done bar — floats above the keyboard, tracks its height */}
      <Animated.View style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: kbBottom,
        opacity: kbVisible,
        zIndex: 20,
      }}>
        <BlurView
          intensity={theme.dark ? 68 : 92}
          tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
        >
          <View style={[styles.doneBar, { borderTopColor: theme.hairline }]}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
              <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Animated.View>
    </View>
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
  allocationCardInner: {
    gap: 12,
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  sectionStack: {
    paddingHorizontal: 16,
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
    alignItems: 'center',
    marginBottom: 14,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendItem: {
    alignItems: 'center',
  },
  incomeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
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
  amountInput: {
    paddingVertical: 4,
    minWidth: 60,
    textAlign: 'right',
    borderBottomWidth: 1.5,
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
  doneBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
