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
  ImageBackground,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
import { Swipeable, ScrollView as GHScrollView, TapGestureHandler, State } from 'react-native-gesture-handler';

const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, GROUP_COLORS, OVER_DOT, ON_GROUP_ICON, cautionText } from '../theme';
import { Icon } from '../components/Icon';
import { MerchantMark } from '../components/MerchantMark';
import { GlassCircleButton, ScreenExitButton, EXIT_FLOAT_STYLE, SUPPORTS_GLASS, glassTintForTheme } from '../components/GlassButton';
import { applyKeypadKey, type KeypadKey } from '../components/NumericKeypad';
import { PopupNumericKeypad } from '../components/PopupNumericKeypad';
import { Collapsible } from '../components/Collapsible';
import { SheetPrimaryButton } from '../components/shared';
import { BillSheetMount, type BillSheetHandle } from '../components/sheetMounts';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionCard } from '../components/SectionCard';
import { makeBgTranslateY, BG_PARALLAX_MAX } from '../components/headerScroll';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';
import { makeP, DARK_TEXT_SHADOW, makeScrim, deriveFloor, MEDIA, ONMEDIA_BORDER_LIGHT, WallpaperP as P } from '../wallpaperPalette';
import { useLedgerMembers, useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryGroupFor } from '../repositories/categoryUtils';
import { memberDisplayName } from '../repositories/memberLabels';
import type { Bill, Category, GroupKey, Income, SpendGroup, SpendSub, Transaction, TransactionCursor } from '../repositories/types';
import { monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import { contributionTotal, goalFromCategory, goalProgressPct, goalRemaining, goalSavedFromParts, statusFor } from '../selectors/goals';
import { CATEGORY_ICON_OPTIONS, ICON_DISPLAY_NAMES, inferCategoryIcon } from '../categoryIcons';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import {
  Button as SwiftButton,
  DatePicker,
  GlassEffectContainer,
  HStack,
  Menu,
  Host,
  Image as SwiftImage,
  ProgressView,
  Rectangle,
  Spacer,
  SwipeActions,
  Text as SwiftText,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityHint as swiftAccessibilityHint,
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  clipped,
  datePickerStyle,
  environment,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  opacity,
  padding,
  progressViewStyle,
  shapes,
  tint,
  truncationMode,
} from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../ThemeProvider';
import type { SFSymbol } from 'sf-symbols-typescript';

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
  onOpenIncome?: (ref: View) => void;
  // Fired when the inline amount keypad opens/closes so the app can hide the tab bar.
  onKeypadOpenChange?: (open: boolean) => void;
  // When set, auto-opens the category editor for this category ID on mount/change.
  pendingEditCategoryId?: string;
  onPendingEditHandled?: () => void;
}

type Cadence = 'Mo' | '2w' | 'Wk' | 'Yr';
const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'Mo', label: 'Monthly' },
  { value: '2w', label: 'Bi-weekly' },
  { value: 'Wk', label: 'Weekly' },
  { value: 'Yr', label: 'Annual' },
];

const currentMonthKey = () => new Date().toISOString().slice(0, 7);
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

const bKey = (gKey: string, label: string) => `${gKey}:${label}`;
const billKey = (gKey: string, billId: string) => `bill:${gKey}:${billId}`;
const ruleIdFromBillId = (billId: string) => billId.startsWith('bill-') ? billId.slice(5) : billId;

const initBudgets = (groups: SpendGroup[], bills: Bill[], categories: Category[]): Record<string, number> => {
  const out: Record<string, number> = {};
  groups.forEach(g => g.subs.forEach(s => { out[bKey(g.key, s.label)] = s.budget; }));
  bills.forEach(bill => {
    const gKey = categoryGroupFor(bill.cat, categories);
    out[billKey(gKey, bill.id)] = bill.fullAmount;
  });
  return out;
};

const ICON_SF_SYMBOL: Record<string, SFSymbol> = {
  cart:    'cart',
  fork:    'fork.knife',
  car:     'car',
  bag:     'bag',
  doc:     'doc',
  film:    'film',
  home:    'house',
  wallet:  'wallet.pass',
  receipt: 'receipt',
  cards:   'creditcard',
  repeat:  'repeat',
  tag:     'tag',
  sparkle: 'sparkles',
  cup:     'cup.and.saucer',
  cal:     'calendar',
  note:    'note.text',
  chart:   'chart.bar',
  profile: 'person',
  bell:    'bell',
  sun:     'sun.max',
  moon:    'moon',
};
const BUDGET_FALLBACK_SYMBOL: SFSymbol = 'tag';
const NATIVE_BUDGET_ALLOCATION_HEIGHT = 72;
const NATIVE_BUDGET_ALLOCATION_BAR_W = SCREEN_W - LAYOUT.screenGutter * 2 - LAYOUT.cardPadX * 2;
const NATIVE_BUDGET_GROUP_ROW_HEIGHT = 62;
const NATIVE_BUDGET_GROUP_HEADER_HEIGHT = 82;
const NATIVE_BUDGET_GROUP_RECURRING_HEIGHT = 34;
const NATIVE_BUDGET_GROUP_ADD_HEIGHT = 48;

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
  semimonthly: 'Twice a month',
  weekly: 'Weekly',
  annual: 'Annual',
  custom: 'Custom',
  oneTime: 'One-time',
};
// Monthly-equivalent of a single income source, matching monthlyIncome()'s math.
const incomeMonthly = (inc: Income): number => {
  switch (inc.cadence) {
    case 'weekly':      return Math.round(inc.amount * 52 / 12);
    case 'biweekly':    return Math.round(inc.amount * 26 / 12);
    case 'semimonthly': return inc.amount * 2;
    case 'annual':      return Math.round(inc.amount / 12);
    case 'custom':      return Math.round(inc.amount * (Number(inc.meta?.perYear) || 12) / 12);
    case 'oneTime':     return 0;
    default:            return inc.amount;
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

const amountToBudgetDraft = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value % 1 === 0 ? String(Math.round(value)) : String(Number(value.toFixed(2)));
};

const applyBudgetKeypadKey = (value: string, key: KeypadKey): string => {
  const digits = (value.split('.')[0] || '').replace(/\D/g, '').replace(/^0+/, '') || '0';
  if (key === 'back') return digits.length <= 1 ? '' : digits.slice(0, -1);
  if (key === '00') {
    if (digits === '0') return '0';
    const next = `${digits}00`;
    return next.length > 6 ? value : next;
  }
  if (digits === '0' && key === '0') return '0';
  const next = digits === '0' ? key : `${digits}${key}`;
  return next.length > 6 ? value : next;
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


// ─── FrameworkCard ────────────────────────────────────────────────────────────
// Shown once on first visit to Budget. Explains the 50/30/20 rule in two lines
// so users understand what the group percentages mean before they start editing.
function FrameworkCard({ theme, onDismiss }: { theme: Theme; onDismiss: () => void }) {
  const groups: { key: string; color: string; pct: string; label: string }[] = [
    { key: 'needs', color: GROUP_COLORS.needs.light, pct: '50%', label: 'Needs' },
    { key: 'wants', color: GROUP_COLORS.wants.light, pct: '30%', label: 'Wants' },
    { key: 'savings', color: GROUP_COLORS.savings.light, pct: '20%', label: 'Savings' },
  ];
  return (
    <View
      style={[fwStyles.card, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}
      accessibilityRole="none"
    >
      <View style={fwStyles.cardHead}>
        <Text style={[TYPE.captionEm, fwStyles.eyebrow, { color: theme.textTer }]}>
          HOW IT WORKS
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss budget framework explanation"
        >
          <Icon name="close" size={14} color={theme.textTer} stroke={1.8} />
        </Pressable>
      </View>
      <Text style={[TYPE.body, fwStyles.headline, { color: theme.text }]}>
        The 50/30/20 rule
      </Text>
      <Text style={[TYPE.bodyRegular, fwStyles.body, { color: theme.textSec }]}>
        Aim to spend 50% of income on essentials, 30% on things you enjoy, and save the remaining 20%.
      </Text>
      <View style={fwStyles.groups}>
        {groups.map(g => (
          <View key={g.key} style={fwStyles.groupItem}>
            <View style={[fwStyles.groupDot, { backgroundColor: g.color }]} />
            <Text style={[TYPE.captionEm, { color: theme.text }]}>{g.pct}</Text>
            <Text style={[TYPE.caption, { color: theme.textSec }]}>{g.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const fwStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.card,
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xl,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  eyebrow: {
    letterSpacing: 0.6,
  },
  headline: {
    marginBottom: SPACE.xs,
  },
  body: {
    lineHeight: 20,
    marginBottom: SPACE.lg,
  },
  groups: {
    flexDirection: 'row',
    gap: SPACE.xl,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4, // width/2 — circle
  },
});

// ─────────────────────────────────────────────────────────────────────────────

function SwipeRow({ children, onRemove, onOpen, onClose, scrollRef, tapRef }: {
  children: React.ReactNode;
  onRemove?: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
  scrollRef: React.RefObject<any>;
  tapRef: React.RefObject<any>;
}) {
  const swipeRef = useRef<Swipeable>(null);
  if (!onRemove) return <>{children}</>;

  const renderRightActions = useCallback((progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
    return (
      <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
        <TouchableOpacity
          onPress={onRemove}
          style={{ flex: 1, marginLeft: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: OVER_DOT }}
        >
          <Icon name="trash" size={18} color={ON_GROUP_ICON} stroke={1.6} />
        </TouchableOpacity>
      </Animated.View>
    );
  }, [onRemove]);

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

type NativeBudgetRowItem = {
  id: string;
  kind: 'category' | 'custom' | 'bill';
  label: string;
  meta?: string;
  icon: SFSymbol;
  color: string;
  amount: number;
  editable: boolean;
  active: boolean;
  draft: string;
  goal?: {
    pct: number;
    status: string;
    statusColor: string;
    remaining: number;
  };
  accessibilityLabel: string;
  accessibilityHint?: string;
  onOpen?: () => void;
  onEditAmount: () => void;
  onDelete?: () => void;
};

function NativeBudgetAllocationCard({
  theme,
  p,
  needsFrac,
  wantsFrac,
  savingsFrac,
  needsPct,
  wantsPct,
  savingsPct,
  needsCol,
  wantsCol,
  savingsCol,
}: {
  theme: Theme;
  p: P;
  needsFrac: number;
  wantsFrac: number;
  savingsFrac: number;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  needsCol: string;
  wantsCol: string;
  savingsCol: string;
}) {
  const glassTint = theme.dark ? 'rgba(18,20,22,0.46)' : 'rgba(255,255,255,0.72)';
  const needsW = Math.max(0, Math.min(NATIVE_BUDGET_ALLOCATION_BAR_W, NATIVE_BUDGET_ALLOCATION_BAR_W * needsFrac));
  const wantsW = Math.max(0, Math.min(NATIVE_BUDGET_ALLOCATION_BAR_W - needsW, NATIVE_BUDGET_ALLOCATION_BAR_W * wantsFrac));
  const savingsW = Math.max(0, Math.min(NATIVE_BUDGET_ALLOCATION_BAR_W - needsW - wantsW, NATIVE_BUDGET_ALLOCATION_BAR_W * savingsFrac));
  const legendItems = [
    { key: 'Needs', color: needsCol, pct: needsPct, pctColor: needsPct > 50 ? OVER_DOT : p.text },
    { key: 'Wants', color: wantsCol, pct: wantsPct, pctColor: wantsPct > 30 ? OVER_DOT : p.text },
    { key: 'Savings', color: savingsCol, pct: savingsPct, pctColor: savingsPct >= 20 ? savingsCol : p.text },
  ];

  return (
    <Host
      ignoreSafeArea="all"
      colorScheme={theme.dark ? 'dark' : 'light'}
      style={{ width: '100%', height: NATIVE_BUDGET_ALLOCATION_HEIGHT }}
    >
      <GlassEffectContainer>
        <VStack
          alignment="leading"
          spacing={SPACE.md}
          modifiers={[
            padding({
              leading: LAYOUT.cardPadX,
              trailing: LAYOUT.cardPadX,
              top: LAYOUT.cardPadTop,
              bottom: LAYOUT.cardPadBottom,
            }),
            frame({ maxWidth: 10000, alignment: 'leading' }),
            glassEffect({
              glass: { variant: 'regular', interactive: true, tint: glassTint },
              shape: 'roundedRectangle',
              cornerRadius: RADIUS.card,
            }),
          ]}
        >
          <VStack
            alignment="leading"
            spacing={0}
            modifiers={[
              frame({ width: NATIVE_BUDGET_ALLOCATION_BAR_W, height: 7, alignment: 'leading' }),
              background(p.trackBg, shapes.roundedRectangle({ cornerRadius: 4 })),
              clipped(),
            ]}
          >
            <HStack alignment="center" spacing={0} modifiers={[frame({ width: NATIVE_BUDGET_ALLOCATION_BAR_W, height: 7, alignment: 'leading' })]}>
              {needsW > 0 ? <Rectangle modifiers={[frame({ width: needsW, height: 7 }), foregroundStyle(needsCol)]} /> : null}
              {wantsW > 0 ? <Rectangle modifiers={[frame({ width: wantsW, height: 7 }), foregroundStyle(wantsCol)]} /> : null}
              {savingsW > 0 ? <Rectangle modifiers={[frame({ width: savingsW, height: 7 }), foregroundStyle(savingsCol)]} /> : null}
            </HStack>
          </VStack>

          <HStack
            alignment="center"
            spacing={0}
            modifiers={[frame({ width: NATIVE_BUDGET_ALLOCATION_BAR_W, alignment: 'leading' })]}
          >
            <NativeBudgetAllocationLegendItem item={legendItems[0]} p={p} />
            <Spacer />
            <NativeBudgetAllocationLegendItem item={legendItems[1]} p={p} />
            <Spacer />
            <NativeBudgetAllocationLegendItem item={legendItems[2]} p={p} />
          </HStack>
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}

function NativeBudgetAllocationLegendItem({
  item,
  p,
}: {
  item: { key: string; color: string; pct: number; pctColor: string };
  p: P;
}) {
  return (
    <HStack alignment="center" spacing={SPACE.xs}>
      <SwiftText modifiers={[font({ size: 10 }), foregroundStyle(item.color)]}>●</SwiftText>
      <SwiftText modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(p.textSec), lineLimit(1)]}>
        {item.key}
      </SwiftText>
      <SwiftText modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(item.pctColor), lineLimit(1)]}>
        {item.pct}%
      </SwiftText>
    </HStack>
  );
}

function NativeBudgetGroupCard({
  theme,
  p,
  label,
  color,
  icon,
  total,
  target,
  targetPct,
  delta,
  isOverTarget,
  open,
  rows,
  onToggle,
  onAddCategory,
}: {
  theme: Theme;
  p: P;
  label: string;
  color: string;
  icon: SFSymbol;
  total: number;
  target: number;
  targetPct: number;
  delta: number;
  isOverTarget: boolean;
  open: boolean;
  rows: NativeBudgetRowItem[];
  onToggle: () => void;
  onAddCategory: () => void;
}) {
  const glassTint = theme.dark ? 'rgba(18,20,22,0.46)' : 'rgba(255,255,255,0.72)';
  const progress = target > 0 ? Math.min(total / target, 1) : 0;
  const statusColor = isOverTarget ? OVER_DOT : p.textSec;
  const recurringDividerCount = open && rows.some(row => row.kind === 'bill') ? 1 : 0;
  const detailsHeight = open
    ? rows.length * NATIVE_BUDGET_GROUP_ROW_HEIGHT + recurringDividerCount * NATIVE_BUDGET_GROUP_RECURRING_HEIGHT
    : 0;
  const hostHeight =
    LAYOUT.cardPadTop +
    NATIVE_BUDGET_GROUP_HEADER_HEIGHT +
    detailsHeight +
    NATIVE_BUDGET_GROUP_ADD_HEIGHT +
    LAYOUT.cardPadBottom;
  let sawBill = false;

  return (
    <Host
      ignoreSafeArea="all"
      colorScheme={theme.dark ? 'dark' : 'light'}
      style={{ width: '100%', height: hostHeight }}
    >
      <GlassEffectContainer>
        <VStack
          alignment="leading"
          spacing={0}
          modifiers={[
            padding({
              leading: LAYOUT.cardPadX,
              trailing: LAYOUT.cardPadX,
              top: LAYOUT.cardPadTop,
              bottom: LAYOUT.cardPadBottom,
            }),
            frame({ maxWidth: 10000, alignment: 'leading' }),
            glassEffect({
              glass: { variant: 'regular', interactive: true, tint: glassTint },
              shape: 'roundedRectangle',
              cornerRadius: RADIUS.card,
            }),
          ]}
        >
          <SwiftButton
            onPress={onToggle}
            modifiers={[
              swiftAccessibilityLabel(`${open ? 'Collapse' : 'Expand'} ${label} budget group`),
              swiftAccessibilityHint(`${label} target is ${fmtPct(targetPct)}`),
            ]}
          >
            <VStack
              alignment="leading"
              spacing={SPACE.sm}
              modifiers={[
                frame({ height: NATIVE_BUDGET_GROUP_HEADER_HEIGHT, maxWidth: 10000, alignment: 'leading' }),
              ]}
            >
              <HStack alignment="center" spacing={SPACE.md} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
                <SwiftImage
                  systemName={icon}
                  size={15}
                  color={color}
                  modifiers={[
                    frame({ width: 34, height: 34 }),
                    background(`${color}22`, shapes.roundedRectangle({ cornerRadius: 17 })),
                  ]}
                />
                <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
                  <SwiftText modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(p.text), lineLimit(1)]}>
                    {label}
                  </SwiftText>
                  <SwiftText modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(statusColor), lineLimit(1)]}>
                    {isOverTarget ? `$${fmtMoney(delta)} over target` : `$${fmtMoney(target)} target · ${fmtPct(targetPct)}`}
                  </SwiftText>
                </VStack>
                <SwiftText modifiers={[font({ size: 18, weight: 'semibold' }), foregroundStyle(color), lineLimit(1)]}>
                  ${fmtMoney(total)}
                </SwiftText>
                <SwiftImage
                  systemName={open ? 'chevron.up' : 'chevron.down'}
                  size={12}
                  color={p.textTer}
                />
              </HStack>
              <ProgressView
                value={progress}
                modifiers={[
                  progressViewStyle('linear'),
                  tint(isOverTarget ? OVER_DOT : color),
                  frame({ maxWidth: 10000 }),
                ]}
              />
            </VStack>
          </SwiftButton>

          <VStack
            alignment="leading"
            spacing={0}
            modifiers={[
              frame({ height: detailsHeight, maxWidth: 10000, alignment: 'topLeading' }),
              clipped(),
            ]}
          >
            {rows.map((row, index) => {
              const showRecurringDivider = row.kind === 'bill' && !sawBill;
              if (row.kind === 'bill') sawBill = true;
              const last = index === rows.length - 1;
              return (
                <VStack key={row.id} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
                  {showRecurringDivider ? (
                    <HStack
                      alignment="center"
                      spacing={SPACE.sm}
                      modifiers={[frame({ height: NATIVE_BUDGET_GROUP_RECURRING_HEIGHT, maxWidth: 10000, alignment: 'leading' })]}
                    >
                      <SwiftImage systemName="repeat" size={11} color={p.textTer} />
                      <SwiftText modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(p.textTer)]}>
                        Recurring
                      </SwiftText>
                    </HStack>
                  ) : null}
                  <NativeBudgetRow
                    item={row}
                    p={p}
                    last={last}
                  />
                </VStack>
              );
            })}
          </VStack>

          <Rectangle
            modifiers={[
              frame({ height: open && rows.length > 0 ? 1 : 0, maxWidth: 10000 }),
              foregroundStyle(p.hairline),
              opacity(open && rows.length > 0 ? 1 : 0),
            ]}
          />
          <SwiftButton
            onPress={onAddCategory}
            modifiers={[swiftAccessibilityLabel(`Add category to ${label}`), tint(color)]}
          >
            <HStack
              alignment="center"
              spacing={SPACE.sm}
              modifiers={[
                frame({ height: NATIVE_BUDGET_GROUP_ADD_HEIGHT, maxWidth: 10000, alignment: 'leading' }),
              ]}
            >
              <SwiftImage systemName="plus" size={13} color={color} />
              <SwiftText modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(color)]}>
                Add category
              </SwiftText>
            </HStack>
          </SwiftButton>
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}

function NativeBudgetRow({
  item,
  p,
  last,
}: {
  item: NativeBudgetRowItem;
  p: P;
  last: boolean;
}) {
  const labelContent = (
    <HStack alignment="center" spacing={SPACE.md} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
      <SwiftImage
        systemName={item.icon}
        size={14}
        color={item.color}
        modifiers={[
          frame({ width: 32, height: 32 }),
          background(`${item.color}24`, shapes.roundedRectangle({ cornerRadius: 16 })),
        ]}
      />
      <VStack alignment="leading" spacing={3} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
        <SwiftText
          modifiers={[
            font({ size: 14, weight: 'medium' }),
            foregroundStyle(p.text),
            lineLimit(1),
            truncationMode('tail'),
          ]}
        >
          {item.label}
        </SwiftText>
        {item.goal ? (
          <HStack alignment="center" spacing={SPACE.xs} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
            <ProgressView
              value={Math.min(item.goal.pct / 100, 1)}
              modifiers={[
                progressViewStyle('linear'),
                tint(item.color),
                frame({ width: 54 }),
              ]}
            />
            <SwiftText modifiers={[font({ size: 11 }), foregroundStyle(item.goal.statusColor), lineLimit(1)]}>
              {item.goal.status}
            </SwiftText>
            <SwiftText modifiers={[font({ size: 11 }), foregroundStyle(p.textTer), lineLimit(1)]}>
              · ${fmtMoney(item.goal.remaining)} to go
            </SwiftText>
          </HStack>
        ) : item.meta ? (
          <SwiftText
            modifiers={[
              font({ size: 12 }),
              foregroundStyle(p.textSec),
              lineLimit(1),
              truncationMode('tail'),
            ]}
          >
            {item.meta}
          </SwiftText>
        ) : null}
      </VStack>
    </HStack>
  );
  const rowLabel = item.onOpen ? (
    <SwiftButton
      onPress={item.onOpen}
      modifiers={[
        frame({ maxWidth: 10000, alignment: 'leading' }),
        swiftAccessibilityLabel(item.accessibilityLabel),
        ...(item.accessibilityHint ? [swiftAccessibilityHint(item.accessibilityHint)] : []),
      ]}
    >
      {labelContent}
    </SwiftButton>
  ) : (
    <HStack
      alignment="center"
      spacing={SPACE.md}
      modifiers={[
        frame({ maxWidth: 10000, alignment: 'leading' }),
        opacity(0.9),
      ]}
    >
      {labelContent}
    </HStack>
  );

  const row = (
    <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
      <HStack
        alignment="center"
        spacing={SPACE.md}
        modifiers={[
          frame({ height: NATIVE_BUDGET_GROUP_ROW_HEIGHT - (last ? 0 : 1), maxWidth: 10000, alignment: 'leading' }),
        ]}
      >
        {rowLabel}
        <NativeBudgetAmountButton item={item} p={p} />
      </HStack>
      {!last ? (
        <Rectangle
          modifiers={[
            frame({ height: 1, maxWidth: 10000 }),
            foregroundStyle(p.hairline),
          ]}
        />
      ) : null}
    </VStack>
  );

  if (!item.onDelete) return row;

  return (
    <SwipeActions>
      {row}
      <SwipeActions.Actions edge="trailing" allowsFullSwipe>
        <SwiftButton
          label="Delete"
          systemImage="trash"
          role="destructive"
          onPress={item.onDelete}
          modifiers={[tint(OVER_DOT)]}
        />
      </SwipeActions.Actions>
    </SwipeActions>
  );
}

function NativeBudgetAmountButton({ item, p }: { item: NativeBudgetRowItem; p: P }) {
  const amountText = item.active
    ? `$${formatDraft(item.draft)}`
    : `$${fmtAmt(item.amount)}`;
  const amountColor = item.active ? item.color : p.textSec;
  const content = (
    <VStack alignment="trailing" spacing={3} modifiers={[opacity(item.editable ? 1 : 0.58)]}>
      <SwiftText
        modifiers={[
          font({ size: 15, weight: 'semibold' }),
          foregroundStyle(amountColor),
          lineLimit(1),
        ]}
      >
        {amountText}
      </SwiftText>
      <Rectangle
        modifiers={[
          frame({ width: 54, height: 1 }),
          foregroundStyle(item.editable ? (item.active ? item.color : p.hairline) : 'rgba(0,0,0,0)'),
        ]}
      />
    </VStack>
  );

  if (!item.editable) return content;

  return (
    <SwiftButton
      onPress={item.onEditAmount}
      modifiers={[
        swiftAccessibilityLabel(`Edit ${item.label} budget`),
        tint(item.color),
      ]}
    >
      {content}
    </SwiftButton>
  );
}

// Allocation bar segments
function AllocationBar({ needsFrac, wantsFrac, savingsFrac, trackBg, needsCol, wantsCol, savingsCol, height = 8, accessibilityLabel, tickFracs }: {
  needsFrac: number; wantsFrac: number; savingsFrac: number;
  trackBg: string; needsCol: string; wantsCol: string; savingsCol: string;
  height?: number;
  accessibilityLabel?: string;
  // Positions (0–1) where target-boundary tick marks are drawn over the bar.
  tickFracs?: number[];
}) {
  const r = height / 2;
  return (
    <View style={{ position: 'relative' }}>
      <View
        style={{ height, borderRadius: r, overflow: 'hidden', flexDirection: 'row', backgroundColor: trackBg }}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {needsFrac > 0 && <View style={{ height: '100%', width: `${(needsFrac * 100).toFixed(2)}%` as any, backgroundColor: needsCol }} />}
        {wantsFrac > 0 && <View style={{ height: '100%', width: `${(wantsFrac * 100).toFixed(2)}%` as any, backgroundColor: wantsCol }} />}
        {savingsFrac > 0 && <View style={{ height: '100%', width: `${(savingsFrac * 100).toFixed(2)}%` as any, backgroundColor: savingsCol }} />}
      </View>
      {tickFracs?.map((frac, i) =>
        frac > 0.02 && frac < 0.98 ? (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${(frac * 100).toFixed(2)}%` as any,
              top: 0,
              height,
              width: 1.5,
              borderRadius: 1,
              backgroundColor: 'rgba(255,255,255,0.55)',
            }}
          />
        ) : null,
      )}
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
      <Text style={{ opacity: 0.55 }}>$</Text>{formatDraft(draft)}
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
function EditableBudgetAmount({ value, active, color, accentColor, underlineColor, onStartEdit, onMeasured, accessibilityLabel, disabled = false }: {
  value: number;
  active: boolean;
  color: string;
  accentColor: string;
  underlineColor: string;
  onStartEdit: () => void;
  onMeasured: (top: number, height: number) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const ref = useRef<View>(null);

  const startEdit = () => {
    if (disabled) return;
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
      disabled={disabled}
      activeOpacity={0.6}
      hitSlop={{ top: 10, bottom: 10, left: 12, right: 6 }}
      accessibilityRole={disabled ? undefined : 'button'}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.catBudgetWrap, { borderBottomColor: disabled ? 'transparent' : underlineColor, opacity: disabled ? 0.58 : 1 }]}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={1}
          style={[styles.catBudgetText, { color }]}
        >
          <Text style={{ opacity: 0.55 }}>$</Text>{fmtAmt(value)}
        </Text>
        <View style={styles.catBudgetCaretSpacer} />
      </View>
    </TouchableOpacity>
  );
}

export function BudgetScreen({ theme, onOpenDrawer, onOpenIncome, onKeypadOpenChange, pendingEditCategoryId, onPendingEditHandled }: Props) {
  const { transactionsRepo, incomeRepo, budgetsRepo, categoriesRepo, recurringRulesRepo, sessionRepo } = useRepositories();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [repoVersion, setRepoVersion] = useState(0);
  const incomes = useRepositoryList(incomeRepo);
  const budgetRecords = useRepositoryList(budgetsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const ledgerMembers = useLedgerMembers();
  const upcomingBills = useMemo(
    () => upcomingBillsFromRecurring(recurringRules, categories),
    [recurringRules, categories],
  );
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey());
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
  const { wallpaper, wallpaperFloorBase, metaFlag, setMetaFlag } = useTheme();
  const pWallpaper = makeP(true);
  const p = makeP(theme.dark);
  const shadow = DARK_TEXT_SHADOW;
  const scrim = makeScrim(theme.dark);
  const floorColor = deriveFloor(wallpaperFloorBase, theme.dark);

  // ── Scroll-driven sticky pin ──────────────────────────────────
  // The allocation card stays in the scroll layout, then translates by the
  // scrolled-past distance once it reaches the top of the scroll viewport.
  const sectionStackYRef = useRef(0);
  const allocCardYRef = useRef(0);
  const [allocStickyY, setAllocStickyY] = useState(0);
  const updateAllocStickyY = useCallback(() => {
    const next = sectionStackYRef.current + allocCardYRef.current;
    setAllocStickyY(prev => Math.abs(prev - next) < 0.5 ? prev : next);
  }, []);

  // Native-driven scroll position for the wallpaper parallax. handleScroll still
  // runs as the JS listener to drive the (layout-dependent) pin state.
  const scrollY = useRef(new Animated.Value(0)).current;
  const bgTranslateY = makeBgTranslateY(scrollY);
  const iconScrolledOpacity = scrollY.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
  const floorOpacity = scrollY.interpolate({
    inputRange: [0, SCREEN_H * 0.6],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const allocationStickyTranslateY = allocStickyY > 0
    ? scrollY.interpolate({
        inputRange: [0, allocStickyY, allocStickyY + 1],
        outputRange: [0, 0, 1],
        extrapolate: 'extend',
      })
    : 0;

  // Latest content offset, mirrored for the keypad's scroll-into-view math.
  const scrollOffsetRef = useRef(0);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = y;
  }, []);

  // ── Budget state ──────────────────────────────────────────────
  const [income, setIncome] = useState(initialIncome);
  const [budgets, setBudgets] = useState<Record<string, number>>(() => initBudgets(visibleSpendGroups, upcomingBills, categories));
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoLabel, setUndoLabel] = useState('');
  const [undoHasAction, setUndoHasAction] = useState(true);

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
  const [nativeDraft, setNativeDraft] = useState('');
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
  const monthOptions = useMemo(() => {
    const keys = new Set(budgetRecords.map(b => b.month));
    keys.add(currentMonthKey());
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [budgetRecords]);
  const selectedMonthHasBudgets = useMemo(
    () => budgetRecords.some(b => b.month === selectedMonth),
    [budgetRecords, selectedMonth],
  );
  const prevMonthKey = useMemo(() => monthKeyFromOffset(selectedMonth, -1), [selectedMonth]);
  const prevMonthHasBudgets = useMemo(
    () => budgetRecords.some(b => b.month === prevMonthKey),
    [budgetRecords, prevMonthKey],
  );
  const showCopyPrompt = !selectedMonthHasBudgets && prevMonthHasBudgets;
  const showNotice = useCallback((label: string) => {
    if (pendingDeleteRef.current) {
      pendingDeleteRef.current();
      pendingDeleteRef.current = null;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoLabel(label);
    setUndoHasAction(false);
    setUndoVisible(true);
    undoTimer.current = setTimeout(() => {
      setUndoVisible(false);
    }, 4000);
  }, []);
  const lockedOwnerName = useCallback((createdByUserId?: string) => (
    memberDisplayName(ledgerMembers, createdByUserId) ?? 'This member'
  ), [ledgerMembers]);
  const canEditCategoryId = useCallback((categoryId?: string) => {
    if (!categoryId) return true;
    const category = categories.find(item => item.id === categoryId);
    return !category || sessionRepo.canEdit(category.createdByUserId, category.ledgerId);
  }, [categories, sessionRepo]);
  const canEditBudgetKey = useCallback((key: string) => {
    if (key.startsWith('bill:')) {
      const [, , billId] = key.split(':');
      const ruleId = billId ? ruleIdFromBillId(billId) : '';
      const rule = recurringRules.find(item => item.id === ruleId);
      return !rule || sessionRepo.canEdit(rule.createdByUserId, rule.ledgerId);
    }
    const [groupKey, label] = key.split(':') as [SpendGroup['key'] | undefined, string | undefined];
    if (!groupKey || !label) return true;
    const sub = visibleSpendGroups.find(g => g.key === groupKey)?.subs.find(s => s.label === label);
    if (sub?.cat && !canEditCategoryId(sub.cat)) return false;
    const existing = budgetRecords.find(b => (
      (sub?.cat && b.category === sub.cat) || (b.group === groupKey && b.label === label)
    ) && b.month === selectedMonth);
    return !existing || sessionRepo.canEdit(existing.createdByUserId, existing.ledgerId);
  }, [budgetRecords, canEditCategoryId, recurringRules, selectedMonth, sessionRepo, visibleSpendGroups]);
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
    if (!canEditBudgetKey(key)) {
      showNotice('This item is locked by its owner.');
      return false;
    }
	    if (key.startsWith('bill:')) {
	      const [, , billId] = key.split(':');
	      if (billId) recurringRulesRepo.update(ruleIdFromBillId(billId), { amount: v, updatedByUserId: 'local' });
	      return true;
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
    return true;
	  };

	  const commitBudget = (key: string, value: number) => {
    if (!canEditBudgetKey(key)) {
      showNotice('This item is locked by its owner.');
      return;
    }
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
    if (!canEditBudgetKey(key)) {
      showNotice('This item is locked by its owner.');
      return;
    }
	    const wasOpen = editingKeyRef.current !== null;
    // Switching rows mid-edit: commit the one we're leaving first. editingKey goes
    // straight from one key to the next (never null), so the keypad and tab bar
    // don't blink between rows.
    if (editingKey && editingKey !== key) flushEditDraft(editingKey, draftStore.value);
    editingKeyRef.current = key;
    const initialDraft = amountToBudgetDraft(value);
    setDraft(initialDraft);
    if (SUPPORTS_GLASS) setNativeDraft(initialDraft);
    setEditingKey(key);
    if (!wasOpen) slideKeypad(true);
  };

  // A keypress mutates the live draft only — no screen-level state changes, so
  // only LiveDraftText repaints.
  const handleKeypadKey = useCallback((k: KeypadKey) => {
    const next = applyBudgetKeypadKey(draftStore.value, k);
    setDraft(next);
    if (SUPPORTS_GLASS) setNativeDraft(next);
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
    if (SUPPORTS_GLASS) setNativeDraft('');
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
    const category = categories.find(cat => cat.id === sub.cat);
    if (category && !sessionRepo.canEdit(category.createdByUserId, category.ledgerId)) {
      showNotice(`${lockedOwnerName(category.createdByUserId)} has locked edits for this category.`);
      return;
    }
    const rowKey = bKey(gKey, label);
    if (!canEditBudgetKey(rowKey)) {
      showNotice('This budget is locked by its owner.');
      return;
    }
	    saveSnapshot();
	    setRemovedSubs(prev => new Set([...prev, rowKey]));
	    setBudgets(b => { const n = { ...b }; delete n[rowKey]; return n; });
	    showUndo(`Removed ${label}`, () => {
	      if (category) categoriesRepo.update(category.id, { archived: true, updatedByUserId: 'local' });
	    });
	  };

	  const removeBill = (bill: Bill) => {
	    const ruleId = typeof bill.meta?.recurringRuleId === 'string' ? bill.meta.recurringRuleId : ruleIdFromBillId(bill.id);
    const rule = recurringRules.find(item => item.id === ruleId);
    if (rule && !sessionRepo.canEdit(rule.createdByUserId, rule.ledgerId)) {
      showNotice(`${lockedOwnerName(rule.createdByUserId)} has locked edits for this bill.`);
      return;
    }
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
    goalTarget?: number,
    goalSaved?: number,
    goalDeadline?: string,
  ): boolean => {
    const origGroup = visibleSpendGroups.find(g => g.key === gKey);
    // Exclude rows the user just deleted (pending the undo window) so the name
    // they removed is immediately reusable.
    const taken = new Set([
      ...(origGroup?.subs ?? [])
        .filter(s => !removedSubs.has(bKey(gKey, s.label)))
        .map(s => s.label.toLowerCase()),
      ...(customSubs[gKey] ?? []).map(s => s.label.toLowerCase()),
    ]);
    if (taken.has(label.toLowerCase())) {
      setDuplicateNameError(true);
      setCategoryFormError('A category with this name already exists');
      return false;
    }
    const icon = iconOverride ?? inferCategoryIcon(label);
    const catMeta: Record<string, unknown> = { custom: true };
    if (goalTarget && goalTarget > 0) {
      const startingBalance = Math.max(0, goalSaved ?? 0);
      catMeta.goalTarget = goalTarget;
      catMeta.goalStartingBalance = startingBalance;
      catMeta.goalSaved = goalSavedFromParts(goalTarget, startingBalance, []);
      catMeta.goalMonthlyContribution = budget && budget > 0 ? budget : undefined;
      catMeta.goalContributions = [];
      catMeta.goalStatus = startingBalance >= goalTarget ? 'completed' : 'active';
      if (startingBalance >= goalTarget) catMeta.goalCompletedAt = new Date().toISOString().slice(0, 10);
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
    const goal = goalFromCategory(category);
    setCategoryGoalTarget(goal ? String(goal.target) : '');
    setCategoryGoalSaved(goal ? String(goal.saved) : '');
    setCategoryGoalDeadline(goal?.deadline ?? (typeof meta.goalDeadline === 'string' ? meta.goalDeadline : ''));
    const amt = budgets[bKey(category.group, category.label)] ?? category.defaultBudget ?? 0;
    setCategoryBudgetDraft(amt > 0 ? String(amt) : '');
    setCategoryNotes(typeof meta.notes === 'string' ? meta.notes : '');
    setCategoryGroupDraft(category.group);
    setDuplicateNameError(false);
    setCategoryFormError('');
  };

  useEffect(() => {
    if (!pendingEditCategoryId) return;
    openCategoryEditor(pendingEditCategoryId);
    onPendingEditHandled?.();
  }, [pendingEditCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeCategoryEditor = () => {
    setEditingCategory(null);
    setCategoryLabelDraft('');
    setCategoryIconDraft('tag');
    setCategoryGroupDraft('needs');
    setCategoryGoalTarget('');
    setCategoryGoalSaved('');
    setCategoryGoalDeadline('');
    setCategoryBudgetDraft('');
    setCategoryNotes('');
    setDuplicateNameError(false);
    setCategoryFormError('');
  };

	  const saveCategoryEdit = (): boolean => {
	    if (!editingCategory) return false;
    if (!canEditCategoryId(editingCategory.id)) {
      showNotice(`${lockedOwnerName(editingCategory.createdByUserId)} has locked edits for this category.`);
      return false;
    }
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
    const budgetValue = parseAmountDraft(categoryBudgetDraft);
    const nextDefaultBudget = budgetValue !== null
      ? budgetValue
      : budgets[bKey(editingCategory.group, editingCategory.label)] ?? editingCategory.defaultBudget;
    const nextMeta: Record<string, unknown> = { ...(editingCategory.meta ?? {}) };
    if (categoryGroupDraft === 'savings' && goalTarget && goalTarget > 0) {
      const existingGoal = goalFromCategory(editingCategory);
      const contributions = existingGoal?.contributions ?? [];
      const saved = goalSaved && goalSaved > 0 ? goalSaved : 0;
      const startingBalance = Math.max(0, saved - contributionTotal(contributions));
      const nextSaved = goalSavedFromParts(goalTarget, startingBalance, contributions);
      nextMeta.goalTarget = goalTarget;
      nextMeta.goalStartingBalance = startingBalance;
      nextMeta.goalSaved = nextSaved;
      nextMeta.goalMonthlyContribution = nextDefaultBudget > 0 ? nextDefaultBudget : undefined;
      nextMeta.goalContributions = contributions;
      nextMeta.goalStatus = nextSaved >= goalTarget ? 'completed' : 'active';
      if (nextSaved >= goalTarget) {
        nextMeta.goalCompletedAt = typeof nextMeta.goalCompletedAt === 'string'
          ? nextMeta.goalCompletedAt
          : new Date().toISOString().slice(0, 10);
      } else {
        delete nextMeta.goalCompletedAt;
      }
      if (categoryGoalDeadline.trim()) {
        nextMeta.goalDeadline = categoryGoalDeadline.trim();
      } else {
        delete nextMeta.goalDeadline;
      }
    } else {
      delete nextMeta.goalTarget;
      delete nextMeta.goalSaved;
      delete nextMeta.goalStartingBalance;
      delete nextMeta.goalDeadline;
      delete nextMeta.goalMonthlyContribution;
      delete nextMeta.goalContributions;
      delete nextMeta.goalStatus;
      delete nextMeta.goalCompletedAt;
    }
    if (categoryNotes.trim()) {
      nextMeta.notes = categoryNotes.trim();
    } else {
      delete nextMeta.notes;
    }
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
	      .forEach(b => {
        if (!sessionRepo.canEdit(b.createdByUserId, b.ledgerId)) return;
        budgetsRepo.update(b.id, {
          group: actualGroup,
          category: editingCategory.id,
          label,
          icon: categoryIconDraft,
        });
      });
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
    return true;
  };

  const deleteEditingCategory = () => {
    if (!editingCategory) return;
    removeSub(editingCategory.group, { cat: editingCategory.id, label: editingCategory.label });
    closeCategoryEditor();
  };
  const canEditEditingCategory = !editingCategory || canEditCategoryId(editingCategory.id);

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
        .reduce((s, bill) => s + (budgets[billKey(g.key, bill.id)] ?? bill.fullAmount), 0);
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

  const barMax          = Math.max(totalBudgeted, income);
  const needsFrac       = barMax > 0 ? needsTotal   / barMax : 0;
  const wantsFrac       = barMax > 0 ? wantsTotal   / barMax : 0;
  const savingsFrac     = barMax > 0 ? savingsTotal / barMax : 0;
  // Positions of the 50/30/20 target boundaries on the bar (relative to barMax).
  const targetNeedsFrac = barMax > 0 ? (income * 0.5) / barMax : 0.5;
  const targetWantsFrac = barMax > 0 ? (income * 0.8) / barMax : 0.8;
  const isPastMonth     = selectedMonth < currentMonthKey();

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

  // Inline in allocationBarBody — legendItems removed after distillation.

  // Shared allocation-card body — reused by the RN fallback path. The iOS 26
  // path renders an equivalent native Liquid Glass bar.
  // Only the bar + legend animates — the income button lives in its own card below.
  const allocationBarBody = useMemo(() => {
    // One compliance signal per group: pct colored by on-track vs over/short.
    // Dollar amounts live in the group headers below — no need to repeat them here.
    const groups = [
      { key: 'Needs',   dot: needsCol,   pct: _needsPct,   pctColor: _needsPct   > 50 ? OVER_DOT : p.text },
      { key: 'Wants',   dot: wantsCol,   pct: _wantsPct,   pctColor: _wantsPct   > 30 ? OVER_DOT : p.text },
      { key: 'Savings', dot: savingsCol, pct: _savingsPct, pctColor: _savingsPct >= 20 ? savingsCol : p.text },
    ];
    return (
      <>
        <AllocationBar
          needsFrac={needsFrac} wantsFrac={wantsFrac} savingsFrac={savingsFrac}
          trackBg={p.trackBg} needsCol={needsCol} wantsCol={wantsCol} savingsCol={savingsCol}
          height={7}
          tickFracs={[targetNeedsFrac, targetWantsFrac]}
          accessibilityLabel={`Budget allocation: Needs ${_needsPct}%, Wants ${_wantsPct}%, Savings ${_savingsPct}%`}
        />
        <View style={styles.compactLegend}>
          {groups.map(item => (
            <View key={item.key} style={styles.compactLegendItem}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.dot }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TYPE.label, { color: p.textSec }]}>{item.key}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TYPE.bodySmEm, { color: item.pctColor }]}>{item.pct}%</Text>
            </View>
          ))}
        </View>
      </>
    );
  }, [needsFrac, wantsFrac, savingsFrac, targetNeedsFrac, targetWantsFrac, _needsPct, _wantsPct, _savingsPct, p.trackBg, p.text, p.textSec, needsCol, wantsCol, savingsCol, isOver, remaining]);

  const incomeBtnRef = useRef<View>(null);
  const billSheetRef = useRef<BillSheetHandle>(null);

  const stickyBorderColor = theme.dark ? MEDIA.hairline : ONMEDIA_BORDER_LIGHT;
  const renderAllocationCard = () => (
    SUPPORTS_GLASS ? (
      <NativeBudgetAllocationCard
        theme={theme}
        p={p}
        needsFrac={needsFrac}
        wantsFrac={wantsFrac}
        savingsFrac={savingsFrac}
        needsPct={_needsPct}
        wantsPct={_wantsPct}
        savingsPct={_savingsPct}
        needsCol={needsCol}
        wantsCol={wantsCol}
        savingsCol={savingsCol}
      />
    ) : (
      <SectionCard dark={theme.dark}>
        {allocationBarBody}
      </SectionCard>
    )
  );

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
          >
            {SUPPORTS_GLASS ? (
              <GlassCircleButton
                onPress={onOpenDrawer}
                systemImage="line.3.horizontal"
                size={40}
                iconSize={18}
                iconColor={theme.dark ? MEDIA.text : '#0E0C18'}
                glassTint={glassTintForTheme(theme.dark)}
                colorScheme={theme.dark ? 'dark' : 'light'}
                accessibilityLabel="Open menu"
              />
            ) : (
              <IconBtn onPress={onOpenDrawer}>
                <Icon name="menu" size={22} color={pWallpaper.text} stroke={1.7} />
              </IconBtn>
            )}
            <View style={styles.headerTitle} pointerEvents="none">
              <Text style={[styles.headerTitleText, { color: pWallpaper.text }]}>Budget</Text>
              <Animated.Text style={[styles.headerTitleText, StyleSheet.absoluteFill, { color: theme.text, opacity: iconScrolledOpacity }]}>Budget</Animated.Text>
            </View>
            <ThemeToggle />
          </View>

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
              onLayout={e => {
                sectionStackYRef.current = e.nativeEvent.layout.y;
                updateAllocStickyY();
              }}
            >
              {/* Budget hero — open on the wallpaper, rhymes with Home */}
              <View
                style={styles.hero}
              >
                {isPastMonth && (
                  <View style={[styles.pastMonthBanner, { backgroundColor: 'rgba(8,6,20,0.32)', borderColor: pWallpaper.hairline }]}>
                    <Text style={[TYPE.caption, { color: pWallpaper.textSec }]} numberOfLines={1}>
                      Viewing {monthLabel(selectedMonth)}, editing historical data
                    </Text>
                  </View>
                )}
                <View style={styles.heroTopRow}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => { if (incomeBtnRef.current) onOpenIncome?.(incomeBtnRef.current); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Income $${fmtMoney(income)}, assigned $${fmtMoney(totalBudgeted)}. Edit income`}
                  >
                    <View ref={incomeBtnRef} collapsable={false} style={styles.heroStatusRow}>
                      <View style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.35)', flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={[TYPE.onMediaStatus, { color: pWallpaper.text }, shadow]}>${fmtMoney(income)}</Text>
                        <Text style={[TYPE.onMediaStatusSub, { color: pWallpaper.textSec }, shadow]}> Income</Text>
                      </View>
                      <Text style={[TYPE.onMediaStatusSub, { color: pWallpaper.textSec }, shadow]}> · </Text>
                      <Text style={[TYPE.onMediaStatus, { color: isOver ? OVER_DOT : pWallpaper.text }, shadow]}>${fmtMoney(totalBudgeted)}</Text>
                      <Text style={[TYPE.onMediaStatusSub, { color: isOver ? OVER_DOT : pWallpaper.textSec }, shadow]}> Assigned</Text>
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

              {/* Allocation bar card — pins at the top once scrolled past */}
              <Animated.View
                onLayout={e => {
                  allocCardYRef.current = e.nativeEvent.layout.y;
                  updateAllocStickyY();
                }}
                style={[
                  styles.allocationStickyCard,
                  { transform: [{ translateY: allocationStickyTranslateY }] },
                ]}
              >
                {renderAllocationCard()}
              </Animated.View>

              {/* Copy-from-previous-month prompt — shown when current month has no budgets */}
              {showCopyPrompt && (
                <View style={[styles.copyPromptCard, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>No budgets for {monthLabel(selectedMonth)}</Text>
                    <Text style={[TYPE.bodySm, { color: p.textSec }]} numberOfLines={1}>Copy allocations from {monthLabel(prevMonthKey)}?</Text>
                  </View>
                  <Pressable
                    onPress={copyFromPreviousMonth}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy budgets from ${monthLabel(prevMonthKey)}`}
                    style={[styles.copyPromptBtn, { backgroundColor: theme.accent.fill }]}
                  >
                    <Text style={[TYPE.bodySmEm, { color: theme.accent.ink }]}>Copy</Text>
                  </Pressable>
                </View>
              )}

              {/* 50/30/20 framework card — shown once on first visit */}
              {!metaFlag('frameworkCardDismissed') && (
                <FrameworkCard
                  theme={theme}
                  onDismiss={() => setMetaFlag('frameworkCardDismissed')}
                />
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
                const hasRecurringSection = groupBills.length > 0;
                const isCollapsed = collapsedGroups.has(g.key);
                const beginAddCategory = () => {
                  setAddingForGroup(g.key);
                  setCategoryGroupDraft(g.key as GroupKey);
                  setCategoryLabelDraft('');
                  setCategoryIconDraft('tag');
                  setCategoryGoalTarget('');
                  setCategoryGoalSaved('');
                  setCategoryBudgetDraft('');
                  setCategoryGoalDeadline('');
                  setCategoryNotes('');
                  setDuplicateNameError(false);
                  setCategoryFormError('');
                };

                if (SUPPORTS_GLASS) {
                  const nativeRows: NativeBudgetRowItem[] = [
                    ...visibleOrigSubs.map(sub => {
                      const rowKey = bKey(g.key, sub.label);
                      const subCat = categories.find(c => c.id === sub.cat);
                      const subGoal = subCat ? goalFromCategory(subCat) : null;
                      const subGoalPct = subGoal ? goalProgressPct(subGoal) : 0;
                      const subGoalStatus = subGoal ? statusFor(subGoal) : null;
                      const subGoalStatusColor = subGoalStatus?.tone === 'caution'
                        ? (theme.dark ? cautionText(true) : OVER_DOT)
                        : subGoalStatus?.tone === 'good'
                          ? groupColor
                          : p.textTer;
                      const subBudget = budgets[rowKey] ?? sub.budget;
                      const canEditRow = canEditBudgetKey(rowKey) && canEditCategoryId(sub.cat);
                      return {
                        id: sub.cat,
                        kind: 'category' as const,
                        label: sub.label,
                        icon: ICON_SF_SYMBOL[sub.icon] ?? BUDGET_FALLBACK_SYMBOL,
                        color: groupColor,
                        amount: subBudget,
                        editable: canEditRow,
                        active: editingKey === rowKey,
                        draft: editingKey === rowKey ? nativeDraft : '',
                        goal: subGoal
                          ? {
                              pct: subGoalPct,
                              status: subGoalStatus?.label ?? 'Goal',
                              statusColor: subGoalStatusColor,
                              remaining: goalRemaining(subGoal),
                            }
                          : undefined,
                        accessibilityLabel: `Edit ${sub.label} category`,
                        accessibilityHint: canEditRow ? 'Swipe left to delete' : undefined,
                        onOpen: () => openCategoryEditor(sub.cat),
                        onEditAmount: () => startAmountEdit(rowKey, subBudget),
                        onDelete: canEditRow ? () => handleRemoveSub(g.key, sub) : undefined,
                      };
                    }),
                    ...customs.map(sub => {
                      const rowKey = bKey(g.key, sub.label);
                      const customCat = categories.find(c => c.group === (g.key as GroupKey) && c.label.toLowerCase() === sub.label.toLowerCase());
                      const spendSub = visibleSpendGroups.find(group => group.key === g.key)?.subs.find(item => item.label.toLowerCase() === sub.label.toLowerCase());
                      const subBudget = budgets[rowKey] ?? spendSub?.budget ?? 0;
                      const canEditRow = canEditBudgetKey(rowKey) && (!customCat || canEditCategoryId(customCat.id));
                      return {
                        id: `custom-${g.key}-${sub.label}`,
                        kind: 'custom' as const,
                        label: sub.label,
                        icon: ICON_SF_SYMBOL[customCat?.icon ?? 'tag'] ?? BUDGET_FALLBACK_SYMBOL,
                        color: groupColor,
                        amount: subBudget,
                        editable: canEditRow,
                        active: editingKey === rowKey,
                        draft: editingKey === rowKey ? nativeDraft : '',
                        accessibilityLabel: `Edit ${sub.label} category`,
                        accessibilityHint: canEditRow ? 'Swipe left to delete' : undefined,
                        onOpen: customCat ? () => openCategoryEditor(customCat.id) : undefined,
                        onEditAmount: () => startAmountEdit(rowKey, subBudget),
                        onDelete: canEditRow ? () => handleRemoveSub(g.key, { cat: slugify(sub.label), label: sub.label }) : undefined,
                      };
                    }),
                    ...groupBills.map(bill => {
                      const rowKey = billKey(g.key, bill.id);
                      const canEditRow = canEditBudgetKey(rowKey);
                      return {
                        id: bill.id,
                        kind: 'bill' as const,
                        label: bill.name,
                        meta: bill.dueDate,
                        icon: ICON_SF_SYMBOL[bill.icon] ?? ICON_SF_SYMBOL.repeat ?? BUDGET_FALLBACK_SYMBOL,
                        color: categoryGroupColor(bill.cat, categories, theme.dark),
                        amount: budgets[rowKey] ?? bill.fullAmount,
                        editable: canEditRow,
                        active: editingKey === rowKey,
                        draft: editingKey === rowKey ? nativeDraft : '',
                        accessibilityLabel: `Edit ${bill.name}`,
                        accessibilityHint: canEditRow ? 'Swipe left to delete' : undefined,
                        onOpen: () => billSheetRef.current?.open(bill),
                        onEditAmount: () => startAmountEdit(rowKey, budgets[rowKey] ?? bill.fullAmount),
                        onDelete: canEditRow ? () => handleRemoveBill(bill) : undefined,
                      };
                    }),
                  ];
                  return (
                    <NativeBudgetGroupCard
                      key={g.key}
                      theme={theme}
                      p={p}
                      label={g.label}
                      color={groupColor}
                      icon={ICON_SF_SYMBOL[GROUP_META[g.key as GroupKey]?.icon ?? 'tag'] ?? BUDGET_FALLBACK_SYMBOL}
                      total={groupTotal}
                      target={groupTarget}
                      targetPct={g.targetPct}
                      delta={groupDelta}
                      isOverTarget={g.key === 'savings' ? false : groupIsOver}
                      open={!isCollapsed}
                      rows={nativeRows}
                      onToggle={() => toggleGroupCollapsed(g.key)}
                      onAddCategory={beginAddCategory}
                    />
                  );
                }

	                return (
	                  <SectionCard key={g.key} dark={theme.dark}>
	                    <TouchableOpacity
	                      onPress={() => toggleGroupCollapsed(g.key)}
	                      activeOpacity={0.7}
	                      delayPressIn={0}
	                      accessibilityRole="button"
	                      accessibilityState={{ expanded: !isCollapsed }}
	                      accessibilityLabel={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.label} budget group`}
	                      style={styles.cardHead}
	                    >
	                      <View style={{ flex: 1, minWidth: 0 }}>
	                        <View style={styles.groupTitleRow}>
	                          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: groupColor }} />
	                          <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: p.text }]}>{g.label}</Text>
	                        </View>
	                        <Text style={[TYPE.caption, { color: groupIsOver ? (g.key === 'savings' ? savingsCol : OVER_DOT) : p.textSec }]}>
	                          {groupIsOver ? `\$${fmtMoney(groupDelta)} over target of ${fmtPct(g.targetPct)}` : `\$${fmtMoney(groupTarget)} target · ${fmtPct(g.targetPct)}`}
	                        </Text>
	                      </View>
	                      <View style={styles.groupHeadAmount}>
	                        <Text style={[TYPE.subsectionTitle, { color: groupColor }]}>${groupTotal.toLocaleString()}</Text>
	                        <RotatingChevron open={!isCollapsed} color={p.textTer} />
	                      </View>
	                    </TouchableOpacity>

	                    <Collapsible open={!isCollapsed}>
	                    <View>
	                    {visibleOrigSubs.map((sub, si) => {
                      const isLast = si === visibleOrigSubs.length - 1 && customs.length === 0 && !hasRecurringSection;
	                      const rowKey = bKey(g.key, sub.label);
                      const isRemoving = pendingRemoveKeys.has(rowKey);
	                      const subCat = categories.find(c => c.id === sub.cat);
	                      const subGoal = subCat ? goalFromCategory(subCat) : null;
	                      const subGoalPct = subGoal ? goalProgressPct(subGoal) : 0;
	                      const subGoalStatus = subGoal ? statusFor(subGoal) : null;
	                      const subGoalStatusColor = subGoalStatus?.tone === 'caution'
                          ? (theme.dark ? cautionText(true) : OVER_DOT)
                          : subGoalStatus?.tone === 'good'
                            ? groupColor
                            : p.textTer;
	                      const subBudget = budgets[rowKey] ?? sub.budget;
                      const canEditRow = canEditBudgetKey(rowKey) && canEditCategoryId(sub.cat);
	                      return (
	                        <CollapsingRow key={sub.cat} removing={isRemoving}>
	                          <SwipeRow onRemove={canEditRow ? () => handleRemoveSub(g.key, sub) : undefined} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
	                            <TouchableOpacity
	                              onPress={() => openCategoryEditor(sub.cat)}
                              activeOpacity={0.7}
                              delayPressIn={0}
                              style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
	                              accessibilityRole="button"
	                              accessibilityLabel={`Edit ${sub.label} category`}
	                              accessibilityHint={canEditRow ? 'Swipe left to delete' : undefined}
	                              accessibilityActions={canEditRow ? [{ name: 'delete', label: 'Delete' }] : undefined}
	                              onAccessibilityAction={canEditRow ? (event) => { if (event.nativeEvent.actionName === 'delete') handleRemoveSub(g.key, sub); } : undefined}
                            >
                              <View style={[styles.rowIcon, { backgroundColor: `${groupColor}26` }]}>
                                <Icon name={sub.icon} size={15} color={groupColor} stroke={1.6} />
                              </View>
	                              <View style={{ flex: 1, minWidth: 0 }}>
	                                <Text style={[TYPE.body, { color: p.text }]} numberOfLines={1}>{sub.label}</Text>
	                                {subGoal && (
                                  <>
                                    <View style={[styles.subGoalTrack, { backgroundColor: p.hairline, marginTop: 5, width: '100%' }]}>
                                      <View style={{ height: '100%', borderRadius: 2, width: `${subGoalPct}%`, backgroundColor: groupColor }} />
                                    </View>
                                    <Text style={[TYPE.caption, { color: p.textSec, marginTop: 3 }]}>
                                      <Text style={{ color: subGoalStatusColor }}>
                                        {subGoalStatus?.label}
                                      </Text>
                                      {' · '}{subGoalPct}% · ${goalRemaining(subGoal).toLocaleString()} to go
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
                                  disabled={!canEditRow}
	                              />
                            </TouchableOpacity>
                          </SwipeRow>
                        </CollapsingRow>
                      );
                    })}

	                    {customs.map((sub, ci) => {
                      const isLast = ci === customs.length - 1 && !hasRecurringSection;
	                      const rowKey = bKey(g.key, sub.label);
	                      const isRemoving = pendingRemoveKeys.has(rowKey);
	                      const customCat = categories.find(c => c.group === (g.key as GroupKey) && c.label.toLowerCase() === sub.label.toLowerCase());
	                      const spendSub = visibleSpendGroups.find(group => group.key === g.key)?.subs.find(item => item.label.toLowerCase() === sub.label.toLowerCase());
	                      const subBudget = budgets[rowKey] ?? spendSub?.budget ?? 0;
                      const canEditRow = canEditBudgetKey(rowKey) && (!customCat || canEditCategoryId(customCat.id));
	                      return (
	                        <CollapsingRow key={sub.label} removing={isRemoving}>
	                          <SwipeRow onRemove={canEditRow ? () => handleRemoveSub(g.key, { cat: slugify(sub.label), label: sub.label }) : undefined} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                            <TouchableOpacity
                              onPress={() => customCat && openCategoryEditor(customCat.id)}
                              activeOpacity={customCat ? 0.7 : 1}
                              delayPressIn={0}
                              style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
	                              accessibilityRole="button"
	                              accessibilityLabel={`Edit ${sub.label} category`}
	                              accessibilityHint={canEditRow ? 'Swipe left to delete' : undefined}
	                              accessibilityActions={canEditRow ? [{ name: 'delete', label: 'Delete' }] : undefined}
	                              onAccessibilityAction={canEditRow ? (event) => { if (event.nativeEvent.actionName === 'delete') handleRemoveSub(g.key, { cat: slugify(sub.label), label: sub.label }); } : undefined}
                            >
                              <View style={[styles.rowIcon, { backgroundColor: groupColor + '26' }]}>
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
                                  disabled={!canEditRow}
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
                        {groupBills.map((bill, bi) => {
	                          const isLast = bi === groupBills.length - 1;
	                          const isBillRemoving = pendingRemoveKeys.has(bill.id);
                          const rowKey = billKey(g.key, bill.id);
                          const canEditRow = canEditBudgetKey(rowKey);
	                          return (
	                            <CollapsingRow key={bill.id} removing={isBillRemoving}>
	                            <SwipeRow onRemove={canEditRow ? () => handleRemoveBill(bill) : undefined} onOpen={handleSwipeOpen} onClose={handleSwipeClose} scrollRef={scrollViewRef} tapRef={outerTapRef}>
                              <TouchableOpacity
                                onPress={() => billSheetRef.current?.open(bill)}
                                activeOpacity={0.7}
                                delayPressIn={0}
                                style={[styles.editRow, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
	                                accessibilityRole="button"
	                                accessibilityLabel={`Edit ${bill.name}`}
	                                accessibilityHint={canEditRow ? 'Swipe left to delete' : undefined}
	                                accessibilityActions={canEditRow ? [{ name: 'delete', label: 'Delete' }] : undefined}
	                                onAccessibilityAction={canEditRow ? (event) => { if (event.nativeEvent.actionName === 'delete') handleRemoveBill(bill); } : undefined}
                              >
                                <MerchantMark
                                  merchant={bill.merchant}
                                  catIcon={bill.icon}
                                  color={categoryGroupColor(bill.cat, categories, theme.dark)}
                                  size={32}
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={[TYPE.body, { color: p.text }]}>{bill.name}</Text>
                                  <Text style={[TYPE.caption, { color: p.textSec, marginTop: 1 }]}>{bill.dueDate}</Text>
                                </View>
                                <EditableBudgetAmount
	                                  value={budgets[rowKey] ?? bill.fullAmount}
	                                  active={editingKey === rowKey}
                                  color={p.textSec}
                                  accentColor={theme.accent.dot}
                                  underlineColor={p.hairline}
	                                  onStartEdit={() => startAmountEdit(rowKey, budgets[rowKey] ?? bill.fullAmount)}
	                                  onMeasured={scrollEditIntoView}
	                                  accessibilityLabel={`Edit ${bill.name} budget`}
                                    disabled={!canEditRow}
	                                />
                              </TouchableOpacity>
                            </SwipeRow>
                            </CollapsingRow>
                          );
                        })}
                      </>
	                    )}

	                    </View>
	                    </Collapsible>

                    <TouchableOpacity
                      onPress={beginAddCategory}
                      activeOpacity={0.7}
                      style={[styles.addCatBtn, { borderTopWidth: !isCollapsed && (visibleOrigSubs.length + customs.length + groupBills.length) > 0 ? 1 : 0, borderTopColor: p.hairline }]}
                    >
                      <Icon name="plus" size={13} color={theme.accent.dot} stroke={2} />
                      <Text style={[TYPE.captionEm, { color: theme.accent.dot }]}>Add category</Text>
                    </TouchableOpacity>
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
                style={{ borderRadius: RADIUS.field, overflow: 'hidden' }}
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

      <BillSheetMount ref={billSheetRef} />

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
        goalDeadline={categoryGoalDeadline}
        nameError={duplicateNameError}
        formError={categoryFormError}
        canEdit={canEditEditingCategory}
        notes={categoryNotes}
        onLabelChange={(v) => { setCategoryLabelDraft(v); if (duplicateNameError) setDuplicateNameError(false); if (categoryFormError) setCategoryFormError(''); }}
        onIconChange={setCategoryIconDraft}
        onGroupChange={setCategoryGroupDraft}
        onGoalTargetChange={setCategoryGoalTarget}
        onGoalSavedChange={setCategoryGoalSaved}
        onBudgetChange={setCategoryBudgetDraft}
        onGoalDeadlineChange={setCategoryGoalDeadline}
        onNotesChange={(v) => { setCategoryNotes(v); if (categoryFormError) setCategoryFormError(''); }}
        onClose={() => { closeCategoryEditor(); setAddingForGroup(null); }}
        onSave={saveCategoryEdit}
        onDelete={deleteEditingCategory}
        onAddNew={(lbl, icn, grp, bgt, gt, gs, gd) => {
          return addSub(grp, lbl, icn, bgt, gt, gs, gd);
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
          <Text style={{ opacity: 0.55 }}>$</Text>{draft ? formatDraft(draft) : ''}
        </Text>
        <EditCaret color={accentColor} />
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={onActivate} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 12, right: 6 }}>
      <View style={[styles.catBudgetWrap, { borderBottomColor: underlineColor }]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.catBudgetText, { color: isPlaceholder ? underlineColor : color }]}>
          {isPlaceholder ? placeholder : <><Text style={{ opacity: 0.55 }}>$</Text>{fmtAmt(isNaN(num) ? 0 : num)}</>}
        </Text>
        <View style={styles.catBudgetCaretSpacer} />
      </View>
    </TouchableOpacity>
  );
}

function CategoryEditSheet({
  theme, category, addingForGroup, label, icon, group, goalTarget, goalSaved,
  budget, goalDeadline, nameError, formError, canEdit, notes,
  onLabelChange, onIconChange, onGroupChange, onGoalTargetChange, onGoalSavedChange,
  onBudgetChange, onGoalDeadlineChange, onNotesChange,
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
  goalDeadline: string;
  nameError: boolean;
  formError: string;
  canEdit: boolean;
  notes: string;
  onLabelChange: (v: string) => void;
  onIconChange: (v: string) => void;
  onGroupChange: (v: GroupKey) => void;
  onGoalTargetChange: (v: string) => void;
  onGoalSavedChange: (v: string) => void;
  onBudgetChange: (v: string) => void;
  onGoalDeadlineChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onClose: () => void;
  onSave: () => boolean;
  onDelete: () => void;
  onAddNew: (label: string, icon: string, group: GroupKey, budget?: number, goalTarget?: number, goalSaved?: number, goalDeadline?: string) => boolean;
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
  const deadlineAutoFilled = useRef(false);
  const deadlineDateRef = useRef<Date | null>(null);
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
      deadlineAutoFilled.current = false;
      const parsed = parseDeadline(goalDeadline);
      deadlineDateRef.current = parsed;
      setBudgetDisplay(budget ? `$${budget}` : '');
      setGoalTargetDisplay(goalTarget ? `$${goalTarget}` : '');
      setGoalSavedDisplay(goalSaved ? `$${goalSaved}` : '');
      setDeadlineDate(parsed);
      setActiveNumField(null);
      sheetScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [category, addingForGroup]);

  useEffect(() => {
    if (!showGoalFields) return;
    const target = parseAmountDraft(goalTargetDisplay) ?? 0;
    const saved = parseAmountDraft(goalSavedDisplay) ?? 0;
    const budg = parseAmountDraft(budgetDisplay) ?? 0;
    if (target > 0 && budg > 0 && (deadlineAutoFilled.current || !deadlineDateRef.current)) {
      const remaining = Math.max(0, target - saved);
      const months = Math.ceil(remaining / budg);
      const now = new Date();
      const projected = new Date(now.getFullYear(), now.getMonth() + months, 1);
      deadlineDateRef.current = projected;
      deadlineAutoFilled.current = true;
      setDeadlineDate(projected);
      onGoalDeadlineChange(projected.toISOString().slice(0, 10));
    } else if (deadlineAutoFilled.current && (target <= 0 || budg <= 0)) {
      deadlineDateRef.current = null;
      deadlineAutoFilled.current = false;
      setDeadlineDate(null);
      onGoalDeadlineChange('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalTargetDisplay, goalSavedDisplay, budgetDisplay]);

  useEffect(() => {
    // Close any open keypad and reset scroll when the group changes so content
    // always renders from the top regardless of prior scroll state.
    setActiveNumField(null);
    sheetScrollRef.current?.scrollTo({ y: 0, animated: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

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
  const labelRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
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
    const n = Number(raw);
    // Cash-register keypad expects "X.XX" format. A bare integer like "900"
    // would be misread as 900¢ = $9.00 on the first key press.
    const initialDraft = Number.isFinite(n) && n > 0
      ? `${Math.floor(n)}.${String(Math.round((n % 1) * 100)).padStart(2, '0')}`
      : '0.00';
    setNumDraft(initialDraft);
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
    sheetScrollRef.current?.scrollTo({ y: 0, animated: false });
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
  // Savings group adds ~200pt of content (section header + 3 goal rows + preview).
  // Use the bare minimum top padding so everything stays on screen without scrolling.
  const sheetTopPadding = compactSheet
    ? showGoalFields
      ? 24
      : Math.max(insets.top, 10) + 8
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
      snapPoints={['85%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
      keyboardBehavior={"none" as any}
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
          style={[EXIT_FLOAT_STYLE, { zIndex: 25 }]}
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
                : 16,
            },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={activeNumField !== null}
          onScroll={e => { sheetScrollY.current = e.nativeEvent.contentOffset.y; }}
          onScrollBeginDrag={() => { if (activeNumField) closeNumKeypad(); }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={false}
        >
          {/* Hero — tap circle to open native popup menu */}
          <View style={[styles.catHero, compactSheet && styles.catHeroCompact]}>
	            <Host ignoreSafeArea="all" style={{ width: 52, height: 52 }} pointerEvents={canEdit ? 'auto' : 'none'}>
              <Menu
                label={
                  <View
                    style={{ width: 52, height: 52 }}
                    accessibilityRole="button"
                    accessibilityLabel="Choose category icon"
                  >
                    <View style={[styles.catHeroCircle, { backgroundColor: groupIconBg }]}>
                      <Icon name={icon} size={22} color={ON_GROUP_ICON} stroke={1.5} />
                    </View>
                    <View style={[styles.iconPickerBadge, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                      <Icon name="chevDown" size={7} color={theme.dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'} stroke={2.4} />
                    </View>
                  </View>
                }
              >
                {CATEGORY_ICON_OPTIONS.map(opt => (
                  <SwiftButton
                    key={opt}
                    systemImage={opt === icon ? 'checkmark' : (ICON_SF_SYMBOL[opt] ?? 'tag') as any}
	                    onPress={() => {
                      if (!canEdit) return;
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
              if (!canEdit) return;
	              const opt = GROUP_OPTIONS[e.nativeEvent.selectedSegmentIndex];
              if (opt) onGroupChange(opt.value);
            }}
            tintColor={theme.accent.dot}
            appearance={theme.dark ? 'dark' : 'light'}
            backgroundColor={theme.dark ? 'rgba(242,244,245,0.08)' : 'rgba(11,13,16,0.045)'}
            fontStyle={{ color: theme.dark ? 'rgba(242,244,245,0.68)' : 'rgba(11,13,16,0.62)' }}
            activeFontStyle={{ color: theme.accent.ink, fontWeight: '600' }}
            accessibilityLabel="Budget group"
            style={[styles.catGroupSegmented, compactSheet && styles.catGroupSegmentedCompact]}
          />

          {/* Primary field card: Name, Budget, Notes */}
	          <View pointerEvents={canEdit ? 'auto' : 'none'} style={[styles.catFieldCard, !canEdit && styles.lockedFields, { backgroundColor: theme.chipBg, marginTop: compactSheet ? 8 : 12 }]}>
            <Pressable
              disabled={!canEdit}
              onPress={() => { if (activeNumField) closeNumKeypad(); labelRef.current?.focus(); }}
              style={[fieldRowStyle, sep]}
            >
              <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Name</Text>
              <TextInput
                ref={labelRef}
                value={label}
                editable={canEdit}
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
            </Pressable>
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
	                onActivate={() => { if (canEdit) activateNumField('budget', budgetDisplay); }}
              />
            </View>
            <Pressable
              disabled={!canEdit}
              onPress={() => { if (activeNumField) closeNumKeypad(); notesRef.current?.focus(); }}
              style={fieldRowStyle}
            >
              <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Notes</Text>
              <TextInput
                ref={notesRef}
                value={notes}
                editable={canEdit}
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
            </Pressable>
          </View>
          {showCategoryError && (
            <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: 8 }]}>
              {categoryValidationError}
            </Text>
          )}

          {/* Goal fields */}
          {showGoalFields && (
            <>
              <Text style={[TYPE.labelLg, { color: theme.textTer, marginTop: compactSheet ? 20 : 24, marginBottom: compactSheet ? 10 : 12 }]}>
                SAVINGS GOAL
              </Text>
	              <View pointerEvents={canEdit ? 'auto' : 'none'} style={[styles.catFieldCard, !canEdit && styles.lockedFields, { backgroundColor: theme.chipBg }]}>
                <View ref={fieldRowRefs.target} style={[fieldRowStyle, sep, { minHeight: 50 }]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Goal amount</Text>
                  <SheetNumericField
                    displayValue={goalTargetDisplay}
                    draft={activeNumField === 'target' ? numDraft : ''}
                    active={activeNumField === 'target'}
                    placeholder="Optional"
                    color={theme.text}
                    accentColor={theme.accent.dot}
                    underlineColor={theme.hairline}
	                    onActivate={() => { if (canEdit) activateNumField('target', goalTargetDisplay); }}
                  />
                </View>
                <View ref={fieldRowRefs.saved} style={[fieldRowStyle, sep, { minHeight: 50 }]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Saved so far</Text>
                  <SheetNumericField
                    displayValue={goalSavedDisplay}
                    draft={activeNumField === 'saved' ? numDraft : ''}
                    active={activeNumField === 'saved'}
                    placeholder="Optional"
                    color={theme.text}
                    accentColor={theme.accent.dot}
                    underlineColor={theme.hairline}
	                    onActivate={() => { if (canEdit) activateNumField('saved', goalSavedDisplay); }}
                  />
                </View>
                {/* Target date — fixed-height row so the picker never shifts layout */}
                <View style={[fieldRowStyle, { height: 50 }]}>
                  <Text style={[styles.catFieldLabel, { color: theme.textSec }]}>Goal by</Text>
                  {deadlineDate ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Host ignoreSafeArea="all" style={styles.catDatePickerHost}>
                        <DatePicker
                          selection={deadlineDate}
	                          onDateChange={(d) => { if (!canEdit) return; deadlineAutoFilled.current = false; deadlineDateRef.current = d; setDeadlineDate(d); onGoalDeadlineChange(d.toISOString().slice(0, 10)); }}
                          displayedComponents={['date']}
                          modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' })]}
                        />
                      </Host>
	                      <Pressable onPress={() => { if (!canEdit) return; deadlineAutoFilled.current = false; deadlineDateRef.current = null; setDeadlineDate(null); onGoalDeadlineChange(''); }} pointerEvents="box-only" hitSlop={8} disabled={!canEdit}>
                        <Icon name="close" size={11} color={theme.textTer} stroke={2} />
                      </Pressable>
                    </View>
                  ) : (
	                    <Pressable onPress={() => { if (!canEdit) return; const d = new Date(); d.setFullYear(d.getFullYear() + 1); deadlineAutoFilled.current = false; deadlineDateRef.current = d; setDeadlineDate(d); onGoalDeadlineChange(d.toISOString().slice(0, 10)); }} pointerEvents="box-only" disabled={!canEdit}>
                      <Text style={[TYPE.bodySm, { color: theme.accent.dot }]}>Set date</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {rawGoalTarget > 0 && (
                <View style={[styles.categoryGoalPreview, { marginTop: compactSheet ? SPACE.lg : SPACE.xl }]}>
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

        </BottomSheetScrollView>

        {/* Fixed footer — in normal flow under the scroll container. The Name /
            Notes fields use a plain TextInput (not BottomSheetTextInput), so the
            iOS keyboard never registers with the sheet: it simply overlays, the
            sheet stays anchored, and this footer stays put under the container. */}
        <View style={[styles.catSheetFooter, { paddingBottom: sheetBottomPadding }]}>
	          <SheetPrimaryButton
	            label={isAddMode ? 'Add category' : 'Save category'}
	            onPress={handleSave}
	            theme={theme}
	            disabled={!canSaveCategory || !canEdit}
	          />
            {!isAddMode && !canEdit && (
              <Text style={[TYPE.caption, styles.lockedCategoryCopy, { color: theme.textSec }]}>
                This category is locked by its owner.
              </Text>
            )}
	          {!isAddMode && canEdit && (
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

        <PopupNumericKeypad
          visible={activeNumField !== null}
          theme={theme}
          borderColor={theme.hairline}
          onHeightChange={setSheetKbH}
          onKey={handleSheetKey}
          onDone={closeNumKeypad}
          zIndex={20}
          passthrough
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
    paddingHorizontal: LAYOUT.cardPadX,
    paddingBottom: LAYOUT.rowPadY,
  },
  headerTitle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitleText: { ...TYPE.pageTitle, textAlign: 'center' },
  hero: {
    paddingHorizontal: SPACE.xs,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  pastMonthBanner: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    paddingVertical: 5,
    marginBottom: SPACE.sm,
  },
  copyPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    paddingHorizontal: LAYOUT.cardPadX,
    paddingVertical: SPACE.lg,
    marginBottom: SPACE.md,
  },
  copyPromptBtn: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
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
    gap: 5, // off-grid optical — tight arrow+text pairing
    paddingVertical: SPACE.xs,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.px2,
  },
  heroMonthText: {
    ...TYPE.onMediaStatusSubMd,
  },
  sectionStack: {
    paddingHorizontal: LAYOUT.screenGutter,
    paddingTop: SPACE.md,
    paddingBottom: 0,
    gap: SPACE.lg,
  },
  allocationStickyCard: {
    zIndex: 5,
    elevation: 5,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACE.lg,
    marginBottom: SPACE.lg,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.xs,
  },
  groupHeadAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    flexShrink: 0,
  },
  compactLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACE.md,
    gap: SPACE.xl,
  },
  compactLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  incomeNativeSheet: {
    flex: 1,
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: 22, // slightly above xl — visual breathing room before the hero
    gap: SPACE.lg,
  },
  incomeHero: {
    alignItems: 'center',
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  incomeHeroCircle: {
    width: 52,
    height: 52,
    borderRadius: 26, // width/2 — circle
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeSegmented: {
    marginTop: 2,
  },
  incomeFeedback: {
    minHeight: 34,
    borderRadius: 17, // width/2 — pill shape
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7, // off-grid optical — tight icon+text pairing
  },
  incomeAmountInput: {
    minWidth: 60,
    textAlign: 'right',
  },
  undoToast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: LAYOUT.screenGutter,
    paddingVertical: LAYOUT.rowPadY,
    borderWidth: 1,
    borderRadius: RADIUS.field,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: LAYOUT.rowPadY,
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
    borderRadius: 16, // width/2 — circle
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  billsDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.px2,
    borderTopWidth: 1,
  },
  addCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.px2,
  },
  categorySheet: {
    flex: 1,
  },
  categorySheetScroll: {
    flex: 1,
  },
  categorySheetContent: {
    flexGrow: 1,
    paddingHorizontal: LAYOUT.cardPadX,
  },
  categoryGoalPreview: {
    marginTop: SPACE.md,
    gap: SPACE.sm,
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  catSheetFooter: {
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: SPACE.md,
  },
  categoryDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: LAYOUT.rowPadY,
  },
  lockedFields: {
    opacity: 0.58,
  },
  lockedCategoryCopy: {
    textAlign: 'center',
    marginTop: SPACE.md,
  },
  catHero: {
    alignItems: 'center',
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.lg,
  },
  catHeroCompact: {
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.md,
  },
  catHeroCircle: {
    width: 52,
    height: 52,
    borderRadius: 26, // width/2 — circle
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickerBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9, // width/2 — circle
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
    borderRadius: 1, // rounded cursor tip
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
    borderRadius: RADIUS.field,
    overflow: 'hidden',
  },
  catFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingVertical: LAYOUT.rowPadY,
    paddingHorizontal: LAYOUT.screenGutter,
    gap: SPACE.md,
  },
  catFieldRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: SPACE.sm,
    paddingHorizontal: LAYOUT.screenGutter,
    gap: SPACE.md,
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
