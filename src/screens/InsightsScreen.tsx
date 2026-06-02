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
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  background,
  environment,
  presentationDetents,
  presentationDragIndicator,
  type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { MenuView } from '@react-native-menu/menu';

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
  WallpaperP as P,
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
  type ActivityInitialFilter,
  type CatRow,
} from '../selectors/spending';
import { Icon } from '../components/Icon';
import { ScreenExitButton, EXIT_FLOAT_STYLE } from '../components/GlassButton';
import { BentoTile } from '../components/BentoTile';
import { LineChart } from '../components/charts/LineChart';
import { SpendChart } from '../components/charts/SpendChart';
import type { InsightDetailTarget } from './InsightDetailScreen';
import { HeaderIcon, useHeaderScroll, BG_PARALLAX_MAX } from '../components/headerScroll';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  InsightBarChart,
  InsightPaceChart,
  type InsightBin,
  type InsightDetail,
} from '../components/charts/InsightsCharts';
import { SnapshotViz, type SnapshotVizSpec } from '../components/charts/SnapshotViz';
import { TYPE } from '../typography';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CARD_OUTER_PAD = 16;
const CARD_INNER_PAD = 18;
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

const CHART_TYPES = ['Spent', 'Pace'] as const;
const PERIODS = ['Week', 'Month', 'Year'] as const;
type Period = (typeof PERIODS)[number];

// UI timeframe chips. The data layer only models Week/Month/Year, so 6M is
// temporarily mapped onto the yearly range until a real 6-month range exists.
const TIMEFRAMES = ['1W', '1M', '6M', '1Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const TF_TO_PERIOD: Record<Timeframe, Period> = {
  '1W': 'Week',
  '1M': 'Month',
  '6M': 'Year',
  '1Y': 'Year',
};

// Snapshot rows are drawn from a scored candidate pool; only the strongest few
// surface so the card stays compact and varies with the data/period.
const MAX_SNAPSHOTS = 4;

interface Snapshot {
  key: string;
  label: string;        // short, clear chip (e.g. "Over budget")
  title: string;        // the one-line insight
  color: string;        // semantic tint (over/savings/category)
  icon: string;
  score: number;        // higher = more noteworthy right now
  detail: InsightDetail; // every snapshot opens a detail sheet (with a filter)
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
  return (
    <View
      style={[
        styles.deltaBadge,
        {
          backgroundColor: isUp
            ? dark
              ? 'rgba(212,82,42,0.18)'
              : 'rgba(212,82,42,0.12)'
            : dark
              ? 'rgba(122,205,138,0.16)'
              : 'rgba(58,135,80,0.10)',
        },
      ]}
    >
      <Text
        style={[
          styles.deltaText,
          { color: isUp ? OVER_DOT : dark ? '#7ACD8A' : '#3A8750' },
        ]}
      >
        {isUp ? '▲' : '▼'} {d.pct}%
      </Text>
    </View>
  );
}

// ── Frosted section card ──────────────────────────────────────────
function SectionCard({
  children,
  style,
  dark,
}: {
  children: React.ReactNode;
  style?: any;
  dark: boolean;
}) {
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

function SelectedInsightStrip({
  detail,
  theme,
  p,
  onOpen,
}: {
  detail: InsightDetail | null;
  theme: Theme;
  p: P;
  onOpen: () => void;
}) {
  if (!detail) return null;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Show details for ${detail.title}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.selectedStrip, { borderTopColor: p.hairline }]}
    >
      <View style={[styles.selectedDot, { backgroundColor: detail.color }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[TYPE.captionEm, { color: theme.text }]} numberOfLines={1}>
          {detail.title}
          <Text style={{ color: theme.textTer }}> · </Text>
          {detail.amount}
        </Text>
        <Text
          style={[TYPE.caption, { color: theme.textSec, marginTop: 1 }]}
          numberOfLines={1}
        >
          {detail.description}
        </Text>
      </View>
      <Icon name="chevR" size={15} color={p.textSec} stroke={2.2} />
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

function ReadoutRow({
  label,
  title,
  icon,
  theme,
  text,
  textTer,
  onPress,
}: {
  label: string;
  title: string;
  icon: string;
  theme: Theme;
  text: string;
  textTer: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View
        style={[
          styles.readoutIcon,
          {
            backgroundColor: theme.dark ? 'rgba(242,244,245,0.92)' : '#0B0D10',
          },
        ]}
      >
        <Icon
          name={icon}
          size={15}
          color={theme.dark ? '#080A0D' : '#F2F4F5'}
          stroke={1.8}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[TYPE.labelSm, { color: textTer }]}>{label}</Text>
        <Text
          style={[TYPE.bodySmEm, { color: text, marginTop: 2 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      {onPress ? (
        <Icon name="chevR" size={14} color={textTer} stroke={2.1} />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.readoutRow}>{content}</View>;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      delayPressIn={0}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${title}`}
      style={styles.readoutRow}
    >
      {content}
    </TouchableOpacity>
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
  const metrics = d?.metrics?.slice(0, 3) ?? [];
  // Compare-style vizzes stack two bars and run taller; rows that also carry a
  // supporting stat strip need the extra room so nothing clips against the
  // fixed detent. Bare snapshots stay compact.
  const tall = metrics.length > 0 || d?.viz?.kind === 'compare';
  const detent: PresentationDetent = { fraction: tall ? 0.54 : 0.46 };

  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
      <BottomSheet
        isPresented={detail !== null}
        onIsPresentedChange={(v) => {
          if (!v) onClose();
        }}
      >
        <Group
          modifiers={[
            presentationDetents([detent]),
            presentationDragIndicator('visible'),
            environment({
              key: 'colorScheme',
              value: theme.dark ? 'dark' : 'light',
            }),
            background(theme.surface),
          ]}
        >
          <RNHostView>
            <View
              style={[
                styles.insightSheetContent,
                {
                  backgroundColor: theme.dark
                    ? theme.surface
                    : 'rgba(255,255,255,0.44)',
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
                        { color: theme.text, marginTop: 10 },
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
                    <Pressable
                      onPress={() => {
                        onClose();
                        onViewActivity(d.filter!);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`View matching transactions for ${d.title}`}
                      style={({ pressed }) => [
                        styles.insightSheetAction,
                        {
                          backgroundColor: pressed ? theme.textSec : theme.text,
                        },
                      ]}
                    >
                      <Text style={[TYPE.subsectionTitle, { color: theme.bg }]}>
                        View matching transactions
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
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
  const { transactionsRepo, categoriesRepo, budgetsRepo, recurringRulesRepo } =
    useRepositories();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [repoVersion, setRepoVersion] = useState(0);
  const categories = useRepositoryList(categoriesRepo);
  const budgets = useRepositoryList(budgetsRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
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
  useEffect(() => {
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
    setTransactions(rows);
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
  const primaryComparison = useMemo(() => {
    if (projected.budget > 0) {
      const pct = Math.round(
        (Math.abs(projected.delta) / projected.budget) * 100,
      );
      // Within a couple of points of plan reads as "on track" rather than a
      // misleadingly precise over/under figure.
      if (pct <= 2) {
        return { label: 'On track with plan', color: p.textSec };
      }
      const direction = projected.delta > 0 ? 'over' : 'under';
      const suffix = rangeComplete ? 'plan' : 'projected';
      return {
        label: `${pct}% ${direction} ${suffix}`,
        color: projected.color,
      };
    }

    // Fallback: compare discretionary spend only, so a bill that lands in one
    // period but not the comparison period doesn't fake a big swing.
    const variable = catBreakdown.variableTotal;
    const prevVariable = catBreakdown.prevVariableTotal;
    if (prevVariable > 0) {
      const pct = Math.round(
        Math.abs((variable - prevVariable) / prevVariable) * 100,
      );
      return {
        label: `${pct}% ${variable <= prevVariable ? 'lower' : 'higher'} than last ${period.toLowerCase()}`,
        color:
          variable <= prevVariable
            ? groupDisplayColor('savings', theme.dark)
            : OVER_DOT,
      };
    }

    return {
      label: rangeComplete ? 'Range complete' : 'Range in progress',
      color: p.textSec,
    };
  }, [
    catBreakdown.prevVariableTotal,
    catBreakdown.variableTotal,
    period,
    p.textSec,
    projected.budget,
    projected.color,
    projected.delta,
    rangeComplete,
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

    return out.sort((a, b) => b.score - a.score).slice(0, MAX_SNAPSHOTS);
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

  const { scrollY, headerBgOpacity, iconScrolledOpacity, bgTranslateY } = useHeaderScroll();

  const timeframeIdx = TIMEFRAMES.indexOf(timeframe);
  const rangeContextLabel =
    period === 'Week'
      ? 'This week'
      : period === 'Month'
        ? 'This month'
        : 'This year';

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

  // ── Bento summary tiles (v3, in progress) ────────────────────────
  // Most values come straight from selectors already computed above; the
  // native Gauge (Left-to-spend tile) and the hero chart get wired in later
  // build steps. Week has no real budget, so the budget tile flips to a
  // projection (consistent with the rest of the screen's pace framing).
  const isCycle = period !== 'Week';
  const leftToSpend = projected.budget - total;
  const onTrack = projected.delta <= 0;
  const savingsTint = groupDisplayColor('savings', theme.dark);
  const groupMix = (() => {
    const totals: Record<GroupKey, number> = { needs: 0, wants: 0, savings: 0 };
    catBreakdown.rows.forEach((r) => {
      totals[categoryGroupFor(r.cat, categories)] += r.spent;
    });
    const sum = totals.needs + totals.wants + totals.savings || 1;
    return {
      totals,
      pct: {
        needs: Math.round((totals.needs / sum) * 100),
        wants: Math.round((totals.wants / sum) * 100),
        savings: Math.round((totals.savings / sum) * 100),
      },
    };
  })();
  // The single most-notable insight, excluding the ones that already have their
  // own tile (next bill, the 50/30/20 mix).
  const topMoved =
    snapshots.find((s) => s.key !== 'next-bill' && s.key !== 'mix') ??
    snapshots[0];
  const nextBill = upcomingBills[0];
  const budgetFillPct =
    projected.budget > 0 ? Math.min(1, total / projected.budget) : 0;
  // Neutral line colors for the spend chart (no accent in data viz).
  const lineColor = theme.dark
    ? 'rgba(242,244,245,0.72)'
    : 'rgba(14,12,24,0.50)';
  const lineColorFaint = theme.dark
    ? 'rgba(242,244,245,0.32)'
    : 'rgba(14,12,24,0.22)';
  // Faint placeholder bars for the Income tile.
  const sparkBars = (lineSeries.length ? lineSeries : [0]).slice(-6);
  const sparkBarsMax = Math.max(...sparkBars, 1);

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
                    color: theme.dark ? '#080A0D' : '#F2F4F5',
                    fontWeight: '600',
                  }}
                  style={styles.timeframeSeg}
                />
                <MenuView
                  shouldOpenOnLongPress={false}
                  themeVariant={theme.dark ? 'dark' : 'light'}
                  actions={dateOptions.map((opt, idx) => ({
                    id: String(idx),
                    title: opt,
                    state: idx === dateIdx ? 'on' : 'off',
                  }))}
                  onPressAction={({ nativeEvent }) => {
                    const next = Number(nativeEvent.event);
                    setDateIdxByPeriod((prev) => ({ ...prev, [period]: next }));
                  }}
                >
                  <View style={styles.monthLabel}>
                    <Text
                      style={[
                        styles.monthLabelText,
                        { color: pWall.text },
                        shadow,
                      ]}
                      numberOfLines={1}
                    >
                      {dateLabel}
                    </Text>
                    <Icon
                      name="chevDown"
                      size={13}
                      color={pWall.text}
                      stroke={2.2}
                    />
                  </View>
                </MenuView>
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
                <Text style={[TYPE.labelSm, { color: p.textTer }]}>Spent</Text>
                <Text style={[styles.tileHeroAmount, { color: p.text }]}>
                  {spendDisplay.whole}
                  <Text style={{ color: p.textSec }}>{spendDisplay.cents}</Text>
                </Text>
                <Text
                  style={[TYPE.bodySm, styles.heroSubLabel, { color: p.textTer }]}
                  numberOfLines={1}
                >
                  {heroSubLabel}
                </Text>
                <View style={styles.heroChart}>
                  <SpendChart
                    data={cumulativeSeries}
                    width={HERO_CHART_W}
                    height={150}
                    color={lineColor}
                    ringColor={theme.surface}
                    strokeWidth={2.5}
                    onScrub={setScrubIdx}
                  />
                </View>
              </BentoTile>

              {/* Row: Income | Net cashflow */}
              <View style={styles.bentoRow}>
                <BentoTile
                  dark={theme.dark}
                  style={styles.tileHalf}
                  onPress={() =>
                    onOpenInsight({
                      title: 'Income',
                      subtitle: rangeContextLabel,
                      icon: 'chart',
                    })
                  }
                  accessibilityLabel="Income"
                >
                  <Text style={[TYPE.labelSm, { color: p.textTer }]}>Income</Text>
                  <Text
                    style={[styles.tileValue, { color: p.text }]}
                    numberOfLines={1}
                  >
                    {money(0)}
                  </Text>
                  <View style={styles.tileSpark}>
                    {sparkBars.map((v, i) => (
                      <View
                        key={i}
                        style={{
                          flex: 1,
                          height: Math.max((v / sparkBarsMax) * 40, 4),
                          borderRadius: 3,
                          backgroundColor: lineColorFaint,
                        }}
                      />
                    ))}
                  </View>
                </BentoTile>

                <BentoTile
                  dark={theme.dark}
                  style={styles.tileHalf}
                  onPress={() =>
                    onOpenInsight({
                      title: 'Net cashflow',
                      subtitle: rangeContextLabel,
                      icon: 'chart',
                    })
                  }
                  accessibilityLabel="Net cashflow"
                >
                  <Text style={[TYPE.labelSm, { color: p.textTer }]}>
                    Net cashflow
                  </Text>
                  <Text
                    style={[styles.tileValue, { color: p.text }]}
                    numberOfLines={1}
                  >
                    {money(0)}
                  </Text>
                  <View style={styles.tileMiniChart}>
                    <LineChart
                      data={lineSeries}
                      width={HALF_CHART_W}
                      height={40}
                      color={lineColorFaint}
                      strokeWidth={2}
                    />
                  </View>
                </BentoTile>
              </View>

              {/* Budget (full-width / "double" tile) */}
              <Text style={[styles.bentoSection, { color: pWall.text }, shadow]}>
                Budget
              </Text>
              <BentoTile
                dark={theme.dark}
                style={styles.tileBudget}
                onPress={() =>
                  onOpenInsight({
                    title: 'Budget',
                    subtitle: rangeContextLabel,
                    icon: 'chart',
                    accentColor: onTrack ? savingsTint : OVER_DOT,
                  })
                }
                accessibilityLabel="Budget"
              >
                <Text style={[TYPE.labelSm, { color: p.textTer }]}>
                  {isCycle ? 'This month' : 'This week'}
                </Text>
                <View style={styles.budgetLineRow}>
                  <Text style={[styles.tileValue, { color: p.text }]}>
                    {money(Math.max(0, leftToSpend))}
                  </Text>
                  <Text style={[TYPE.body, { color: p.textSec }]}>
                    left to spend
                  </Text>
                </View>
                <View style={styles.budgetStatusRow}>
                  <View
                    style={[
                      styles.budgetDot,
                      { backgroundColor: onTrack ? savingsTint : OVER_DOT },
                    ]}
                  />
                  <Text
                    style={[
                      TYPE.captionEm,
                      { color: onTrack ? savingsTint : OVER_DOT },
                    ]}
                  >
                    {onTrack ? 'On track' : 'Over budget'}
                  </Text>
                </View>
                <View style={[styles.budgetBar, { backgroundColor: p.hairline }]}>
                  <View
                    style={[
                      styles.budgetBarFill,
                      {
                        width: `${Math.max(0, 1 - budgetFillPct) * 100}%` as any,
                        backgroundColor: onTrack ? savingsTint : OVER_DOT,
                      },
                    ]}
                  />
                </View>
                <View style={styles.budgetFooter}>
                  <Text style={[TYPE.caption, { color: p.textTer }]}>
                    {Math.round(Math.max(0, 1 - budgetFillPct) * 100)}% remaining
                  </Text>
                  <Text style={[TYPE.caption, { color: p.textTer }]}>
                    {money(projected.budget)}
                  </Text>
                </View>
              </BentoTile>
            </View>

          </View>
        </Animated.ScrollView>
    </View>
  );
}

// Spacing follows a 4px grid — 4 / 8 / 12 / 16 / 20 / 24. The only off-grid
// value is CARD_INNER_PAD (18), kept because chart geometry is derived from it.
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
  timeframeSeg: { width: 200, height: 30, borderRadius: 13, overflow: 'hidden' },
  monthLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthLabelText: { ...TYPE.subsectionTitle },
  bentoRow: { flexDirection: 'row', gap: 12 },
  tileHero: { minHeight: 260 },
  tileHalf: { flex: 1, minHeight: Math.round(HALF_W) },
  tileWide: { minHeight: 56 },
  tileBudget: { minHeight: 150 },
  tileHeroAmount: { ...TYPE.display, lineHeight: 38, marginTop: 8 },
  heroSubLabel: { marginTop: 2 },
  tileValue: { ...TYPE.headline, marginTop: 6 },
  tileValueSm: { ...TYPE.subsectionTitle, marginTop: 8 },
  heroChart: { marginTop: 'auto', height: 150 },
  tileMiniChart: { marginTop: 'auto', height: 40 },
  bentoSection: { ...TYPE.sectionTitle, marginTop: 4 },
  budgetLineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  budgetStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  budgetDot: { width: 7, height: 7, borderRadius: 4 },
  budgetBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
  },
  budgetBarFill: { height: 6, borderRadius: 3 },
  budgetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  tileSpark: {
    height: 52,
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
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
  sectionCard: { borderRadius: 24, overflow: 'hidden' },
  sectionCardBorder: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: CARD_INNER_PAD,
    paddingTop: 18,
    paddingBottom: 16,
  },
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
    gap: 6,
    flexShrink: 0,
  },
  chartSegmented: {
    width: 128,
    height: 32,
    flexShrink: 0,
  },
  chartSlide: { height: CHART_H, justifyContent: 'center' },
  selectedStrip: {
    minHeight: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  selectedDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  emptyState: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 16,
    marginTop: 12,
  },
  // Readout
  readoutHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  readoutRows: {
    gap: 4,
  },
  readoutRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  readoutIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
  rowAmtRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowAmt: { ...TYPE.body },
  rowPct: { ...TYPE.caption, marginTop: 2 },
  rowBudgetStatus: { ...TYPE.caption, marginTop: 2 },
  // Delta badge
  deltaBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100 },
  deltaText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },
  // Budget bar
  budgetTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  budgetFill: { height: 4, borderRadius: 2 },
  // Native insight sheet
  insightSheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
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
    marginTop: 18,
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
    marginTop: 14,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
