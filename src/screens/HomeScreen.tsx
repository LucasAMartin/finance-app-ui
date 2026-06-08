import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ImageBackground,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import {
  Button as SwiftButton,
  GlassEffectContainer,
  HStack,
  Host,
  Image as SwiftImage,
  Menu,
  ProgressView,
  Rectangle,
  RoundedRectangle,
  Spacer,
  SwipeActions,
  Text as SwiftText,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityHint as swiftAccessibilityHint,
  accessibilityLabel as swiftAccessibilityLabel,
  Animation,
  animation,
  background,
  clipped,
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
import { Swipeable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { useTheme } from '../ThemeProvider';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, OVER_DOT, cautionText, CAUTION_AMBER, HERO_AVAIL, GROUP_COLORS, ON_GROUP_ICON } from '../theme';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';
import { MEDIA, MEDIA_INK, DARK_TEXT_SHADOW, makeP, deriveFloor, WallpaperP as P } from '../wallpaperPalette';
import { Skeleton } from '../components/Skeleton';
import { useLedgerMembers, useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap, UNCATEGORIZED_LABEL } from '../repositories/categoryUtils';
import { appendMemberLabel } from '../repositories/memberLabels';
import type { Bill, Category, LedgerMember, SpendGroup, Transaction, TransactionCursor } from '../repositories/types';
import { advanceDueDate, monthBudgets, monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';
import { GlassCircleButton, GlassCircleIcon, SUPPORTS_GLASS } from '../components/GlassButton';
import { HeaderIcon, useHeaderScroll, BG_PARALLAX_MAX } from '../components/headerScroll';
import { HomeSpendGroups } from '../components/HomeSpendGroups';
import { MerchantMark } from '../components/MerchantMark';
import { merchantLogoKey, transactionUsesMerchantLogo, useMerchantLogoMap } from '../merchantLogos';
import { NativeMerchantMark } from '../../modules/glass-card/src/NativeMerchantMark';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionCard } from '../components/SectionCard';
import { useAppFeedback } from '../AppFeedbackProvider';
import { useMorphSource } from '../components/useMorphSource';
import type { SourceRect } from '../components/ContainerTransform';
import { TYPE } from '../typography';
import type { ActivityInitialFilter } from '../selectors/spending';
import type { SFSymbol } from 'sf-symbols-typescript';

const { height: SCREEN_H } = Dimensions.get('window');
const HOME_ACTIVITY_LIMIT = 8;
const HOME_MONTH_PAGE_SIZE = 200;
const HERO_MORPH_CLOSE_RETURN_DELAY = 130;
type HeroAction = 'voice' | 'manual' | 'income';

const CATEGORY_SF_SYMBOL: Record<string, SFSymbol> = {
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
const UPCOMING_FALLBACK_SYMBOL: SFSymbol = 'calendar';

function quickActionColors(theme: Theme, p: P) {
  const labelFg = p.text;
  const glassTint = theme.dark ? 'rgba(20,20,24,0.55)' : 'rgba(255,255,255,0.92)';
  const inkFg = theme.dark ? MEDIA.text : MEDIA_INK;
  return {
    iconFg: inkFg,
    labelFg,
    circleBg: glassTint,
    circleBorder: theme.dark ? 'rgba(235,239,242,0.16)' : 'rgba(14,12,24,0.10)',
    glassTint,
    menuImageColor: inkFg,
  };
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return {
    from: new Date(year, month - 1, 1),
    to: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

// ── Budget progress bar ──────────────────────────────────────────
function BudgetBar({ pct, trackBg }: { pct: number; trackBg: string }) {
  const [barW, setBarW] = useState(0);
  const H = 5, R = RADIUS.bar;
  const color = pct >= 1.0 ? OVER_DOT : pct >= 0.75 ? CAUTION_AMBER : HERO_AVAIL;
  return (
    <View
      style={{ height: H, borderRadius: R, overflow: 'hidden', backgroundColor: trackBg }}
      onLayout={e => setBarW(e.nativeEvent.layout.width)}
    >
      {barW > 0 && pct > 0 && (
        <View style={{ height: H, borderRadius: R, width: Math.round(barW * Math.min(pct, 1)), backgroundColor: color }} />
      )}
    </View>
  );
}

function IconBtn({
  onPress, children, size = 40, accessibilityLabel, accessibilityRole = 'button',
}: {
  onPress?: () => void;
  children: React.ReactNode;
  size?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
}) {
  return (
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.iconBtn, { width: size, height: size, backgroundColor: 'transparent' }]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </Pressable>
  );
}

function HeroAmount({ value, prefix, color, shadow }: { value: number; prefix: string; color: string; shadow?: object }) {
  const abs = Math.abs(value);
  const whole = Math.floor(abs).toLocaleString();
  const frac = Math.round((abs - Math.floor(abs)) * 100).toString().padStart(2, '0');
  const display = `${prefix}${whole}.${frac}`;
  return (
    <Text
      style={[styles.heroAmount, { color }, shadow]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      maxFontSizeMultiplier={1.3}
      accessibilityLabel={`${display} ${value < 0 || prefix.startsWith('-') ? 'over budget' : 'available'}`}
    >
      {display}
    </Text>
  );
}

// ── Quick-action tile ─────────────────────────────────────────────
// All colors adapt dark/light via the adaptive palette. Every tile shares the
// same soft, slightly-opaque fill (neutral black tint in dark, like the cards).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const QuickAction = React.forwardRef<View, {
  icon: string;
  // SF Symbol shown by the native glass button on iOS 26+ (falls back to `icon`).
  glassSymbol: SFSymbol;
  label: string;
  onPress?: () => void;
  onPrepare?: () => void;
  href?: Href;
  // Fire on finger-down instead of finger-up. RN's onPress waits for release and,
  // inside a ScrollView, for scroll arbitration — that gap is the perceived lag.
  // onPressIn fires immediately, so the action feels instant. Use for actions
  // that open a screen/sheet where mis-firing on a stray touch is harmless.
  instant?: boolean;
  theme: Theme;
  p: P;
  shadow?: object;
}>(function QuickAction(
  { icon, glassSymbol, label, onPress, onPrepare, href, instant, theme, p, shadow },
  ref,
) {
  const colors = quickActionColors(theme, p);
  const fire = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };
  const prepare = () => {
    onPrepare?.();
  };
  const pressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    prepare();
  };

  if (SUPPORTS_GLASS) {
    if (href) {
      return (
        <Link href={href} asChild>
          <Link.Trigger>
            <AnimatedPressable
              onPressIn={pressIn}
              style={styles.qa}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <View style={styles.qaInner}>
                <Link.AppleZoom>
                  <View ref={ref} collapsable={false} style={{ width: 56, height: 56 }}>
                    <GlassCircleIcon
                      systemImage={glassSymbol}
                      size={56}
                      iconSize={22}
                      iconColor={colors.iconFg}
                      glassTint={colors.glassTint}
                    />
                  </View>
                </Link.AppleZoom>
                <Text style={[styles.qaLabel, { color: colors.labelFg }, shadow]}>{label}</Text>
              </View>
            </AnimatedPressable>
          </Link.Trigger>
        </Link>
      );
    }

    // Native interactive Liquid Glass button (iOS 26+). The morph ref lands on
    // the glass circle's wrapping View so a transform still grows from it.
    return (
      <Animated.View style={styles.qa} onTouchStart={prepare}>
        <View style={styles.qaInner}>
          <GlassCircleButton
            ref={ref}
            onPress={fire}
            systemImage={glassSymbol}
            size={56}
            iconSize={22}
            iconColor={colors.iconFg}
            glassTint={colors.glassTint}
            accessibilityLabel={label}
          />
          <Text style={[styles.qaLabel, { color: colors.labelFg }, shadow]}>{label}</Text>
        </View>
      </Animated.View>
    );
  }

  const trigger = (
    <Pressable
      onPressIn={href ? pressIn : instant ? fire : prepare}
      onPress={href || instant ? undefined : fire}
      style={({ pressed }) => [styles.qaInner, { opacity: pressed ? 0.7 : 1 }]}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {/* ref is on the circle so a container transform grows from the circle
          itself (not the icon+label column). */}
      {href ? (
        <Link.AppleZoom>
          <View ref={ref} collapsable={false} style={[styles.qaCircle, { backgroundColor: colors.circleBg, borderColor: colors.circleBorder }]}>
            <Icon name={icon} size={20} color={colors.iconFg} stroke={1.7} />
          </View>
        </Link.AppleZoom>
      ) : (
        <View ref={ref} collapsable={false} style={[styles.qaCircle, { backgroundColor: colors.circleBg, borderColor: colors.circleBorder }]}>
          <Icon name={icon} size={20} color={colors.iconFg} stroke={1.7} />
        </View>
      )}
      <Text style={[styles.qaLabel, { color: colors.labelFg }, shadow]}>{label}</Text>
    </Pressable>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        <Link.Trigger>
          <AnimatedPressable
            onPressIn={pressIn}
            style={styles.qa}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <View style={styles.qaInner}>
              <Link.AppleZoom>
                <View ref={ref} collapsable={false} style={[styles.qaCircle, { backgroundColor: colors.circleBg, borderColor: colors.circleBorder }]}>
                  <Icon name={icon} size={20} color={colors.iconFg} stroke={1.7} />
                </View>
              </Link.AppleZoom>
              <Text style={[styles.qaLabel, { color: colors.labelFg }, shadow]}>{label}</Text>
            </View>
          </AnimatedPressable>
        </Link.Trigger>
      </Link>
    );
  }

  return (
    <Animated.View style={styles.qa}>
      {trigger}
    </Animated.View>
  );
});

// ── Section card ─────────────────────────────────────────────────
// Dark: heavy dark frost (intensity 70). Light: light frost (intensity 35)
// — barely opaque so the vivid wallpaper bleeds through.

// All amounts on the home screen read as dollars-and-cents, e.g. $1,234.00 / $1,234.50.
const fmtAmount = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface NativeUpcomingBillItem {
  id: string;
  name: string;
  dueDate: string;
  daysText: string;
  daysColor: string;
  amountText: string;
  symbol: SFSymbol;
  iconColor: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onOpen: () => void;
  onPaid?: () => void;
}

interface NativeHomeActivityItem {
  id: string;
  merchant: string;
  meta: string;
  time: string;
  amountText: string;
  symbol: SFSymbol;
  iconColor: string;
  logoUrl?: string;
  logoBgColor?: string | null;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onOpen: () => void;
  onDelete?: () => void;
}

interface NativeHomeActivityGroup {
  key: string;
  label: string;
  items: NativeHomeActivityItem[];
}

const NATIVE_SPEND_GROUP_CLOSED_HEIGHT = 94;
const nativeSpendGroupDetailHeight = (group: SpendGroup) => {
  if (group.key === 'wants') return 20 + group.subs.length * 52;
  return 16 + group.subs.length * 44 + Math.max(0, group.subs.length - 1) * SPACE.md;
};

interface Props {
  theme: Theme;
  onViewActivity: (filter?: ActivityInitialFilter) => void;
  onOpenDrawer: () => void;
  onAddVoice: (source: SourceRect) => void;
  onAddManual: (source: SourceRect) => void;
  onLogIncome: (source: SourceRect) => void;
  onOpenTheme: () => void;
  onContributeGoal: () => void;
  onOpenTx: (tx: Transaction) => void;
  onPrepareTx?: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
  onOpenBill: (bill: Bill) => void;
  morphResetToken?: number;
}

export function HomeScreen({ theme, onViewActivity, onOpenDrawer, onAddVoice, onAddManual, onLogIncome, onOpenTheme, onContributeGoal, onOpenTx, onPrepareTx, onDeleteTx, onOpenBill, morphResetToken = 0 }: Props) {
  const { transactionsRepo, incomeRepo, budgetsRepo, categoriesRepo, recurringRulesRepo, sessionRepo } = useRepositories();
  const { showToast } = useAppFeedback();
  // Morph sources — all measured at press time from the circle (radius 28).
  const voiceMorph  = useMorphSource(28);
  const manualMorph = useMorphSource(28);
  const incomeMorph = useMorphSource(28);
  const heroMorphAnim = useRef(new Animated.Value(0)).current;
  const preparedHeroActionRef = useRef<HeroAction | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentMonthTransactions, setCurrentMonthTransactions] = useState<Transaction[]>([]);
  const [repoVersion, setRepoVersion] = useState(0);
  const incomes = useRepositoryList(incomeRepo);
  const budgets = useRepositoryList(budgetsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const ledgerMembers = useLedgerMembers();
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const upcomingBills = useMemo(() => upcomingBillsFromRecurring(recurringRules, categories), [recurringRules, categories]);
  const { wallpaper, wallpaperFloorBase } = useTheme();
  const insets = useSafeAreaInsets();
  // pWallpaper: hero, header, quick-actions — always on the wallpaper, always white.
  // p: card interiors — adaptive (dark text in light mode reads on light frosted glass).
  const pWallpaper = makeP(true);
  const p = makeP(theme.dark);
  // Text shadow for hero/header text — wallpaper is behind it in both modes.
  const shadow = DARK_TEXT_SHADOW;

  useEffect(() => {
    return transactionsRepo.subscribe(() => setRepoVersion(version => version + 1));
  }, [transactionsRepo]);

  useEffect(() => {
    const { from, to } = monthRange(currentMonthKey());
    const rows: Transaction[] = [];
    let cursor: TransactionCursor | undefined;
    do {
      const page = transactionsRepo.listPage({
        limit: HOME_MONTH_PAGE_SIZE,
        from: from.toISOString(),
        to: to.toISOString(),
        sort: 'date-desc',
        cursor,
      });
      rows.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);
    setCurrentMonthTransactions(rows);
  }, [transactionsRepo, repoVersion]);

  const [monthIdx, setMonthIdx] = useState(0);
  const visibleMonthBudgets = useMemo(() => monthBudgets(currentMonthTransactions, budgets, incomes), [currentMonthTransactions, budgets, incomes]);
  const selectedMonthKey = visibleMonthBudgets[monthIdx]?.key ?? visibleMonthBudgets[0]?.key ?? currentMonthKey();
  const selectedMonthRange = useMemo(() => monthRange(selectedMonthKey), [selectedMonthKey]);
  const selectedIsCurrentMonth = selectedMonthKey === (visibleMonthBudgets[0]?.key ?? currentMonthKey());

  useEffect(() => {
    const rows: Transaction[] = [];
    let cursor: TransactionCursor | undefined;
    do {
      const page = transactionsRepo.listPage({
        limit: HOME_MONTH_PAGE_SIZE,
        from: selectedMonthRange.from.toISOString(),
        to: selectedMonthRange.to.toISOString(),
        sort: 'date-desc',
        cursor,
      });
      rows.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);
    setTransactions(rows);
  }, [transactionsRepo, selectedMonthRange, repoVersion]);

  const homeActivityGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; txs: Transaction[] }> = [];
    transactions.slice(0, HOME_ACTIVITY_LIMIT).forEach(tx => {
      const label = selectedIsCurrentMonth && tx.when === 'today'
        ? 'Today'
        : selectedIsCurrentMonth && tx.when === 'yesterday'
          ? 'Yesterday'
          : tx.fullDate;
      const existing = groups.find(group => group.label === label);
      if (existing) existing.txs.push(tx);
      else groups.push({ key: `${tx.fullDate}-${tx.when}`, label, txs: [tx] });
    });
    return groups;
  }, [selectedIsCurrentMonth, transactions]);
  const homeActivityLogoTxs = useMemo(
    () => homeActivityGroups.flatMap(group => group.txs),
    [homeActivityGroups],
  );
  const merchantLogos = useMerchantLogoMap(homeActivityLogoTxs, SUPPORTS_GLASS);

  const visibleSpendGroups = useMemo(() => spendGroups(transactions, budgets, categories, selectedMonthKey), [transactions, budgets, categories, selectedMonthKey]);
  const income = useMemo(() => monthlyIncome(incomes, selectedMonthKey), [incomes, selectedMonthKey]);
  const visibleUpcomingBills = selectedIsCurrentMonth ? upcomingBills : [];
  const mb = visibleMonthBudgets[monthIdx] ?? visibleMonthBudgets[0];

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const markBillPaid = useCallback((bill: Bill) => {
    const ruleId = bill.id.startsWith('bill-') ? bill.id.slice(5) : bill.id;
    const rule = recurringRulesRepo.get(ruleId);
    if (rule && !sessionRepo.canEdit(rule.createdByUserId, rule.ledgerId)) return;
    const created = transactionsRepo.create({
      merchant: bill.merchant,
      cat: bill.cat,
      amount: bill.amount,
      recurring: true,
      recurringRuleId: ruleId,
      occurredAt: new Date().toISOString(),
      type: 'expense',
      visibility: 'shared',
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    const originalNextDueDate = rule?.nextDueDate;
    const originalMeta = rule?.meta;
    if (rule) {
      recurringRulesRepo.update(ruleId, {
        nextDueDate: advanceDueDate(rule),
        meta: { ...rule.meta, partialPaid: undefined },
      });
    }
    showToast(`${bill.name} marked as paid`, () => {
      transactionsRepo.delete(created.id);
      if (rule && originalNextDueDate !== undefined) {
        recurringRulesRepo.update(ruleId, { nextDueDate: originalNextDueDate, meta: originalMeta });
      }
    });
  }, [transactionsRepo, recurringRulesRepo, sessionRepo, showToast]);

  const nativeUpcomingBills = useMemo<NativeUpcomingBillItem[]>(() => (
    visibleUpcomingBills.map(bill => {
      const amountText = `${bill.estimate ? '~' : ''}$${fmtAmount(bill.amount)}`;
      const ruleId = bill.id.startsWith('bill-') ? bill.id.slice(5) : bill.id;
      const rule = recurringRules.find(item => item.id === ruleId);
      const canMarkPaid = !rule || sessionRepo.canEdit(rule.createdByUserId, rule.ledgerId);
      const daysColor = bill.daysUntil <= 7
        ? OVER_DOT
        : bill.daysUntil <= 14
          ? cautionText(theme.dark)
          : p.textSec;

      return {
        id: bill.id,
        name: bill.name,
        dueDate: bill.dueDate,
        daysText: `in ${bill.daysUntil} days`,
        daysColor,
        amountText,
        symbol: CATEGORY_SF_SYMBOL[bill.icon] ?? UPCOMING_FALLBACK_SYMBOL,
        iconColor: categoryGroupColor(bill.cat, categories, theme.dark),
        accessibilityLabel: `${bill.name}, due ${bill.dueDate}, in ${bill.daysUntil} days, ${amountText}`,
        accessibilityHint: canMarkPaid ? 'Swipe left to mark paid' : undefined,
        onOpen: () => onOpenBill(bill),
        onPaid: canMarkPaid ? () => markBillPaid(bill) : undefined,
      };
    })
  ), [categories, markBillPaid, onOpenBill, p.textSec, recurringRules, sessionRepo, theme.dark, visibleUpcomingBills]);

  const nativeHomeActivityGroups = useMemo<NativeHomeActivityGroup[]>(() => (
    homeActivityGroups.map(group => ({
      key: group.key,
      label: group.label,
      items: group.txs.map(tx => {
        const cat = cats[tx.cat];
        const meta = appendMemberLabel(cat?.label ?? UNCATEGORIZED_LABEL, ledgerMembers, tx.createdByUserId);
        const canDelete = transactionsRepo.canEdit(tx);
        const logo = transactionUsesMerchantLogo(tx) ? merchantLogos.get(merchantLogoKey(tx.merchant)) : undefined;
        return {
          id: tx.id,
          merchant: tx.merchant,
          meta,
          time: tx.time,
          amountText: `$${fmtAmount(tx.amount)}`,
          symbol: CATEGORY_SF_SYMBOL[cat?.icon ?? ''] ?? UPCOMING_FALLBACK_SYMBOL,
          iconColor: categoryGroupColor(tx.cat, categories, theme.dark),
          logoUrl: logo?.logoUrl,
          logoBgColor: logo?.bgColor,
          accessibilityLabel: `${tx.merchant}, ${meta}, ${tx.time}, $${fmtAmount(tx.amount)}`,
          accessibilityHint: canDelete ? 'Swipe left to delete' : undefined,
          onOpen: () => {
            onPrepareTx?.(tx);
            onOpenTx(tx);
          },
          onDelete: canDelete
            ? () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onDeleteTx(tx);
              }
            : undefined,
        };
      }),
    }))
  ), [cats, categories, homeActivityGroups, ledgerMembers, merchantLogos, onDeleteTx, onOpenTx, onPrepareTx, theme.dark, transactionsRepo]);

  const handleEditTheme = () => {
    onOpenTheme();
  };

  const prepareHeroMorphReaction = useCallback((action: HeroAction) => {
    preparedHeroActionRef.current = action;
    heroMorphAnim.stopAnimation();
    heroMorphAnim.setValue(0);
  }, [heroMorphAnim]);

  const startHeroMorphReaction = useCallback(() => {
    heroMorphAnim.stopAnimation();
    Animated.timing(heroMorphAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [heroMorphAnim]);

  useEffect(() => {
    if (morphResetToken === 0) return;
    preparedHeroActionRef.current = null;
    heroMorphAnim.stopAnimation();
    const timer = setTimeout(() => {
      Animated.timing(heroMorphAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, HERO_MORPH_CLOSE_RETURN_DELAY);
    return () => clearTimeout(timer);
  }, [heroMorphAnim, morphResetToken]);

  const prepareVoiceFromHero = useCallback(() => {
    prepareHeroMorphReaction('voice');
    requestAnimationFrame(startHeroMorphReaction);
  }, [prepareHeroMorphReaction, startHeroMorphReaction]);

  const prepareManualFromHero = useCallback(() => {
    prepareHeroMorphReaction('manual');
    requestAnimationFrame(startHeroMorphReaction);
  }, [prepareHeroMorphReaction, startHeroMorphReaction]);

  const prepareIncomeFromHero = useCallback(() => {
    prepareHeroMorphReaction('income');
    requestAnimationFrame(startHeroMorphReaction);
  }, [prepareHeroMorphReaction, startHeroMorphReaction]);

  const openVoiceFromHero = useCallback(() => {
    voiceMorph.measure(source => {
      const wasPrepared = preparedHeroActionRef.current === 'voice';
      if (!wasPrepared) prepareHeroMorphReaction('voice');
      if (wasPrepared) startHeroMorphReaction();
      else requestAnimationFrame(startHeroMorphReaction);
      onAddVoice(source);
    });
  }, [onAddVoice, prepareHeroMorphReaction, startHeroMorphReaction, voiceMorph]);

  const openManualFromHero = useCallback(() => {
    manualMorph.measure(source => {
      const wasPrepared = preparedHeroActionRef.current === 'manual';
      if (!wasPrepared) prepareHeroMorphReaction('manual');
      if (wasPrepared) startHeroMorphReaction();
      else requestAnimationFrame(startHeroMorphReaction);
      onAddManual(source);
    });
  }, [manualMorph, onAddManual, prepareHeroMorphReaction, startHeroMorphReaction]);

  const openIncomeFromHero = useCallback(() => {
    incomeMorph.measure(source => {
      const wasPrepared = preparedHeroActionRef.current === 'income';
      if (!wasPrepared) prepareHeroMorphReaction('income');
      if (wasPrepared) startHeroMorphReaction();
      else requestAnimationFrame(startHeroMorphReaction);
      onLogIncome(source);
    });
  }, [incomeMorph, onLogIncome, prepareHeroMorphReaction, startHeroMorphReaction]);


  const { scrollY, headerBgOpacity, iconScrolledOpacity, bgTranslateY } = useHeaderScroll();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);


  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setLoading(true);
    setTimeout(() => { setLoading(false); setRefreshing(false); }, 1100);
  }, []);

  const hasIncome = mb.budget > 0;
  const rawPct = hasIncome ? mb.spent / mb.budget : 0;
  const available = Math.max(mb.budget - mb.spent, 0);
  const overage = mb.spent - mb.budget;
  const over = hasIncome && mb.spent > mb.budget;
  const openSelectedMonthActivity = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onViewActivity({
      dateFrom: selectedMonthRange.from,
      dateTo: selectedMonthRange.to,
    });
  }, [onViewActivity, selectedMonthRange]);

  // Solid color the wallpaper fades into as the user scrolls away from it.
  // Hue comes from the wallpaper; deriveFloor bends it dark/light per mode.
  const floorColor = deriveFloor(wallpaperFloorBase, theme.dark);

  // Dark mode: violet-black scrim — cards are dark glass on a darkened scene.
  // Light mode: subtle tint — wallpaper shows through vividly.
  const scrimTop    = theme.dark ? 'rgba(8,6,20,0.55)' : 'rgba(8,6,20,0.3)';
  const scrimMid    = theme.dark ? 'rgba(8,6,20,0.34)' : 'rgba(8,6,20,0.3)';
  const scrimLower  = theme.dark ? 'rgba(8,6,20,0.68)' : 'rgba(8,6,20,0.2)';
  const scrimBottom = theme.dark ? 'rgba(8,6,20,0.88)' : 'transparent';

  // The wallpaper is a fixed backdrop; as content scrolls up over it, the floor
  // overlay fades in so the backdrop dissolves into the solid floor color by the
  // time the user has scrolled ~60% of a screen.
  const floorOpacity = scrollY.interpolate({
    inputRange: [0, SCREEN_H * 0.6],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ flex: 1, backgroundColor: floorColor }}>
      {/* Wallpaper photo — drifts up at half the scroll speed; container extends
          below the screen so the upward shift never reveals a gap. */}
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
      <LinearGradient
        pointerEvents="none"
        colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
        locations={[0, 0.28, 0.60, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floor — fades in over the wallpaper as the user scrolls down */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: floorColor, opacity: floorOpacity }]}
      />

        {/* ─── Header ─────────────────────────────── */}
        <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: headerBgOpacity }]}
          >
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.headerDivider, {
              backgroundColor: theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)',
            }]} />
          </Animated.View>
          <View style={styles.headerRow}>
            {SUPPORTS_GLASS ? (
              <GlassCircleButton
                onPress={onOpenDrawer}
                systemImage="line.3.horizontal"
                size={40}
                iconSize={18}
                iconColor={quickActionColors(theme, pWallpaper).iconFg}
                glassTint={quickActionColors(theme, pWallpaper).glassTint}
                colorScheme={theme.dark ? 'dark' : 'light'}
                accessibilityLabel="Open menu"
              />
            ) : (
              <IconBtn onPress={onOpenDrawer} accessibilityLabel="Open menu">
                <HeaderIcon
                  name="menu"
                  wallpaperColor={pWallpaper.text}
                  scrolledColor={p.text}
                  scrolledOpacity={iconScrolledOpacity}
                />
              </IconBtn>
            )}
            <ThemeToggle />
          </View>
        </View>

        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={dismissOpenSwipe}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={pWallpaper.textSec} colors={[theme.accent.dot]}
              progressBackgroundColor={theme.dark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'} />
          }
        >
          {/* ─── Hero ─────────────────────────────── */}
          <View style={styles.hero}>
            <Animated.View style={styles.heroTopRow}>
              <View style={styles.heroStatusGroup}>
                {loading ? (
                  <Skeleton width={150} height={13} radius={4} onMedia={theme.dark} />
                ) : hasIncome ? (
                  <>
                    <Text style={[styles.heroStatusLabel, { color: over ? OVER_DOT : pWallpaper.text }, shadow]}>
                      {over ? 'Over budget' : 'Available'}
                    </Text>
                    <View
                      style={[styles.heroStatusDiv, { backgroundColor: pWallpaper.hairlineStrong }]}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                    <Text style={[styles.heroStatusSub, { color: pWallpaper.textSec }, shadow]}>
                      {mb.remainingLabel}
                    </Text>
                  </>
                ) : (
                  <TouchableOpacity onPress={openIncomeFromHero} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.heroStatusLabel, { color: pWallpaper.textSec }, shadow]} numberOfLines={1}>
                      Set your income to get started
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {loading ? (
                <Skeleton width={88} height={13} radius={4} onMedia={theme.dark} />
              ) : (
                <Host ignoreSafeArea="all" style={styles.monthPickerHost}>
                  <Menu
                    label={
                      <View style={styles.monthPickerBtn}>
                        <Text style={[styles.monthPickerText, { color: pWallpaper.text }, shadow]}>
                          {visibleMonthBudgets[monthIdx]?.month} {visibleMonthBudgets[monthIdx]?.key.split('-')[0]}
                        </Text>
                        <Icon name="chevDown" size={11} color={pWallpaper.text} stroke={2} />
                      </View>
                    }
                  >
                    {visibleMonthBudgets.map((m, idx) => (
                      <SwiftButton
                        key={m.key}
                        systemImage={idx === monthIdx ? 'checkmark' : undefined}
                        onPress={() => setMonthIdx(idx)}
                        label={`${m.month} ${m.key.split('-')[0]}`}
                      />
                    ))}
                  </Menu>
                </Host>
              )}
            </Animated.View>

            {loading ? (
              <>
                <Skeleton width={220} height={42} radius={8} onMedia={theme.dark} style={{ marginBottom: 20 }} />
                <Skeleton width="100%" height={5} radius={3} onMedia={theme.dark} />
              </>
            ) : (
              <Animated.View>
                <View style={styles.heroAmountRow}>
                  <HeroAmount
                    value={hasIncome ? (over ? overage : available) : 0}
                    prefix={hasIncome && over ? '-$' : '$'}
                    color={hasIncome && over ? OVER_DOT : pWallpaper.text}
                    shadow={shadow}
                  />
                </View>
                <BudgetBar pct={rawPct} trackBg={pWallpaper.trackBg} />
              </Animated.View>
            )}
          </View>

          {/* ─── Quick actions ─────────────────────── */}
          {/* Three capture modes (voice / manual / income) plus a More menu */}
          {/* for less-frequent options — all share the same soft button fill. */}
          <View style={styles.quickRow}>
            <QuickAction ref={voiceMorph.ref}  icon="mic"    glassSymbol="mic.fill"             label="Voice"  onPrepare={prepareVoiceFromHero}  href="/expense?mode=voice"  theme={theme} p={pWallpaper} shadow={shadow} />
            <QuickAction ref={manualMorph.ref} icon="keypad" glassSymbol="square.grid.3x3.fill" label="Manual" onPrepare={prepareManualFromHero} href="/expense?mode=manual" theme={theme} p={pWallpaper} shadow={shadow} />
            <QuickAction ref={incomeMorph.ref} icon="plus"   glassSymbol="plus"                 label="Income" onPrepare={prepareIncomeFromHero} href="/income"               theme={theme} p={pWallpaper} shadow={shadow} />
            <MoreMenuButton
              theme={theme}
              p={pWallpaper}
              shadow={shadow}
              onEditTheme={handleEditTheme}
              onContributeGoal={onContributeGoal}
            />
          </View>

          {/* ─── Sections stack ──────────────────── */}
          <View style={styles.sectionStack}>

            {/* Spending */}
            {SUPPORTS_GLASS ? (
              <NativeSpendingSection
                theme={theme}
                p={p}
                loading={loading}
                groups={visibleSpendGroups}
                income={income}
              />
            ) : (
              <SectionCard dark={theme.dark}>
                <View style={styles.sectionHead}>
                  <Text style={[styles.ledgerLabel, { color: p.text }]} accessibilityRole="header">Spending</Text>
                </View>
                {loading ? (
                  <CategorySkeleton dark={theme.dark} />
                ) : (
                  <HomeSpendGroups theme={theme} groups={visibleSpendGroups} income={income} compact onMedia={theme.dark} />
                )}
              </SectionCard>
            )}

            {/* Upcoming */}
            {SUPPORTS_GLASS ? (
              <NativeUpcomingSection
                dark={theme.dark}
                p={p}
                loading={loading}
                bills={nativeUpcomingBills}
              />
            ) : (
              <SectionCard dark={theme.dark}>
                <View style={styles.sectionHead}>
                  <Text style={[styles.ledgerLabel, { color: p.text }]} accessibilityRole="header">Upcoming</Text>
                </View>
                {loading ? (
                  <BillsSkeleton dark={theme.dark} />
                ) : (
                  visibleUpcomingBills.length === 0 ? (
                    <Text style={[styles.emptyMonthText, { color: p.textTer }]}>
                      No recurring bills tracked. Mark an expense as repeating to add one.
                    </Text>
                  ) : visibleUpcomingBills.map((b, i) => {
	                  const amountStr = `${b.estimate ? '~' : ''}$${fmtAmount(b.amount)}`;
	                  const a11y = `${b.name}, due ${b.dueDate}, in ${b.daysUntil} days, ${amountStr}`;
	                  const billIconColor = categoryGroupColor(b.cat, categories, theme.dark);
                    const ruleId = b.id.startsWith('bill-') ? b.id.slice(5) : b.id;
                    const rule = recurringRules.find(item => item.id === ruleId);
                    const canMarkPaid = !rule || sessionRepo.canEdit(rule.createdByUserId, rule.ledgerId);
	                  return (
	                    <SwipeBillRow
	                      key={b.id}
	                      onPaid={canMarkPaid ? () => markBillPaid(b) : undefined}
                        onOpen={handleSwipeOpen}
                        onClose={handleSwipeClose}
                      >
                        <TouchableOpacity
                          onPress={() => onOpenBill(b)}
                          activeOpacity={0.6}
                          delayPressIn={0}
                          style={[
                            styles.billRow,
                            { borderBottomWidth: i < visibleUpcomingBills.length - 1 ? 1 : 0, borderBottomColor: p.hairline },
                          ]}
	                        accessible
	                        accessibilityLabel={a11y}
	                        accessibilityHint={canMarkPaid ? 'Swipe right to mark paid' : undefined}
	                        accessibilityActions={canMarkPaid ? [{ name: 'paid', label: 'Mark as paid' }] : undefined}
	                        onAccessibilityAction={canMarkPaid ? (e) => {
	                          if (e.nativeEvent.actionName === 'paid') markBillPaid(b);
	                        } : undefined}
                        >
                          <MerchantMark
                            merchant={b.merchant}
                            catIcon={b.icon}
                            color={billIconColor}
                            size={36}
                            iconSize={16}
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.rowTitle, { color: p.text }]}>{b.name}</Text>
                            <Text style={[styles.rowSub, { color: p.textSec }]}>
                              {b.dueDate}
                              {'  ·  '}
                              <Text style={{ color: b.daysUntil <= 7 ? OVER_DOT : b.daysUntil <= 14 ? cautionText(theme.dark) : p.textSec }}>
                                in {b.daysUntil} days
                              </Text>
                            </Text>
                          </View>
                          <Money value={b.amount} theme={theme} color={p.text} prefix={b.estimate ? '~$' : '$'} />
                        </TouchableOpacity>
                      </SwipeBillRow>
                    );
                  })
                )}
              </SectionCard>
            )}

            {/* Activity */}
            {SUPPORTS_GLASS ? (
              <NativeHomeActivitySection
                dark={theme.dark}
                p={p}
                accent={theme.accent.dot}
                loading={loading}
                groups={nativeHomeActivityGroups}
                onSeeAll={openSelectedMonthActivity}
              />
            ) : (
              <SectionCard dark={theme.dark}>
                <View style={styles.sectionHead}>
                  <Text style={[styles.ledgerLabel, { color: p.text }]} accessibilityRole="header">Activity</Text>
                  <TouchableOpacity onPress={openSelectedMonthActivity} activeOpacity={0.6} delayPressIn={0}>
                    <Text style={[styles.ledgerAction, { color: theme.accent.dot }]}>See all</Text>
                  </TouchableOpacity>
                </View>
                {loading ? (
                  <ActivitySkeleton dark={theme.dark} />
                ) : homeActivityGroups.length === 0 ? (
                  <Text style={[styles.emptyMonthText, { color: p.textTer }]}>
                    No expenses logged yet. Tap + below to add one by voice or text.
                  </Text>
                ) : (
                  homeActivityGroups.map(group => (
                      <View key={group.key} style={{ marginBottom: 16 }}>
                        <Text style={[styles.dayLabel, { color: p.textTer }]}>
                          {group.label}
                        </Text>
                        {group.txs.map((tx, i, arr) => (
                          <SwipeTxRow
                            key={tx.id}
                            onDelete={transactionsRepo.canEdit(tx) ? () => onDeleteTx(tx) : undefined}
                            onOpen={handleSwipeOpen}
                            onClose={handleSwipeClose}
                          >
                            <TxRow tx={tx}
                              onPress={() => onOpenTx(tx)}
                              onPrepare={onPrepareTx ? () => onPrepareTx(tx) : undefined}
                              onDelete={transactionsRepo.canEdit(tx) ? () => onDeleteTx(tx) : undefined}
                              last={i === arr.length - 1}
                              dark={theme.dark} p={p} cats={cats} categories={categories} members={ledgerMembers} />
                          </SwipeTxRow>
                        ))}
                      </View>
                    ))
                )}
              </SectionCard>
            )}

          </View>
        </Animated.ScrollView>

    </View>
  );
}

function NativeSpendingSection({
  theme,
  p,
  loading,
  groups,
  income,
}: {
  theme: Theme;
  p: P;
  loading: boolean;
  groups: SpendGroup[];
  income: number;
}) {
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const glassTint = theme.dark ? 'rgba(18,20,22,0.46)' : 'rgba(255,255,255,0.72)';
  const sectionChromeHeight = LAYOUT.cardPadTop + 17 + SPACE.md + LAYOUT.cardPadBottom;
  const groupHeight = (group: SpendGroup) => {
    if (!openKeys[group.key]) return NATIVE_SPEND_GROUP_CLOSED_HEIGHT;
    return NATIVE_SPEND_GROUP_CLOSED_HEIGHT + nativeSpendGroupDetailHeight(group);
  };
  const sectionHeight = loading
    ? 430
    : sectionChromeHeight + groups.reduce((sum, group) => sum + groupHeight(group), 0);
  const heightAnim = useRef(new Animated.Value(sectionHeight)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: sectionHeight,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [heightAnim, sectionHeight]);

  const toggleGroup = (key: string) => {
    setOpenKeys(current => ({ ...current, [key]: !current[key] }));
  };

  return (
    <Animated.View style={{ width: '100%', height: heightAnim, overflow: 'hidden' }}>
      <Host
        ignoreSafeArea="all"
        colorScheme={theme.dark ? 'dark' : 'light'}
        style={{ width: '100%', height: sectionHeight }}
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
            <SwiftText
              modifiers={[
                font({ size: 14, weight: 'semibold' }),
                foregroundStyle(p.text),
              ]}
            >
              Spending
            </SwiftText>

            {loading ? (
              <NativeSpendingSkeleton p={p} />
            ) : (
              <VStack
                alignment="leading"
                spacing={SPACE.xs}
                modifiers={[padding({ top: SPACE.md }), frame({ maxWidth: 10000, alignment: 'leading' })]}
              >
                {groups.map(group => (
                  <NativeSpendGroupPanel
                    key={group.key}
                    theme={theme}
                    p={p}
                    group={group}
                    income={income}
                    open={!!openKeys[group.key]}
                    onToggle={() => toggleGroup(group.key)}
                  />
                ))}
              </VStack>
            )}
          </VStack>
        </GlassEffectContainer>
      </Host>
    </Animated.View>
  );
}

function NativeSpendGroupPanel({
  theme,
  p,
  group,
  income,
  open,
  onToggle,
}: {
  theme: Theme;
  p: P;
  group: SpendGroup;
  income: number;
  open: boolean;
  onToggle: () => void;
}) {
  const color = theme.dark ? GROUP_COLORS[group.key].dark : GROUP_COLORS[group.key].vibrant;
  const groupTotal = group.subs.reduce((sum, item) => sum + item.spent, 0);
  const actualPct = income > 0 ? groupTotal / income : 0;
  const fill = Math.min(group.targetPct > 0 ? actualPct / group.targetPct : 0, 1);
  const isSavings = group.key === 'savings';
  const onTrack = isSavings
    ? actualPct >= group.targetPct * 0.9
    : actualPct <= group.targetPct * 1.05;
  const barColor = onTrack ? color : OVER_DOT;
  const statusText = isSavings
    ? onTrack ? 'On Track' : 'Below Target'
    : onTrack ? 'On Track' : 'Over Budget';
  const headerTint = theme.dark ? `${color}12` : `${color}26`;
  const detailHeight = nativeSpendGroupDetailHeight(group);

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[
        background(headerTint, shapes.roundedRectangle({ cornerRadius: RADIUS.chip })),
        frame({ maxWidth: 10000, alignment: 'leading' }),
      ]}
    >
      <SwiftButton
        onPress={onToggle}
        modifiers={[
          swiftAccessibilityLabel(`${group.label}, $${fmtAmount(groupTotal)}, ${statusText}`),
          swiftAccessibilityHint(open ? 'Collapse spending group' : 'Expand spending group'),
        ]}
      >
        <VStack
          alignment="leading"
          spacing={SPACE.sm}
          modifiers={[
            padding({ leading: SPACE.md, trailing: SPACE.md, top: SPACE.lg, bottom: SPACE.md }),
            frame({ maxWidth: 10000, alignment: 'leading' }),
          ]}
        >
          <HStack alignment="center" spacing={SPACE.sm}>
            <SwiftText modifiers={[font({ size: 10 }), foregroundStyle(color)]}>●</SwiftText>
            <SwiftText
              modifiers={[
                font({ size: 15, weight: 'semibold' }),
                foregroundStyle(p.text),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {group.label}
            </SwiftText>
            <Spacer minLength={SPACE.sm} />
            <SwiftText
              modifiers={[
                font({ size: 18, weight: 'semibold' }),
                foregroundStyle(p.text),
                lineLimit(1),
              ]}
            >
              ${fmtAmount(groupTotal)}
            </SwiftText>
            <SwiftImage
              systemName={open ? 'chevron.up' : 'chevron.down'}
              size={13}
              color={color}
              modifiers={[
                opacity(open ? 1 : 0.78),
                animation(Animation.easeOut({ duration: 0.18 }), open),
              ]}
            />
          </HStack>

          <ProgressView
            value={fill}
            modifiers={[
              progressViewStyle('linear'),
              tint(barColor),
              frame({ maxWidth: 10000 }),
            ]}
          />

          <HStack alignment="center" spacing={6}>
            <SwiftText
              modifiers={[
                font({ size: 12, weight: 'semibold' }),
                foregroundStyle(p.textTer),
              ]}
            >
              {Math.round(actualPct * 100)}% of {Math.round(group.targetPct * 100)}% target
            </SwiftText>
            <SwiftText modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(p.textTer)]}>·</SwiftText>
            <SwiftText
              modifiers={[
                font({ size: 12, weight: 'semibold' }),
                foregroundStyle(onTrack ? color : OVER_DOT),
              ]}
            >
              {statusText}
            </SwiftText>
          </HStack>
        </VStack>
      </SwiftButton>

      <VStack
        alignment="leading"
        spacing={group.key === 'wants' ? 0 : SPACE.md}
        modifiers={[
          padding({ leading: SPACE.md, trailing: SPACE.md, bottom: SPACE.lg }),
          frame({ height: open ? detailHeight : 0, maxWidth: 10000, alignment: 'topLeading' }),
          opacity(open ? 1 : 0),
          clipped(),
          animation(Animation.easeOut({ duration: 0.24 }), open),
        ]}
      >
        {group.key === 'wants' ? (
          <NativeWantsRows group={group} color={color} p={p} />
        ) : (
          <NativeDetailSpendRows group={group} color={color} p={p} isSavings={isSavings} />
        )}
      </VStack>
    </VStack>
  );
}

function NativeDetailSpendRows({
  group,
  color,
  p,
  isSavings,
}: {
  group: SpendGroup;
  color: string;
  p: P;
  isSavings: boolean;
}) {
  return (
    <>
      {group.subs.map(sub => {
        const pct = sub.budget > 0 ? Math.min(sub.spent / sub.budget, 1) : 0;
        const over = !isSavings && sub.spent > sub.budget;
        const funded = sub.spent >= sub.budget;

        return (
          <HStack
            key={sub.label}
            alignment="center"
            spacing={SPACE.md}
            modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}
          >
            <SwiftImage
              systemName={CATEGORY_SF_SYMBOL[sub.icon] ?? UPCOMING_FALLBACK_SYMBOL}
              size={14}
              color={color}
              modifiers={[
                frame({ width: 28, height: 28 }),
                background(`${color}18`, shapes.roundedRectangle({ cornerRadius: 8 })),
              ]}
            />
            <VStack alignment="leading" spacing={SPACE.xs} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
              <HStack alignment="center" spacing={SPACE.sm}>
                <SwiftText
                  modifiers={[
                    font({ size: 14 }),
                    foregroundStyle(p.text),
                    lineLimit(1),
                    truncationMode('tail'),
                  ]}
                >
                  {sub.label}
                </SwiftText>
                <Spacer minLength={SPACE.sm} />
                {funded && isSavings ? (
                  <SwiftText modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(color)]}>✓</SwiftText>
                ) : null}
                <SwiftText
                  modifiers={[
                    font({ size: 12, weight: 'semibold' }),
                    foregroundStyle(over ? OVER_DOT : p.text),
                    lineLimit(1),
                  ]}
                >
                  ${fmtAmount(sub.spent)}
                </SwiftText>
                {(!funded || over) ? (
                  <SwiftText
                    modifiers={[
                      font({ size: 11 }),
                      foregroundStyle(p.textTer),
                      lineLimit(1),
                    ]}
                  >
                    / ${fmtAmount(sub.budget)}
                  </SwiftText>
                ) : null}
              </HStack>
              <ProgressView
                value={pct}
                modifiers={[
                  progressViewStyle('linear'),
                  tint(over ? OVER_DOT : color),
                  frame({ maxWidth: 10000 }),
                ]}
              />
            </VStack>
          </HStack>
        );
      })}
    </>
  );
}

function NativeWantsRows({
  group,
  color,
  p,
}: {
  group: SpendGroup;
  color: string;
  p: P;
}) {
  return (
    <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
      {group.subs.map((sub, index) => (
        <VStack key={sub.label} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
          <HStack
            alignment="center"
            spacing={SPACE.md}
            modifiers={[
              padding({ top: LAYOUT.rowPadY, bottom: LAYOUT.rowPadY }),
              frame({ maxWidth: 10000, alignment: 'leading' }),
            ]}
          >
            <SwiftImage
              systemName={CATEGORY_SF_SYMBOL[sub.icon] ?? UPCOMING_FALLBACK_SYMBOL}
              size={14}
              color={color}
              modifiers={[
                frame({ width: 28, height: 28 }),
                background(`${color}18`, shapes.roundedRectangle({ cornerRadius: 8 })),
              ]}
            />
            <SwiftText
              modifiers={[
                font({ size: 14 }),
                foregroundStyle(p.text),
                lineLimit(1),
                truncationMode('tail'),
                frame({ maxWidth: 10000, alignment: 'leading' }),
              ]}
            >
              {sub.label}
            </SwiftText>
            <Spacer minLength={SPACE.sm} />
            <SwiftText
              modifiers={[
                font({ size: 12, weight: 'semibold' }),
                foregroundStyle(p.text),
                lineLimit(1),
              ]}
            >
              ${fmtAmount(sub.spent)}
            </SwiftText>
          </HStack>
          {index < group.subs.length - 1 ? (
            <Rectangle
              modifiers={[
                frame({ height: 1, maxWidth: 10000 }),
                foregroundStyle(p.hairline),
              ]}
            />
          ) : null}
        </VStack>
      ))}
    </VStack>
  );
}

function NativeSpendingSkeleton({ p }: { p: P }) {
  const block = (width: number, height: number, radius: number) => (
    <RoundedRectangle
      cornerRadius={radius}
      modifiers={[
        frame({ width, height }),
        foregroundStyle(p.hairline),
      ]}
    />
  );

  return (
    <VStack
      alignment="leading"
      spacing={SPACE.xs}
      modifiers={[padding({ top: SPACE.md }), frame({ maxWidth: 10000, alignment: 'leading' })]}
    >
      {[0, 1, 2].map(index => (
        <VStack
          key={index}
          alignment="leading"
          spacing={SPACE.sm}
          modifiers={[
            padding({ leading: SPACE.md, trailing: SPACE.md, top: SPACE.lg, bottom: SPACE.md }),
            background(p.hairline, shapes.roundedRectangle({ cornerRadius: RADIUS.chip })),
            frame({ maxWidth: 10000, alignment: 'leading' }),
          ]}
        >
          <HStack alignment="center" spacing={SPACE.sm} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
            {block(7, 7, RADIUS.bar)}
            {block(index === 1 ? 72 : 56, 14, 4)}
            <Spacer />
            {block(84, 18, 5)}
          </HStack>
          {block(220, 8, 4)}
          {block(156, 12, 4)}
        </VStack>
      ))}
    </VStack>
  );
}

function NativeUpcomingSection({
  dark,
  p,
  loading,
  bills,
}: {
  dark: boolean;
  p: P;
  loading: boolean;
  bills: NativeUpcomingBillItem[];
}) {
  const glassTint = dark ? 'rgba(18,20,22,0.46)' : 'rgba(255,255,255,0.72)';
  const rowHeight = 64;
  const sectionChromeHeight = LAYOUT.cardPadTop + 17 + SPACE.xs + LAYOUT.cardPadBottom;
  const sectionHeight = loading
    ? sectionChromeHeight + rowHeight * 3 + 2
    : bills.length === 0
      ? 116
      : sectionChromeHeight + rowHeight * bills.length + Math.max(0, bills.length - 1);

  return (
    <Host
      ignoreSafeArea="all"
      colorScheme={dark ? 'dark' : 'light'}
      style={{ width: '100%', height: sectionHeight }}
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
          <HStack
            alignment="center"
            modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}
          >
            <SwiftText
              modifiers={[
                font({ size: 14, weight: 'semibold' }),
                foregroundStyle(p.text),
              ]}
            >
              Upcoming
            </SwiftText>
            <Spacer />
          </HStack>

          {loading ? (
            <NativeUpcomingSkeleton p={p} />
          ) : bills.length === 0 ? (
            <SwiftText
              modifiers={[
                padding({ top: SPACE.md }),
                font({ size: 14 }),
                foregroundStyle(p.textTer),
                lineLimit(2),
              ]}
            >
              No recurring bills tracked. Mark an expense as repeating to add one.
            </SwiftText>
          ) : (
            <VStack
              alignment="leading"
              spacing={0}
              modifiers={[padding({ top: SPACE.xs }), frame({ maxWidth: 10000, alignment: 'leading' })]}
            >
              {bills.map((bill, index) => (
                <NativeUpcomingRow
                  key={bill.id}
                  bill={bill}
                  p={p}
                  last={index === bills.length - 1}
                />
              ))}
            </VStack>
          )}
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}

function NativeUpcomingRow({
  bill,
  p,
  last,
}: {
  bill: NativeUpcomingBillItem;
  p: P;
  last: boolean;
}) {
  const row = (
    <SwiftButton
      onPress={bill.onOpen}
      modifiers={[
        swiftAccessibilityLabel(bill.accessibilityLabel),
        ...(bill.accessibilityHint ? [swiftAccessibilityHint(bill.accessibilityHint)] : []),
      ]}
    >
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}
      >
        <HStack
          alignment="center"
          spacing={SPACE.md}
          modifiers={[
            padding({ top: 14, bottom: 14 }),
            frame({ maxWidth: 10000, alignment: 'leading' }),
          ]}
        >
          <SwiftImage
            systemName={bill.symbol}
            size={16}
            color={bill.iconColor}
            modifiers={[
              frame({ width: 36, height: 36 }),
              background(`${bill.iconColor}24`, shapes.circle()),
            ]}
          />
          <VStack
            alignment="leading"
            spacing={4}
            modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}
          >
            <SwiftText
              modifiers={[
                font({ size: 15, weight: 'semibold' }),
                foregroundStyle(p.text),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {bill.name}
            </SwiftText>
            <HStack alignment="center" spacing={6}>
              <SwiftText
                modifiers={[
                  font({ size: 12 }),
                  foregroundStyle(p.textSec),
                  lineLimit(1),
                ]}
              >
                {bill.dueDate}
              </SwiftText>
              <SwiftText modifiers={[font({ size: 12 }), foregroundStyle(p.textSec)]}>·</SwiftText>
              <SwiftText
                modifiers={[
                  font({ size: 12 }),
                  foregroundStyle(bill.daysColor),
                  lineLimit(1),
                ]}
              >
                {bill.daysText}
              </SwiftText>
            </HStack>
          </VStack>
          <Spacer minLength={SPACE.sm} />
          <SwiftText
            modifiers={[
              font({ size: 15, weight: 'semibold' }),
              foregroundStyle(p.text),
              lineLimit(1),
            ]}
          >
            {bill.amountText}
          </SwiftText>
        </HStack>

        {!last && (
          <Rectangle
            modifiers={[
              frame({ height: 1, maxWidth: 10000 }),
              foregroundStyle(p.hairline),
            ]}
          />
        )}
      </VStack>
    </SwiftButton>
  );

  if (!bill.onPaid) return row;

  return (
    <SwipeActions>
      {row}
      <SwipeActions.Actions edge="trailing" allowsFullSwipe>
        <SwiftButton
          label="Paid"
          systemImage="checkmark"
          onPress={bill.onPaid}
          modifiers={[tint(HERO_AVAIL)]}
        />
      </SwipeActions.Actions>
    </SwipeActions>
  );
}

function NativeUpcomingSkeleton({ p }: { p: P }) {
  const block = (width: number, height: number, radius: number) => (
    <RoundedRectangle
      cornerRadius={radius}
      modifiers={[
        frame({ width, height }),
        foregroundStyle(p.hairline),
      ]}
    />
  );

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[padding({ top: SPACE.xs }), frame({ maxWidth: 10000, alignment: 'leading' })]}
    >
      {[0, 1, 2].map(index => (
        <VStack key={index} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
          <HStack
            alignment="center"
            spacing={SPACE.md}
            modifiers={[padding({ top: 14, bottom: 14 }), frame({ maxWidth: 10000, alignment: 'leading' })]}
          >
            {block(36, 36, 18)}
            <VStack alignment="leading" spacing={8} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
              {block(index === 1 ? 116 : 92, 13, 4)}
              {block(index === 2 ? 72 : 96, 11, 4)}
            </VStack>
            <Spacer />
            {block(62, 14, 4)}
          </HStack>
          {index < 2 && (
            <Rectangle
              modifiers={[
                frame({ height: 1, maxWidth: 10000 }),
                foregroundStyle(p.hairline),
              ]}
            />
          )}
        </VStack>
      ))}
    </VStack>
  );
}

function NativeHomeActivitySection({
  dark,
  p,
  accent,
  loading,
  groups,
  onSeeAll,
}: {
  dark: boolean;
  p: P;
  accent: string;
  loading: boolean;
  groups: NativeHomeActivityGroup[];
  onSeeAll: () => void;
}) {
  const glassTint = dark ? 'rgba(18,20,22,0.46)' : 'rgba(255,255,255,0.72)';
  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const sectionChromeHeight = LAYOUT.cardPadTop + 18 + SPACE.md + LAYOUT.cardPadBottom;
  const groupLabelHeight = 27;
  const rowHeight = 64;
  const sectionHeight = loading
    ? 332
    : itemCount === 0
      ? 116
      : sectionChromeHeight
        + groups.length * groupLabelHeight
        + itemCount * rowHeight
        + Math.max(0, groups.length - 1) * SPACE.md;

  return (
    <Host
      ignoreSafeArea="all"
      colorScheme={dark ? 'dark' : 'light'}
      style={{ width: '100%', height: sectionHeight }}
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
          <HStack alignment="center" spacing={SPACE.md} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
            <SwiftText
              modifiers={[
                font({ size: 14, weight: 'semibold' }),
                foregroundStyle(p.text),
              ]}
            >
              Activity
            </SwiftText>
            <Spacer />
            <SwiftButton
              label="See all"
              onPress={onSeeAll}
              modifiers={[tint(accent)]}
            />
          </HStack>

          {loading ? (
            <NativeHomeActivitySkeleton p={p} />
          ) : itemCount === 0 ? (
            <SwiftText
              modifiers={[
                padding({ top: SPACE.md }),
                font({ size: 14 }),
                foregroundStyle(p.textTer),
                lineLimit(2),
              ]}
            >
              No expenses logged yet. Tap + below to add one by voice or text.
            </SwiftText>
          ) : (
            <VStack
              alignment="leading"
              spacing={SPACE.md}
              modifiers={[padding({ top: SPACE.md }), frame({ maxWidth: 10000, alignment: 'leading' })]}
            >
              {groups.map(group => (
                <VStack key={group.key} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
                  <SwiftText
                    modifiers={[
                      font({ size: 12, weight: 'semibold' }),
                      foregroundStyle(p.textTer),
                      padding({ bottom: SPACE.sm }),
                    ]}
                  >
                    {group.label}
                  </SwiftText>
                  {group.items.map((item, index) => (
                    <NativeHomeActivityRow
                      key={item.id}
                      item={item}
                      p={p}
                      last={index === group.items.length - 1}
                    />
                  ))}
                </VStack>
              ))}
            </VStack>
          )}
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}

function NativeHomeActivityRow({
  item,
  p,
  last,
}: {
  item: NativeHomeActivityItem;
  p: P;
  last: boolean;
}) {
  const row = (
    <SwiftButton
      onPress={item.onOpen}
      modifiers={[
        swiftAccessibilityLabel(item.accessibilityLabel),
        ...(item.accessibilityHint ? [swiftAccessibilityHint(item.accessibilityHint)] : []),
      ]}
    >
      <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
        <HStack
          alignment="center"
          spacing={SPACE.md}
          modifiers={[
            padding({ top: 14, bottom: 14 }),
            frame({ maxWidth: 10000, alignment: 'leading' }),
          ]}
        >
          <NativeMerchantMark
            logoUrl={item.logoUrl}
            logoBgColor={item.logoBgColor}
            fallbackSystemName={item.symbol}
            fallbackColor={item.iconColor}
            fallbackBackgroundColor={`${item.iconColor}24`}
            size={32}
          />
          <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
            <SwiftText
              modifiers={[
                font({ size: 15, weight: 'semibold' }),
                foregroundStyle(p.text),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {item.merchant}
            </SwiftText>
            <SwiftText
              modifiers={[
                font({ size: 12 }),
                foregroundStyle(p.textSec),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {item.meta} · {item.time}
            </SwiftText>
          </VStack>
          <Spacer minLength={SPACE.sm} />
          <SwiftText
            modifiers={[
              font({ size: 15, weight: 'semibold' }),
              foregroundStyle(p.text),
              lineLimit(1),
            ]}
          >
            {item.amountText}
          </SwiftText>
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
    </SwiftButton>
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

function NativeHomeActivitySkeleton({ p }: { p: P }) {
  const block = (width: number, height: number, radius: number) => (
    <RoundedRectangle
      cornerRadius={radius}
      modifiers={[
        frame({ width, height }),
        foregroundStyle(p.hairline),
      ]}
    />
  );

  return (
    <VStack alignment="leading" spacing={SPACE.md} modifiers={[padding({ top: SPACE.md }), frame({ maxWidth: 10000, alignment: 'leading' })]}>
      {[2, 3].map((count, groupIndex) => (
        <VStack key={groupIndex} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
          {block(70, 11, 4)}
          {Array.from({ length: count }).map((_, index) => (
            <VStack key={index} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
              <HStack
                alignment="center"
                spacing={SPACE.md}
                modifiers={[
                  padding({ top: 14, bottom: 14 }),
                  frame({ maxWidth: 10000, alignment: 'leading' }),
                ]}
              >
                {block(32, 32, 16)}
                <VStack alignment="leading" spacing={8} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
                  {block(index === 0 ? 108 : 86, 13, 4)}
                  {block(index === 1 ? 76 : 112, 11, 4)}
                </VStack>
                <Spacer />
                {block(62, 14, 4)}
              </HStack>
              {index < count - 1 ? (
                <Rectangle
                  modifiers={[
                    frame({ height: 1, maxWidth: 10000 }),
                    foregroundStyle(p.hairline),
                  ]}
                />
              ) : null}
            </VStack>
          ))}
        </VStack>
      ))}
    </VStack>
  );
}

// ── Skeleton loaders ─────────────────────────────────────────────
function CategorySkeleton({ dark }: { dark: boolean }) {
  const groups = [{ subs: 4 }, { subs: 0 }, { subs: 2 }];
  const hairline = dark ? MEDIA.hairline : 'rgba(14,12,24,0.09)';
  return (
    <View>
      {groups.map((g, gi) => (
        <View key={gi} style={{ paddingBottom: 4, borderBottomWidth: gi < 2 ? 1 : 0, borderBottomColor: hairline }}>
          <View style={{ paddingVertical: 20, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width={52} height={11} radius={4} onMedia={dark} />
              <Skeleton width={52} height={14} radius={4} onMedia={dark} />
            </View>
            <Skeleton width="100%" height={6} radius={3} onMedia={dark} />
            <Skeleton width={140} height={11} radius={4} onMedia={dark} />
          </View>
          {g.subs > 0 ? (
            <View style={{ gap: 13, paddingBottom: 20 }}>
              {Array.from({ length: g.subs }).map((_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Skeleton width={28} height={28} radius={8} onMedia={dark} />
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Skeleton width={72} height={12} radius={4} onMedia={dark} />
                      <Skeleton width={64} height={12} radius={4} onMedia={dark} />
                    </View>
                    <Skeleton width="100%" height={4} radius={2} onMedia={dark} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 7, paddingBottom: 20 }}>
              {[0, 1, 2].map(i => (
                <Skeleton key={i} width={undefined} height={46} radius={10} onMedia={dark} style={{ flex: 1 }} />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function BillsSkeleton({ dark }: { dark: boolean }) {
  const hairline = dark ? MEDIA.hairline : 'rgba(14,12,24,0.09)';
  return (
    <View>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={[styles.billRow, {
          borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: hairline,
        }]}>
          <Skeleton width={36} height={36} radius={18} onMedia={dark} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="48%" height={13} radius={4} onMedia={dark} />
            <Skeleton width="42%" height={11} radius={4} onMedia={dark} />
          </View>
          <Skeleton width={54} height={14} radius={4} onMedia={dark} />
        </View>
      ))}
    </View>
  );
}

function ActivitySkeleton({ dark }: { dark: boolean }) {
  const hairline = dark ? MEDIA.hairline : 'rgba(14,12,24,0.09)';
  return (
    <View>
      {[2, 3].map((rowCount, g) => (
        <View key={g} style={{ marginBottom: 16 }}>
          <Skeleton width={70} height={11} radius={4} onMedia={dark} style={{ marginBottom: 8, marginLeft: 2 }} />
          {Array.from({ length: rowCount }).map((_, i) => (
            <View key={i} style={[styles.txRow, {
              borderBottomWidth: i < rowCount - 1 ? 1 : 0, borderBottomColor: hairline,
            }]}>
              <Skeleton width={36} height={36} radius={18} onMedia={dark} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="48%" height={13} radius={4} onMedia={dark} />
                <Skeleton width="32%" height={11} radius={4} onMedia={dark} />
              </View>
              <Skeleton width={54} height={14} radius={4} onMedia={dark} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── SwipeBillRow ──────────────────────────────────────────────────
function SwipeBillRow({ children, onPaid, onOpen, onClose }: {
  children: React.ReactNode;
  onPaid?: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  if (!onPaid) return <>{children}</>;
  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
      return (
        <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
          <TouchableOpacity
            onPress={onPaid}
            style={[styles.paidAction, { marginLeft: 8 }]}
          >
            <Icon name="check" size={18} color={ON_GROUP_ICON} stroke={2.2} />
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [onPaid],
  );
  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      friction={1}
      overshootRight={false}
      rightThreshold={30}
      activeOffsetX={[-22, 22]}
      failOffsetY={[-12, 12]}
      onSwipeableWillOpen={() => onOpen(swipeRef.current!)}
      onSwipeableClose={onClose}
    >
      {children}
    </Swipeable>
  );
}

// ── SwipeTxRow ────────────────────────────────────────────────────
function SwipeTxRow({ children, onDelete, onOpen, onClose }: {
  children: React.ReactNode;
  onDelete?: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  if (!onDelete) return <>{children}</>;
  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
      return (
        <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onDelete();
            }}
            style={[styles.deleteAction, { marginLeft: 8 }]}
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
          >
            <Icon name="trash" size={18} color={ON_GROUP_ICON} stroke={1.6} />
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [onDelete],
  );
  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      friction={1}
      overshootRight={false}
      rightThreshold={30}
      activeOffsetX={[-22, 22]}
      failOffsetY={[-12, 12]}
      onSwipeableWillOpen={() => onOpen(swipeRef.current!)}
      onSwipeableClose={onClose}
    >
      {children}
    </Swipeable>
  );
}

// ── TxRow ─────────────────────────────────────────────────────────
const TxRow = React.memo(function TxRow({
  tx, onPress, onPrepare, onDelete, last, dark, p, cats, categories, members,
}: {
  tx: Transaction;
  onPress: () => void;
  onPrepare?: () => void;
  onDelete?: () => void;
  last: boolean;
  dark: boolean;
  p: P;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  members: LedgerMember[];
}) {
  const cat = cats[tx.cat];
  const meta = appendMemberLabel(cat?.label ?? UNCATEGORIZED_LABEL, members, tx.createdByUserId);
  const a11yLabel = `${tx.merchant}, ${meta}, ${tx.time}, $${fmtAmount(tx.amount)}`;
  return (
    <GHTouchableOpacity
      onPressIn={onPrepare}
      onPress={onPress}
      activeOpacity={0.6}
      style={[styles.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: p.hairline }]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={onDelete ? 'Swipe left to delete' : undefined}
      accessibilityActions={onDelete ? [{ name: 'delete', label: 'Delete transaction' }] : undefined}
      onAccessibilityAction={onDelete ? (e: { nativeEvent: { actionName: string } }) => {
        if (e.nativeEvent.actionName === 'delete') onDelete?.();
      } : undefined}
    >
      <MerchantMark
        merchant={tx.merchant}
        catIcon={cat?.icon}
        color={categoryGroupColor(tx.cat, categories, dark)}
        logoEnabled={transactionUsesMerchantLogo(tx)}
        size={32}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={1} ellipsizeMode="tail">{tx.merchant}</Text>
        <Text style={[styles.rowSub, { color: p.textSec }]}>{meta} · {tx.time}</Text>
      </View>
      <Money value={tx.amount} theme={{ text: p.text } as Theme} color={p.text} prefix="$" />
    </GHTouchableOpacity>
  );
});

// ── MoreMenuButton ────────────────────────────────────────────────
// Uses @react-native-menu/menu (UIKit UIMenu) — visually identical to
// SwiftUI Menu but without the SwiftUI Host lifecycle bug that broke
// off-screen menus on app foreground.
function MoreMenuButton({
  theme, p, shadow, onEditTheme, onContributeGoal,
}: {
  theme: Theme;
  p: P;
  shadow?: object;
  onEditTheme: () => void;
  onContributeGoal: () => void;
}) {
  const colors = quickActionColors(theme, p);
  return (
    <MenuView
      shouldOpenOnLongPress={false}
      themeVariant={theme.dark ? 'dark' : 'light'}
      actions={[
        { id: 'contribute-goal', title: 'Contribute to goal', image: 'target', imageColor: colors.menuImageColor },
        { id: 'theme', title: 'Edit theme', image: 'paintbrush', imageColor: colors.menuImageColor },
      ]}
      onPressAction={({ nativeEvent }) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (nativeEvent.event === 'contribute-goal') onContributeGoal();
        if (nativeEvent.event === 'theme') onEditTheme();
      }}
      style={styles.qa}
    >
      <Animated.View style={styles.qaInner}>
        {SUPPORTS_GLASS ? (
          <GlassCircleIcon systemImage="ellipsis" size={56} iconSize={22} iconColor={colors.iconFg} glassTint={colors.glassTint} />
        ) : (
          <View style={[styles.qaCircle, { backgroundColor: colors.circleBg, borderColor: colors.circleBorder }]}>
            <Icon name="ellipsis" size={20} color={colors.iconFg} stroke={1.7} />
          </View>
        )}
        <Text style={[styles.qaLabel, { color: colors.labelFg }, shadow]}>More</Text>
      </Animated.View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: LAYOUT.cardPadX,
    paddingBottom: SPACE.sm,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingHorizontal: SPACE.xxl,
    paddingTop: SPACE.xxl,
    paddingBottom: SPACE.xxxl,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.lg,
    height: 30,
  },
  heroStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    flexShrink: 1,
  },
  heroStatusLabel: {
    ...TYPE.onMediaStatus,
  },
  heroStatusDiv: {
    width: 1,
    height: 14,
  },
  heroStatusSub: {
    ...TYPE.onMediaStatusSub,
  },
  heroAmountRow: {
    marginBottom: SPACE.lg,
    alignItems: 'flex-start',
  },

  heroAmount: {
    ...TYPE.onMediaAmount,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: LAYOUT.cardPadX,
    marginBottom: 28,
  },
  qa: {
    flex: 1,
  },
  monthPickerHost: {
    height: 30,
    width: 130,
  },
  monthPickerBtn: {
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
  monthPickerText: {
    ...TYPE.onMediaStatusSubMd,
  },
  qaInner: {
    alignItems: 'center',
    gap: SPACE.sm,
  },
  qaCircle: {
    width: 56,
    height: 56,
    borderRadius: 28, // width/2 — circle
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    ...TYPE.onMediaQa,
  },
  sectionStack: {
    paddingHorizontal: LAYOUT.screenGutter,
    gap: LAYOUT.sectionGap,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ledgerLabel: {
    ...TYPE.sectionTitle,
  },
  ledgerAction: {
    ...TYPE.captionEm,
    paddingTop: 3,
  },
  dayLabel: {
    ...TYPE.txDateLabel,
    marginBottom: 8,
  },
  emptyMonthText: {
    ...TYPE.bodySm,
    paddingTop: 2,
    paddingBottom: 8,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18, // width/2 — circle
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTitle: {
    ...TYPE.body,
  },
  rowSub: {
    ...TYPE.caption,
    marginTop: 2,
  },
  rowAmt: {
    ...TYPE.bodySm,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: LAYOUT.rowPadY,
  },
  paidAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GROUP_COLORS.savings.light,
  },
  deleteAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OVER_DOT,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: LAYOUT.rowPadY,
  },
});
