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
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Swipeable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { useTheme } from '../ThemeProvider';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, OVER_DOT, cautionText, CAUTION_AMBER, HERO_AVAIL, GROUP_COLORS } from '../theme';
import { MEDIA, DARK_TEXT_SHADOW, makeP, WallpaperP as P } from '../wallpaperPalette';
import { Skeleton } from '../components/Skeleton';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import type { Bill, Category, Transaction } from '../repositories/types';
import { advanceDueDate, monthBudgets, monthlyIncome, spendGroups, upcomingBillsFromRecurring } from '../selectors/finance';
import { Icon } from '../components/Icon';
import { HeaderIcon, useHeaderScroll } from '../components/headerScroll';
import { HomeSpendGroups } from '../components/HomeSpendGroups';
import { ThemeToggle } from '../components/ThemeToggle';
import { TYPE } from '../typography';

// ── Budget progress bar ──────────────────────────────────────────
function BudgetBar({ pct, trackBg }: { pct: number; trackBg: string }) {
  const [barW, setBarW] = useState(0);
  const H = 5, R = 3;
  const color = pct >= 1.0 ? OVER_DOT
    : pct >= 0.9  ? CAUTION_AMBER
    : pct >= 0.75 ? GROUP_COLORS.wants.light
    : HERO_AVAIL;
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
// All colors adapt dark/light via the adaptive palette.
// `primary` swaps the circle to the accent fill — used for Voice, the
// signature capture action, so it visually rhymes with the tab-bar mic.
const QuickAction = React.forwardRef<View, {
  icon: string;
  label: string;
  onPress: () => void;
  dark: boolean;
  p: P;
  shadow?: object;
  primary?: boolean;
  accent?: { fill: string; ink: string };
}>(function QuickAction(
  { icon, label, onPress, dark, p, shadow, primary, accent },
  ref,
) {
  const circleBg     = primary && accent
    ? accent.fill
    : dark ? 'rgba(28,22,56,0.55)' : 'rgba(255,255,255,0.92)';
  const circleBorder = primary && accent
    ? 'transparent'
    : dark ? 'rgba(235,225,255,0.20)' : 'rgba(14,12,24,0.10)';
  const iconColor = primary && accent
    ? accent.ink
    : dark ? p.text : '#0E0C18';
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };
  return (
    <View ref={ref} collapsable={false} style={styles.qa}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.qaInner, { opacity: pressed ? 0.7 : 1 }]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={[styles.qaCircle, { backgroundColor: circleBg, borderColor: circleBorder }]}>
          <Icon name={icon} size={20} color={iconColor} stroke={1.7} />
        </View>
        <Text style={[styles.qaLabel, { color: p.text }, shadow]}>{label}</Text>
      </Pressable>
    </View>
  );
});

// ── Section card ─────────────────────────────────────────────────
// Dark: heavy dark frost (intensity 70). Light: light frost (intensity 35)
// — barely opaque so the vivid wallpaper bleeds through.
function SectionCard({ children, style, dark }: { children: React.ReactNode; style?: any; dark: boolean }) {
  const borderColor = dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';
  return (
    <BlurView
      intensity={dark ? 70 : 100}
      tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
      style={[styles.sectionCard, style]}
    >
      <View style={[styles.sectionCardBorder, { borderColor }]}>
        {children}
      </View>
    </BlurView>
  );
}

interface Props {
  theme: Theme;
  onViewSpending: () => void;
  onViewActivity: () => void;
  onOpenDrawer: () => void;
  onAddVoice: () => void;
  onAddManual: () => void;
  onAddRecurring: () => void;
  onLogIncome: () => void;
  onOpenTheme: () => void;
  onOpenTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
  onOpenBill: (bill: Bill) => void;
}

export function HomeScreen({ theme, onViewSpending, onViewActivity, onOpenDrawer, onAddVoice, onAddManual, onAddRecurring, onLogIncome, onOpenTheme, onOpenTx, onDeleteTx, onOpenBill }: Props) {
  const { transactionsRepo, incomeRepo, budgetsRepo, categoriesRepo, recurringRulesRepo } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const incomes = useRepositoryList(incomeRepo);
  const budgets = useRepositoryList(budgetsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const upcomingBills = useMemo(() => upcomingBillsFromRecurring(recurringRules, categories), [recurringRules, categories]);
  const { wallpaper } = useTheme();
  const insets = useSafeAreaInsets();
  // pWallpaper: hero, header, quick-actions — always on the wallpaper, always white.
  // p: card interiors — adaptive (dark text in light mode reads on light frosted glass).
  const pWallpaper = makeP(true);
  const p = makeP(theme.dark);
  // Text shadow for hero/header text — wallpaper is behind it in both modes.
  const shadow = DARK_TEXT_SHADOW;

  const groups = useMemo(() => {
    const g: Record<string, Transaction[]> = { today: [], yesterday: [], earlier: [] };
    transactions.forEach(t => g[t.when].push(t));
    return g;
  }, [transactions]);

  const [monthIdx, setMonthIdx] = useState(0);
  const visibleMonthBudgets = useMemo(() => monthBudgets(transactions, budgets), [transactions, budgets]);
  const visibleSpendGroups = useMemo(() => spendGroups(transactions, budgets, categories), [transactions, budgets, categories]);
  const income = useMemo(() => monthlyIncome(incomes), [incomes]);
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
    transactionsRepo.create({
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
    const rule = recurringRulesRepo.get(ruleId);
    if (rule) {
      recurringRulesRepo.update(ruleId, {
        nextDueDate: advanceDueDate(rule),
        meta: { ...rule.meta, partialPaid: undefined },
      });
    }
  }, [transactionsRepo, recurringRulesRepo]);

  const handleEditTheme = () => {
    onOpenTheme();
  };

  const { scrollY, headerBgOpacity, iconScrolledOpacity } = useHeaderScroll();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);


  const onRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    setTimeout(() => { setLoading(false); setRefreshing(false); }, 1100);
  };

  const rawPct = mb.budget > 0 ? mb.spent / mb.budget : 0;
  const available = Math.max(mb.budget - mb.spent, 0);
  const overage = mb.spent - mb.budget;
  const over = mb.spent > mb.budget;

  // Dark mode: violet-black scrim — cards are dark glass on a darkened scene.
  // Light mode: no tint — wallpaper shows through fully; light frosted glass
  // cards sit directly on the vivid wallpaper.
  const scrimTop    = theme.dark ? 'rgba(8,6,20,0.55)' : 'rgba(8,6,20,0.3)' ;
  const scrimMid    = theme.dark ? 'rgba(8,6,20,0.34)' : 'rgba(8,6,20,0.3)' ;
  const scrimLower  = theme.dark ? 'rgba(8,6,20,0.68)' : 'rgba(8,6,20,0.2)' ;
  const scrimBottom = theme.dark ? 'rgba(8,6,20,0.88)' : 'transparent';

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? '#000' : '#F8F6FF' }}>
      <ImageBackground source={wallpaper.source} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
        <LinearGradient
          pointerEvents="none"
          colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
          locations={[0, 0.28, 0.60, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* ─── Header ─────────────────────────────── */}
        <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { opacity: headerBgOpacity }]}
          >
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.headerDivider, {
              backgroundColor: theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)',
            }]} />
          </Animated.View>
          <View style={styles.headerRow}>
            <IconBtn onPress={onOpenDrawer} accessibilityLabel="Open menu">
              <HeaderIcon
                name="menu"
                wallpaperColor={pWallpaper.text}
                scrolledColor={p.text}
                scrolledOpacity={iconScrolledOpacity}
              />
            </IconBtn>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <View style={[styles.iconBtn, { width: 40, height: 40 }]}>
                <HeaderIcon
                  name="bell"
                  wallpaperColor={pWallpaper.text}
                  scrolledColor={p.text}
                  scrolledOpacity={iconScrolledOpacity}
                />
                <View style={[styles.bellDot, {
                  backgroundColor: OVER_DOT,
                  borderColor: 'rgba(8,6,20,0.4)',
                }]} />
              </View>
              <ThemeToggle />
            </View>
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
            <View style={styles.heroTopRow}>
              <View style={styles.heroStatusGroup}>
                {loading ? (
                  <Skeleton width={150} height={13} radius={4} onMedia={theme.dark} />
                ) : (
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
                )}
              </View>
              {loading ? (
                <Skeleton width={88} height={13} radius={4} onMedia={theme.dark} />
              ) : (
                <MenuView
                  shouldOpenOnLongPress={false}
                  themeVariant={theme.dark ? 'dark' : 'light'}
                  actions={visibleMonthBudgets.map((m, idx) => ({
                    id: String(idx),
                    title: `${m.month} ${m.key.split('-')[0]}`,
                    state: idx === monthIdx ? 'on' : 'off',
                  }))}
                  onPressAction={({ nativeEvent }) => setMonthIdx(Number(nativeEvent.event))}
                  style={styles.monthPickerHost}
                >
                  <View style={styles.monthPickerBtn}>
                    <Text style={[styles.monthPickerText, { color: pWallpaper.text }, shadow]}>
                      {visibleMonthBudgets[monthIdx]?.month} {visibleMonthBudgets[monthIdx]?.key.split('-')[0]}
                    </Text>
                    <Icon name="chevDown" size={11} color={pWallpaper.text} stroke={2} />
                  </View>
                </MenuView>
              )}
            </View>

            {loading ? (
              <>
                <Skeleton width={220} height={42} radius={8} onMedia={theme.dark} style={{ marginBottom: 18 }} />
                <Skeleton width="100%" height={5} radius={3} onMedia={theme.dark} />
              </>
            ) : (
              <>
                <View style={styles.heroAmountRow}>
                  <HeroAmount
                    value={over ? overage : available}
                    prefix={over ? '-$' : '$'}
                    color={over ? OVER_DOT : pWallpaper.text}
                    shadow={shadow}
                  />
                </View>
                <BudgetBar pct={rawPct} trackBg={pWallpaper.trackBg} />
              </>
            )}
          </View>

          {/* ─── Quick actions ─────────────────────── */}
          {/* Three capture modes (voice / manual / income) plus a More menu */}
          {/* for less-frequent options. Voice carries the accent fill so it */}
          {/* visually rhymes with the tab-bar mic button: same action. */}
          <View style={styles.quickRow}>
            <QuickAction
              icon="mic"
              label="Voice"
              onPress={onAddVoice}
              dark={theme.dark}
              p={pWallpaper}
              shadow={shadow}
              primary
              accent={{ fill: theme.accent.fill, ink: theme.accent.ink }}
            />
            <QuickAction icon="keypad"   label="Manual"   onPress={onAddManual}     dark={theme.dark} p={pWallpaper} shadow={shadow} />
            <QuickAction icon="plus"     label="Income"   onPress={onLogIncome} dark={theme.dark} p={pWallpaper} shadow={shadow} />
            <MoreMenuButton
              dark={theme.dark}
              p={pWallpaper}
              shadow={shadow}
              onEditTheme={handleEditTheme}
              onAddRecurring={onAddRecurring}
            />
          </View>

          {/* ─── Sections stack ──────────────────── */}
          <View style={styles.sectionStack}>

            {/* Spending */}
            <SectionCard dark={theme.dark}>
              <View style={styles.sectionHead}>
                <Text style={[styles.ledgerLabel, { color: p.text }]}>Spending</Text>
                <TouchableOpacity onPress={onViewSpending} activeOpacity={0.6} delayPressIn={0}>
                  <Text style={[styles.ledgerAction, { color: p.text }]}>See all</Text>
                </TouchableOpacity>
              </View>
              {loading ? (
                <CategorySkeleton dark={theme.dark} />
              ) : (
                <HomeSpendGroups theme={theme} groups={visibleSpendGroups} income={income} compact onMedia={theme.dark} />
              )}
            </SectionCard>

            {/* Upcoming */}
            <SectionCard dark={theme.dark}>
              <View style={styles.sectionHead}>
                <Text style={[styles.ledgerLabel, { color: p.text }]}>Upcoming</Text>
              </View>
              {loading ? (
                <BillsSkeleton dark={theme.dark} />
              ) : (
                upcomingBills.map((b, i) => {
                  const amountStr = `${b.estimate ? '~' : ''}$${b.amount.toFixed(b.amount % 1 === 0 ? 0 : 2)}`;
                  const a11y = `${b.name}, due ${b.dueDate}, in ${b.daysUntil} days, ${amountStr}`;
                  return (
                    <SwipeBillRow
                      key={b.id}
                      onPaid={() => markBillPaid(b)}
                      onOpen={handleSwipeOpen}
                      onClose={handleSwipeClose}
                    >
                      <TouchableOpacity
                        onPress={() => onOpenBill(b)}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        style={[
                          styles.billRow,
                          { borderBottomWidth: i < upcomingBills.length - 1 ? 1 : 0, borderBottomColor: p.hairline },
                        ]}
                        accessible
                        accessibilityLabel={a11y}
                      >
                        <View style={[styles.rowIcon, { backgroundColor: categoryGroupColor(b.cat, categories, theme.dark) }]}
                          accessibilityElementsHidden importantForAccessibility="no">
                          <Icon name={b.icon} size={16} color="#FBF8FF" stroke={1.6} />
                        </View>
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
                        <Text style={[styles.rowAmt, { color: p.text }]}>{amountStr}</Text>
                      </TouchableOpacity>
                    </SwipeBillRow>
                  );
                })
              )}
            </SectionCard>

            {/* Activity */}
            <SectionCard dark={theme.dark}>
              <View style={styles.sectionHead}>
                <Text style={[styles.ledgerLabel, { color: p.text }]}>Activity</Text>
                <TouchableOpacity onPress={onViewActivity} activeOpacity={0.6} delayPressIn={0}>
                  <Text style={[styles.ledgerAction, { color: p.text }]}>See all</Text>
                </TouchableOpacity>
              </View>
              {loading ? (
                <ActivitySkeleton dark={theme.dark} />
              ) : (
                (['today', 'yesterday', 'earlier'] as const).map(key =>
                  groups[key].length > 0 && (
                    <View key={key} style={{ marginBottom: 14 }}>
                      <Text style={[styles.dayLabel, { color: p.textTer }]}>
                        {key === 'today' ? 'Today' : key === 'yesterday' ? 'Yesterday' : 'This week'}
                      </Text>
                      {groups[key].map((tx, i, arr) => (
                        <SwipeTxRow
                          key={tx.id}
                          onDelete={() => onDeleteTx(tx)}
                          onOpen={handleSwipeOpen}
                          onClose={handleSwipeClose}
                        >
                          <TxRow tx={tx}
                            onPress={() => onOpenTx(tx)} last={i === arr.length - 1}
                            dark={theme.dark} p={p} cats={cats} categories={categories} />
                        </SwipeTxRow>
                      ))}
                    </View>
                  )
                )
              )}
            </SectionCard>

          </View>
        </Animated.ScrollView>

      </ImageBackground>
    </View>
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
          <View style={{ paddingVertical: 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width={52} height={11} radius={4} onMedia={dark} />
              <Skeleton width={52} height={14} radius={4} onMedia={dark} />
            </View>
            <Skeleton width="100%" height={6} radius={3} onMedia={dark} />
            <Skeleton width={140} height={11} radius={4} onMedia={dark} />
          </View>
          {g.subs > 0 ? (
            <View style={{ gap: 13, paddingBottom: 18 }}>
              {Array.from({ length: g.subs }).map((_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
            <View style={{ flexDirection: 'row', gap: 7, paddingBottom: 18 }}>
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
          <View style={{ flex: 1, gap: 6 }}>
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
        <View key={g} style={{ marginBottom: 14 }}>
          <Skeleton width={70} height={11} radius={4} onMedia={dark} style={{ marginBottom: 8, marginLeft: 2 }} />
          {Array.from({ length: rowCount }).map((_, i) => (
            <View key={i} style={[styles.txRow, {
              borderBottomWidth: i < rowCount - 1 ? 1 : 0, borderBottomColor: hairline,
            }]}>
              <Skeleton width={36} height={36} radius={18} onMedia={dark} />
              <View style={{ flex: 1, gap: 6 }}>
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
  onPaid: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
    return (
      <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
        <TouchableOpacity
          onPress={onPaid}
          style={[styles.paidAction, { marginLeft: 6 }]}
        >
          <Icon name="check" size={18} color="#FBF8FF" stroke={2.2} />
        </TouchableOpacity>
      </Animated.View>
    );
  };
  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
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

// ── SwipeTxRow ────────────────────────────────────────────────────
function SwipeTxRow({ children, onDelete, onOpen, onClose }: {
  children: React.ReactNode;
  onDelete: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
    return (
      <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
        <TouchableOpacity
          onPress={() => { swipeRef.current?.close(); onDelete(); }}
          style={[styles.deleteAction, { marginLeft: 6 }]}
          accessibilityRole="button"
          accessibilityLabel="Delete transaction"
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

// ── TxRow ─────────────────────────────────────────────────────────
const TxRow = React.memo(function TxRow({
  tx, onPress, last, dark, p, cats, categories,
}: {
  tx: Transaction;
  onPress: () => void;
  last: boolean;
  dark: boolean;
  p: P;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
}) {
  const cat = cats[tx.cat];
  const a11yLabel = `${tx.merchant}, ${cat?.label ?? 'transaction'}, ${tx.time}, $${tx.amount.toFixed(2)}`;
  return (
    <GHTouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[styles.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: p.hairline }]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <View style={[styles.rowIcon, { backgroundColor: categoryGroupColor(tx.cat, categories, dark) }]}
        accessibilityElementsHidden importantForAccessibility="no">
        <Icon name={cat?.icon} size={16} color="#FBF8FF" stroke={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={1} ellipsizeMode="tail">{tx.merchant}</Text>
        <Text style={[styles.rowSub, { color: p.textSec }]}>{cat?.label} · {tx.time}</Text>
      </View>
      <Text style={[styles.rowAmt, { color: p.text }]}>${tx.amount.toFixed(2)}</Text>
    </GHTouchableOpacity>
  );
});

// ── MoreMenuButton ────────────────────────────────────────────────
// Uses @react-native-menu/menu (UIKit UIMenu) — visually identical to
// SwiftUI Menu but without the SwiftUI Host lifecycle bug that broke
// off-screen menus on app foreground.
function MoreMenuButton({
  dark, p, shadow, onEditTheme, onAddRecurring,
}: {
  dark: boolean;
  p: P;
  shadow?: object;
  onEditTheme: () => void;
  onAddRecurring: () => void;
}) {
  const circleBg     = dark ? 'rgba(28,22,56,0.55)' : 'rgba(255,255,255,0.92)';
  const circleBorder = dark ? 'rgba(235,225,255,0.20)' : 'rgba(14,12,24,0.10)';
  const iconColor    = dark ? p.text : '#0E0C18';
  return (
    <MenuView
      shouldOpenOnLongPress={false}
      themeVariant={dark ? 'dark' : 'light'}
      actions={[
        { id: 'theme',     title: 'Edit theme',             image: 'paintbrush',                       imageColor: dark ? '#FFFFFF' : '#000000' },
        { id: 'recurring', title: 'Add recurring expense',  image: 'arrow.triangle.2.circlepath',      imageColor: dark ? '#FFFFFF' : '#000000' },
      ]}
      onPressAction={({ nativeEvent }) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if      (nativeEvent.event === 'theme')     onEditTheme();
        else if (nativeEvent.event === 'recurring') onAddRecurring();
      }}
      style={styles.qa}
    >
      <View style={styles.qaInner}>
        <View style={[styles.qaCircle, { backgroundColor: circleBg, borderColor: circleBorder }]}>
          <Icon name="ellipsis" size={20} color={iconColor} stroke={1.7} />
        </View>
        <Text style={[styles.qaLabel, { color: p.text }, shadow]}>More</Text>
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 8,
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
  bellDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    height: 30,
  },
  heroStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  heroAmount: {
    ...TYPE.onMediaAmount,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 2,
  },
  monthPickerText: {
    ...TYPE.onMediaStatusSub,
    fontWeight: '500',
  },
  qaInner: {
    alignItems: 'center',
    gap: 8,
  },
  qaCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    ...TYPE.onMediaQa,
  },
  sectionStack: {
    paddingHorizontal: 16,
    gap: 22,
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
    paddingBottom: 12,
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
    opacity: 0.82,
    paddingTop: 3,
  },
  dayLabel: {
    ...TYPE.txDateLabel,
    marginBottom: 8,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    gap: 12,
    paddingVertical: 14,
  },
  paidAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
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
    gap: 12,
    paddingVertical: 14,
  },
});
