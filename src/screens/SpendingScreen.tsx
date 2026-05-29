import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  ImageBackground,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text as SwiftText, Host, Menu, RNHostView, Picker } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import { useTheme } from '../ThemeProvider';
import { Theme, OVER_DOT, CAUTION_AMBER, overText, cautionText } from '../theme';
import { MEDIA, DARK_TEXT_SHADOW, makeP, WallpaperP as P } from '../wallpaperPalette';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import { currentMonthlyBudget } from '../selectors/finance';
import {
  generateDateOptions,
  derivePeriodRanges,
  categorySpending,
  merchantSpending,
  spendingTrend,
  type ActivityInitialFilter,
} from '../selectors/spending';
import { Icon } from '../components/Icon';
import { HeaderIcon, useHeaderScroll } from '../components/headerScroll';
import { ThemeToggle } from '../components/ThemeToggle';
import { FinanceBarChart, FinanceLineChart, FinanceDonut } from '../components/charts/FinanceCharts';
import { TYPE } from '../typography';

const { width: SCREEN_W } = Dimensions.get('window');

const CARD_OUTER_PAD = 16;
const CARD_INNER_PAD = 18;
const CARD_W         = SCREEN_W - CARD_OUTER_PAD * 2;
const CHART_INNER_W  = CARD_W - CARD_INNER_PAD * 2;
const CHART_H        = 188;

const CHART_TYPES    = ['Trend', 'Pace', 'Mix'] as const;
const PERIODS        = ['Week', 'Month', 'Year'] as const;
type Period          = (typeof PERIODS)[number];
const BREAKDOWN_TABS = ['Category', 'Merchant'] as const;
type BreakdownMode   = (typeof BREAKDOWN_TABS)[number];

// ── Spending-level delta badge ────────────────────────────────────
type DeltaKind = 'up' | 'down' | 'flat' | 'new' | 'hide';

function computeDelta(spent: number, prevSpent: number): { kind: DeltaKind; pct: number } {
  if (prevSpent === 0 && spent === 0) return { kind: 'hide', pct: 0 };
  if (prevSpent === 0)                return { kind: 'new',  pct: 0 };
  const raw = (spent - prevSpent) / prevSpent;
  const pct = Math.round(Math.abs(raw) * 100);
  if (pct === 0) return { kind: 'flat', pct: 0 };
  return { kind: raw > 0 ? 'up' : 'down', pct };
}

function DeltaBadge({ spent, prevSpent, dark }: { spent: number; prevSpent: number; dark: boolean }) {
  const d = computeDelta(spent, prevSpent);
  if (d.kind === 'hide' || d.kind === 'flat') return null;

  if (d.kind === 'new') {
    return (
      <View style={[styles.deltaBadge, { backgroundColor: dark ? 'rgba(180,160,240,0.12)' : 'rgba(14,12,24,0.06)' }]}>
        <Text style={[styles.deltaText, { color: dark ? MEDIA.textSec : 'rgba(14,12,24,0.55)' }]}>NEW</Text>
      </View>
    );
  }

  const isUp = d.kind === 'up';
  return (
    <View style={[
      styles.deltaBadge,
      {
        backgroundColor: isUp
          ? (dark ? 'rgba(212,82,42,0.18)' : 'rgba(212,82,42,0.12)')
          : (dark ? 'rgba(122,205,138,0.16)' : 'rgba(58,135,80,0.10)'),
      },
    ]}>
      <Text style={[
        styles.deltaText,
        { color: isUp ? OVER_DOT : (dark ? '#7ACD8A' : '#3A8750') },
      ]}>
        {isUp ? '▲' : '▼'} {d.pct}%
      </Text>
    </View>
  );
}

// ── Frosted section card ──────────────────────────────────────────
function SectionCard({ children, style, dark }: { children: React.ReactNode; style?: any; dark: boolean }) {
  const borderColor = dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';
  return (
    <BlurView
      intensity={dark ? 70 : 100}
      tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
      style={[styles.sectionCard, style]}
    >
      <View style={[styles.sectionCardBorder, { borderColor }]}>{children}</View>
    </BlurView>
  );
}

// ── Header icon button ────────────────────────────────────────────
function IconBtn({ onPress, children, label }: { onPress?: () => void; children: React.ReactNode; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}
    >
      {children}
    </Pressable>
  );
}

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
  onViewActivity: (filter: ActivityInitialFilter) => void;
}

export function SpendingScreen({ theme, onOpenDrawer, onViewActivity }: Props) {
  const { transactionsRepo, categoriesRepo, budgetsRepo } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const categories   = useRepositoryList(categoriesRepo);
  const budgets      = useRepositoryList(budgetsRepo);
  const { wallpaper } = useTheme();
  const insets  = useSafeAreaInsets();
  const pWall   = makeP(true);
  const p       = makeP(theme.dark);
  const shadow  = DARK_TEXT_SHADOW;

  const [period,    setPeriod]    = useState<Period>('Week');
  const [chartIdx,  setChartIdx]  = useState(0);
  const [breakdown, setBreakdown] = useState<BreakdownMode>('Category');

  // Per-period date index — remembered independently so switching periods
  // doesn't reset the user's navigation.
  const [dateIdxByPeriod, setDateIdxByPeriod] = useState<Record<Period, number>>({
    Week: 0, Month: 0, Year: 0,
  });

  // Stable "now" so all useMemos agree on the current date across renders.
  const now = useMemo(() => new Date(), []);

  const dateOptions = useMemo(() => generateDateOptions(period, now), [period, now]);
  const dateIdx     = dateIdxByPeriod[period];
  const dateLabel   = dateOptions[dateIdx] ?? dateOptions[0];

  const ranges      = useMemo(() => derivePeriodRanges(period, dateIdx, now), [period, dateIdx, now]);
  const monthlyBgt  = useMemo(() => currentMonthlyBudget(budgets), [budgets]);

  const catBreakdown   = useMemo(
    () => categorySpending(transactions, categories, budgets, ranges, period),
    [transactions, categories, budgets, ranges, period],
  );
  const merchBreakdown = useMemo(
    () => merchantSpending(transactions, categories, ranges),
    [transactions, categories, ranges],
  );
  const trendData = useMemo(
    () => spendingTrend(transactions, ranges, period, monthlyBgt),
    [transactions, ranges, period, monthlyBgt],
  );
  const donutData = useMemo(
    () => catBreakdown.rows.map(r => ({ cat: r.cat, value: r.spent })),
    [catBreakdown.rows],
  );

  const { scrollY, headerBgOpacity, iconScrolledOpacity } = useHeaderScroll();

  const total     = catBreakdown.total;
  const prevTotal = catBreakdown.prevTotal;

  const spendDisplay = (() => {
    const whole = Math.floor(total).toLocaleString();
    const cents = Math.round((total - Math.floor(total)) * 100).toString().padStart(2, '0');
    return { whole: `$${whole}`, cents: `.${cents}` };
  })();
  const deltaPct    = prevTotal > 0 ? (total - prevTotal) / prevTotal : 0;
  const deltaIsDown = deltaPct <= 0;
  const deltaPctAbs = Math.round(Math.abs(deltaPct) * 100);

  const chartScrollRef = useRef<ScrollView>(null);
  const onChartScroll  = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CHART_INNER_W);
    if (idx !== chartIdx && idx >= 0 && idx < CHART_TYPES.length) setChartIdx(idx);
  };

  const periodIdx    = PERIODS.indexOf(period);
  const breakdownIdx = BREAKDOWN_TABS.indexOf(breakdown);

  const scrimTop    = theme.dark ? 'rgba(8,6,20,0.55)' : 'rgba(8,6,20,0.30)';
  const scrimMid    = theme.dark ? 'rgba(8,6,20,0.34)' : 'rgba(8,6,20,0.30)';
  const scrimLower  = theme.dark ? 'rgba(8,6,20,0.68)' : 'rgba(8,6,20,0.20)';
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
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: headerBgOpacity }]}>
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.headerDivider, { backgroundColor: theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)' }]} />
          </Animated.View>
          <View style={styles.headerRow}>
            <IconBtn onPress={onOpenDrawer} label="Open menu">
              <HeaderIcon
                name="menu"
                wallpaperColor={pWall.text}
                scrolledColor={p.text}
                scrolledOpacity={iconScrolledOpacity}
              />
            </IconBtn>
            <ThemeToggle />
          </View>
        </View>

        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
        >
          {/* ─── Date range title ────── */}
          <View style={styles.dateBlock}>
            <View style={styles.weekNavRow}>
              <Pressable
                onPress={() => setDateIdxByPeriod(prev => ({ ...prev, [period]: Math.min(dateIdx + 1, dateOptions.length - 1) }))}
                pointerEvents="box-only"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.weekNavBtn}
                accessibilityRole="button"
                accessibilityLabel="Previous period"
              >
                <Icon name="chevL" size={20} color={pWall.text} stroke={2.2} />
              </Pressable>

              {period === 'Week' ? (
                <Text style={[styles.dateTitle, styles.dateTitleWeek, { color: pWall.text, flex: 1, textAlign: 'center' }, shadow]}>
                  {dateLabel}
                </Text>
              ) : (
                <Host style={styles.weekNavMenuHost}>
                  <Menu
                    label={
                      <RNHostView>
                        <View style={styles.weekNavMenuLabel}>
                          <Text style={[styles.dateTitle, styles.dateTitleWeek, { color: pWall.text, textAlign: 'center' }, shadow]}>
                            {dateLabel}
                          </Text>
                          <Icon name="chevDown" size={13} color={pWall.text} stroke={2.2} />
                        </View>
                      </RNHostView>
                    }
                  >
                    <Picker
                      selection={dateIdx}
                      onSelectionChange={(val) => {
                        const next = Number(val);
                        setDateIdxByPeriod(prev => ({ ...prev, [period]: next }));
                      }}
                      modifiers={[pickerStyle('inline'), tint(theme.accent.dot)]}
                    >
                      {dateOptions.map((opt, idx) => (
                        <SwiftText key={opt} modifiers={[tag(idx)]}>{opt}</SwiftText>
                      ))}
                    </Picker>
                  </Menu>
                </Host>
              )}

              <Pressable
                onPress={() => setDateIdxByPeriod(prev => ({ ...prev, [period]: Math.max(dateIdx - 1, 0) }))}
                pointerEvents="box-only"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.weekNavBtn, { opacity: dateIdx === 0 ? 0.3 : 1 }]}
                disabled={dateIdx === 0}
                accessibilityRole="button"
                accessibilityLabel="Next period"
              >
                <Icon name="chevR" size={20} color={pWall.text} stroke={2.2} />
              </Pressable>
            </View>
          </View>

          {/* ─── Week / Month / Year segmented ──── */}
          <View style={styles.segmentWrap}>
            <SegmentedControl
              values={PERIODS as unknown as string[]}
              selectedIndex={periodIdx}
              onChange={(e) => {
                const next = PERIODS[e.nativeEvent.selectedSegmentIndex];
                if (next) setPeriod(next);
              }}
              tintColor={theme.accent.dot}
              appearance={theme.dark ? 'dark' : 'light'}
            />
          </View>

          {/* ─── Sections ─────────────────────────── */}
          <View style={styles.sectionStack}>

            {/* ── Overview / charts ─────────────── */}
            <SectionCard dark={theme.dark}>
              <View style={styles.chartTopRow}>
                <Text style={[styles.chartTitle, { color: p.text }]}>Overview</Text>
                <View style={[styles.chartTypePill, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(14,12,24,0.06)' }]}>
                  <Text style={[TYPE.captionEm, { color: p.text }]}>{CHART_TYPES[chartIdx]}</Text>
                </View>
              </View>

              <View style={styles.chartHero}>
                <Text style={[styles.chartHeroAmount, { color: p.text }]}>
                  {spendDisplay.whole}
                  <Text style={[styles.chartHeroCents, { color: p.text }]}>{spendDisplay.cents}</Text>
                </Text>
                <View style={styles.chartHeroSubRow}>
                  <Text style={[styles.chartHeroLabel, { color: p.textSec }]}>Total spend</Text>
                  {prevTotal > 0 && (
                    <View style={[
                      styles.heroOverviewDelta,
                      {
                        backgroundColor: deltaIsDown
                          ? (theme.dark ? 'rgba(122,205,138,0.16)' : 'rgba(58,135,80,0.10)')
                          : (theme.dark ? 'rgba(212,82,42,0.18)' : 'rgba(212,82,42,0.12)'),
                      },
                    ]}>
                      <Text style={[styles.deltaText, { color: deltaIsDown ? (theme.dark ? '#7ACD8A' : '#3A8750') : OVER_DOT }]}>
                        {deltaIsDown ? '▼' : '▲'} {deltaPctAbs}%
                      </Text>
                    </View>
                  )}
                  {prevTotal > 0 && <Text style={[styles.chartHeroVs, { color: p.textTer }]}>vs prev</Text>}
                </View>
              </View>

              <ScrollView
                ref={chartScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={onChartScroll}
                onMomentumScrollEnd={onChartScroll}
                scrollEventThrottle={16}
                snapToInterval={CHART_INNER_W}
                decelerationRate="fast"
                disableIntervalMomentum
                bounces={false}
              >
                <View style={[styles.chartSlide, { width: CHART_INNER_W }]}>
                  <FinanceBarChart
                    data={trendData.data}
                    budget={trendData.budget}
                    theme={theme}
                    width={CHART_INNER_W}
                    height={CHART_H}
                  />
                </View>
                <View style={[styles.chartSlide, { width: CHART_INNER_W }]}>
                  <FinanceLineChart
                    data={trendData.data}
                    budget={trendData.budget}
                    theme={theme}
                    width={CHART_INNER_W}
                    height={CHART_H}
                  />
                </View>
                <View style={[styles.chartSlide, { width: CHART_INNER_W, alignItems: 'center', justifyContent: 'center' }]}>
                  <FinanceDonut
                    data={donutData}
                    theme={theme}
                    size={Math.min(CHART_H - 8, 168)}
                    categories={categories}
                  />
                </View>
              </ScrollView>

              <View style={styles.dotsRow}>
                {CHART_TYPES.map((_, i) => {
                  const active = i === chartIdx;
                  return (
                    <View
                      key={i}
                      style={[styles.dot, {
                        backgroundColor: active ? p.text : p.hairlineStrong,
                        width: active ? 18 : 6,
                        opacity: active ? 0.9 : 0.7,
                      }]}
                    />
                  );
                })}
              </View>
            </SectionCard>

            {/* ── Category / Merchant breakdown ──── */}
            <SectionCard dark={theme.dark}>
              <View style={styles.breakdownTabsWrap}>
                <SegmentedControl
                  values={BREAKDOWN_TABS as unknown as string[]}
                  selectedIndex={breakdownIdx}
                  onChange={(e) => {
                    const next = BREAKDOWN_TABS[e.nativeEvent.selectedSegmentIndex];
                    if (next) setBreakdown(next);
                  }}
                  tintColor={theme.accent.dot}
                  appearance={theme.dark ? 'dark' : 'light'}
                />
              </View>

              {breakdown === 'Category'
                ? catBreakdown.rows.map((r, i) => {
                    const color       = categoryGroupColor(r.cat, categories, theme.dark);
                    const budgetPct   = r.budget > 0 ? r.spent / r.budget : 0;
                    const isOver      = budgetPct >= 1;
                    const isNear      = budgetPct >= 0.9;
                    const barColor    = isOver ? OVER_DOT : isNear ? CAUTION_AMBER : theme.accent.dot;
                    const statusColor = isOver
                      ? overText(theme.dark)
                      : isNear
                        ? cautionText(theme.dark)
                        : p.textSec;
                    const remaining = r.budget - r.spent;
                    const isLast    = i === catBreakdown.rows.length - 1;
                    return (
                      <TouchableOpacity
                        key={r.cat}
                        onPress={() => onViewActivity({
                          catIds:   [r.cat],
                          dateFrom: ranges.current.from,
                          dateTo:   ranges.current.to,
                        })}
                        activeOpacity={0.65}
                        delayPressIn={0}
                        style={[styles.row, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
                      >
                        <View style={[styles.rowIcon, { backgroundColor: color }]}>
                          <Icon name={r.icon} size={18} color="#FBF8FF" stroke={1.6} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.rowInnerRow}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={1}>{r.label}</Text>
                              <Text style={[styles.rowSub, { color: p.textSec }]}>
                                {r.txCount} {r.txCount === 1 ? 'transaction' : 'transactions'}
                              </Text>
                            </View>
                            <View style={styles.rowRight}>
                              <View style={styles.rowAmtRow}>
                                <DeltaBadge spent={r.spent} prevSpent={r.prevSpent} dark={theme.dark} />
                                <Text style={[styles.rowAmt, { color: p.text }]}>
                                  ${r.spent.toFixed(r.spent >= 100 ? 0 : 2)}
                                </Text>
                              </View>
                              {r.budget > 0 && (
                                <Text style={[styles.rowBudgetStatus, { color: statusColor }]}>
                                  {isOver
                                    ? `$${Math.abs(remaining).toFixed(0)} over`
                                    : `$${remaining.toFixed(0)} left`}
                                </Text>
                              )}
                            </View>
                          </View>
                          {r.budget > 0 && (
                            <View style={[styles.budgetTrack, { backgroundColor: p.hairline, marginTop: 8 }]}>
                              <View style={[
                                styles.budgetFill,
                                {
                                  width: `${Math.min(budgetPct, 1) * 100}%` as any,
                                  backgroundColor: barColor,
                                },
                              ]} />
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                : merchBreakdown.rows.map((r, i) => {
                    const color  = categoryGroupColor(r.cat, categories, theme.dark);
                    const isLast = i === merchBreakdown.rows.length - 1;
                    return (
                      <TouchableOpacity
                        key={r.merchant}
                        onPress={() => onViewActivity({
                          merchantQuery: r.merchant,
                          dateFrom:      ranges.current.from,
                          dateTo:        ranges.current.to,
                        })}
                        activeOpacity={0.65}
                        delayPressIn={0}
                        style={[styles.row, { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: p.hairline }]}
                      >
                        <View style={[styles.rowIcon, { backgroundColor: color }]}>
                          <Icon name={r.icon} size={18} color="#FBF8FF" stroke={1.6} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.rowInnerRow}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={1}>{r.merchant}</Text>
                              <Text style={[styles.rowSub, { color: p.textSec }]}>
                                {r.txCount} {r.txCount === 1 ? 'transaction' : 'transactions'}
                              </Text>
                            </View>
                            <View style={styles.rowRight}>
                              <View style={styles.rowAmtRow}>
                                <DeltaBadge spent={r.spent} prevSpent={r.prevSpent} dark={theme.dark} />
                                <Text style={[styles.rowAmt, { color: p.text }]}>
                                  ${r.spent.toFixed(r.spent >= 100 ? 0 : 2)}
                                </Text>
                              </View>
                              <Text style={[styles.rowPct, { color: p.textSec }]}>
                                {Math.round(r.pct * 100)}%
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
              }
            </SectionCard>

          </View>
        </Animated.ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 8,
    zIndex: 10, overflow: 'hidden',
  },
  headerDivider: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingBottom: 8,
  },
  dateBlock: { paddingHorizontal: 24, paddingTop: 6, paddingBottom: 18 },
  dateTitle: { fontSize: 32, fontWeight: '700', letterSpacing: -1.0, lineHeight: 38 },
  dateTitleWeek: { fontSize: 24, letterSpacing: -0.6 },
  weekNavRow: { flexDirection: 'row', alignItems: 'center' },
  weekNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  weekNavMenuHost: { flex: 1, height: 38 },
  weekNavMenuLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  segmentWrap: { paddingHorizontal: CARD_OUTER_PAD, marginBottom: 22 },
  sectionStack: { paddingHorizontal: CARD_OUTER_PAD, gap: 22 },
  sectionCard: { borderRadius: 24, overflow: 'hidden' },
  sectionCardBorder: {
    borderRadius: 24, borderWidth: 1,
    paddingHorizontal: CARD_INNER_PAD, paddingTop: 18, paddingBottom: 14,
  },
  // Chart
  chartTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chartTitle: { ...TYPE.bodySmEm, opacity: 0.7, letterSpacing: 0.2 },
  chartTypePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  chartHero: { marginBottom: 14 },
  chartHeroAmount: { fontSize: 34, fontWeight: '700', letterSpacing: -1.0, lineHeight: 38 },
  chartHeroCents:  { fontSize: 18, fontWeight: '600', letterSpacing: -0.4, opacity: 0.65 },
  chartHeroSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chartHeroLabel:  { ...TYPE.bodySm },
  chartHeroVs:     { ...TYPE.caption },
  heroOverviewDelta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  chartSlide: { height: CHART_H, justifyContent: 'center' },
  dotsRow: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  dot:     { height: 6, borderRadius: 3 },
  // Breakdown
  breakdownTabsWrap: { marginBottom: 6 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 12, paddingVertical: 14,
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginTop: 1,
  },
  rowInnerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  rowTitle:   { ...TYPE.body },
  rowSub:     { ...TYPE.caption, marginTop: 2 },
  rowRight:   { alignItems: 'flex-end', flexShrink: 0, minWidth: 72 },
  rowAmtRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowAmt:     { ...TYPE.body },
  rowPct:     { ...TYPE.caption, marginTop: 2 },
  rowBudgetStatus: { ...TYPE.caption, marginTop: 2 },
  // Delta badge
  deltaBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100 },
  deltaText:  { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },
  // Budget bar
  budgetTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  budgetFill:  { height: 4, borderRadius: 2 },
});
