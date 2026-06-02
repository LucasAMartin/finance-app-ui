import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Host, Menu, Button as SwiftButton } from '@expo/ui/swift-ui';

import { Theme, GROUP_COLORS } from '../theme';
import { useTheme } from '../ThemeProvider';
import { makeP, makeScrim, DARK_TEXT_SHADOW, MEDIA } from '../wallpaperPalette';
import { RADIUS } from '../radius';
import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { SpendChart } from '../components/charts/SpendChart';
import { MerchantMark } from '../components/MerchantMark';
import { transactionUsesMerchantLogo } from '../merchantLogos';
import { Money } from '../components/shared';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import type {
  Category,
  Transaction,
  TransactionCursor,
  TransactionSummaryQuery,
} from '../repositories/types';
import {
  generateDateOptions,
  derivePeriodRanges,
  spendSeriesToBuckets,
} from '../selectors/spending';
import { buildSavedMetric } from '../selectors/savings';
import { TYPE } from '../typography';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_PAD = 16;
const CHART_W = SCREEN_W - CHART_PAD * 2;
const CHART_H = 160;
const DETAIL_CHART_INSET_Y = 20;
const PAGE_SIZE = 50;

const TIMEFRAMES = ['1W', '1M', '1Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type Period = 'Week' | 'Month' | 'Year';
const TF_TO_PERIOD: Record<Timeframe, Period> = {
  '1W': 'Week',
  '1M': 'Month',
  '1Y': 'Year',
};

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
  const abs = Math.abs(n);
  const value =
    abs >= 1000 && decimals === 0
      ? Math.round(abs).toLocaleString()
      : abs.toFixed(decimals);
  return `$${value}`;
}

export interface InsightDetailTarget {
  kind?: 'spending' | 'savings';
  title: string;
  subtitle?: string;
  icon?: string;
  accentColor?: string;
}

interface Props {
  theme: Theme;
  target: InsightDetailTarget | null;
  onOpenTx?: (tx: Transaction) => void;
  onClose: () => void;
}

export function InsightDetailScreen({ theme, target, onOpenTx, onClose }: Props) {
  const { transactionsRepo, categoriesRepo, incomeRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const incomes = useRepositoryList(incomeRepo);
  const cats = useMemo(() => categoryMap(categories), [categories]);

  const { wallpaper } = useTheme();
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
  const handleOpenTx = useCallback((selected: Transaction) => {
    onOpenTx?.(selected);
  }, [onOpenTx]);

  // Keep the last target mounted through the slide-out so content doesn't blank.
  const last = useRef<InsightDetailTarget | null>(null);
  if (target) last.current = target;
  const t = last.current;
  const isSavingsDetail = t?.kind === 'savings';
  const savingsTint = t?.accentColor ?? GROUP_COLORS.savings.dark;

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 220,
      useNativeDriver: true,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    }).start();
  }, [visible, anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_W, 0],
  });

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
  const lineSeries = useMemo(() => {
    if (!visible) return [];
    const points = transactionsRepo.getSpendSeries({
      from: ranges.current.from.toISOString(),
      to: ranges.current.to.toISOString(),
      bucket: period === 'Year' ? 'month' : 'day',
    });
    return spendSeriesToBuckets(points, period, ranges.current.from, ranges.current.to);
  }, [transactionsRepo, ranges, period, visible, repoVersion]);

  const cumulativeSeries = useMemo(() => {
    let s = 0;
    return lineSeries.map(v => (s += v));
  }, [lineSeries]);
  const activeSeries = isSavingsDetail
    ? savedMetric.cumulativeSeries
    : cumulativeSeries;

  // ── Scrub ─────────────────────────────────────────────────────────
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  useEffect(() => setScrubIdx(null), [activeSeries]);

  // Period total comes from the aggregate summary, not a reduce over rows.
  const total = useMemo(() => {
    if (!visible) return 0;
    return transactionsRepo.getSummary({
      from: ranges.current.from.toISOString(),
      to: ranges.current.to.toISOString(),
    }).expenseTotal;
  }, [transactionsRepo, ranges, visible, repoVersion]);
  const activeTotal = isSavingsDetail ? savedMetric.total : total;
  const heroAmount =
    scrubIdx != null ? (activeSeries[scrubIdx] ?? activeTotal) : activeTotal;

  const scrubDateLabel = (idx: number): string => {
    if (period === 'Year') {
      return new Date(ranges.current.from.getFullYear(), idx, 1)
        .toLocaleDateString('en-US', { month: 'long' });
    }
    return addDays(ranges.current.from, idx)
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const metricDisplay = money(heroAmount, heroAmount < 100 ? 2 : 0);
  const heroSubLabel = scrubIdx != null ? scrubDateLabel(scrubIdx) : dateLabel;
  const savedIntentionalText = money(
    savedMetric.intentional,
    savedMetric.intentional < 100 ? 2 : 0,
  );
  const savedExtraText = money(savedMetric.extra, savedMetric.extra < 100 ? 2 : 0);

  // ── Paginated transaction list ────────────────────────────────────
  // Only the visible window is loaded; more pages stream in on scroll. The
  // chart/total above are driven by aggregates, so they stay correct even
  // though the list below is partial.
  const listScope = useMemo<TransactionSummaryQuery>(() => ({
    from: ranges.current.from.toISOString(),
    to: ranges.current.to.toISOString(),
    categoryIds: isSavingsDetail ? savedMetric.categoryIds : undefined,
    merchantQuery: query.trim() || undefined,
    searchCategoryIds,
  }), [ranges, isSavingsDetail, savedMetric.categoryIds, query, searchCategoryIds]);

  const [rows, setRows] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<TransactionCursor | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const page = transactionsRepo.listPage({
      ...listScope,
      sort: sortBy,
      limit: PAGE_SIZE,
    });
    setRows(page.rows);
    setNextCursor(page.nextCursor);
    setLoadingMore(false);
  }, [transactionsRepo, listScope, sortBy, visible, repoVersion]);

  const loadMore = useCallback(() => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    const page = transactionsRepo.listPage({
      ...listScope,
      sort: sortBy,
      limit: PAGE_SIZE,
      cursor: nextCursor,
    });
    setRows(prev => [...prev, ...page.rows]);
    setNextCursor(page.nextCursor);
    setLoadingMore(false);
  }, [transactionsRepo, listScope, sortBy, nextCursor, loadingMore]);

  const grouped = useMemo(() => {
    const g: Record<string, Transaction[]> = {};
    rows.forEach(tx => {
      if (!g[tx.fullDate]) g[tx.fullDate] = [];
      g[tx.fullDate].push(tx);
    });
    return g;
  }, [rows]);
  const dayKeys = useMemo(() => Object.keys(grouped), [grouped]);

  const lineColor = isSavingsDetail ? savingsTint : 'rgba(242,244,245,0.82)';

  const sortIdx = SORT_OPTIONS.findIndex(o => o.id === sortBy);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 80, opacity: anim, transform: [{ translateX }] },
      ]}
    >
      <View style={styles.root}>
        <ImageBackground
          source={wallpaper.source}
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
                tint={pW.text}
                fallbackBg="rgba(8,6,20,0.45)"
                accessibilityLabel="Back"
              />

              {/* Title */}
              <Text style={[styles.headerTitle, { color: pW.text }, DARK_TEXT_SHADOW]} numberOfLines={1}>
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
            keyExtractor={day => day}
            renderItem={({ item: day }) => (
              <DetailDayGroup
                day={day}
                txs={grouped[day]}
                categories={categories}
                cats={cats}
                theme={theme}
                onPress={handleOpenTx}
              />
            )}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={7}
            onEndReached={loadMore}
            onEndReachedThreshold={0.7}
            ListHeaderComponent={
              <View style={styles.headerStack}>
                <View style={styles.hero}>
                  <View style={styles.metricHeroTop}>
                    <Text style={[TYPE.labelSm, { color: pW.textTer }]}>
                      {isSavingsDetail ? 'Saved' : 'Spent'}
                    </Text>
                    <Text style={[TYPE.labelSm, { color: pW.textTer }]}>
                      ·
                    </Text>
                    <Text style={[TYPE.labelSm, { color: pW.textTer }]}>
                      {heroSubLabel}
                    </Text>
                  </View>
                  <Text style={[styles.metricHeroAmount, { color: pW.text }]}>{metricDisplay}</Text>
                  <View style={styles.heroChart}>
                    <SpendChart
                      data={activeSeries}
                      width={CHART_W}
                      height={CHART_H}
                      color={lineColor}
                      fillColor={isSavingsDetail ? savingsTint : undefined}
                      ringColor="#08060e"
                      strokeWidth={2.5}
                      verticalInset={DETAIL_CHART_INSET_Y}
                      onScrub={setScrubIdx}
                    />
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
                    values={TIMEFRAMES as unknown as string[]}
                    selectedIndex={TIMEFRAMES.indexOf(timeframe)}
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
                    style={styles.pickerSeg}
                  />

                  {/* Date — labeled chevron menu, identical to the Insights pattern */}
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

                  {/* Sort — its own visible control */}
                  <Host ignoreSafeArea="all" style={{ width: 36, height: 36 }}>
                    <Menu
                      label={
                        <View style={styles.moreBtn}>
                          <Icon name="filter" size={16} color={pW.text} />
                        </View>
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

                {/* Search bar */}
                <View style={styles.searchWrap}>
                  <BlurView intensity={theme.dark ? 50 : 90} tint={cardTint} style={styles.searchCard}>
                    <View style={[styles.searchCardInner, { borderColor: cardBorder }]}>
                      <View style={styles.searchRow}>
                        <Icon name="search" size={16} color={p.textSec} />
                        <TextInput
                          value={query}
                          onChangeText={setQuery}
                          placeholder="Search transactions…"
                          placeholderTextColor={p.textTer}
                          style={[styles.searchInput, { color: p.text }]}
                          returnKeyType="search"
                          accessibilityLabel="Search transactions"
                        />
                        {query.length > 0 && (
                          <TouchableOpacity
                            onPress={() => setQuery('')}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="Clear search"
                          >
                            <Icon name="close" size={14} color={p.textSec} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </BlurView>
                </View>
              </View>
            }
            ListEmptyComponent={
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
            }
          />
        </ImageBackground>
      </View>
    </Animated.View>
  );
}

// ─── DetailDayGroup ───────────────────────────────────────────────────────────

function DetailDayGroup({
  day, txs, categories, cats, theme, onPress,
}: {
  day: string;
  txs: Transaction[];
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  theme: Theme;
  onPress: (tx: Transaction) => void;
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
            <Pressable
              key={tx.id}
              onPress={() => onPress(tx)}
              style={({ pressed }) => [
                styles.txRow,
                {
                  borderBottomWidth: i < txs.length - 1 ? 1 : 0,
                  borderBottomColor: border,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${tx.merchant}, ${cat?.label ?? ''}, ${isIncome ? '+' : '−'}$${tx.amount.toFixed(2)}`}
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
                  {cat?.label} · {tx.time}
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
            </Pressable>
          );
        })}
      </View>
    </BlurView>
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
  searchWrap: {},
  searchCard: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  searchCardInner: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    ...TYPE.bodyRegular,
    padding: 0,
  },

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
