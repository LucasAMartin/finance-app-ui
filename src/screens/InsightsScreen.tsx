import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Button as SwiftButton, Host, Menu } from '@expo/ui/swift-ui';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import { useTheme } from '../ThemeProvider';
import {
  GROUP_COLORS,
  Theme,
  OVER_DOT,
  CAUTION_AMBER,
  overText,
  cautionText,
} from '../theme';
import {
  MEDIA,
  DARK_TEXT_SHADOW,
  makeP,
  deriveFloor,
} from '../wallpaperPalette';
import {
  useRepositories,
  useRepositoryList,
} from '../repositories/RepositoryProvider';
import { categoryGroupFor } from '../repositories/categoryUtils';
import type { Category, GroupKey, Transaction, TransactionCursor } from '../repositories/types';
import {
  currentMonthlyBudget,
  upcomingBillsFromRecurring,
} from '../selectors/finance';
import {
  generateDateOptions,
  derivePeriodRanges,
  categorySpending,
  merchantSpending,
  spendingTrend,
  scheduledFixedInRange,
  spendSeriesToBuckets,
  trendTimeframeConfig,
  foldTrendSeries,
  type ActivityInitialFilter,
  type CatRow,
} from '../selectors/spending';
import { buildSavedMetric } from '../selectors/savings';
import { Icon } from '../components/Icon';
import { MerchantMark } from '../components/MerchantMark';
import { ScreenExitButton, EXIT_FLOAT_STYLE } from '../components/GlassButton';
import { BentoTile } from '../components/BentoTile';
import { SpendChart } from '../components/charts/SpendChart';
import { TrendBars } from '../components/charts/TrendBars';
import { SheetPrimaryButton } from '../components/shared';
import type { InsightDetailTarget } from './InsightDetailScreen';
import { HeaderIcon, useHeaderScroll, BG_PARALLAX_MAX } from '../components/headerScroll';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionCard } from '../components/SectionCard';
import {
  type InsightBin,
  type InsightDetail,
} from '../components/charts/InsightsCharts';
import { SnapshotViz, type SnapshotVizSpec } from '../components/charts/SnapshotViz';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CARD_OUTER_PAD = 16;
const CARD_INNER_PAD = 20;
const CARD_W = SCREEN_W - CARD_OUTER_PAD * 2;
const CHART_INNER_W = CARD_W - CARD_INNER_PAD * 2;
const CHART_H = 188;

// Bento tile geometry. BentoTile has 16px inner padding; a half tile is half
// the content width minus the 12px row gap. Chart widths are the inner content
// widths so the SVG fills its tile edge to edge.
const TILE_PAD = 16;
const HERO_CHART_W = CARD_W - TILE_PAD * 2;
const HALF_W = (CARD_W - 12) / 2;
const HALF_CHART_W = HALF_W - TILE_PAD * 2;

const PERIODS = ['Week', 'Month', 'Year'] as const;
type Period = (typeof PERIODS)[number];

// UI timeframe chips. Each maps onto a range the data layer actually models, so
// every chip's label matches the range it shows.
const TIMEFRAMES = ['1W', '1M', '1Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const TF_TO_PERIOD: Record<Timeframe, Period> = {
  '1W': 'Week',
  '1M': 'Month',
  '1Y': 'Year',
};

// The Spending-trends tile buckets each timeframe at its own granularity, so its
// resting headline reads "average daily/weekly/…" beside the figure.
const TREND_CADENCE: Record<Timeframe, string> = {
  '1W': 'Daily',
  '1M': 'Weekly',
  '1Y': 'Quarterly',
};

// Label for a scrubbed bucket, shown beside its total while the user drags.
function trendScrubLabel(
  tf: Timeframe,
  slot: { from: Date } | undefined,
  idx: number,
): string {
  if (!slot) return '';
  if (tf === '1W')
    return slot.from.toLocaleDateString('en-US', { weekday: 'long' });
  if (tf === '1M') return `Week ${idx + 1}`;
  return `Q${idx + 1}`;
}

// Snapshot rows are drawn from a scored candidate pool; the pool is returned
// sorted so each consumer can slice the strongest few for its own section.

// Snapshot keys that represent period-over-period movement — surfaced together
// in the "What changed" section.
const CHANGE_KEYS = new Set(['trending-up', 'most-improved', 'bill-changed']);

// The two "Where it went" lists, switched via the in-tile segmented control.
const WHERE_TABS = ['Top Categories', 'Top Merchants'] as const;

interface Snapshot {
  key: string;
  label: string;        // short, clear chip (e.g. "Over budget")
  title: string;        // the one-line insight
  color: string;        // semantic tint (over/savings/category)
  icon: string;
  score: number;        // higher = more noteworthy right now
  detail: InsightDetail; // every snapshot opens a detail sheet (with a filter)
}

// A single "Where it went" row (category or merchant). The detail is prebuilt so
// a tap opens the native insight sheet, identical to a "What changed" row.
interface BreakdownItem {
  key: string;
  color: string;
  icon: string;
  label: string;
  spent: number;
  prevSpent: number;
  detail: InsightDetail;
}

// Match the Home screen's spending palette: vibrant group colors in light mode,
// the tuned dark variants in dark mode. categoryGroupColor (the muted `.light`
// values) is intentionally not used here so Insights and Home read identically.
function groupDisplayColor(group: GroupKey, dark: boolean): string {
  return dark ? GROUP_COLORS[group].dark : GROUP_COLORS[group].vibrant;
}

function categoryDisplayColor(
  cat: string,
  categories: Category[],
  dark: boolean,
): string {
  return groupDisplayColor(categoryGroupFor(cat, categories), dark);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
  const next = startOfDay(d);
  next.setDate(next.getDate() + days);
  return next;
}

function buildInsightBins(
  period: Period,
  ranges: ReturnType<typeof derivePeriodRanges>,
  trendData: {
    data: { label: string; v: number; budget: number; plan: number }[];
    budget: number;
  },
): InsightBin[] {
  if (period === 'Week') {
    return trendData.data.map((d, i) => {
      const from = addDays(ranges.current.from, i);
      return {
        label: d.label,
        value: d.v,
        budget: d.budget,
        plan: d.plan,
        from,
        to: endOfDay(from),
      };
    });
  }

  if (period === 'Month') {
    return trendData.data.map((d, i) => {
      const from = addDays(ranges.current.from, i * 7);
      const weekTo = endOfDay(addDays(from, 6));
      const to = weekTo > ranges.current.to ? ranges.current.to : weekTo;
      return { label: d.label, value: d.v, budget: d.budget, plan: d.plan, from, to };
    });
  }

  const year = ranges.current.from.getFullYear();
  return trendData.data.map((d, i) => ({
    label: d.label,
    value: d.v,
    budget: d.budget,
    plan: d.plan,
    from: new Date(year, i, 1),
    to: endOfDay(new Date(year, i + 1, 0)),
  }));
}

function money(n: number, decimals = 0): string {
  const abs = Math.abs(n);
  const value =
    abs >= 1000 && decimals === 0
      ? Math.round(abs).toLocaleString()
      : abs.toFixed(decimals);
  return `$${value}`;
}

function signedMoney(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${money(n)}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function elapsedFraction(from: Date, to: Date, now: Date): number {
  if (now >= to) return 1;
  if (now <= from) return 0.01;
  return Math.max(
    0.01,
    clamp01((now.getTime() - from.getTime()) / (to.getTime() - from.getTime())),
  );
}

function periodBudget(
  period: Period,
  monthlyBudget: number,
  bins: InsightBin[],
): number {
  if (period === 'Month') return monthlyBudget;
  if (period === 'Year') return monthlyBudget * 12;
  // Week: sum the timing-aware plan so a bill due this week is part of the
  // budget the projection is measured against (otherwise a rent week always
  // reads as wildly "over").
  return bins.reduce((sum, bin) => sum + bin.plan, 0);
}

// ── Spending-level delta badge ────────────────────────────────────
type DeltaKind = 'up' | 'down' | 'flat' | 'new' | 'hide';

function computeDelta(
  spent: number,
  prevSpent: number,
): { kind: DeltaKind; pct: number } {
  if (prevSpent === 0 && spent === 0) return { kind: 'hide', pct: 0 };
  if (prevSpent === 0) return { kind: 'new', pct: 0 };
  const raw = (spent - prevSpent) / prevSpent;
  const pct = Math.round(Math.abs(raw) * 100);
  if (pct === 0) return { kind: 'flat', pct: 0 };
  return { kind: raw > 0 ? 'up' : 'down', pct };
}

function DeltaBadge({
  spent,
  prevSpent,
  dark,
}: {
  spent: number;
  prevSpent: number;
  dark: boolean;
}) {
  const d = computeDelta(spent, prevSpent);
  if (d.kind === 'hide' || d.kind === 'flat') return null;
  if (d.kind === 'new') return null;

  const isUp = d.kind === 'up';
  // "Spending fell" reuses the savings group color so green reads identically to
  // every other positive signal on the screen, rather than a one-off hex. No
  // pill background and a real caret glyph (not ▲▼) keep the delta in the same
  // restrained, monochrome-leaning register as the charts above it.
  const green = groupDisplayColor('savings', dark);
  const tint = isUp ? OVER_DOT : green;
  return (
    <View style={styles.delta}>
      <Icon name={isUp ? 'chevUp' : 'chevDown'} size={10} color={tint} stroke={2.6} />
      <Text style={[TYPE.captionEm, { color: tint }]}>{d.pct}%</Text>
    </View>
  );
}

// ── Frosted section card ──────────────────────────────────────────

// ── Header icon button ────────────────────────────────────────────
function IconBtn({
  onPress,
  children,
  label,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
    >
      {children}
    </Pressable>
  );
}

function EmptyState({
  title,
  body,
  theme,
}: {
  title: string;
  body: string;
  theme: Theme;
}) {
  return (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor: theme.dark
            ? 'rgba(242,244,245,0.045)'
            : 'rgba(14,12,24,0.035)',
        },
      ]}
    >
      <Text style={[TYPE.bodySmEm, { color: theme.text }]}>{title}</Text>
      <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 3 }]}>
        {body}
      </Text>
    </View>
  );
}

function InsightBottomSheet({
  detail,
  theme,
  onClose,
  onViewActivity,
}: {
  detail: InsightDetail | null;
  theme: Theme;
  onClose: () => void;
  onViewActivity: (filter: ActivityInitialFilter) => void;
}) {
  const lastDetail = useRef<InsightDetail | null>(null);
  if (detail) lastDetail.current = detail;
  const d = lastDetail.current;
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const metrics = d?.metrics?.slice(0, 3) ?? [];
  // Compare-style vizzes stack two bars and run taller; rows that also carry a
  // supporting stat strip need the extra room so nothing clips against the
  // fixed detent. Bare snapshots stay compact.
  const tall = metrics.length > 0 || d?.viz?.kind === 'compare';
  const snapPoints = useMemo(() => [tall ? '54%' : '46%'], [tall]);

  useEffect(() => {
    if (detail !== null) {
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
  }, [detail]);

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    onClose();
  }, [onClose]);

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
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
    >
      <View
        style={[
          styles.insightSheetContent,
          {
            backgroundColor: theme.surface,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        {d && (
          <>
            <ScreenExitButton
              variant="close"
              onPress={onClose}
              tint={theme.textSec}
              fallbackBg={theme.chipBg}
              style={EXIT_FLOAT_STYLE}
              accessibilityLabel="Close insight details"
            />

            <View style={styles.insightSheetHero}>
              <View
                style={[
                  styles.insightSheetMark,
                  { backgroundColor: `${d.color}2B` },
                ]}
              >
                <Icon
                  name={d.icon ?? 'tag'}
                  size={24}
                  color={d.color}
                  stroke={1.7}
                />
              </View>
              <Text style={[TYPE.label, { color: theme.textTer }]}>
                {d.eyebrow}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  TYPE.sectionTitle,
                  { color: theme.text, marginTop: 4 },
                ]}
              >
                {d.title}
              </Text>
              <Text
                style={[
                  TYPE.display,
                  { color: theme.text, marginTop: 12 },
                ]}
              >
                {d.amount}
              </Text>
              <Text
                style={[
                  TYPE.bodySm,
                  { color: theme.textSec, marginTop: 4 },
                ]}
              >
                {d.description}
              </Text>
            </View>

            {d.viz ? (
              <View style={styles.insightVizWrap}>
                <SnapshotViz viz={d.viz} theme={theme} />
              </View>
            ) : null}

            {metrics.length > 0 ? (
              <View
                style={[
                  styles.insightStatRow,
                  { borderTopColor: theme.hairline },
                ]}
              >
                {metrics.map((m, i) => (
                  <React.Fragment key={m.label}>
                    {i > 0 ? (
                      <View
                        style={[
                          styles.insightStatDiv,
                          { backgroundColor: theme.hairline },
                        ]}
                      />
                    ) : null}
                    <View style={styles.insightStat}>
                      <Text
                        style={[TYPE.labelSm, { color: theme.textTer }]}
                        numberOfLines={1}
                      >
                        {m.label}
                      </Text>
                      <Text
                        style={[
                          TYPE.subsectionTitle,
                          { color: theme.text, marginTop: 5 },
                        ]}
                        numberOfLines={1}
                      >
                        {m.value}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            ) : null}

            {d.filter && (
              <SheetPrimaryButton
                label="View matching transactions"
                onPress={() => {
                  onClose();
                  onViewActivity(d.filter!);
                }}
                theme={theme}
                style={styles.insightSheetAction}
              />
            )}
          </>
        )}
      </View>
    </BottomSheetModal>
  );
}

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
  onViewActivity: (filter: ActivityInitialFilter) => void;
  onOpenInsight: (target: InsightDetailTarget) => void;
}

export function InsightsScreen({
  theme,
  onOpenDrawer,
  onViewActivity,
  onOpenInsight,
}: Props) {
  const { transactionsRepo, categoriesRepo, budgetsRepo, recurringRulesRepo, incomeRepo } =
    useRepositories();
  const [repoVersion, setRepoVersion] = useState(0);
  const categories = useRepositoryList(categoriesRepo);
  const budgets = useRepositoryList(budgetsRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const incomes = useRepositoryList(incomeRepo);
  const { wallpaper, wallpaperFloorBase } = useTheme();
  const insets = useSafeAreaInsets();
  const pWall = makeP(true);
  const p = makeP(theme.dark);
  const shadow = DARK_TEXT_SHADOW;

  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const period = TF_TO_PERIOD[timeframe];

  // Per-period date index — remembered independently so switching periods
  // doesn't reset the user's navigation.
  const [dateIdxByPeriod, setDateIdxByPeriod] = useState<
    Record<Period, number>
  >({
    Week: 0,
    Month: 0,
    Year: 0,
  });

  // Stable "now" so all useMemos agree on the current date across renders.
  const now = useMemo(() => new Date(), []);

  const dateOptions = useMemo(
    () => generateDateOptions(period, now),
    [period, now],
  );
  const dateIdx = dateIdxByPeriod[period];
  const dateLabel = dateOptions[dateIdx] ?? dateOptions[0];

  const ranges = useMemo(
    () => derivePeriodRanges(period, dateIdx, now),
    [period, dateIdx, now],
  );
  useEffect(() => transactionsRepo.subscribe(() => setRepoVersion(v => v + 1)), [transactionsRepo]);
  // Loaded synchronously in render (the SQLite repo is synchronous) and keyed on
  // `ranges` so the transaction set never lags a frame behind a period switch.
  // Loading in an effect instead would leave one render where year-scoped ranges
  // are paired with the previous period's rows — that mismatch emptied
  // "What changed", then refilled it a frame later, popping the section in and
  // shoving "Where it went" down.
  const transactions = useMemo<Transaction[]>(() => {
    const from = ranges.prev.from < ranges.current.from ? ranges.prev.from : ranges.current.from;
    const to = ranges.prev.to > ranges.current.to ? ranges.prev.to : ranges.current.to;
    const rows: Transaction[] = [];
    let cursor: TransactionCursor | undefined;
    do {
      const page = transactionsRepo.listPage({
        from: from.toISOString(),
        to: to.toISOString(),
        sort: 'date-desc',
        limit: 200,
        cursor,
      });
      rows.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);
    return rows;
  }, [transactionsRepo, ranges, repoVersion]);
  // A range whose end is in the past is settled: its totals are actuals, not
  // projections, so we drop the "pace"/"projected" framing for it.
  const rangeComplete = ranges.current.to <= now;
  const monthlyBgt = useMemo(() => currentMonthlyBudget(budgets), [budgets]);

  const catBreakdown = useMemo(
    () =>
      categorySpending(
        transactions,
        categories,
        budgets,
        ranges,
        period,
        recurringRules,
      ),
    [transactions, categories, budgets, ranges, period, recurringRules],
  );
  const total = catBreakdown.total;
  const merchBreakdown = useMemo(
    () => merchantSpending(transactions, categories, ranges, recurringRules),
    [transactions, categories, ranges, recurringRules],
  );
  const trendData = useMemo(
    () => spendingTrend(transactions, ranges, period, monthlyBgt, recurringRules),
    [transactions, ranges, period, monthlyBgt, recurringRules],
  );
  const insightBins = useMemo(
    () => buildInsightBins(period, ranges, trendData),
    [period, ranges, trendData],
  );
  const upcomingBills = useMemo(
    () => upcomingBillsFromRecurring(recurringRules, categories, now),
    [recurringRules, categories, now],
  );
  // Projection separates committed bills from discretionary spend. Only the
  // variable half is extrapolated over the elapsed fraction; fixed costs are
  // counted once (already paid) plus whatever is still scheduled before the
  // period closes. This stops a rent payment on day 1 from projecting a wildly
  // inflated month, which was the core "above pace" false alarm.
  const projected = useMemo(() => {
    const budget = periodBudget(period, monthlyBgt, insightBins);
    const elapsed = elapsedFraction(
      ranges.current.from,
      ranges.current.to,
      now,
    );
    const remainingFixed = rangeComplete
      ? 0
      : scheduledFixedInRange(recurringRules, now, ranges.current.to);
    const projectedVariable = rangeComplete
      ? catBreakdown.variableTotal
      : catBreakdown.variableTotal / elapsed;
    const projectedTotal = rangeComplete
      ? catBreakdown.total
      : catBreakdown.fixedTotal + projectedVariable + remainingFixed;
    const delta = projectedTotal - budget;
    return {
      total: projectedTotal,
      budget,
      delta,
      color: delta > 0 ? OVER_DOT : groupDisplayColor('savings', theme.dark),
    };
  }, [
    catBreakdown.fixedTotal,
    catBreakdown.total,
    catBreakdown.variableTotal,
    insightBins,
    monthlyBgt,
    now,
    period,
    ranges.current.from,
    ranges.current.to,
    rangeComplete,
    recurringRules,
    theme.dark,
  ]);
  const hasSpending = total > 0;

  // Build a pool of candidate insights, each scored by how noteworthy it is for
  // the current data/period, then surface only the strongest few. Because the
  // pool is broad and threshold-gated, the card shows different, relevant cards
  // as the data changes instead of a fixed list every time.
  const snapshots = useMemo<Snapshot[]>(() => {
    const out: Snapshot[] = [];
    if (total <= 0) return out;

    const ctx =
      period === 'Week'
        ? 'This week'
        : period === 'Month'
          ? 'This month'
          : 'This year';
    const per = period.toLowerCase();
    const periodNoun =
      period === 'Week' ? 'day' : period === 'Month' ? 'week' : 'month';
    const green = groupDisplayColor('savings', theme.dark);
    const dec = (n: number) => (Math.abs(n) < 100 ? 2 : 0);
    const range = { dateFrom: ranges.current.from, dateTo: ranges.current.to };
    const catColor = (cat: string) =>
      categoryDisplayColor(cat, categories, theme.dark);

    // ── Budget: a category over budget, or running hot ──────────────
    const pressureCat = catBreakdown.rows
      .filter((r) => r.budget > 0 && r.variableSpent >= r.fixedSpent)
      .map((r) => ({ ...r, remaining: r.budget - r.spent, ratio: r.spent / r.budget }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    if (pressureCat && (pressureCat.remaining < 0 || pressureCat.ratio >= 0.85)) {
      // A category's budget is defined monthly. Month/Year map to a whole budget
      // cycle, so exceeding the (prorated) figure is genuinely "over budget".
      // A Week is only a slice of the monthly budget — exceeding that slice is
      // "above pace", not over budget.
      const isCycle = period !== 'Week';
      const over = pressureCat.remaining < 0;
      const overBudget = isCycle && over;
      const refWord = isCycle ? 'budget' : 'pace';
      const pct = Math.round(pressureCat.ratio * 100);

      const label = overBudget
        ? 'Over budget'
        : over
          ? 'Above pace'
          : 'Running hot';
      const color = overBudget
        ? OVER_DOT
        : over
          ? CAUTION_AMBER
          : pressureCat.ratio >= 0.95
            ? CAUTION_AMBER
            : catColor(pressureCat.cat);
      const title = overBudget
        ? `${pressureCat.label} is ${money(Math.abs(pressureCat.remaining))} over`
        : over
          ? `${pressureCat.label} is ${money(Math.abs(pressureCat.remaining))} above pace`
          : `${pressureCat.label} has ${money(pressureCat.remaining)} left`;
      const score = overBudget
        ? 92 + Math.min(8, (Math.abs(pressureCat.remaining) / pressureCat.budget) * 100)
        : over
          ? 72 + Math.min(12, (Math.abs(pressureCat.remaining) / pressureCat.budget) * 100)
          : 50 + pressureCat.ratio * 28;

      out.push({
        key: 'budget',
        label,
        title,
        color,
        icon: pressureCat.icon,
        score,
        detail: {
          title: pressureCat.label,
          eyebrow: `${ctx} ${refWord}`,
          amount: money(pressureCat.spent, dec(pressureCat.spent)),
          color: overBudget || over ? color : catColor(pressureCat.cat),
          icon: pressureCat.icon,
          description: overBudget
            ? `${money(Math.abs(pressureCat.remaining))} over budget this ${per}.`
            : over
              ? `Tracking ${money(Math.abs(pressureCat.remaining))} above the ${money(pressureCat.budget)} ${refWord} for this ${per}.`
              : `${money(pressureCat.remaining)} left against the ${money(pressureCat.budget)} ${refWord} this ${per}.`,
          viz: {
            kind: 'meter',
            value: pressureCat.spent,
            max: Math.max(pressureCat.budget, pressureCat.spent),
            threshold: pressureCat.budget,
            color: overBudget || over ? color : catColor(pressureCat.cat),
            leftLabel: `spent ${money(pressureCat.spent, dec(pressureCat.spent))}`,
            rightLabel: `${refWord} ${money(pressureCat.budget)}`,
          },
          filter: { catIds: [pressureCat.cat], ...range },
        },
      });
    }

    // ── Biggest discretionary merchant ──────────────────────────────
    const variableMerchant = merchBreakdown.rows.find(
      (r) => !r.recurring && r.spent > 0,
    );
    const topMerchant = variableMerchant ?? merchBreakdown.rows[0];
    if (topMerchant) {
      const isBill = topMerchant.recurring;
      const base = Math.max(catBreakdown.variableTotal, topMerchant.spent);
      const share = Math.round((topMerchant.spent / base) * 100);
      const hasOthers = catBreakdown.variableTotal - topMerchant.spent > 0.005;
      out.push({
        key: 'top-spend',
        label: 'Top spend',
        title: isBill
          ? `${topMerchant.merchant} is a recurring bill`
          : hasOthers
            ? `${topMerchant.merchant} is ${share}% of variable spend`
            : `${topMerchant.merchant} is your top spend`,
        color: catColor(topMerchant.cat),
        icon: topMerchant.icon,
        score: isBill ? 40 : 60 + Math.min(15, share / 10),
        detail: {
          title: topMerchant.merchant,
          eyebrow: `${ctx} merchant`,
          amount: money(topMerchant.spent, dec(topMerchant.spent)),
          color: catColor(topMerchant.cat),
          icon: topMerchant.icon,
          description: isBill
            ? `Recurring bill · ${Math.round(topMerchant.pct * 100)}% of spend.`
            : `${share}% of your variable spend across ${topMerchant.txCount} ${topMerchant.txCount === 1 ? 'charge' : 'charges'}.`,
          viz: {
            kind: 'meter',
            value: topMerchant.spent,
            max: isBill
              ? Math.max(total, topMerchant.spent)
              : Math.max(catBreakdown.variableTotal, topMerchant.spent),
            color: catColor(topMerchant.cat),
            leftLabel: money(topMerchant.spent, dec(topMerchant.spent)),
            rightLabel: isBill
              ? `of ${money(total)} spend`
              : `of ${money(catBreakdown.variableTotal)} variable`,
          },
          filter: { merchantQuery: topMerchant.merchant, ...range },
        },
      });
    }

    // ── Discretionary movement vs the previous period ───────────────
    const changes = catBreakdown.rows
      .filter((r) => r.prevVariableSpent > 0)
      .map((r) => ({ r, delta: r.variableSpent - r.prevVariableSpent }))
      .filter((x) => Math.abs(x.delta) >= 1);
    const changeDetail = (r: CatRow, delta: number): InsightDetail => ({
      title: r.label,
      eyebrow: `${ctx} vs last ${per}`,
      amount: money(r.variableSpent, dec(r.variableSpent)),
      color: delta > 0 ? OVER_DOT : green,
      icon: r.icon,
      description: `${signedMoney(delta)} compared with the previous ${per}.`,
      viz: {
        kind: 'compare',
        prev: r.prevVariableSpent,
        now: r.variableSpent,
        color: delta > 0 ? OVER_DOT : green,
        caption: `${signedMoney(delta)} vs last ${per}`,
      },
      filter: { catIds: [r.cat], ...range },
    });
    const biggestUp = changes
      .filter((x) => x.delta > 0)
      .sort((a, b) => b.delta - a.delta)[0];
    if (biggestUp) {
      out.push({
        key: 'trending-up',
        label: 'Trending up',
        title: `${biggestUp.r.label} up ${money(biggestUp.delta, dec(biggestUp.delta))} vs last ${per}`,
        color: OVER_DOT,
        icon: biggestUp.r.icon,
        score: 56 + Math.min(24, (biggestUp.delta / total) * 120),
        detail: changeDetail(biggestUp.r, biggestUp.delta),
      });
    }
    const biggestDown = changes
      .filter((x) => x.delta < 0)
      .sort((a, b) => a.delta - b.delta)[0];
    if (biggestDown) {
      out.push({
        key: 'most-improved',
        label: 'Most improved',
        title: `${biggestDown.r.label} down ${money(Math.abs(biggestDown.delta), dec(biggestDown.delta))} vs last ${per}`,
        color: green,
        icon: biggestDown.r.icon,
        score: 52 + Math.min(20, (Math.abs(biggestDown.delta) / total) * 120),
        detail: changeDetail(biggestDown.r, biggestDown.delta),
      });
    }

    // ── A recurring bill whose amount actually moved ────────────────
    const billMoved = merchBreakdown.rows
      .filter((r) => r.recurring && r.prevSpent > 0 && r.spent > 0)
      .map((r) => ({ r, delta: r.spent - r.prevSpent }))
      .filter((x) => Math.abs(x.delta) >= 2 && Math.abs(x.delta) / x.r.prevSpent >= 0.05)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (billMoved) {
      const up = billMoved.delta > 0;
      out.push({
        key: 'bill-changed',
        label: 'Bill changed',
        title: `${billMoved.r.merchant} bill ${up ? 'up' : 'down'} ${money(Math.abs(billMoved.delta), dec(billMoved.delta))}`,
        color: up ? OVER_DOT : green,
        icon: billMoved.r.icon,
        score: 72,
        detail: {
          title: billMoved.r.merchant,
          eyebrow: `${ctx} bill`,
          amount: money(billMoved.r.spent, dec(billMoved.r.spent)),
          color: up ? OVER_DOT : green,
          icon: billMoved.r.icon,
          description: `${signedMoney(billMoved.delta)} vs the previous ${per}.`,
          viz: {
            kind: 'compare',
            prev: billMoved.r.prevSpent,
            now: billMoved.r.spent,
            color: up ? OVER_DOT : green,
            caption: `${signedMoney(billMoved.delta)} vs last ${per}`,
          },
          filter: { merchantQuery: billMoved.r.merchant, ...range },
        },
      });
    }

    // ── Next bill due ───────────────────────────────────────────────
    const nextBill = upcomingBills[0];
    if (nextBill) {
      const billCat = catBreakdown.rows.find((r) => r.cat === nextBill.cat);
      out.push({
        key: 'next-bill',
        label: 'Next bill',
        title: `${nextBill.name} due in ${nextBill.daysUntil}d`,
        color: CAUTION_AMBER,
        icon: 'cal',
        score: Math.max(34, Math.min(82, 82 - nextBill.daysUntil * 3)),
        detail: {
          title: nextBill.name,
          eyebrow: 'Upcoming bill',
          amount: money(nextBill.amount, dec(nextBill.amount)),
          color: CAUTION_AMBER,
          icon: 'cal',
          description: `Due ${nextBill.dueDate} · in ${nextBill.daysUntil} ${nextBill.daysUntil === 1 ? 'day' : 'days'}.${nextBill.estimate ? ' Estimated amount.' : ''}${billCat ? ` ${billCat.label}.` : ''}`,
          viz: {
            kind: 'meter',
            value: Math.max(0, 30 - Math.min(nextBill.daysUntil, 30)),
            max: 30,
            color: CAUTION_AMBER,
            leftLabel: `due ${nextBill.dueDate}`,
            rightLabel: `in ${nextBill.daysUntil}d`,
          },
          filter: { merchantQuery: nextBill.merchant, ...range },
        },
      });
    }

    // ── Biggest single day / week / month ───────────────────────────
    const nonEmptyBins = insightBins.filter((b) => b.value > 0);
    if (nonEmptyBins.length > 1) {
      const peak = nonEmptyBins.reduce((m, b) => (b.value > m.value ? b : m));
      out.push({
        key: 'biggest-bin',
        label: `Biggest ${periodNoun}`,
        title: `${peak.label} · ${money(peak.value, dec(peak.value))}`,
        color: p.text,
        icon: 'chart',
        score: 48 + Math.min(18, (peak.value / total) * 40),
        detail: {
          title: `Biggest ${periodNoun}: ${peak.label}`,
          eyebrow: ctx,
          amount: money(peak.value, dec(peak.value)),
          color: p.text,
          icon: 'chart',
          description: `Your highest-spend ${periodNoun} this ${per}, ${Math.round((peak.value / total) * 100)}% of the total.`,
          viz: {
            kind: 'bins',
            bars: insightBins.map((b) => ({
              value: b.value,
              label: b.label,
              highlight: b === peak,
            })),
            caption: `peak ${money(peak.value, dec(peak.value))} · ${peak.label}`,
          },
          filter: { dateFrom: peak.from, dateTo: peak.to },
        },
      });
    }

    // ── 50/30/20 mix: a group running past its target share ─────────
    const groupTotals: Record<GroupKey, number> = { needs: 0, wants: 0, savings: 0 };
    catBreakdown.rows.forEach((r) => {
      groupTotals[categoryGroupFor(r.cat, categories)] += r.spent;
    });
    const targets: Record<GroupKey, number> = { needs: 0.5, wants: 0.3, savings: 0.2 };
    const groupLabels: Record<GroupKey, string> = {
      needs: 'Needs',
      wants: 'Wants',
      savings: 'Savings',
    };
    let mix: { g: GroupKey; share: number; dev: number } | null = null;
    (['wants', 'needs'] as GroupKey[]).forEach((g) => {
      const share = groupTotals[g] / total;
      const dev = share - targets[g];
      if (dev > 0.05 && (!mix || dev > mix.dev)) mix = { g, share, dev };
    });
    if (mix) {
      const m = mix as { g: GroupKey; share: number; dev: number };
      const groupCats = catBreakdown.rows
        .filter((r) => categoryGroupFor(r.cat, categories) === m.g)
        .map((r) => r.cat);
      const sharePct = Math.round(m.share * 100);
      const targetPct = Math.round(targets[m.g] * 100);
      out.push({
        key: 'mix',
        label: groupLabels[m.g],
        title: `${groupLabels[m.g]} are ${sharePct}% of spend`,
        color: groupDisplayColor(m.g, theme.dark),
        icon: 'tag',
        score: 50 + Math.min(22, m.dev * 80),
        detail: {
          title: `${groupLabels[m.g]} spending`,
          eyebrow: `${ctx} · 50/30/20`,
          amount: money(groupTotals[m.g], dec(groupTotals[m.g])),
          color: groupDisplayColor(m.g, theme.dark),
          icon: 'tag',
          description: `${sharePct}% of spend this ${per}, ${sharePct - targetPct} points above the ${targetPct}% target.`,
          viz: {
            kind: 'segments',
            parts: (['needs', 'wants', 'savings'] as GroupKey[]).map((g) => ({
              value: groupTotals[g],
              color: groupDisplayColor(g, theme.dark),
            })),
            leftLabel: `${groupLabels[m.g]} ${sharePct}%`,
            rightLabel: `target ${targetPct}%`,
          },
          filter: { catIds: groupCats, ...range },
        },
      });
    }

    // ── No-spend days (week only) ───────────────────────────────────
    if (period === 'Week') {
      const elapsed = insightBins.filter((b) => b.from <= now);
      const zero = elapsed.filter((b) => b.value === 0).length;
      if (zero >= 2) {
        out.push({
          key: 'no-spend',
          label: 'No-spend days',
          title: rangeComplete
            ? `${zero} no-spend days this week`
            : `${zero} no-spend days so far`,
          color: green,
          icon: 'cal',
          score: 46 + zero * 2,
          detail: {
            title: 'No-spend days',
            eyebrow: ctx,
            amount: `${zero} ${zero === 1 ? 'day' : 'days'}`,
            color: green,
            icon: 'cal',
            description: `${zero} of ${elapsed.length} days so far had no spending.`,
            viz: {
              kind: 'bins',
              bars: elapsed.map((b) => ({
                value: b.value,
                label: b.label,
                muted: b.value === 0,
              })),
              caption: `${zero} no-spend · ${money(total, dec(total))} spent`,
            },
            filter: { ...range },
          },
        });
      }
    }

    // ── Daily average (low-priority filler so the card is never bare) ─
    const elapsedDays = Math.max(
      1,
      Math.round(
        ((rangeComplete ? ranges.current.to : now).getTime() -
          ranges.current.from.getTime()) /
          86_400_000,
      ),
    );
    const perDay = total / elapsedDays;
    out.push({
      key: 'daily-avg',
      label: 'Daily average',
      title: `Averaging ${money(perDay, dec(perDay))}/day`,
      color: p.textSec,
      icon: 'chart',
      score: 36,
      detail: {
        title: 'Daily average',
        eyebrow: ctx,
        amount: `${money(perDay, dec(perDay))}/day`,
        color: p.text,
        icon: 'chart',
        description: `${money(total, dec(total))} across ${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'} this ${per}.`,
        viz: {
          kind: 'bins',
          bars: insightBins.map((b) => ({ value: b.value, label: b.label })),
          avg:
            insightBins.length > 0
              ? insightBins.reduce((s, b) => s + b.value, 0) / insightBins.length
              : 0,
          caption: `avg ${money(perDay, dec(perDay))}/day`,
        },
        filter: { ...range },
      },
    });

    return out.sort((a, b) => b.score - a.score);
  }, [
    catBreakdown.rows,
    catBreakdown.variableTotal,
    categories,
    insightBins,
    merchBreakdown.rows,
    now,
    p.text,
    p.textSec,
    period,
    ranges,
    rangeComplete,
    theme.dark,
    total,
    upcomingBills,
  ]);

  // Which "Where it went" list is showing — top categories (0) or merchants (1).
  const [whereTab, setWhereTab] = useState(0);

  // "What changed" pulls the movement-oriented insights out of the snapshot pool
  // (categories or bills that rose/fell vs the previous period). The section is
  // hidden entirely when nothing notable moved.
  const changeSnapshots = useMemo(
    () => snapshots.filter((s) => CHANGE_KEYS.has(s.key)).slice(0, 3),
    [snapshots],
  );

  // A tapped "What changed" row opens the native insight sheet (rich viz +
  // "View matching transactions"); null = closed.
  const [insightDetail, setInsightDetail] = useState<InsightDetail | null>(null);

  const { scrollY, headerBgOpacity, iconScrolledOpacity, bgTranslateY } = useHeaderScroll();

  const timeframeIdx = TIMEFRAMES.indexOf(timeframe);
  const rangeContextLabel =
    period === 'Week'
      ? 'This week'
      : period === 'Month'
        ? 'This month'
        : 'This year';

  // "Where it went" breakdowns. Each row carries a ready-built InsightDetail so
  // tapping it opens the same native sheet as a "What changed" row (rich viz +
  // "View matching transactions"). Bars scale to the leader so the list reads as
  // a ranking, not a share-of-total. Both lists arrive sorted by spend.
  const breakdownViz = (
    spent: number,
    prevSpent: number,
    color: string,
    dec: number,
    per: string,
  ): SnapshotVizSpec =>
    prevSpent > 0
      ? {
          kind: 'compare',
          prev: prevSpent,
          now: spent,
          color,
          caption: `${signedMoney(spent - prevSpent)} vs last ${per}`,
        }
      : {
          kind: 'meter',
          value: spent,
          max: Math.max(total, spent),
          color,
          leftLabel: money(spent, dec),
          rightLabel: `of ${money(total)} spent`,
        };

  const categoryItems = useMemo<BreakdownItem[]>(() => {
    const per = period.toLowerCase();
    const range = { dateFrom: ranges.current.from, dateTo: ranges.current.to };
    return catBreakdown.rows
      .filter((r) => r.spent > 0)
      .slice(0, 6)
      .map((r) => {
        const color = categoryDisplayColor(r.cat, categories, theme.dark);
        const dec = Math.abs(r.spent) < 100 ? 2 : 0;
        const share = total > 0 ? Math.round((r.spent / total) * 100) : 0;
        return {
          key: r.cat,
          color,
          icon: r.icon,
          label: r.label,
          spent: r.spent,
          prevSpent: r.prevSpent,
          detail: {
            title: r.label,
            eyebrow: `${rangeContextLabel} · category`,
            amount: money(r.spent, dec),
            color,
            icon: r.icon,
            description:
              r.prevSpent > 0
                ? `${share}% of spend · ${signedMoney(r.spent - r.prevSpent)} vs last ${per}.`
                : `${share}% of spend across ${r.txCount} ${r.txCount === 1 ? 'charge' : 'charges'}.`,
            viz: breakdownViz(r.spent, r.prevSpent, color, dec, per),
            filter: { catIds: [r.cat], ...range },
          },
        };
      });
  }, [catBreakdown.rows, categories, period, ranges, rangeContextLabel, theme.dark, total]);

  const merchantItems = useMemo<BreakdownItem[]>(() => {
    const per = period.toLowerCase();
    const range = { dateFrom: ranges.current.from, dateTo: ranges.current.to };
    return merchBreakdown.rows
      .filter((r) => r.spent > 0)
      .slice(0, 6)
      .map((r) => {
        const color = categoryDisplayColor(r.cat, categories, theme.dark);
        const dec = Math.abs(r.spent) < 100 ? 2 : 0;
        const share = Math.round(r.pct * 100);
        return {
          key: r.merchant,
          color,
          icon: r.icon,
          label: r.merchant,
          spent: r.spent,
          prevSpent: r.prevSpent,
          detail: {
            title: r.merchant,
            eyebrow: `${rangeContextLabel} · ${r.recurring ? 'recurring bill' : 'merchant'}`,
            amount: money(r.spent, dec),
            color,
            icon: r.icon,
            description: r.recurring
              ? `Recurring bill · ${share}% of spend.`
              : `${share}% of spend across ${r.txCount} ${r.txCount === 1 ? 'charge' : 'charges'}.`,
            viz: breakdownViz(r.spent, r.prevSpent, color, dec, per),
            filter: { merchantQuery: r.merchant, ...range },
          },
        };
      });
  }, [merchBreakdown.rows, categories, period, ranges, rangeContextLabel, theme.dark, total]);

  const whereItems = whereTab === 0 ? categoryItems : merchantItems;
  const whereMax = whereItems[0]?.spent ?? 0;

  // Daily (Week/Month) or monthly (Year) spend series powering the hero line.
  // Aggregated in the data layer (GROUP BY) rather than by iterating every row.
  const lineSeries = useMemo(() => {
    const points = transactionsRepo.getSpendSeries({
      from: ranges.current.from.toISOString(),
      to: ranges.current.to.toISOString(),
      bucket: period === 'Year' ? 'month' : 'day',
    });
    return spendSeriesToBuckets(points, period, ranges.current.from, ranges.current.to);
  }, [transactionsRepo, ranges, period, repoVersion]);

  // Running total so the hero line climbs to the period's spend — the final
  // point equals the total shown above it, Coinbase-style.
  const cumulativeSeries = useMemo(() => {
    let s = 0;
    return lineSeries.map((v) => (s += v));
  }, [lineSeries]);

  // Anchor the trends tile to the same range the hero is showing: when the
  // selected period is the live one, anchor to `now` (so future buckets stay
  // empty); for a past period, anchor to its end so every bucket is "elapsed".
  const trendAnchor = useMemo(() => {
    const { from, to } = ranges.current;
    return from <= now && now <= to ? now : to;
  }, [ranges, now]);

  // Spending-trends tile: timeframe-aware buckets (7 days / 4 weeks / 6 months /
  // 4 quarters) with the average taken over *elapsed* buckets only, so empty
  // future buckets don't drag the typical-spend line down.
  const trend = useMemo(() => {
    const config = trendTimeframeConfig(timeframe, trendAnchor);
    const points = transactionsRepo.getSpendSeries({
      from: config.from.toISOString(),
      to: config.to.toISOString(),
      bucket: config.bucket,
    });
    const values = foldTrendSeries(points, config.slots);
    const elapsed = config.slots
      .map((slot, i) => ({ slot, value: values[i] }))
      .filter(({ slot }) => slot.from <= trendAnchor);
    const avg = elapsed.length
      ? elapsed.reduce((sum, e) => sum + e.value, 0) / elapsed.length
      : 0;
    return {
      values,
      labels: config.slots.map((s) => s.label),
      slots: config.slots,
      avg,
      from: config.from,
      to: config.to,
    };
  }, [transactionsRepo, timeframe, trendAnchor, repoVersion]);

  // Scrub state for the trends tile — mirrors the hero's scrubIdx: while held,
  // the headline shows the selected bucket's total instead of the average.
  const [trendScrubIdx, setTrendScrubIdx] = useState<number | null>(null);
  useEffect(() => setTrendScrubIdx(null), [trend]);
  const trendScrubbing = trendScrubIdx != null;
  const trendAmount = trendScrubbing
    ? trend.values[trendScrubIdx] ?? trend.avg
    : trend.avg;
  const trendRightLabel = trendScrubbing
    ? trendScrubLabel(timeframe, trend.slots[trendScrubIdx], trendScrubIdx)
    : `${TREND_CADENCE[timeframe]} average`;

  // Active scrub point (null = released → show the period total).
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  // Drop any held scrub when the series changes under it (period/data switch).
  useEffect(() => setScrubIdx(null), [cumulativeSeries]);

  const splitMoney = (n: number) => {
    const whole = Math.floor(n).toLocaleString();
    const cents = Math.round((n - Math.floor(n)) * 100)
      .toString()
      .padStart(2, '0');
    return { whole: `$${whole}`, cents: `.${cents}` };
  };

  // Date/label the scrubbed point represents.
  const scrubDateLabel = (idx: number): string => {
    if (period === 'Year') {
      const year = ranges.current.from.getFullYear();
      return new Date(year, idx, 1).toLocaleDateString('en-US', {
        month: 'long',
      });
    }
    return addDays(ranges.current.from, idx).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const heroScrubbing = scrubIdx != null;
  const heroAmount = heroScrubbing
    ? cumulativeSeries[scrubIdx] ?? total
    : total;
  const spendDisplay = splitMoney(heroAmount);
  const heroSubLabel = heroScrubbing
    ? scrubDateLabel(scrubIdx)
    : rangeContextLabel;

  // ── Bento summary tiles ───────────────────────────────────────────
  const savingsTint = groupDisplayColor('savings', theme.dark);
  // Neutral line colors for the spend chart (no accent in data viz).
  const lineColor = theme.dark
    ? 'rgba(242,244,245,0.72)'
    : 'rgba(14,12,24,0.50)';
  const lineColorFaint = theme.dark
    ? 'rgba(242,244,245,0.32)'
    : 'rgba(14,12,24,0.22)';
  const savedMetric = useMemo(
    () =>
      buildSavedMetric({
        transactionsRepo,
        categories,
        incomes,
        period,
        from: ranges.current.from,
        to: ranges.current.to,
        now,
      }),
    [
      transactionsRepo,
      categories,
      incomes,
      period,
      ranges.current.from,
      ranges.current.to,
      now,
      repoVersion,
    ],
  );

  // Scrub state for the Total saved tile — mirrors the hero: while held, the
  // headline shows the cumulative saved amount at that point and the sub-label
  // shows the date it represents (same date mapping as the hero series).
  const [savedScrubIdx, setSavedScrubIdx] = useState<number | null>(null);
  useEffect(() => setSavedScrubIdx(null), [savedMetric.cumulativeSeries]);
  const savedScrubbing = savedScrubIdx != null;
  const savedAmount = savedScrubbing
    ? savedMetric.cumulativeSeries[savedScrubIdx] ?? savedMetric.total
    : savedMetric.total;
  const savedSubLabel = savedScrubbing
    ? scrubDateLabel(savedScrubIdx)
    : rangeContextLabel;

  const scrimTop = theme.dark ? 'rgba(3,5,8,0.55)' : 'rgba(3,5,8,0.30)';
  const scrimMid = theme.dark ? 'rgba(3,5,8,0.34)' : 'rgba(3,5,8,0.30)';
  const scrimLower = theme.dark ? 'rgba(3,5,8,0.68)' : 'rgba(3,5,8,0.20)';
  const scrimBottom = theme.dark ? 'rgba(3,5,8,0.88)' : 'transparent';

  const floorColor = deriveFloor(wallpaperFloorBase, theme.dark);
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
        locations={[0, 0.28, 0.6, 1]}
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
            style={[
              StyleSheet.absoluteFill,
              { opacity: headerBgOpacity },
            ]}
          >
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.headerDivider,
                {
                  backgroundColor: theme.dark
                    ? MEDIA.hairline
                    : 'rgba(14,12,24,0.08)',
                },
              ]}
            />
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

            <Text style={[styles.headerTitle, { color: pWall.text }, shadow]}>
              Insights
            </Text>

            <ThemeToggle />
          </View>
        </View>

        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 64,
            paddingBottom: 160,
          }}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
        >
          {/* ─── Bento ─────────────────────────────── */}
          <View style={styles.sectionStack}>
            <View style={styles.bento}>
              {/* Control row: small timeframe chips (left) + month menu (right),
                  sitting right above the chart like the reference. */}
              <View style={styles.bentoControls}>
                <SegmentedControl
                  values={TIMEFRAMES as unknown as string[]}
                  selectedIndex={timeframeIdx}
                  onChange={(e) => {
                    const next = TIMEFRAMES[e.nativeEvent.selectedSegmentIndex];
                    if (next) setTimeframe(next);
                  }}
                  tintColor={theme.accent.dot}
                  appearance={theme.dark ? 'dark' : 'light'}
                  backgroundColor={
                    theme.dark
                      ? 'rgba(242,244,245,0.06)'
                      : 'rgba(255,255,255,0.16)'
                  }
                  fontStyle={{
                    color: theme.dark
                      ? 'rgba(242,244,245,0.68)'
                      : 'rgba(11,13,16,0.62)',
                  }}
                  activeFontStyle={{
                    color: theme.accent.ink,
                    fontWeight: '600',
                  }}
                  style={styles.timeframeSeg}
                />
                <Host ignoreSafeArea="all" style={{ width: 150, height: 28 }}>
                  <Menu
                    label={
                      <View style={[styles.monthLabel, { width: 150, height: 28, justifyContent: 'flex-end' }]}>
                        <Text
                          style={[styles.monthLabelText, { color: pWall.text }, shadow]}
                          numberOfLines={1}
                        >
                          {dateLabel}
                        </Text>
                        <Icon name="chevDown" size={13} color={pWall.text} stroke={2.2} />
                      </View>
                    }
                  >
                    {dateOptions.map((opt, idx) => (
                      <SwiftButton
                        key={String(idx)}
                        systemImage={idx === dateIdx ? 'checkmark' : undefined}
                        onPress={() => setDateIdxByPeriod((prev) => ({ ...prev, [period]: idx }))}
                        label={opt}
                      />
                    ))}
                  </Menu>
                </Host>
              </View>

              {/* Hero — Spent + line chart (full width) */}
              <BentoTile
                dark={theme.dark}
                style={styles.tileHero}
                onPress={() =>
                  onOpenInsight({
                    title: 'Spending',
                    subtitle: rangeContextLabel,
                    icon: 'chart',
                  })
                }
                accessibilityLabel={`Spent, ${spendDisplay.whole}`}
              >
                <View style={styles.heroLabelRow}>
                  <Text style={[TYPE.labelSm, { color: p.textTer }]}>Spent</Text>
                  <Text style={[TYPE.labelSm, { color: p.textTer }]}> · </Text>
                  <Text style={[TYPE.labelSm, { color: p.textTer }]} numberOfLines={1}>
                    {heroSubLabel}
                  </Text>
                </View>
                <Text style={[styles.tileHeroAmount, { color: p.text }]}>
                  {spendDisplay.whole}
                  <Text style={{ color: p.textSec }}>{spendDisplay.cents}</Text>
                </Text>
                <View style={styles.heroChart}>
                  <SpendChart
                    data={cumulativeSeries}
                    width={HERO_CHART_W}
                    height={150}
                    color={lineColor}
                    ringColor={theme.surface}
                    strokeWidth={2.5}
                    verticalInset={28}
                    onScrub={setScrubIdx}
                  />
                </View>
              </BentoTile>

              {/* Row: Spending trends | Total saved */}
              <View style={styles.bentoRow}>
                <BentoTile
                  dark={theme.dark}
                  style={styles.tileHalf}
                  onPress={() =>
                    onOpenInsight({
                      kind: 'trends',
                      title: 'Spending trends',
                      subtitle: `Average ${TREND_CADENCE[timeframe]} spend`,
                      icon: 'chart',
                    })
                  }
                  accessibilityLabel={`Spending trends, ${trendRightLabel} ${money(trendAmount)}`}
                >
                  <Text style={[TYPE.labelSm, { color: p.textTer }]}>
                    Spending trends
                  </Text>
                  <Text
                    style={[styles.tileValue, { color: p.text }]}
                    numberOfLines={1}
                  >
                    {money(trendAmount)}
                  </Text>
                  <Text
                    style={[TYPE.caption, { color: p.textTer, marginTop: 2 }]}
                    numberOfLines={1}
                  >
                    {trendRightLabel}
                  </Text>
                  <View style={styles.tileTrendChart}>
                    <TrendBars
                      values={trend.values}
                      labels={trend.labels}
                      selectedIdx={trendScrubIdx}
                      onScrub={setTrendScrubIdx}
                      width={HALF_CHART_W}
                      height={64}
                      barColor={lineColorFaint}
                      selectedColor={lineColor}
                      labelColor={p.textTer}
                      selectedLabelColor={p.text}
                    />
                  </View>
                </BentoTile>

                <BentoTile
                  dark={theme.dark}
                  style={styles.tileHalf}
                  onPress={() =>
                    onOpenInsight({
                      kind: 'savings',
                      title: 'Total saved',
                      subtitle: rangeContextLabel,
                      icon: 'chart',
                      accentColor: savingsTint,
                    })
                  }
                  accessibilityLabel={`Total saved, ${money(savedAmount)}`}
                >
                  <Text style={[TYPE.labelSm, { color: p.textTer }]}>
                    Total saved
                  </Text>
                  <Text
                    style={[styles.tileValue, { color: savingsTint }]}
                    numberOfLines={1}
                  >
                    {money(savedAmount)}
                  </Text>
                  <Text
                    style={[TYPE.caption, { color: p.textTer, marginTop: 2 }]}
                    numberOfLines={1}
                  >
                    {savedSubLabel}
                  </Text>
                  <View style={styles.tileMiniChart}>
                    <SpendChart
                      data={savedMetric.cumulativeSeries}
                      width={HALF_CHART_W}
                      height={40}
                      color={savingsTint}
                      fillColor={savingsTint}
                      ringColor={theme.surface}
                      strokeWidth={2}
                      onScrub={setSavedScrubIdx}
                    />
                  </View>
                </BentoTile>
              </View>

              {/* What changed — movement vs the previous period */}
              {changeSnapshots.length > 0 ? (
                <>
                  <Text style={[styles.bentoSection, { color: pWall.text }, shadow]}>
                    What changed
                  </Text>
                  <BentoTile dark={theme.dark}>
                    {changeSnapshots.map((s, i) => (
                      <Pressable
                        key={s.key}
                        onPress={() => setInsightDetail(s.detail)}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.label}. ${s.title}`}
                        style={({ pressed }) => [
                          styles.changeRow,
                          {
                            borderBottomWidth:
                              i < changeSnapshots.length - 1
                                ? StyleSheet.hairlineWidth
                                : 0,
                            borderBottomColor: p.hairline,
                            opacity: pressed ? 0.6 : 1,
                          },
                        ]}
                      >
                        <View
                          style={[styles.changeIcon, { backgroundColor: `${s.color}26` }]}
                        >
                          <Icon name={s.icon} size={15} color={s.color} stroke={1.8} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[TYPE.labelSm, { color: p.textTer }]}>
                            {s.label}
                          </Text>
                          <Text
                            style={[TYPE.bodySmEm, { color: p.text, marginTop: 2 }]}
                            numberOfLines={1}
                          >
                            {s.title}
                          </Text>
                        </View>
                        <Icon name="chevR" size={14} color={p.textTer} stroke={2.1} />
                      </Pressable>
                    ))}
                  </BentoTile>
                </>
              ) : null}

              {/* Where it went — switchable top categories / merchants. Carries
                  a section title for rhythm parity with "What changed" so the two
                  lists read as a matched pair; the picker switches the sub-view
                  and a row tap opens the same insight sheet. */}
              {hasSpending ? (
                <>
                  <Text style={[styles.bentoSection, { color: pWall.text }, shadow]}>
                    Where it went
                  </Text>
                  <BentoTile dark={theme.dark}>
                  <SegmentedControl
                    values={WHERE_TABS as unknown as string[]}
                    selectedIndex={whereTab}
                    onChange={(e) =>
                      setWhereTab(e.nativeEvent.selectedSegmentIndex)
                    }
                    tintColor={theme.accent.dot}
                    appearance={theme.dark ? 'dark' : 'light'}
                    backgroundColor={theme.chipBg}
                    fontStyle={{ color: theme.textSec }}
                    activeFontStyle={{
                      color: theme.accent.ink,
                      fontWeight: '600',
                    }}
                    style={styles.whereSeg}
                  />
                  <View style={styles.whereList}>
                    {whereItems.length === 0 ? (
                      <Text
                        style={[
                          TYPE.bodySm,
                          { color: p.textTer, paddingVertical: 12 },
                        ]}
                      >
                        Nothing here for this period.
                      </Text>
                    ) : (
                      whereItems.map((it, i) => {
                        const dec = Math.abs(it.spent) < 100 ? 2 : 0;
                        const fill = whereMax > 0 ? it.spent / whereMax : 0;
                        return (
                          <Pressable
                            key={it.key}
                            onPress={() => setInsightDetail(it.detail)}
                            accessibilityRole="button"
                            accessibilityLabel={`${it.label}, ${money(it.spent, dec)}`}
                            style={({ pressed }) => [
                              styles.catRow,
                              {
                                borderBottomWidth:
                                  i < whereItems.length - 1
                                    ? StyleSheet.hairlineWidth
                                    : 0,
                                borderBottomColor: p.hairline,
                                opacity: pressed ? 0.6 : 1,
                              },
                            ]}
                          >
                            {whereTab === 1 ? (
                              <MerchantMark
                                merchant={it.label}
                                catIcon={it.icon}
                                color={it.color}
                                size={32}
                              />
                            ) : (
                              <View
                                style={[styles.catIcon, { backgroundColor: `${it.color}26` }]}
                              >
                                <Icon
                                  name={it.icon}
                                  size={15}
                                  color={it.color}
                                  stroke={1.8}
                                />
                              </View>
                            )}
                            <View style={styles.catMid}>
                              <View style={styles.catTopLine}>
                                <Text
                                  style={[
                                    TYPE.body,
                                    { color: p.text, flexShrink: 1 },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {it.label}
                                </Text>
                                <View style={styles.catRight}>
                                  <Text style={[TYPE.body, { color: p.text }]}>
                                    {money(it.spent, dec)}
                                  </Text>
                                  <DeltaBadge
                                    spent={it.spent}
                                    prevSpent={it.prevSpent}
                                    dark={theme.dark}
                                  />
                                </View>
                              </View>
                              <View
                                style={[
                                  styles.catBar,
                                  { backgroundColor: p.hairline },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.catBarFill,
                                    {
                                      width: `${Math.max(4, fill * 100)}%` as any,
                                      backgroundColor: it.color,
                                    },
                                  ]}
                                />
                              </View>
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                  </BentoTile>
                </>
              ) : (
                <EmptyState
                  theme={theme}
                  title="No spending yet this period"
                  body="Log an expense and your top categories, merchants, and what changed since last period show up here."
                />
              )}
            </View>

          </View>
        </Animated.ScrollView>

        <InsightBottomSheet
          detail={insightDetail}
          theme={theme}
          onClose={() => setInsightDetail(null)}
          onViewActivity={onViewActivity}
        />
    </View>
  );
}

// Spacing follows a 4px grid — 4 / 8 / 12 / 16 / 20 / 24. The only off-grid
// value is CARD_INNER_PAD (20), kept because chart geometry is derived from it.
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
  headerDateNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDateMenuHost: { width: 160, height: 40, justifyContent: 'center' },
  headerDateLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  headerDateText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  weekNavBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sectionStack: { paddingHorizontal: CARD_OUTER_PAD, gap: 24 },
  // Bento (v3): varied-size frosted tiles, tighter gap than the section stack.
  headerTitle: { ...TYPE.pageTitle, flex: 1, textAlign: 'center' },
  bentoPeriod: { height: 36 },
  bento: { gap: 12 },
  bentoControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeframeSeg: { width: 200, height: 30, borderRadius: RADIUS.field, overflow: 'hidden' },
  monthLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthLabelText: { ...TYPE.subsectionTitle },
  bentoRow: { flexDirection: 'row', gap: 12 },
  tileHero: { minHeight: 260 },
  tileHalf: { flex: 1, minHeight: Math.round(HALF_W) },
  tileWide: { minHeight: 56 },
  tileHeroAmount: { ...TYPE.display, lineHeight: 38, marginTop: 8 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center' },
  tileValue: { ...TYPE.headline, marginTop: 8 },
  tileValueSm: { ...TYPE.subsectionTitle, marginTop: 8 },
  heroChart: { flex: 1, maxHeight: 150, marginTop: 8 },
  tileMiniChart: { marginTop: 'auto', height: 40 },
  tileTrendChart: { marginTop: 'auto', height: 64 },
  bentoSection: { ...TYPE.sectionTitle, marginTop: 4 },
  // "Where it went" category rows — flat rows inside one frosted tile.
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  catIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catMid: { flex: 1, minWidth: 0 },
  catTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  catRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  catBar: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 9,
  },
  catBarFill: { height: 5, borderRadius: 3 },
  // "What changed" movement rows.
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  changeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // "Where it went" tile: segmented picker at the top, list below.
  whereSeg: { height: 30, borderRadius: RADIUS.field, overflow: 'hidden' },
  whereList: { marginTop: 4 },
  tileBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 'auto',
  },
  tileBarFill: { height: 6, borderRadius: 3 },
  mixBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 'auto',
    marginBottom: 8,
  },
  tileWideRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileWideRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Chart
  chartTitle: { ...TYPE.bodySmEm, opacity: 0.7, letterSpacing: 0.2 },
  chartPeriodSegmented: {
    marginBottom: 16,
    height: 36,
  },
  chartHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  chartHeroAmount: { ...TYPE.display, lineHeight: 38 },
  chartHeroLabel: { ...TYPE.bodySm, marginTop: 2 },
  chartHeroRight: {
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  chartSegmented: {
    width: 128,
    height: 32,
    flexShrink: 0,
  },
  chartSlide: { height: CHART_H, justifyContent: 'center' },
  emptyState: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 16,
    marginTop: 12,
  },
  changedBlock: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  rowInnerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowTitle: { ...TYPE.body },
  rowSub: { ...TYPE.caption, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', flexShrink: 0, minWidth: 92 },
  rowAmtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowAmt: { ...TYPE.body },
  rowPct: { ...TYPE.caption, marginTop: 2 },
  rowBudgetStatus: { ...TYPE.caption, marginTop: 2 },
  // Delta indicator — caret + percent, no pill, in the row's right cluster.
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  // Budget bar
  budgetTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  budgetFill: { height: 4, borderRadius: 2 },
  // Native insight sheet
  insightSheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  insightSheetHero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
  insightSheetMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  insightVizWrap: {
    marginTop: 4,
    paddingHorizontal: 4,
  },
  insightStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  insightStat: {
    flex: 1,
    alignItems: 'center',
  },
  insightStatDiv: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 1,
  },
  insightSheetAction: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
