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
import { MenuView } from '@react-native-menu/menu';

import { Theme, GROUP_COLORS } from '../theme';
import { useTheme } from '../ThemeProvider';
import { makeP, DARK_TEXT_SHADOW, MEDIA } from '../wallpaperPalette';
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
import { TYPE } from '../typography';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_PAD = 16;
const CHART_W = SCREEN_W - CHART_PAD * 2;
const CHART_H = 160;
const PAGE_SIZE = 50;

const TIMEFRAMES = ['1W', '1M', '6M', '1Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type Period = 'Week' | 'Month' | 'Year';
const TF_TO_PERIOD: Record<Timeframe, Period> = {
  '1W': 'Week',
  '1M': 'Month',
  '6M': 'Year',
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

export interface InsightDetailTarget {
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
  const { transactionsRepo, categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const cats = useMemo(() => categoryMap(categories), [categories]);

  const { wallpaper } = useTheme();
  const insets = useSafeAreaInsets();
  const pW = makeP(true);
  const visible = target !== null;
  const handleOpenTx = useCallback((selected: Transaction) => {
    onOpenTx?.(selected);
  }, [onOpenTx]);

  // Keep the last target mounted through the slide-out so content doesn't blank.
  const last = useRef<InsightDetailTarget | null>(null);
  if (target) last.current = target;
  const t = last.current;

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

  // ── Chart type toggle ─────────────────────────────────────────────
  const [chartTypeIdx, setChartTypeIdx] = useState(0);

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

  // ── Scrub ─────────────────────────────────────────────────────────
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  useEffect(() => setScrubIdx(null), [cumulativeSeries]);

  // Period total comes from the aggregate summary, not a reduce over rows.
  const total = useMemo(() => {
    if (!visible) return 0;
    return transactionsRepo.getSummary({
      from: ranges.current.from.toISOString(),
      to: ranges.current.to.toISOString(),
    }).expenseTotal;
  }, [transactionsRepo, ranges, visible, repoVersion]);
  const heroAmount = scrubIdx != null ? (cumulativeSeries[scrubIdx] ?? total) : total;

  const splitMoney = (n: number) => {
    const whole = Math.floor(n).toLocaleString();
    const cents = Math.round((n - Math.floor(n)) * 100).toString().padStart(2, '0');
    return { whole: `$${whole}`, cents: `.${cents}` };
  };

  const scrubDateLabel = (idx: number): string => {
    if (period === 'Year') {
      return new Date(ranges.current.from.getFullYear(), idx, 1)
        .toLocaleDateString('en-US', { month: 'long' });
    }
    return addDays(ranges.current.from, idx)
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const spendDisplay = splitMoney(heroAmount);
  const heroSubLabel = scrubIdx != null ? scrubDateLabel(scrubIdx) : dateLabel;

  // ── Paginated transaction list ────────────────────────────────────
  // Only the visible window is loaded; more pages stream in on scroll. The
  // chart/total above are driven by aggregates, so they stay correct even
  // though the list below is partial.
  const listScope = useMemo<TransactionSummaryQuery>(() => ({
    from: ranges.current.from.toISOString(),
    to: ranges.current.to.toISOString(),
    merchantQuery: query.trim() || undefined,
    searchCategoryIds,
  }), [ranges, query, searchCategoryIds]);

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

  const lineColor = 'rgba(242,244,245,0.82)';

  const sortIdx = SORT_OPTIONS.findIndex(o => o.id === sortBy);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 80, opacity: anim, transform: [{ translateX }] },
      ]}
    >
      <View style={styles.root}>
        <ImageBackground
          source={wallpaper.source}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(8,6,20,0.62)', 'rgba(8,6,20,0.48)', 'rgba(8,6,20,0.74)', 'rgba(8,6,20,0.92)']}
            locations={[0, 0.28, 0.6, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* ─── Header ───────────────────────────────────────────── */}
          <View
            style={[styles.headerWrap, { paddingTop: insets.top + 8, backgroundColor: 'rgba(8,6,20,0.55)' }]}
          >
            <BlurView
              intensity={60}
              tint="systemMaterialDark"
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.headerDivider, { backgroundColor: MEDIA.hairline }]} />
            <View style={styles.headerRow}>
              {/* Back */}
              <ScreenExitButton
                variant="back"
                onPress={onClose}
                tint="#F2F4F5"
                fallbackBg="rgba(8,6,20,0.45)"
                accessibilityLabel="Back"
              />

              {/* Title */}
              <Text style={[styles.headerTitle, DARK_TEXT_SHADOW]} numberOfLines={1}>
                {t?.title ?? ''}
              </Text>

              {/* Chart type toggle pill */}
              <View style={styles.chartTypePill}>
                {(['chartLine', 'chart', 'repeat'] as const).map((iconName, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setChartTypeIdx(i)}
                    style={[styles.chartTypeBtn, chartTypeIdx === i && styles.chartTypeBtnActive]}
                    accessibilityRole="button"
                    accessibilityLabel={i === 0 ? 'Line chart' : i === 1 ? 'Bar chart' : 'Reset view'}
                  >
                    <Icon
                      name={iconName}
                      size={15}
                      color={chartTypeIdx === i ? '#111111' : 'rgba(242,244,245,0.65)'}
                      stroke={1.9}
                    />
                  </Pressable>
                ))}
              </View>
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
                {/* Hero: amount + chart */}
                <View style={styles.hero}>
                  <Text style={[TYPE.labelSm, { color: pW.textTer, marginBottom: 4 }]}>Spent</Text>
                  <Text style={styles.heroAmount}>
                    {spendDisplay.whole}
                    <Text style={styles.heroCents}>{spendDisplay.cents}</Text>
                  </Text>
                  <Text style={[TYPE.bodySm, { color: pW.textTer, marginTop: 4 }]}>
                    {heroSubLabel}
                  </Text>
                  <View style={styles.heroChart}>
                    <SpendChart
                      data={cumulativeSeries}
                      width={CHART_W}
                      height={CHART_H}
                      color={lineColor}
                      ringColor="#08060e"
                      strokeWidth={2.5}
                      onScrub={setScrubIdx}
                    />
                  </View>
                </View>

                {/* Period picker row */}
                <View style={styles.pickerRow}>
                  <SegmentedControl
                    values={TIMEFRAMES as unknown as string[]}
                    selectedIndex={TIMEFRAMES.indexOf(timeframe)}
                    onChange={(e) => {
                      const next = TIMEFRAMES[e.nativeEvent.selectedSegmentIndex];
                      if (next) setTimeframe(next);
                    }}
                    tintColor="rgba(242,244,245,0.90)"
                    appearance="dark"
                    backgroundColor="rgba(242,244,245,0.10)"
                    fontStyle={{ color: 'rgba(242,244,245,0.55)' }}
                    activeFontStyle={{ color: '#111111', fontWeight: '600' }}
                    style={styles.pickerSeg}
                  />
                  <MenuView
                    shouldOpenOnLongPress={false}
                    themeVariant="dark"
                    actions={[
                      ...SORT_OPTIONS.map((o, i) => ({
                        id: `sort-${o.id}`,
                        title: o.label,
                        state: (i === sortIdx ? 'on' : 'off') as 'on' | 'off',
                      })),
                      ...dateOptions.map((opt, idx) => ({
                        id: `date-${idx}`,
                        title: opt,
                        state: (idx === dateIdx ? 'on' : 'off') as 'on' | 'off',
                      })),
                    ]}
                    onPressAction={({ nativeEvent }) => {
                      const id = nativeEvent.event;
                      if (id.startsWith('sort-')) {
                        setSortBy(id.replace('sort-', '') as SortOrder);
                      } else if (id.startsWith('date-')) {
                        const idx = Number(id.replace('date-', ''));
                        setDateIdxByPeriod(prev => ({ ...prev, [period]: idx }));
                      }
                    }}
                  >
                    <View style={styles.moreBtn}>
                      <Icon name="ellipsis" size={16} color="rgba(242,244,245,0.85)" />
                    </View>
                  </MenuView>
                </View>

                {/* Search bar */}
                <View style={styles.searchWrap}>
                  <BlurView intensity={50} tint="systemMaterialDark" style={styles.searchCard}>
                    <View style={[styles.searchCardInner, { borderColor: MEDIA.hairline }]}>
                      <View style={styles.searchRow}>
                        <Icon name="search" size={16} color={pW.textSec} />
                        <TextInput
                          value={query}
                          onChangeText={setQuery}
                          placeholder="Search transactions…"
                          placeholderTextColor={pW.textTer}
                          style={[styles.searchInput, { color: pW.text }]}
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
                            <Icon name="close" size={14} color={pW.textSec} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </BlurView>
                </View>
              </View>
            }
            ListEmptyComponent={
              <BlurView intensity={50} tint="systemMaterialDark" style={styles.dayCard}>
                <View style={[styles.dayCardInner, { borderColor: MEDIA.hairline }]}>
                  <View style={styles.emptyRow}>
                    <Icon name="receipt" size={16} color={pW.textTer} />
                    <Text style={[TYPE.bodySm, { color: pW.textTer }]}>
                      {query ? 'No results' : 'No transactions'}
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
  const pW = makeP(true);
  const label =
    txs[0]?.when === 'today'     ? 'Today'
    : txs[0]?.when === 'yesterday' ? 'Yesterday'
    : day;
  const spendTotal  = txs.filter(tx => tx.type !== 'income').reduce((s, tx) => s + tx.amount, 0);
  const expenseCount = txs.filter(tx => tx.type !== 'income').length;
  const incomeColor = GROUP_COLORS.savings.dark;

  return (
    <BlurView intensity={50} tint="systemMaterialDark" style={styles.dayCard}>
      <View style={[styles.dayCardInner, { borderColor: MEDIA.hairline }]}>
        <View style={styles.dayHeader}>
          <Text style={[TYPE.txDateLabel, { color: pW.textTer }]}>{label}</Text>
          <Text style={[TYPE.bodySmEm, { color: expenseCount > 1 ? pW.textSec : pW.textTer }]}>
            {expenseCount > 1
              ? `$${spendTotal.toFixed(2)} total`
              : `${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}`}
          </Text>
        </View>
        {txs.map((tx, i) => {
          const groupColor = categoryGroupColor(tx.cat, categories, true);
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
                  borderBottomColor: MEDIA.hairline,
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
                  <Text style={[styles.txName, { color: pW.text, flexShrink: 1 }]} numberOfLines={1}>
                    {tx.merchant}
                  </Text>
                  {tx.recurring && (
                    <Icon name="repeat" size={11} color={pW.textTer} stroke={1.7} />
                  )}
                </View>
                <Text style={[styles.txMeta, { color: pW.textSec }]}>
                  {cat?.label} · {tx.time}
                </Text>
              </View>
              <Money
                value={tx.amount}
                size={13}
                weight="500"
                theme={theme}
                prefix={isIncome ? '+$' : '−$'}
                color={isIncome ? incomeColor : pW.text}
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
    color: '#FFFFFF',
  },

  // Chart type pill (top right in header)
  chartTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(242,244,245,0.12)',
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  chartTypeBtn: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  chartTypeBtnActive: {
    backgroundColor: 'rgba(242,244,245,0.88)',
  },

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
    paddingTop: 12,
    paddingBottom: 4,
  },
  heroAmount: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1.5,
    color: '#F2F4F5',
    lineHeight: 46,
  },
  heroCents: {
    fontSize: 28,
    fontWeight: '400',
    color: 'rgba(242,244,245,0.55)',
  },
  heroChart: {
    marginTop: 16,
    height: CHART_H,
  },

  // Period picker row
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    backgroundColor: 'rgba(242,244,245,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Search bar
  searchWrap: {},
  searchCard: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  searchCardInner: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    ...TYPE.bodyRegular,
    padding: 0,
  },

  // Day card
  dayCard: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  dayCardInner: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
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
