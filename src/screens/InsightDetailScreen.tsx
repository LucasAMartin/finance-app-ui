import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Haptics from 'expo-haptics';
import {
  GlassEffectContainer,
  HStack,
  Host,
  Image as SwiftImage,
  Menu,
  Button as SwiftButton,
  Rectangle,
  RNHostView,
  Spacer,
  Text as SwiftText,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  padding,
  truncationMode,
} from '@expo/ui/swift-ui/modifiers';
import { SearchFilterBar } from '../components/SearchFilterBar';
import { NativeTransactionSummaryCapsule } from '../components/NativeTransactionSummaryCapsule';
import { GlassCircleIcon, SUPPORTS_GLASS, glassTintForTheme } from '../components/GlassButton';

import { formatActiveCurrencyAmount } from '../currency';
import { Theme, GROUP_COLORS, overText } from '../theme';
import { useTheme } from '../ThemeProvider';
import { makeP, makeScrim, DARK_TEXT_SHADOW, MEDIA } from '../wallpaperPalette';
import { RADIUS } from '../radius';
import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { SpendChart } from '../components/charts/SpendChart';
import { TrendBars } from '../components/charts/TrendBars';
import { MerchantMark } from '../components/MerchantMark';
import { merchantLogoKey, transactionUsesMerchantLogo, useMerchantLogoMap } from '../merchantLogos';
import { NativeRowMerchantMark } from '../components/NativeRowMerchantMark';
import { Money } from '../components/shared';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap, UNCATEGORIZED_LABEL } from '../repositories/categoryUtils';
import type {
  Category,
  MerchantLogo,
  Transaction,
  TransactionSummaryQuery,
} from '../repositories/types';
import {
  generateDateOptions,
  derivePeriodRanges,
  spendSeriesToBuckets,
  trailingTrendBuckets,
  foldTrendSeries,
  type TrendGrain,
  type TrendSlot,
  type ActivityInitialFilter,
} from '../selectors/spending';
import { buildSavedMetric } from '../selectors/savings';
import { TYPE } from '../typography';
import type { SFSymbol } from 'sf-symbols-typescript';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_PAD = 16;
const CHART_W = SCREEN_W - CHART_PAD * 2;
const CHART_H = 160;
const DETAIL_CHART_INSET_Y = 20;
const DETAIL_TX_LIMIT = 10;
const LIST_SCRUB_DEBOUNCE_MS = 120;
const NATIVE_DETAIL_DAY_PAD_X = 16;
const NATIVE_DETAIL_DAY_PAD_TOP = 16;
const NATIVE_DETAIL_DAY_PAD_BOTTOM = 4;
const NATIVE_DETAIL_DAY_HEADER_H = 24;
const NATIVE_DETAIL_TX_ROW_H = 58;

const DETAIL_SF_SYMBOL: Record<string, SFSymbol> = {
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
const DETAIL_FALLBACK_SYMBOL: SFSymbol = 'tag';

const TIMEFRAMES = ['1W', '1M', '1Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type Period = 'Week' | 'Month' | 'Year';
const TF_TO_PERIOD: Record<Timeframe, Period> = {
  '1W': 'Week',
  '1M': 'Month',
  '1Y': 'Year',
};

// Trends detail switches the bar grain (rolling window of whole past periods),
// not the within-period timeframe the spending/savings details use.
const TREND_GRAINS: { id: TrendGrain; label: string }[] = [
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
];

type SortOrder = 'date-desc' | 'amount-desc';
const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'date-desc',    label: 'Newest first'  },
  { id: 'amount-desc',  label: 'Highest first' },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const next = startOfDay(d);
  next.setDate(next.getDate() + days);
  return next;
}

function money(n: number, decimals = 0): string {
  return formatActiveCurrencyAmount(Math.abs(n), decimals);
}

export interface InsightDetailTarget {
  kind?: 'spending' | 'savings' | 'trends';
  title: string;
  subtitle?: string;
  icon?: string;
  accentColor?: string;
}

interface Props {
  theme: Theme;
  target: InsightDetailTarget | null;
  onClose: () => void;
  onSeeAll?: (filter: ActivityInitialFilter) => void;
}

export function InsightDetailScreen({ theme, target, onClose, onSeeAll }: Props) {
  const { transactionsRepo, categoriesRepo, incomeRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const incomes = useRepositoryList(incomeRepo);
  const cats = useMemo(() => categoryMap(categories), [categories]);

  const { wallpaper, currencyCode } = useTheme();
  const insets = useSafeAreaInsets();
  // Text directly on the wallpaper (header title, hero) stays light in both
  // themes, matching the Insights screen; frosted-card interiors use `p`, which
  // adapts to the active theme so light mode no longer forces a dark screen.
  const pW = makeP(true);
  const p = makeP(theme.dark);
  const visible = target !== null;

  const { top: scrimTop, mid: scrimMid, lower: scrimLower, bottom: scrimBottom } = makeScrim(theme.dark);
  const scrim: [string, string, string, string] = [scrimTop, scrimMid, scrimLower, scrimBottom];
  const cardBorder = theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';
  const cardTint = theme.dark ? 'systemMaterialDark' : 'systemMaterialLight';

  const t = target;
  const isSavingsDetail = t?.kind === 'savings';
  const isTrendsDetail = t?.kind === 'trends';
  const savingsTint = t?.accentColor ?? GROUP_COLORS.savings.dark;
  // The hero is always a dark stage, so signal colors use their on-dark variants
  // (the base ember reads too dark/saturated against it). Ember = spending up,
  // savings teal = spending down.
  const overTint = overText(true);

  // ── Period state ──────────────────────────────────────────────────
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const period: Period = TF_TO_PERIOD[timeframe];
  const [dateIdxByPeriod, setDateIdxByPeriod] = useState<Record<Period, number>>({
    Week: 0,
    Month: 0,
    Year: 0,
  });
  const dateIdx = dateIdxByPeriod[period];
  const now = useMemo(() => new Date(), []);
  const dateOptions = useMemo(() => generateDateOptions(period, now), [period, now]);
  const dateLabel = dateOptions[dateIdx] ?? dateOptions[0];
  const ranges = useMemo(
    () => derivePeriodRanges(period, dateIdx, now),
    [period, dateIdx, now],
  );

  // ── Sort ──────────────────────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortOrder>('date-desc');

  // ── Search ────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const emptyCountSingular = query
    ? 'result'
    : isSavingsDetail
      ? 'transfer'
      : 'transaction';
  const emptyCountPlural = query
    ? 'results'
    : isSavingsDetail
      ? 'transfers'
      : 'transactions';

  // ── Repo change tracking ──────────────────────────────────────────
  const [repoVersion, setRepoVersion] = useState(0);
  useEffect(
    () => transactionsRepo.subscribe(() => setRepoVersion(v => v + 1)),
    [transactionsRepo],
  );

  // Search → category matches, so the list query mirrors the old client-side
  // "merchant OR category label" filter without loading every row.
  const searchCategoryIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return categories
      .filter(c => c.label.toLowerCase().includes(q))
      .map(c => c.id);
  }, [categories, query]);

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

  // ── Chart series ──────────────────────────────────────────────────
  // Aggregated in the data layer (GROUP BY) — independent of search and never
  // loads the full transaction set just to plot the line.
  // While hidden, retain the last computed series instead of returning [] so the
  // chart doesn't blank out during the slide-out animation. Mirrors `last.current`.
  const lineSeriesRef = useRef<number[]>([]);
  const lineSeries = useMemo(() => {
    if (!visible) return lineSeriesRef.current;
    const points = transactionsRepo.getSpendSeries({
      from: ranges.current.from.toISOString(),
      to: ranges.current.to.toISOString(),
      bucket: period === 'Year' ? 'month' : 'day',
    });
    return spendSeriesToBuckets(points, period, ranges.current.from, ranges.current.to);
  }, [transactionsRepo, ranges, period, visible, repoVersion]);
  if (visible) lineSeriesRef.current = lineSeries;

  const cumulativeSeries = useMemo(() => {
    let s = 0;
    return lineSeries.map(v => (s += v));
  }, [lineSeries]);

  // ── Spending-trends detail: rolling period-over-period ─────────────
  // A trailing window of whole past periods (weekly / monthly / quarterly)
  // ending now, so the bars read as a *trajectory* — the question the cumulative
  // Spent chart can't answer. Leading empty buckets (history shorter than the
  // window) are trimmed so the chart never opens on a row of zeros.
  const [trendGrain, setTrendGrain] = useState<TrendGrain>('month');

  // Increments whenever the screen opens or data context changes, remounting
  // chart components so their animations replay from a clean state.
  const [chartKey, setChartKey] = useState(0);
  useEffect(() => {
    if (visible) setChartKey(k => k + 1);
  }, [visible, period, dateIdx, trendGrain]);

  const trend = useMemo(() => {
    if (!isTrendsDetail) return { values: [] as number[], slots: [] as TrendSlot[] };
    const count = trendGrain === 'week' ? 8 : 6;
    const cfg = trailingTrendBuckets(trendGrain, count, now);
    const points = transactionsRepo.getSpendSeries({
      from: cfg.from.toISOString(),
      to: cfg.to.toISOString(),
      bucket: cfg.bucket,
    });
    const values = foldTrendSeries(points, cfg.slots);
    let startIdx = 0;
    while (startIdx < values.length - 4 && values[startIdx] === 0) startIdx++;
    return { values: values.slice(startIdx), slots: cfg.slots.slice(startIdx) };
  }, [isTrendsDetail, trendGrain, now, transactionsRepo, repoVersion]);

  const trendValues = trend.values;
  const trendSlots = trend.slots;
  const trendLabels = trendSlots.map(s => s.label);

  // Current (in-progress) period = the last slot, whose end is still in the
  // future. Dimmed in the chart and held out of the average/trajectory so a
  // half-finished period never reads as a real dip.
  const trendPartialIdx =
    trendSlots.length > 0 &&
    trendSlots[trendSlots.length - 1].to.getTime() > now.getTime()
      ? trendSlots.length - 1
      : null;
  const completedVals = trendValues.filter((_, i) => i !== trendPartialIdx);
  const trendAvg = completedVals.length
    ? completedVals.reduce((a, b) => a + b, 0) / completedVals.length
    : trendValues.length
      ? trendValues.reduce((a, b) => a + b, 0) / trendValues.length
      : 0;

  const grainNoun =
    trendGrain === 'week' ? 'week' : trendGrain === 'month' ? 'month' : 'quarter';
  const grainAdj =
    trendGrain === 'week' ? 'Weekly' : trendGrain === 'month' ? 'Monthly' : 'Quarterly';
  const trendWindowLabel = `Rolling ${trendValues.length} ${grainNoun}s`;

  const activeSeries = isSavingsDetail
    ? savedMetric.cumulativeSeries
    : isTrendsDetail
      ? trendValues
      : cumulativeSeries;

  // ── Scrub / tap selection ─────────────────────────────────────────
  // scrubIdx is the live chart/hero index. The transaction list intentionally
  // follows on a short debounce so scrubbing stays fluid while heavier row
  // queries settle after the user's finger pauses.
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [listScrubIdx, setListScrubIdx] = useState<number | null>(null);
  const listScrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearListScrubTimer = useCallback(() => {
    if (listScrubTimerRef.current) {
      clearTimeout(listScrubTimerRef.current);
      listScrubTimerRef.current = null;
    }
  }, []);
  useEffect(() => () => clearListScrubTimer(), [clearListScrubTimer]);
  useEffect(() => {
    clearListScrubTimer();
    setScrubIdx(null);
    setListScrubIdx(null);
  }, [activeSeries, clearListScrubTimer]);

  const handleChartScrub = useCallback((idx: number | null) => {
    setScrubIdx(idx);
    clearListScrubTimer();
    listScrubTimerRef.current = setTimeout(() => {
      listScrubTimerRef.current = null;
      setListScrubIdx(idx);
    }, LIST_SCRUB_DEBOUNCE_MS);
  }, [clearListScrubTimer]);

  const handleChartTap = useCallback((idx: number) => {
    clearListScrubTimer();
    setScrubIdx(prev => {
      const next = prev === idx ? null : idx;
      setListScrubIdx(next);
      return next;
    });
  }, [clearListScrubTimer]);

  // Fuller label for a scrubbed trend bar than its compact axis tick.
  const trendScrubLabel = (i: number): string => {
    const s = trendSlots[i];
    if (!s) return '';
    if (trendGrain === 'week')
      return `Week of ${s.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    if (trendGrain === 'month')
      return s.from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return `Q${Math.floor(s.from.getMonth() / 3) + 1} ${s.from.getFullYear()}`;
  };

  // Trajectory stat shown in the hero eyebrow. When a trends bar is tapped, the
  // stat reflects that bar vs the average of all other completed bars so the user
  // can compare any period, not just the most recent one.
  const trendStat = useMemo(() => {
    if (!isTrendsDetail) return null;
    if (scrubIdx !== null && scrubIdx < trendValues.length) {
      const selectedVal = trendValues[scrubIdx];
      const selectedSlot = trendSlots[scrubIdx];
      const otherCompleted = trendValues.filter((_, i) => i !== scrubIdx && i !== trendPartialIdx);
      if (otherCompleted.length === 0) return null;
      const avg = otherCompleted.reduce((a, b) => a + b, 0) / otherCompleted.length;
      if (avg <= 0) return null;
      const pct = Math.round(((selectedVal - avg) / avg) * 100);
      if (pct === 0) return null;
      const slot = selectedSlot;
      const periodLabel = slot
        ? trendGrain === 'week'
          ? `Week of ${slot.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : trendGrain === 'month'
            ? slot.from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : `Q${Math.floor(slot.from.getMonth() / 3) + 1} ${slot.from.getFullYear()}`
        : grainNoun;
      return { pct: Math.abs(pct), up: pct > 0, periodLabel };
    }
    // Default: most recent completed period vs the prior average.
    if (completedVals.length < 2) return null;
    const lastIdx = trendPartialIdx !== null ? trendSlots.length - 2 : trendSlots.length - 1;
    const lastSlot = trendSlots[lastIdx];
    const last = completedVals[completedVals.length - 1];
    const prior = completedVals.slice(0, -1);
    const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (priorAvg <= 0) return null;
    const pct = Math.round(((last - priorAvg) / priorAvg) * 100);
    if (pct === 0) return null;
    const periodLabel = lastSlot?.label ?? grainNoun;
    return { pct: Math.abs(pct), up: pct > 0, periodLabel };
  }, [isTrendsDetail, scrubIdx, trendValues, trendSlots, trendPartialIdx, trendGrain, completedVals, grainNoun]);

  // Period total comes from the aggregate summary, not a reduce over rows.
  // Same retention as lineSeries: keep the last total so the hero amount holds
  // steady through the slide-out instead of snapping to $0.00.
  const totalRef = useRef(0);
  const total = useMemo(() => {
    if (!visible) return totalRef.current;
    return transactionsRepo.getSummary({
      from: ranges.current.from.toISOString(),
      to: ranges.current.to.toISOString(),
    }).expenseTotal;
  }, [transactionsRepo, ranges, visible, repoVersion]);
  if (visible) totalRef.current = total;
  const activeTotal = isSavingsDetail
    ? savedMetric.total
    : isTrendsDetail
      ? trendAvg
      : total;
  const heroAmount =
    scrubIdx != null ? (activeSeries[scrubIdx] ?? activeTotal) : activeTotal;
  // Trends resting label calls out the average cadence; while scrubbing a bar it
  // reverts to "Spent" since the headline is then that bucket's actual spend.
  const heroLeadLabel = isTrendsDetail
    ? scrubIdx != null
      ? 'Spent'
      : `${grainAdj} average`
    : isSavingsDetail
      ? 'Saved'
      : 'Spent';

  const scrubDateLabel = (idx: number): string => {
    if (period === 'Year') {
      return new Date(ranges.current.from.getFullYear(), idx, 1)
        .toLocaleDateString('en-US', { month: 'long' });
    }
    return addDays(ranges.current.from, idx)
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const metricDisplay = money(heroAmount, heroAmount < 100 ? 2 : 0);
  const heroSubLabel = isTrendsDetail
    ? scrubIdx != null
      ? trendScrubLabel(scrubIdx)
      : trendWindowLabel
    : scrubIdx != null
      ? scrubDateLabel(scrubIdx)
      : dateLabel;
  const savedIntentionalText = money(
    savedMetric.intentional,
    savedMetric.intentional < 100 ? 2 : 0,
  );
  const savedExtraText = money(savedMetric.extra, savedMetric.extra < 100 ? 2 : 0);

  // ── Paginated transaction list ────────────────────────────────────
  // Tapping/scrubbing locks the list to that period. For trends, a tapped bar
  // scopes to that slot; default is the most recent slot. For spending/savings,
  // a tapped point scopes to that day (Week/Month) or that month (Year).

  // Derive the date range for a locked spending/savings point.
  const selectedPointRange = useMemo<{ from: Date; to: Date } | null>(() => {
    if (isTrendsDetail || listScrubIdx === null) return null;
    if (period === 'Year') {
      const year = ranges.current.from.getFullYear();
      const from = new Date(year, listScrubIdx, 1);
      const to = new Date(year, listScrubIdx + 1, 0, 23, 59, 59, 999);
      return { from, to };
    }
    const from = addDays(ranges.current.from, listScrubIdx);
    from.setHours(0, 0, 0, 0);
    const to = addDays(ranges.current.from, listScrubIdx);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [isTrendsDetail, listScrubIdx, period, ranges]);

  const listSlot = isTrendsDetail
    ? (listScrubIdx !== null ? trendSlots[listScrubIdx] : trendSlots[trendSlots.length - 1])
    : null;

  const listScope = useMemo<TransactionSummaryQuery>(() => {
    const from = selectedPointRange
      ? selectedPointRange.from
      : listSlot
        ? listSlot.from
        : ranges.current.from;
    const to = selectedPointRange
      ? selectedPointRange.to
      : listSlot
        ? listSlot.to
        : ranges.current.to;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      categoryIds: isSavingsDetail ? savedMetric.categoryIds : undefined,
      merchantQuery: query.trim() || undefined,
      searchCategoryIds,
    };
  }, [selectedPointRange, listSlot, ranges, isSavingsDetail, savedMetric.categoryIds, query, searchCategoryIds]);

  const rows = useMemo(() => {
    if (!visible) return [];
    const page = transactionsRepo.listPage({
      ...listScope,
      sort: sortBy,
      limit: DETAIL_TX_LIMIT,
    });
    return page.rows;
  }, [transactionsRepo, listScope, sortBy, visible, repoVersion]);
  const merchantLogos = useMerchantLogoMap(rows, SUPPORTS_GLASS);

  const grouped = useMemo(() => {
    const g: Record<string, Transaction[]> = {};
    rows.forEach(tx => {
      if (!g[tx.fullDate]) g[tx.fullDate] = [];
      g[tx.fullDate].push(tx);
    });
    return g;
  }, [rows]);
  const dayKeys = useMemo(() => Object.keys(grouped), [grouped]);

  const lineColor = isSavingsDetail ? savingsTint : 'rgba(147,197,253,0.92)';

  const sortIdx = SORT_OPTIONS.findIndex(o => o.id === sortBy);

  return (
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <ImageBackground
        source={wallpaper.source}
        defaultSource={typeof wallpaper.source === 'number' ? wallpaper.source : undefined}
        fadeDuration={0}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          pointerEvents="none"
          colors={scrim}
          locations={[0, 0.28, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* ─── Header ───────────────────────────────────────────── */}
          <View
            style={[
              styles.headerWrap,
              {
                paddingTop: insets.top + 8,
                backgroundColor: theme.dark
                  ? 'rgba(8,6,20,0.55)'
                  : 'rgba(8,6,20,0.16)',
              },
            ]}
          >
            <BlurView
              intensity={theme.dark ? 60 : 90}
              tint={cardTint}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.headerDivider, { backgroundColor: cardBorder }]} />
            <View style={styles.headerRow}>
              {/* Back */}
              <ScreenExitButton
                variant="back"
                onPress={onClose}
                tint={p.text}
                fallbackBg={theme.dark ? 'rgba(8,6,20,0.45)' : 'rgba(255,255,255,0.3)'}
                accessibilityLabel="Back"
              />

              {/* Title */}
              <Text style={[styles.headerTitle, { color: p.text }]} numberOfLines={1}>
                {t?.title ?? ''}
              </Text>

              {/* Spacer keeps the title optically centered against the back button */}
              <View style={styles.headerSpacer} />
            </View>
          </View>

          {/* ─── Scrollable content ───────────────────────────────── */}
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 64, paddingBottom: 120 },
            ]}
            data={dayKeys}
            extraData={currencyCode}
            keyExtractor={day => day}
            renderItem={({ item: day }) => (
              <DetailDayGroup
                day={day}
                txs={grouped[day]}
                categories={categories}
                cats={cats}
                theme={theme}
                merchantLogos={merchantLogos}
                currencyCode={currencyCode}
              />
            )}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={7}
            ListHeaderComponent={
              <View style={styles.headerStack}>
                <View style={styles.hero}>
                  {/* Guaranteed dark backing behind the metric + chart, scrolling
                      with them. The page scrim alone can't be trusted over a
                      bright or busy wallpaper, so this localized gradient holds
                      the bars and labels at AA contrast on any wallpaper, then
                      fades out at the bottom so there's no hard band edge. */}
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(3,5,8,0.10)', 'rgba(3,5,8,0.10)', 'rgba(3,5,8,0)']}
                    locations={[0, 0.9, 1]}
                    style={styles.heroBacking}
                  />
                  <View style={styles.metricHeroTop}>
                    <Text style={[TYPE.labelSm, { color: pW.textSec }, DARK_TEXT_SHADOW]}>
                      {heroLeadLabel}
                    </Text>
                    <Text style={[TYPE.labelSm, { color: pW.textTer }, DARK_TEXT_SHADOW]}>
                      ·
                    </Text>
                    {isTrendsDetail && trendStat ? (
                      <View style={styles.trendStatInline}>
                        <Icon
                          name={trendStat.up ? 'chevUp' : 'chevDown'}
                          size={10}
                          color={trendStat.up ? overTint : savingsTint}
                          stroke={2.6}
                        />
                        <Text style={[TYPE.labelSm, { color: trendStat.up ? overTint : savingsTint }, DARK_TEXT_SHADOW]}>
                          {trendStat.pct}% in {trendStat.periodLabel}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[TYPE.labelSm, { color: pW.textSec }, DARK_TEXT_SHADOW]}>
                        {heroSubLabel}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.metricHeroAmount, { color: pW.text }, DARK_TEXT_SHADOW]}>{metricDisplay}</Text>
                  <View style={styles.heroChart}>
                    {isTrendsDetail ? (
                      <TrendBars
                        key={chartKey}
                        values={trendValues}
                        labels={trendLabels}
                        width={CHART_W}
                        height={CHART_H}
                        selectedIdx={scrubIdx}
                        partialIdx={trendPartialIdx}
                        onScrub={handleChartScrub}
                        onTap={handleChartTap}
                        barColor="rgba(147,197,253,0.68)"
                        selectedColor="rgba(147,197,253,1)"
                        labelColor={pW.textSec}
                        selectedLabelColor="rgba(147,197,253,1)"
                      />
                    ) : (
                      <SpendChart
                        key={chartKey}
                        data={activeSeries}
                        width={CHART_W}
                        height={CHART_H}
                        color={lineColor}
                        fillColor={isSavingsDetail ? savingsTint : undefined}
                        ringColor="#08060e"
                        strokeWidth={2.5}
                        verticalInset={DETAIL_CHART_INSET_Y}
                        selectedIdx={scrubIdx}
                        onScrub={handleChartScrub}
                        onTap={handleChartTap}
                      />
                    )}
                  </View>
                  {isSavingsDetail ? (
                    <Text style={[styles.savedComposition, { color: pW.textTer }]}>
                      Paid in{' '}
                      <Text style={{ color: pW.text }}>{savedIntentionalText}</Text>
                      {'  '}·{'  '}
                      Extra{' '}
                      <Text style={{ color: savingsTint }}>{savedExtraText}</Text>
                    </Text>
                  ) : null}
                </View>

                {/* Period picker row — same control vocabulary as the Insights
                    screen: timeframe segmented + a labeled chevron date menu,
                    with sort given its own affordance instead of hiding inside a
                    generic overflow. */}
                <View style={styles.pickerRow}>
                  <SegmentedControl
                    values={
                      isTrendsDetail
                        ? TREND_GRAINS.map(g => g.label)
                        : (TIMEFRAMES as unknown as string[])
                    }
                    selectedIndex={
                      isTrendsDetail
                        ? TREND_GRAINS.findIndex(g => g.id === trendGrain)
                        : TIMEFRAMES.indexOf(timeframe)
                    }
                    onChange={(e) => {
                      const i = e.nativeEvent.selectedSegmentIndex;
                      if (isTrendsDetail) {
                        const g = TREND_GRAINS[i];
                        if (g) setTrendGrain(g.id);
                      } else {
                        const next = TIMEFRAMES[i];
                        if (next) setTimeframe(next);
                      }
                    }}
                    tintColor={theme.accent.dot}
                    appearance={theme.dark ? 'dark' : 'light'}
                    backgroundColor={
                      theme.dark
                        ? 'rgba(3,5,8,0.48)'
                        : 'rgba(255,255,255,0.58)'
                    }
                    fontStyle={{
                      color: theme.dark
                        ? 'rgba(242,244,245,0.76)'
                        : 'rgba(11,13,16,0.72)',
                    }}
                    activeFontStyle={{
                      color: theme.accent.ink,
                      fontWeight: '600',
                    }}
                    style={styles.pickerSeg}
                  />

                  {/* Date — labeled chevron menu, identical to the Insights
                      pattern. Hidden for trends, whose window is always the
                      rolling stretch ending now. */}
                  {!isTrendsDetail && (
                    <Host ignoreSafeArea="all" style={{ width: 132, height: 36 }}>
                      <Menu
                        label={
                          <View style={styles.dateLabel}>
                            <Text
                              style={[styles.dateLabelText, { color: pW.text }, DARK_TEXT_SHADOW]}
                              numberOfLines={1}
                            >
                              {dateLabel}
                            </Text>
                            <Icon name="chevDown" size={13} color={pW.text} stroke={2.2} />
                          </View>
                        }
                      >
                        {dateOptions.map((opt, idx) => (
                          <SwiftButton
                            key={`date-${idx}`}
                            systemImage={idx === dateIdx ? 'checkmark' : undefined}
                            onPress={() => setDateIdxByPeriod(prev => ({ ...prev, [period]: idx }))}
                            label={opt}
                          />
                        ))}
                      </Menu>
                    </Host>
                  )}

                  {/* Sort — glass circle trigger opening a native menu */}
                  <Host ignoreSafeArea="all" style={{ width: 44, height: 44 }}>
                    <Menu
                      label={
                        SUPPORTS_GLASS ? (
                          <GlassCircleIcon
                            systemImage="arrow.up.arrow.down"
                            size={44}
                            iconSize={18}
                            iconColor={theme.dark ? (pW.text as string) : '#0E0C18'}
                            glassTint={glassTintForTheme(theme.dark)}
                          />
                        ) : (
                          <View style={styles.moreBtn}>
                            <Icon name="filter" size={16} color={theme.dark ? pW.text : '#0E0C18'} />
                          </View>
                        )
                      }
                    >
                      {SORT_OPTIONS.map((o, i) => (
                        <SwiftButton
                          key={`sort-${o.id}`}
                          systemImage={i === sortIdx ? 'checkmark' : undefined}
                          onPress={() => setSortBy(o.id as SortOrder)}
                          label={o.label}
                        />
                      ))}
                    </Menu>
                  </Host>
                </View>

                {/* Search bar — native SwiftUI TextField matching the History screen */}
                <View style={styles.searchWrap}>
                  <SearchFilterBar
                    theme={theme}
                    p={p}
                    query={query}
                    onChangeQuery={setQuery}
                    activeCount={0}
                    hideActions
                    placeholder="Search transactions…"
                  />
                </View>
              </View>
            }
            ListEmptyComponent={
              SUPPORTS_GLASS ? (
                <NativeTransactionSummaryCapsule
                  theme={theme}
                  p={p}
                  count={0}
                  total={0}
                  countSingular={emptyCountSingular}
                  countPlural={emptyCountPlural}
                  accessibilityLabel={`0 ${emptyCountPlural}, ${formatActiveCurrencyAmount(0, true)} total`}
                />
              ) : (
                <BlurView intensity={theme.dark ? 50 : 90} tint={cardTint} style={styles.dayCard}>
                  <View style={[styles.dayCardInner, { borderColor: cardBorder }]}>
                    <View style={styles.emptyRow}>
                      <Icon name="receipt" size={16} color={p.textTer} />
                      <Text style={[TYPE.bodySm, { color: p.textTer }]}>
                        {query
                          ? 'No results'
                          : isSavingsDetail
                            ? 'No savings transfers'
                            : 'No transactions'}
                      </Text>
                    </View>
                  </View>
                </BlurView>
              )
            }
            ListFooterComponent={rows.length > 0 ? (
              <View style={styles.seeAllWrap}>
                {SUPPORTS_GLASS ? (
                  <Host matchContents ignoreSafeArea="all" colorScheme={theme.dark ? 'dark' : 'light'}>
                    <GlassEffectContainer>
                      <SwiftButton
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          const from = listSlot ? listSlot.from : ranges.current.from;
                          const to   = listSlot ? listSlot.to   : ranges.current.to;
                          onSeeAll?.({ dateFrom: from, dateTo: to });
                        }}
                        modifiers={[
                          buttonStyle('plain'),
                          glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' }),
                        ]}
                      >
                        <RNHostView matchContents>
                          <View style={styles.seeAllRow}>
                            <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>See all transactions</Text>
                            <Icon name="chevR" size={13} color={theme.accent.dot} stroke={2.2} />
                          </View>
                        </RNHostView>
                      </SwiftButton>
                    </GlassEffectContainer>
                  </Host>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="See all transactions"
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      const from = listSlot ? listSlot.from : ranges.current.from;
                      const to   = listSlot ? listSlot.to   : ranges.current.to;
                      onSeeAll?.({ dateFrom: from, dateTo: to });
                    }}
                  >
                    <BlurView
                      intensity={theme.dark ? 55 : 72}
                      tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
                      style={[styles.seeAllRow, { borderRadius: RADIUS.full, overflow: 'hidden' }]}
                    >
                      <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>See all transactions</Text>
                      <Icon name="chevR" size={13} color={theme.accent.dot} stroke={2.2} />
                    </BlurView>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          />
      </ImageBackground>
    </View>
  );
}

// ─── DetailDayGroup ───────────────────────────────────────────────────────────

function DetailDayGroup({
  day, txs, categories, cats, theme, merchantLogos, currencyCode,
}: {
  day: string;
  txs: Transaction[];
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  theme: Theme;
  merchantLogos: Map<string, MerchantLogo>;
  currencyCode: string;
}) {
  const p = makeP(theme.dark);
  const tint = theme.dark ? 'systemMaterialDark' : 'systemMaterialLight';
  const border = theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';
  const label =
    txs[0]?.when === 'today'     ? 'Today'
    : txs[0]?.when === 'yesterday' ? 'Yesterday'
    : day;
  const spendTotal  = txs.filter(tx => tx.type !== 'income').reduce((s, tx) => s + tx.amount, 0);
  const expenseCount = txs.filter(tx => tx.type !== 'income').length;
  const incomeColor = GROUP_COLORS.savings[theme.dark ? 'dark' : 'light'];

  if (SUPPORTS_GLASS) {
    return (
      <NativeDetailDayGroup
        label={label}
        txs={txs}
        categories={categories}
        cats={cats}
        theme={theme}
        currencyCode={currencyCode}
        p={p}
        merchantLogos={merchantLogos}
        spendTotal={spendTotal}
        expenseCount={expenseCount}
        incomeColor={incomeColor}
      />
    );
  }

  return (
    <BlurView intensity={theme.dark ? 50 : 90} tint={tint} style={styles.dayCard}>
      <View style={[styles.dayCardInner, { borderColor: border }]}>
        <View style={styles.dayHeader}>
          <Text style={[TYPE.txDateLabel, { color: p.textTer }]}>{label}</Text>
          <Text style={[TYPE.bodySmEm, { color: expenseCount > 1 ? p.textSec : p.textTer }]}>
            {expenseCount > 1
              ? `$${spendTotal.toFixed(2)} total`
              : `${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}`}
          </Text>
        </View>
        {txs.map((tx, i) => {
          const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
          const cat        = cats[tx.cat];
          const isIncome   = tx.type === 'income';
          return (
            <View
              key={tx.id}
              accessibilityLabel={`${tx.merchant}, ${cat?.label ?? UNCATEGORIZED_LABEL}, ${isIncome ? '+' : '-'}${formatActiveCurrencyAmount(tx.amount, true)}`}
              style={[
                styles.txRow,
                {
                  borderBottomWidth: i < txs.length - 1 ? 1 : 0,
                  borderBottomColor: border,
                },
              ]}
            >
              <MerchantMark
                merchant={tx.merchant}
                catIcon={cat?.icon}
                color={groupColor}
                logoEnabled={transactionUsesMerchantLogo(tx)}
                size={32}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.txName, { color: p.text, flexShrink: 1 }]} numberOfLines={1}>
                    {tx.merchant}
                  </Text>
                  {tx.recurring && (
                    <Icon name="repeat" size={11} color={p.textTer} stroke={1.7} />
                  )}
                </View>
                <Text style={[styles.txMeta, { color: p.textSec }]}>
                  {cat?.label ?? UNCATEGORIZED_LABEL} · {tx.time}
                </Text>
              </View>
              <Money
                value={tx.amount}
                size={13}
                weight="500"
                theme={theme}
                prefix={isIncome ? '+$' : '−$'}
                color={isIncome ? incomeColor : p.text}
              />
            </View>
          );
        })}
      </View>
    </BlurView>
  );
}

type NativeDetailTxItem = {
  id: string;
  title: string;
  meta: string;
  amountText: string;
  amountColor: string;
  symbol: SFSymbol;
  iconColor: string;
  logoUrl?: string;
  logoBgColor?: string | null;
  recurring: boolean;
  accessibilityLabel: string;
};

function NativeDetailDayGroup({
  label,
  txs,
  categories,
  cats,
  theme,
  currencyCode: _currencyCode,
  p,
  merchantLogos,
  spendTotal,
  expenseCount,
  incomeColor,
}: {
  label: string;
  txs: Transaction[];
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  theme: Theme;
  currencyCode: string;
  p: ReturnType<typeof makeP>;
  merchantLogos: Map<string, MerchantLogo>;
  spendTotal: number;
  expenseCount: number;
  incomeColor: string;
}) {
  const glassTint = theme.dark ? 'rgba(18,20,22,0.46)' : 'rgba(255,255,255,0.72)';
  const summary =
    expenseCount > 1
      ? `${formatActiveCurrencyAmount(spendTotal, true)} total`
      : `${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}`;
  const summaryColor = expenseCount > 1 ? p.textSec : p.textTer;
  const hostHeight =
    NATIVE_DETAIL_DAY_PAD_TOP
    + NATIVE_DETAIL_DAY_HEADER_H
    + 8
    + txs.length * NATIVE_DETAIL_TX_ROW_H
    + NATIVE_DETAIL_DAY_PAD_BOTTOM;

  const items: NativeDetailTxItem[] = txs.map(tx => {
    const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
    const cat = cats[tx.cat];
    const isIncome = tx.type === 'income';
    const logo = transactionUsesMerchantLogo(tx)
      ? merchantLogos.get(merchantLogoKey(tx.merchant))
      : undefined;
    const amountText = `${isIncome ? '+' : '-'}${formatActiveCurrencyAmount(tx.amount, true)}`;
    const meta = `${cat?.label ?? UNCATEGORIZED_LABEL} · ${tx.time}`;
    return {
      id: tx.id,
      title: tx.merchant,
      meta,
      amountText,
      amountColor: isIncome ? incomeColor : p.text,
      symbol: DETAIL_SF_SYMBOL[cat?.icon ?? ''] ?? DETAIL_FALLBACK_SYMBOL,
      iconColor: groupColor,
      logoUrl: logo?.logoUrl,
      logoBgColor: logo?.bgColor,
      recurring: !!tx.recurring,
      accessibilityLabel: `${tx.merchant}, ${meta}, ${amountText}`,
    };
  });

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
              leading: NATIVE_DETAIL_DAY_PAD_X,
              trailing: NATIVE_DETAIL_DAY_PAD_X,
              top: NATIVE_DETAIL_DAY_PAD_TOP,
              bottom: NATIVE_DETAIL_DAY_PAD_BOTTOM,
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
            spacing={12}
            modifiers={[
              padding({ bottom: 8 }),
              frame({ height: NATIVE_DETAIL_DAY_HEADER_H + 8, maxWidth: 10000, alignment: 'leading' }),
            ]}
          >
            <SwiftText modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(p.textTer), lineLimit(1)]}>
              {label}
            </SwiftText>
            <Spacer />
            <SwiftText modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(summaryColor), lineLimit(1)]}>
              {summary}
            </SwiftText>
          </HStack>
          <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
            {items.map((item, index) => (
              <NativeDetailTxRow
                key={item.id}
                item={item}
                p={p}
                last={index === items.length - 1}
              />
            ))}
          </VStack>
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}

function NativeDetailTxRow({
  item,
  p,
  last,
}: {
  item: NativeDetailTxItem;
  p: ReturnType<typeof makeP>;
  last: boolean;
}) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[
        frame({ maxWidth: 10000, alignment: 'leading' }),
        swiftAccessibilityLabel(item.accessibilityLabel),
      ]}
    >
      <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
        <HStack
          alignment="center"
          spacing={12}
          modifiers={[frame({ height: NATIVE_DETAIL_TX_ROW_H - (last ? 0 : 1), maxWidth: 10000, alignment: 'leading' })]}
        >
          <NativeRowMerchantMark
            logoUrl={item.logoUrl}
            logoBgColor={item.logoBgColor}
            fallbackSystemName={item.symbol}
            fallbackColor={item.iconColor}
            fallbackBackgroundColor={`${item.iconColor}24`}
            size={32}
          />
          <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
            <HStack alignment="center" spacing={5}>
              <SwiftText
                modifiers={[
                  font({ size: 15 }),
                  foregroundStyle(p.text),
                  lineLimit(1),
                  truncationMode('tail'),
                ]}
              >
                {item.title}
              </SwiftText>
              {item.recurring ? (
                <SwiftImage systemName="repeat" size={11} color={p.textTer} />
              ) : null}
            </HStack>
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
          </VStack>
          <Spacer minLength={8} />
          <SwiftText modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(item.amountColor), lineLimit(1)]}>
            {item.amountText}
          </SwiftText>
        </HStack>
        {!last ? <Rectangle modifiers={[frame({ height: 1, maxWidth: 10000 }), foregroundStyle(p.hairline)]} /> : null}
      </VStack>
    </VStack>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
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
    height: 44,
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
  },

  // Balances the back button so the title stays optically centered
  headerSpacer: { width: 40, height: 40 },

  // Scroll
  scrollContent: {
    paddingHorizontal: CHART_PAD,
    gap: 12,
  },

  // ListHeaderComponent is wrapped in a single View by FlatList, so the
  // hero/picker/search spacing lives here rather than on the scroll content.
  headerStack: {
    gap: 12,
  },

  // Hero
  hero: {
    paddingTop: 20,
    paddingBottom: 4,
  },
  // Bleeds to the screen edges (negating the CHART_PAD gutter) and extends up
  // under the blurred header so its solid band has no visible top edge; the
  // gradient itself fades the bottom into the page scrim.
  heroBacking: {
    position: 'absolute',
    top: -120,
    left: -CHART_PAD,
    right: -CHART_PAD,
    bottom: -150,
  },
  metricHeroTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
  },
  metricHeroAmount: {
    ...TYPE.displayXl,
    marginTop: 8,
  },
  heroChart: {
    marginTop: 16,
    height: CHART_H,
  },
  savedComposition: {
    ...TYPE.bodySm,
    marginTop: 4,
    lineHeight: 20,
  },
  trendStatInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // Period picker row
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickerSeg: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MEDIA.trackBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dateLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    width: 132,
    height: 36,
  },
  dateLabelText: { ...TYPE.subsectionTitle },

  // Search bar
  searchWrap: { marginTop: 10 },

  // Day card
  dayCard: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  dayCardInner: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  seeAllWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },

  // Transaction rows
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  txName: {
    ...TYPE.body,
  },
  txMeta: {
    ...TYPE.caption,
    marginTop: 2,
  },
});
