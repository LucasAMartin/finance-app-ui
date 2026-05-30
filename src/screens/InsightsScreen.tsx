import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  WallpaperP as P,
} from '../wallpaperPalette';
import {
  useRepositories,
  useRepositoryList,
} from '../repositories/RepositoryProvider';
import { categoryGroupFor } from '../repositories/categoryUtils';
import type { Category, GroupKey } from '../repositories/types';
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
  type ActivityInitialFilter,
} from '../selectors/spending';
import { Icon } from '../components/Icon';
import { HeaderIcon, useHeaderScroll } from '../components/headerScroll';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  InsightBarChart,
  InsightPaceChart,
  type InsightBin,
  type InsightDetail,
} from '../components/charts/InsightsCharts';
import { TYPE } from '../typography';

const { width: SCREEN_W } = Dimensions.get('window');

const CARD_OUTER_PAD = 16;
const CARD_INNER_PAD = 18;
const CARD_W = SCREEN_W - CARD_OUTER_PAD * 2;
const CHART_INNER_W = CARD_W - CARD_INNER_PAD * 2;
const CHART_H = 188;
const INSIGHT_SHEET_DETENT: PresentationDetent = { fraction: 0.42 };

const CHART_TYPES = ['Spent', 'Pace'] as const;
const PERIODS = ['Week', 'Month', 'Year'] as const;
type Period = (typeof PERIODS)[number];

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
  trendData: { data: { label: string; v: number }[]; budget: number },
): InsightBin[] {
  if (period === 'Week') {
    return trendData.data.map((d, i) => {
      const from = addDays(ranges.current.from, i);
      return {
        label: d.label,
        value: d.v,
        budget: trendData.budget,
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
      return { label: d.label, value: d.v, budget: trendData.budget, from, to };
    });
  }

  const year = ranges.current.from.getFullYear();
  return trendData.data.map((d, i) => ({
    label: d.label,
    value: d.v,
    budget: trendData.budget,
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
  return bins.reduce((sum, bin) => sum + bin.budget, 0);
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
  value,
  color,
  icon,
  theme,
  text,
  textTer,
  onPress,
}: {
  label: string;
  title: string;
  value?: string;
  color: string;
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
      {value ? <Text style={[TYPE.bodySmEm, { color }]}>{value}</Text> : null}
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
      accessibilityLabel={`${label}. ${title}${value ? `. ${value}` : ''}`}
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
  const metrics = d?.metrics.slice(0, 3) ?? [];

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
            presentationDetents([INSIGHT_SHEET_DETENT]),
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
                  <Pressable
                    onPress={onClose}
                    pointerEvents="box-only"
                    accessibilityRole="button"
                    accessibilityLabel="Close insight details"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[
                      styles.insightSheetClose,
                      { backgroundColor: theme.chipBg },
                    ]}
                  >
                    <Icon name="close" size={15} color={theme.textSec} />
                  </Pressable>

                  <View style={styles.insightSheetHero}>
                    <View
                      style={[
                        styles.insightSheetMark,
                        { backgroundColor: `${d.color}2B` },
                      ]}
                    >
                      <View
                        style={[
                          styles.insightSheetMarkDot,
                          { backgroundColor: d.color },
                        ]}
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

                  <View style={styles.insightMetricRow}>
                    {metrics.map((m) => (
                      <View
                        key={m.label}
                        style={[
                          styles.insightMetric,
                          { backgroundColor: theme.chipBg },
                        ]}
                      >
                        <Text style={[TYPE.labelSm, { color: theme.textTer }]}>
                          {m.label}
                        </Text>
                        <Text
                          style={[
                            TYPE.captionEm,
                            { color: theme.text, marginTop: 3 },
                          ]}
                        >
                          {m.value}
                        </Text>
                      </View>
                    ))}
                  </View>

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
}

export function InsightsScreen({ theme, onOpenDrawer, onViewActivity }: Props) {
  const { transactionsRepo, categoriesRepo, budgetsRepo, recurringRulesRepo } =
    useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const budgets = useRepositoryList(budgetsRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const { wallpaper } = useTheme();
  const insets = useSafeAreaInsets();
  const pWall = makeP(true);
  const p = makeP(theme.dark);
  const shadow = DARK_TEXT_SHADOW;

  const [period, setPeriod] = useState<Period>('Week');
  const [chartIdx, setChartIdx] = useState(0);
  const [insightDetail, setInsightDetail] = useState<InsightDetail | null>(
    null,
  );
  const [selectedDetail, setSelectedDetail] = useState<InsightDetail | null>(
    null,
  );
  const [chartHolding, setChartHolding] = useState(false);

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
  // A range whose end is in the past is settled: its totals are actuals, not
  // projections, so we drop the "pace"/"projected" framing for it.
  const rangeComplete = ranges.current.to <= now;
  const monthlyBgt = useMemo(() => currentMonthlyBudget(budgets), [budgets]);

  const catBreakdown = useMemo(
    () => categorySpending(transactions, categories, budgets, ranges, period),
    [transactions, categories, budgets, ranges, period],
  );
  const total = catBreakdown.total;
  const prevTotal = catBreakdown.prevTotal;
  const merchBreakdown = useMemo(
    () => merchantSpending(transactions, categories, ranges),
    [transactions, categories, ranges],
  );
  const trendData = useMemo(
    () => spendingTrend(transactions, ranges, period, monthlyBgt),
    [transactions, ranges, period, monthlyBgt],
  );
  const insightBins = useMemo(
    () => buildInsightBins(period, ranges, trendData),
    [period, ranges, trendData],
  );
  const upcomingBills = useMemo(
    () => upcomingBillsFromRecurring(recurringRules, categories, now),
    [recurringRules, categories, now],
  );
  const projected = useMemo(() => {
    const budget = periodBudget(period, monthlyBgt, insightBins);
    const elapsed = elapsedFraction(
      ranges.current.from,
      ranges.current.to,
      now,
    );
    const projectedTotal =
      ranges.current.to <= now
        ? catBreakdown.total
        : catBreakdown.total / elapsed;
    const delta = projectedTotal - budget;
    return {
      total: projectedTotal,
      budget,
      delta,
      copy: rangeComplete
        ? `${money(Math.abs(delta))} ${delta > 0 ? 'over' : 'under'} plan`
        : `${money(Math.abs(delta))} ${delta > 0 ? 'above' : 'below'} planned pace`,
      color: delta > 0 ? OVER_DOT : groupDisplayColor('savings', theme.dark),
    };
  }, [
    catBreakdown.total,
    insightBins,
    monthlyBgt,
    now,
    period,
    ranges.current.from,
    ranges.current.to,
    rangeComplete,
    theme.dark,
  ]);
  const primaryComparison = useMemo(() => {
    if (projected.budget > 0) {
      const pct = Math.round(
        (Math.abs(projected.delta) / projected.budget) * 100,
      );
      const direction = projected.delta > 0 ? 'over' : 'under';
      const suffix = rangeComplete ? 'plan' : 'planned pace';
      return {
        label: `${pct}% ${direction} ${suffix}`,
        color: projected.color,
      };
    }

    if (prevTotal > 0) {
      const pct = Math.round(Math.abs((total - prevTotal) / prevTotal) * 100);
      return {
        label: `${pct}% ${total <= prevTotal ? 'lower' : 'higher'} than last ${period.toLowerCase()}`,
        color:
          total <= prevTotal
            ? groupDisplayColor('savings', theme.dark)
            : OVER_DOT,
      };
    }

    return {
      label: rangeComplete ? 'Range complete' : 'Range in progress',
      color: p.textSec,
    };
  }, [
    period,
    p.textSec,
    prevTotal,
    projected.budget,
    projected.color,
    projected.delta,
    rangeComplete,
    theme.dark,
    total,
  ]);
  const whatChanged = useMemo(() => {
    return catBreakdown.rows
      .map((row) => {
        const delta = row.spent - row.prevSpent;
        const pct =
          row.prevSpent > 0 ? Math.round((delta / row.prevSpent) * 100) : null;
        return {
          ...row,
          delta,
          pct,
          color:
            delta > 0
              ? OVER_DOT
              : delta < 0
                ? groupDisplayColor('savings', theme.dark)
                : p.textSec,
          statusLabel:
            row.prevSpent === 0
              ? 'New'
              : delta > 0
                ? 'Up'
                : delta < 0
                  ? 'Down'
                  : 'Flat',
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }, [catBreakdown.rows, p.textSec, theme.dark]);
  const topDriver = useMemo(() => {
    const merchant = merchBreakdown.rows[0];
    if (!merchant) return null;
    const cat = catBreakdown.rows.find((row) => row.cat === merchant.cat);
    const share =
      cat && cat.spent > 0
        ? Math.round((merchant.spent / cat.spent) * 100)
        : Math.round(merchant.pct * 100);
    return {
      merchant,
      cat,
      share,
      color: categoryDisplayColor(merchant.cat, categories, theme.dark),
      copy: `${merchant.merchant} is ${share}% of ${cat?.label ?? 'spend'}`,
    };
  }, [catBreakdown.rows, categories, merchBreakdown.rows, theme.dark]);
  const budgetPressure = useMemo(() => {
    const pressureCat = catBreakdown.rows
      .filter((row) => row.budget > 0)
      .map((row) => ({
        ...row,
        remaining: row.budget - row.spent,
        ratio: row.spent / row.budget,
      }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    const bill = upcomingBills[0] ?? null;
    return { pressureCat, bill };
  }, [catBreakdown.rows, upcomingBills]);
  const topChange =
    whatChanged.find((row) => row.delta !== 0 && row.prevSpent > 0) ?? null;
  const hasSpending = total > 0;

  const handleSelectedDetail = useCallback((detail: InsightDetail) => {
    setSelectedDetail(detail);
  }, []);

  const withCurrentRange = useCallback(
    (detail: InsightDetail): InsightDetail => ({
      ...detail,
      filter: detail.filter
        ? {
            ...detail.filter,
            dateFrom: ranges.current.from,
            dateTo: ranges.current.to,
          }
        : undefined,
    }),
    [ranges.current.from, ranges.current.to],
  );

  const { scrollY, headerBgOpacity, iconScrolledOpacity } = useHeaderScroll();

  const spendDisplay = (() => {
    const whole = Math.floor(total).toLocaleString();
    const cents = Math.round((total - Math.floor(total)) * 100)
      .toString()
      .padStart(2, '0');
    return { whole: `$${whole}`, cents: `.${cents}` };
  })();

  const periodIdx = PERIODS.indexOf(period);
  const rangeContextLabel =
    period === 'Week'
      ? 'This week'
      : period === 'Month'
        ? 'This month'
        : 'This year';

  const scrimTop = theme.dark ? 'rgba(3,5,8,0.55)' : 'rgba(3,5,8,0.30)';
  const scrimMid = theme.dark ? 'rgba(3,5,8,0.34)' : 'rgba(3,5,8,0.30)';
  const scrimLower = theme.dark ? 'rgba(3,5,8,0.68)' : 'rgba(3,5,8,0.20)';
  const scrimBottom = theme.dark ? 'rgba(3,5,8,0.88)' : 'transparent';

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ImageBackground
        source={wallpaper.source}
        resizeMode="cover"
        style={StyleSheet.absoluteFillObject}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
          locations={[0, 0.28, 0.6, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* ─── Header ─────────────────────────────── */}
        <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { opacity: headerBgOpacity },
            ]}
          >
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFillObject}
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
            <ThemeToggle />
          </View>
        </View>

        <Animated.ScrollView
          style={{ flex: 1 }}
          scrollEnabled={!chartHolding}
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
          {/* ─── Date range title ────── */}
          <View style={styles.dateBlock}>
            <View style={styles.weekNavRow}>
              <Pressable
                onPress={() =>
                  setDateIdxByPeriod((prev) => ({
                    ...prev,
                    [period]: Math.min(dateIdx + 1, dateOptions.length - 1),
                  }))
                }
                pointerEvents="box-only"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[
                  styles.weekNavBtn,
                  { opacity: dateIdx >= dateOptions.length - 1 ? 0.3 : 1 },
                ]}
                disabled={dateIdx >= dateOptions.length - 1}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: dateIdx >= dateOptions.length - 1,
                }}
                accessibilityLabel="Previous period"
              >
                <Icon name="chevL" size={20} color={pWall.text} stroke={2.2} />
              </Pressable>

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
                style={styles.weekNavMenuHost}
              >
                <View style={styles.weekNavMenuLabel}>
                  <Text
                    style={[
                      styles.dateTitle,
                      styles.dateTitleWeek,
                      { color: pWall.text, textAlign: 'center' },
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

              <Pressable
                onPress={() =>
                  setDateIdxByPeriod((prev) => ({
                    ...prev,
                    [period]: Math.max(dateIdx - 1, 0),
                  }))
                }
                pointerEvents="box-only"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[
                  styles.weekNavBtn,
                  { opacity: dateIdx === 0 ? 0.3 : 1 },
                ]}
                disabled={dateIdx === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: dateIdx === 0 }}
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
              fontStyle={{
                color: theme.dark
                  ? 'rgba(242,244,245,0.68)'
                  : 'rgba(11,13,16,0.62)',
              }}
              activeFontStyle={{
                color: theme.dark ? '#080A0D' : '#F2F4F5',
                fontWeight: '600',
              }}
            />
          </View>

          {/* ─── Sections ─────────────────────────── */}
          <View style={styles.sectionStack}>
            {/* ── Insights charts ─────────────── */}
            <SectionCard dark={theme.dark}>
              <View style={styles.chartHero}>
                <View style={styles.chartHeroTopRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.chartHeroAmount, { color: p.text }]}>
                      {spendDisplay.whole}
                      <Text style={[styles.chartHeroCents, { color: p.text }]}>
                        {spendDisplay.cents}
                      </Text>
                    </Text>
                    <Text style={[styles.chartHeroLabel, { color: p.textSec }]}>
                      Spent this {period.toLowerCase()}
                    </Text>
                  </View>
                  <SegmentedControl
                    values={CHART_TYPES as unknown as string[]}
                    selectedIndex={chartIdx}
                    onChange={(e) =>
                      setChartIdx(e.nativeEvent.selectedSegmentIndex)
                    }
                    tintColor={theme.accent.dot}
                    appearance={theme.dark ? 'dark' : 'light'}
                    fontStyle={{
                      color: theme.dark
                        ? 'rgba(242,244,245,0.68)'
                        : 'rgba(11,13,16,0.62)',
                    }}
                    activeFontStyle={{
                      color: theme.dark ? '#080A0D' : '#F2F4F5',
                      fontWeight: '600',
                    }}
                    style={styles.chartSegmented}
                  />
                </View>

                <View style={styles.chartHeroSubRow}>
                  <Text
                    style={[TYPE.captionEm, { color: primaryComparison.color }]}
                  >
                    {primaryComparison.label}
                  </Text>
                </View>
              </View>

              {hasSpending ? (
                <>
                  <View style={[styles.chartSlide, { width: CHART_INNER_W }]}>
                    {chartIdx === 0 && (
                      <InsightBarChart
                        bins={insightBins}
                        theme={theme}
                        width={CHART_INNER_W}
                        height={CHART_H}
                        onInspect={setInsightDetail}
                        onSelectDetail={handleSelectedDetail}
                        onInteractionChange={setChartHolding}
                      />
                    )}
                    {chartIdx === 1 && (
                      <InsightPaceChart
                        bins={insightBins}
                        theme={theme}
                        width={CHART_INNER_W}
                        height={CHART_H}
                        onInspect={setInsightDetail}
                        onSelectDetail={handleSelectedDetail}
                        onInteractionChange={setChartHolding}
                      />
                    )}
                  </View>

                  <SelectedInsightStrip
                    detail={selectedDetail}
                    theme={theme}
                    p={p}
                    onOpen={() =>
                      selectedDetail && setInsightDetail(selectedDetail)
                    }
                  />
                </>
              ) : (
                <EmptyState
                  title="No chart data yet"
                  body="Choose another range to inspect spend and pace."
                  theme={theme}
                />
              )}
            </SectionCard>

            <SectionCard dark={theme.dark}>
              <View style={styles.readoutHead}>
                <Text style={[styles.chartTitle, { color: p.text }]}>
                  Snapshot
                </Text>
                <Text style={[TYPE.caption, { color: p.textSec }]}>
                  {rangeContextLabel}
                </Text>
              </View>

              <View style={styles.readoutRows}>
                {topDriver && (
                  <ReadoutRow
                    label="Driver"
                    title={topDriver.copy}
                    color={topDriver.color}
                    icon={topDriver.merchant.icon}
                    theme={theme}
                    text={p.text}
                    textTer={p.textTer}
                    onPress={() =>
                      setInsightDetail({
                        title: topDriver.merchant.merchant,
                        eyebrow: `${rangeContextLabel} merchant`,
                        amount: money(
                          topDriver.merchant.spent,
                          topDriver.merchant.spent < 100 ? 2 : 0,
                        ),
                        color: topDriver.color,
                        description: topDriver.copy,
                        metrics: [
                          {
                            label: 'Category',
                            value:
                              topDriver.cat?.label ?? topDriver.merchant.cat,
                          },
                          {
                            label: 'Txns',
                            value: String(topDriver.merchant.txCount),
                          },
                          {
                            label: 'Share',
                            value: `${Math.round(topDriver.merchant.pct * 100)}%`,
                          },
                        ],
                        filter: {
                          merchantQuery: topDriver.merchant.merchant,
                          dateFrom: ranges.current.from,
                          dateTo: ranges.current.to,
                        },
                      })
                    }
                  />
                )}

                {budgetPressure.pressureCat && (
                  <ReadoutRow
                    label={rangeComplete ? 'Budget' : 'Pace'}
                    title={
                      rangeComplete
                        ? budgetPressure.pressureCat.remaining < 0
                          ? `${budgetPressure.pressureCat.label} ended over plan`
                          : `${budgetPressure.pressureCat.label} came in ${money(budgetPressure.pressureCat.remaining)} under`
                        : budgetPressure.pressureCat.remaining < 0
                          ? `${budgetPressure.pressureCat.label} is above planned pace`
                          : `${budgetPressure.pressureCat.label} has ${money(budgetPressure.pressureCat.remaining)} left at pace`
                    }
                    color={
                      budgetPressure.pressureCat.remaining < 0
                        ? OVER_DOT
                        : categoryDisplayColor(
                            budgetPressure.pressureCat.cat,
                            categories,
                            theme.dark,
                          )
                    }
                    icon={budgetPressure.pressureCat.icon}
                    theme={theme}
                    text={p.text}
                    textTer={p.textTer}
                    onPress={() =>
                      setInsightDetail({
                        title: budgetPressure.pressureCat.label,
                        eyebrow: `${rangeContextLabel} category`,
                        amount: money(
                          budgetPressure.pressureCat.spent,
                          budgetPressure.pressureCat.spent < 100 ? 2 : 0,
                        ),
                        color:
                          budgetPressure.pressureCat.remaining < 0
                            ? OVER_DOT
                            : categoryDisplayColor(
                                budgetPressure.pressureCat.cat,
                                categories,
                                theme.dark,
                              ),
                        description: rangeComplete
                          ? budgetPressure.pressureCat.remaining < 0
                            ? `${money(Math.abs(budgetPressure.pressureCat.remaining))} over budget for this range.`
                            : `${money(budgetPressure.pressureCat.remaining)} under budget for this range.`
                          : budgetPressure.pressureCat.remaining < 0
                            ? 'Spending is above the planned pace for this range.'
                            : `${money(budgetPressure.pressureCat.remaining)} left at the current planned pace.`,
                        metrics: [
                          {
                            label: rangeComplete ? 'Of budget' : 'Pace',
                            value: `${Math.round(budgetPressure.pressureCat.ratio * 100)}%`,
                          },
                          {
                            label: 'Txns',
                            value: String(budgetPressure.pressureCat.txCount),
                          },
                          {
                            label: 'Share',
                            value: `${Math.round(budgetPressure.pressureCat.pct * 100)}%`,
                          },
                        ],
                        filter: {
                          catIds: [budgetPressure.pressureCat.cat],
                          dateFrom: ranges.current.from,
                          dateTo: ranges.current.to,
                        },
                      })
                    }
                  />
                )}

                {budgetPressure.bill && (
                  <ReadoutRow
                    label="Upcoming"
                    title={`${budgetPressure.bill.name} due in ${budgetPressure.bill.daysUntil}d`}
                    color={CAUTION_AMBER}
                    icon="cal"
                    theme={theme}
                    text={p.text}
                    textTer={p.textTer}
                  />
                )}

                {topChange && (
                  <ReadoutRow
                    label="Changed"
                    title={`${topChange.label} ${topChange.statusLabel.toLowerCase()}`}
                    color={topChange.color}
                    icon={topChange.icon}
                    theme={theme}
                    text={p.text}
                    textTer={p.textTer}
                    onPress={() =>
                      setInsightDetail({
                        title: topChange.label,
                        eyebrow: `${rangeContextLabel} change`,
                        amount: money(
                          topChange.spent,
                          topChange.spent < 100 ? 2 : 0,
                        ),
                        color: topChange.color,
                        description: `${signedMoney(topChange.delta)} compared with the previous ${period.toLowerCase()}.`,
                        metrics: [
                          {
                            label: 'Previous',
                            value: money(
                              topChange.prevSpent,
                              topChange.prevSpent < 100 ? 2 : 0,
                            ),
                          },
                          {
                            label: 'Now',
                            value: money(
                              topChange.spent,
                              topChange.spent < 100 ? 2 : 0,
                            ),
                          },
                          { label: 'Txns', value: String(topChange.txCount) },
                        ],
                        filter: {
                          catIds: [topChange.cat],
                          dateFrom: ranges.current.from,
                          dateTo: ranges.current.to,
                        },
                      })
                    }
                  />
                )}

                {!topDriver &&
                  !budgetPressure.pressureCat &&
                  !budgetPressure.bill &&
                  !topChange && (
                    <EmptyState
                      title="No snapshot yet"
                      body="Switch periods to compare drivers, budget pressure, and bills."
                      theme={theme}
                    />
                  )}
              </View>
            </SectionCard>

            {/* ── Categories ─────────────────────── */}
            <SectionCard dark={theme.dark}>
              <View style={styles.readoutHead}>
                <Text style={[styles.chartTitle, { color: p.text }]}>
                  Categories
                </Text>
                <Text style={[TYPE.caption, { color: p.textSec }]}>
                  {catBreakdown.rows.length} groups
                </Text>
              </View>

              {catBreakdown.rows.length === 0 ? (
                <EmptyState
                  title="No categories in this range"
                  body="Try another period to see your category breakdown."
                  theme={theme}
                />
              ) : (
                catBreakdown.rows.map((r, i) => {
                  const color = categoryDisplayColor(
                    r.cat,
                    categories,
                    theme.dark,
                  );
                  const budgetPct = r.budget > 0 ? r.spent / r.budget : 0;
                  const isOver = budgetPct >= 1;
                  const isNear = budgetPct >= 0.9;
                  const statusColor = isOver
                    ? overText(theme.dark)
                    : isNear
                      ? cautionText(theme.dark)
                      : p.textSec;
                  const remaining = r.budget - r.spent;
                  const isLast = i === catBreakdown.rows.length - 1;
                  const avg = r.spent / Math.max(r.txCount, 1);
                  const avgStr = money(avg, avg < 100 ? 2 : 0);
                  const txnWord =
                    r.txCount === 1 ? 'transaction' : 'transactions';
                  const budgetLine =
                    r.budget > 0
                      ? remaining < 0
                        ? ` ${money(Math.abs(remaining))} over budget.`
                        : ` ${money(remaining)} left in budget.`
                      : r.prevSpent > 0
                        ? ` ${signedMoney(r.spent - r.prevSpent)} vs the previous ${period.toLowerCase()}.`
                        : '';
                  const categoryDetail: InsightDetail = {
                    title: r.label,
                    eyebrow: `${rangeContextLabel} category`,
                    amount: money(r.spent, r.spent < 100 ? 2 : 0),
                    color: remaining < 0 ? OVER_DOT : color,
                    description: `${avgStr} average across ${r.txCount} ${txnWord}.${budgetLine}`,
                    metrics: [
                      { label: 'Share', value: `${Math.round(r.pct * 100)}%` },
                      { label: 'Avg', value: avgStr },
                      r.budget > 0
                        ? {
                            label: 'Of budget',
                            value: `${Math.round(budgetPct * 100)}%`,
                          }
                        : r.prevSpent > 0
                          ? {
                              label: `Vs ${period.toLowerCase()}`,
                              value: signedMoney(r.spent - r.prevSpent),
                            }
                          : { label: 'Txns', value: String(r.txCount) },
                    ],
                    filter: {
                      catIds: [r.cat],
                      dateFrom: ranges.current.from,
                      dateTo: ranges.current.to,
                    },
                  };
                  return (
                    <TouchableOpacity
                      key={r.cat}
                      onPress={() => setInsightDetail(categoryDetail)}
                      activeOpacity={0.65}
                      delayPressIn={0}
                      style={[
                        styles.row,
                        {
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: p.hairline,
                        },
                      ]}
                    >
                      <View
                        style={[styles.rowIcon, { backgroundColor: color }]}
                      >
                        <Icon
                          name={r.icon}
                          size={18}
                          color="#FBF8FF"
                          stroke={1.6}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rowInnerRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={[styles.rowTitle, { color: p.text }]}
                              numberOfLines={1}
                            >
                              {r.label}
                            </Text>
                            <Text style={[styles.rowSub, { color: p.textSec }]}>
                              {r.txCount}{' '}
                              {r.txCount === 1 ? 'transaction' : 'transactions'}
                            </Text>
                          </View>
                          <View style={styles.rowRight}>
                            <View style={styles.rowAmtRow}>
                              <DeltaBadge
                                spent={r.spent}
                                prevSpent={r.prevSpent}
                                dark={theme.dark}
                              />
                              <Text style={[styles.rowAmt, { color: p.text }]}>
                                ${r.spent.toFixed(r.spent >= 100 ? 0 : 2)}
                              </Text>
                            </View>
                            {r.budget > 0 && (
                              <Text
                                style={[
                                  styles.rowBudgetStatus,
                                  { color: statusColor },
                                ]}
                              >
                                {isOver
                                  ? `$${Math.abs(remaining).toFixed(0)} over`
                                  : `$${remaining.toFixed(0)} left`}
                              </Text>
                            )}
                          </View>
                        </View>
                        {r.budget > 0 && (
                          <View
                            style={[
                              styles.budgetTrack,
                              { backgroundColor: p.hairline, marginTop: 8 },
                            ]}
                          >
                            <View
                              style={[
                                styles.budgetFill,
                                {
                                  width:
                                    `${Math.min(budgetPct, 1) * 100}%` as any,
                                  backgroundColor: color,
                                },
                              ]}
                            />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </SectionCard>

            {/* ── Merchants ──────────────────────── */}
            <SectionCard dark={theme.dark}>
              <View style={styles.readoutHead}>
                <Text style={[styles.chartTitle, { color: p.text }]}>
                  Merchants
                </Text>
                <Text style={[TYPE.caption, { color: p.textSec }]}>
                  {rangeContextLabel}
                </Text>
              </View>

              {merchBreakdown.rows.length === 0 ? (
                <EmptyState
                  title="No merchants in this range"
                  body="Try another period to see merchant activity."
                  theme={theme}
                />
              ) : (
                merchBreakdown.rows.map((r, i) => {
                  const color = categoryDisplayColor(
                    r.cat,
                    categories,
                    theme.dark,
                  );
                  const isLast = i === merchBreakdown.rows.length - 1;
                  const catLabel =
                    catBreakdown.rows.find((row) => row.cat === r.cat)?.label ??
                    r.cat;
                  const avg = r.spent / Math.max(r.txCount, 1);
                  const avgStr = money(avg, avg < 100 ? 2 : 0);
                  const visitWord = r.txCount === 1 ? 'visit' : 'visits';
                  const trendLine =
                    r.prevSpent > 0
                      ? ` ${signedMoney(r.spent - r.prevSpent)} vs the previous ${period.toLowerCase()}.`
                      : '';
                  const merchantDetail: InsightDetail = {
                    title: r.merchant,
                    eyebrow: `${catLabel} · ${rangeContextLabel}`,
                    amount: money(r.spent, r.spent < 100 ? 2 : 0),
                    color,
                    description: `${avgStr} average across ${r.txCount} ${visitWord}. ${Math.round(r.pct * 100)}% of spend.${trendLine}`,
                    metrics: [
                      { label: 'Category', value: catLabel },
                      { label: 'Avg', value: avgStr },
                      r.prevSpent > 0
                        ? {
                            label: `Vs ${period.toLowerCase()}`,
                            value: signedMoney(r.spent - r.prevSpent),
                          }
                        : { label: 'Visits', value: String(r.txCount) },
                    ],
                    filter: {
                      merchantQuery: r.merchant,
                      dateFrom: ranges.current.from,
                      dateTo: ranges.current.to,
                    },
                  };
                  return (
                    <TouchableOpacity
                      key={r.merchant}
                      onPress={() => setInsightDetail(merchantDetail)}
                      activeOpacity={0.65}
                      delayPressIn={0}
                      style={[
                        styles.row,
                        {
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: p.hairline,
                        },
                      ]}
                    >
                      <View
                        style={[styles.rowIcon, { backgroundColor: color }]}
                      >
                        <Icon
                          name={r.icon}
                          size={18}
                          color="#FBF8FF"
                          stroke={1.6}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rowInnerRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={[styles.rowTitle, { color: p.text }]}
                              numberOfLines={1}
                            >
                              {r.merchant}
                            </Text>
                            <Text style={[styles.rowSub, { color: p.textSec }]}>
                              {r.txCount}{' '}
                              {r.txCount === 1 ? 'transaction' : 'transactions'}
                            </Text>
                          </View>
                          <View style={styles.rowRight}>
                            <View style={styles.rowAmtRow}>
                              <DeltaBadge
                                spent={r.spent}
                                prevSpent={r.prevSpent}
                                dark={theme.dark}
                              />
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
              )}
            </SectionCard>
          </View>
        </Animated.ScrollView>

        <InsightBottomSheet
          detail={insightDetail}
          theme={theme}
          onClose={() => setInsightDetail(null)}
          onViewActivity={onViewActivity}
        />
      </ImageBackground>
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
  dateBlock: {
    paddingHorizontal: CARD_OUTER_PAD,
    paddingTop: 8,
    paddingBottom: 16,
  },
  dateTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1.0,
    lineHeight: 38,
  },
  dateTitleWeek: { fontSize: 24, letterSpacing: -0.6 },
  weekNavRow: { flexDirection: 'row', alignItems: 'center' },
  weekNavBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  weekNavMenuHost: { flex: 1, height: 38 },
  weekNavMenuLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  segmentWrap: { paddingHorizontal: CARD_OUTER_PAD, marginBottom: 24 },
  sectionStack: { paddingHorizontal: CARD_OUTER_PAD, gap: 24 },
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
  chartHero: { marginBottom: 16 },
  chartHeroTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  chartHeroAmount: { ...TYPE.display, lineHeight: 38 },
  chartHeroCents: { ...TYPE.subsectionTitle, opacity: 0.65 },
  chartHeroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  chartHeroLabel: { ...TYPE.bodySm },
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
  rowRight: { alignItems: 'flex-end', flexShrink: 0, minWidth: 72 },
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
  insightSheetMarkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  insightSheetClose: {
    position: 'absolute',
    top: 16,
    right: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  insightMetricRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  insightMetric: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  insightSheetAction: {
    marginTop: 14,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
