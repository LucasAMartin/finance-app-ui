import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  InteractionManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');
import {
  FlatList as GHFlatList,
  Swipeable,
} from 'react-native-gesture-handler';

const AnimatedGHFlatList = Animated.createAnimatedComponent(GHFlatList);
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet, {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import {
  Calendar,
  buildCalendar,
  fromDateId,
  toDateId,
  type CalendarMonthEnhanced,
  type CalendarTheme,
} from '@marceloterreiro/flash-calendar';
import { Button as SwiftButton, ContentUnavailableView, Host, Menu, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { environment, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import type { Bill, Category, Transaction, TransactionCursor, TransactionQuery, TransactionsRepo, TransactionSummary, TransactionSummaryQuery } from '../repositories/types';
import { txToCreateInput, upcomingBillsFromRecurring } from '../selectors/finance';
import type { ActivityInitialFilter } from '../selectors/spending';

// Default calendar position and the "current month" reference derive from the
// real clock. occurredAt (ISO, set by the data layer) is the source of truth
// for every transaction, so the screen tracks actual dates rather than a pinned
// mock month — it stays correct in any month/year.
const NOW            = new Date();
const CALENDAR_YEAR  = NOW.getFullYear();
const CALENDAR_MONTH = NOW.getMonth();
const ACTIVITY_PAGE_SIZE = 80;
const FILTER_COMMIT_DELAY_MS = 90;

let hasShownDeleteHint = false;
import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { SearchFilterBar } from '../components/SearchFilterBar';
import { MerchantMark } from '../components/MerchantMark';
import { transactionUsesMerchantLogo } from '../merchantLogos';
import { Money } from '../components/shared';
import { PopupNumericKeypad } from '../components/PopupNumericKeypad';
import { applyKeypadKey, type KeypadKey } from '../components/NumericKeypad';
import { Skeleton } from '../components/Skeleton';
import { Toast } from '../components/Toast';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionCard } from '../components/SectionCard';
import { HeaderIcon, useHeaderScroll, BG_PARALLAX_MAX } from '../components/headerScroll';
import { Theme, GROUP_COLORS, OVER_DOT, cautionBg, cautionText } from '../theme';
import { MEDIA, DARK_TEXT_SHADOW, makeP, makeScrim, deriveFloor } from '../wallpaperPalette';
import { TYPE } from '../typography';
import { useTheme } from '../ThemeProvider';


type DateFilterPreset = 'today' | 'yesterday' | 'this-week' | 'this-month';
type DateFilter = DateFilterPreset | { from: Date; to: Date } | null;
type AmountFilter = { min?: number; max?: number } | null;
type SortOrder = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'cat';
type CalendarSelectMode = 'day' | 'range';

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'date-desc',   label: 'Newest first'  },
  { id: 'date-asc',   label: 'Oldest first'  },
  { id: 'amount-desc', label: 'Highest first' },
  { id: 'amount-asc',  label: 'Lowest first'  },
  { id: 'cat',         label: 'Category'      },
];

const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
  { id: 'today',       label: 'Today'      },
  { id: 'yesterday',   label: 'Yesterday'  },
  { id: 'this-week',   label: 'This week'  },
  { id: 'this-month',  label: 'This month' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = s.trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3));
  return month < 0 ? null : { month, day: parseInt(m[2], 10) };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Real Date for a transaction. occurredAt (ISO) is the data layer's source of
// truth; fall back to parsing the derived fullDate (assuming the current year)
// only for a legacy row that somehow lacks it.
function txDate(t: Transaction): Date | null {
  if (t.occurredAt) return new Date(t.occurredAt);
  const pd = parseMonthDay(t.fullDate);
  return pd ? new Date(NOW.getFullYear(), pd.month, pd.day) : null;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function fmtDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function amountBounds(filter: AmountFilter): Pick<TransactionSummaryQuery, 'minAmount' | 'maxAmount'> {
  if (!filter) return {};
  const minAmount = filter.min !== undefined && filter.min > 0 ? filter.min : undefined;
  const maxAmount = filter.max !== undefined && filter.max > 0 ? filter.max : undefined;
  return { minAmount, maxAmount };
}

function amountFilterActive(filter: AmountFilter): boolean {
  const bounds = amountBounds(filter);
  return bounds.minAmount !== undefined || bounds.maxAmount !== undefined;
}

function parseAmountDraft(value: string): number | undefined {
  const n = parseFloat(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function formatAmountDraft(value?: number): string {
  return value && value > 0 ? value.toFixed(2) : '0.00';
}

function formatMoneyPlain(value: number): string {
  return value % 1 === 0
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amountFilterLabel(filter: AmountFilter): string {
  const bounds = amountBounds(filter);
  if (bounds.minAmount !== undefined && bounds.maxAmount !== undefined) {
    return `$${formatMoneyPlain(bounds.minAmount)}-$${formatMoneyPlain(bounds.maxAmount)}`;
  }
  if (bounds.minAmount !== undefined) return `$${formatMoneyPlain(bounds.minAmount)}+`;
  if (bounds.maxAmount !== undefined) return `Up to $${formatMoneyPlain(bounds.maxAmount)}`;
  return 'Any amount';
}

function amountFilterFromDrafts(minDraft: string, maxDraft: string): AmountFilter {
  const min = parseAmountDraft(minDraft);
  const max = parseAmountDraft(maxDraft);
  if (min === undefined && max === undefined) return null;
  return { min, max };
}

function amountRangeInvalid(minDraft: string, maxDraft: string): boolean {
  const min = parseAmountDraft(minDraft);
  const max = parseAmountDraft(maxDraft);
  return min !== undefined && max !== undefined && min > max;
}

function endOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(23, 59, 59, 999);
  return next;
}

function dateRangeForFilter(
  dateFilter: DateFilter,
  viewingNonDefaultMonth: boolean,
  calViewYear: number,
  calViewMonth: number,
): Pick<TransactionSummaryQuery, 'from' | 'to'> {
  if (dateFilter !== null) {
    if (typeof dateFilter === 'string') {
      if (dateFilter === 'today') return { from: startOfDay(NOW).toISOString(), to: endOfDay(NOW).toISOString() };
      if (dateFilter === 'yesterday') {
        const y = new Date(NOW);
        y.setDate(y.getDate() - 1);
        return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
      }
      if (dateFilter === 'this-week') {
        const weekStart = new Date(NOW);
        weekStart.setDate(weekStart.getDate() - 6);
        return { from: startOfDay(weekStart).toISOString(), to: endOfDay(NOW).toISOString() };
      }
      if (dateFilter === 'this-month') {
        return {
          from: new Date(NOW.getFullYear(), NOW.getMonth(), 1).toISOString(),
          to: endOfDay(new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0)).toISOString(),
        };
      }
    }
    return {
      from: startOfDay(dateFilter.from).toISOString(),
      to: endOfDay(dateFilter.to).toISOString(),
    };
  }
  if (viewingNonDefaultMonth) {
    return {
      from: new Date(calViewYear, calViewMonth, 1).toISOString(),
      to: endOfDay(new Date(calViewYear, calViewMonth + 1, 0)).toISOString(),
    };
  }
  return {};
}

const EMPTY_SUMMARY: TransactionSummary = {
  transactionCount: 0,
  expenseCount: 0,
  expenseTotal: 0,
  expenseDayCount: 0,
};

// Debounces a rapidly-changing value (e.g. the search box) so downstream work —
// the three repo scans and the calendar/list re-render — fires once the user
// pauses typing rather than on every keystroke.
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

interface Props {
  theme: Theme;
  onOpenDrawer?: () => void;
  onOpenTx?: (tx: Transaction) => void;
  onPrepareTx?: (tx: Transaction) => void;
  initialFilter?: ActivityInitialFilter | null;
  filterToken?: number;
}

export function ActivityScreen({ theme, onOpenDrawer, onOpenTx, onPrepareTx, initialFilter, filterToken }: Props) {
  const { transactionsRepo, categoriesRepo, recurringRulesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const upcomingBills = useMemo(() => upcomingBillsFromRecurring(recurringRules, categories), [recurringRules, categories]);
  const insets = useSafeAreaInsets();
  const { wallpaper, wallpaperFloorBase } = useTheme();

  const [query, setQuery]                   = useState('');
  const [catFilter, setCatFilter]           = useState<string[]>([]);
  const [dateFilter, setDateFilter]         = useState<DateFilter>(null);
  const [amountFilter, setAmountFilter]     = useState<AmountFilter>(null);
  const [sortBy, setSortBy]                 = useState<SortOrder>('date-desc');
  const [pendingUndo, setPendingUndo]       = useState<{ tx: Transaction } | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [calendarSheetOpen, setCalendarSheetOpen] = useState(false);
  const [selectedDay, setSelectedDay]       = useState<number | null>(null);
  const [calViewYear, setCalViewYear]       = useState(CALENDAR_YEAR);
  const [calViewMonth, setCalViewMonth]     = useState(CALENDAR_MONTH);

  // Loading / refresh lifecycle mirrors HomeScreen: a simulated settle today,
  // the seam where the async data source (CloudKit) hooks in later.
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activityRows, setActivityRows] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<TransactionCursor | undefined>(undefined);
  const [activitySummary, setActivitySummary] = useState<TransactionSummary>(EMPTY_SUMMARY);
  const [repoVersion, setRepoVersion] = useState(0);

  useEffect(() => {
    return transactionsRepo.subscribe(() => setRepoVersion(version => version + 1));
  }, [transactionsRepo]);

  // One-time swipe hint: fires when the list first appears with real rows.
  useEffect(() => {
    if (!loading && !loadError && !hasShownDeleteHint) {
      hasShownDeleteHint = true;
      setShowSwipeHint(true);
      const t = setTimeout(() => setShowSwipeHint(false), 3500);
      return () => clearTimeout(t);
    }
  }, [loading, loadError]);

  // Stable identity so the memoized FilterSheet menus don't re-bridge to SwiftUI
  // when an unrelated piece of screen state (e.g. a category toggle) changes.
  const handleSetDateFilter = useCallback((d: DateFilter) => {
    setDateFilter(d);
    if (d !== null) setSelectedDay(null);
  }, []);
  const clearSelectedDay = useCallback(() => setSelectedDay(null), []);
  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);

  const resetCal = () => {
    setSelectedDay(null);
    setDateFilter(null);
    setCalViewYear(CALENDAR_YEAR);
    setCalViewMonth(CALENDAR_MONTH);
  };

  const handleDeleteTx = useCallback((t: Transaction) => {
    transactionsRepo.delete(t.id);
    setPendingUndo({ tx: t });
  }, [transactionsRepo]);

  const handleOpenTx = useCallback((selected: Transaction) => {
    onOpenTx?.(selected);
  }, [onOpenTx]);
  const handlePrepareTx = useCallback((selected: Transaction) => {
    onPrepareTx?.(selected);
  }, [onPrepareTx]);

  const handleUndoDelete = () => {
    if (pendingUndo) transactionsRepo.create(txToCreateInput(pendingUndo.tx));
    setPendingUndo(null);
  };

  // Swipe-to-delete coordination (mirrors BudgetScreen): only one row open at a
  // time, and any open row closes when the user scrolls or taps elsewhere.
  const scrollViewRef = useRef<any>(null);
  const openSwipeRef  = useRef<Swipeable | null>(null);

  const handleSwipeOpen = useCallback((ref: Swipeable) => {
    if (openSwipeRef.current && openSwipeRef.current !== ref) openSwipeRef.current.close();
    openSwipeRef.current = ref;
  }, []);
  const handleSwipeClose = useCallback(() => { openSwipeRef.current = null; }, []);
  const dismissOpenSwipe = useCallback(() => { openSwipeRef.current?.close(); }, []);

  // Sort is a presentation preference, not a scope filter — excluded from the badge count
  // so the filter button doesn't fill just because the user changed sort order.
  const activeCount = catFilter.length + (dateFilter ? 1 : 0) + (amountFilterActive(amountFilter) ? 1 : 0);

  const appliedTokenRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (filterToken === undefined || filterToken === appliedTokenRef.current) return;
    if (!initialFilter) return;
    appliedTokenRef.current = filterToken;
    setCatFilter(initialFilter.catIds ?? []);
    setQuery(initialFilter.merchantQuery ?? '');
    if (initialFilter.dateFrom && initialFilter.dateTo) {
      setDateFilter({ from: initialFilter.dateFrom, to: initialFilter.dateTo });
      setCalViewMonth(initialFilter.dateFrom.getMonth());
      setCalViewYear(initialFilter.dateFrom.getFullYear());
    } else {
      setDateFilter(null);
    }
    setAmountFilter(null);
    setSelectedDay(null);
  }, [filterToken]);

  const { scrollY, headerBgOpacity, iconScrolledOpacity, bgTranslateY } = useHeaderScroll();

  // The text box stays bound to `query` for instant feedback; repo scans key off
  // the debounced value so they don't run per keystroke.
  const debouncedQuery = useDebouncedValue(query, 220);
  const merchantQuery = debouncedQuery.trim() || undefined;
  const searchCategoryIds = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return categories
      .filter(cat => cat.label.toLowerCase().includes(q))
      .map(cat => cat.id);
  }, [categories, debouncedQuery]);

  const transactionScope = useMemo<TransactionSummaryQuery>(() => ({
    categoryIds: catFilter.length > 0 ? catFilter : undefined,
    merchantQuery,
    searchCategoryIds,
    ...amountBounds(amountFilter),
    ...dateRangeForFilter(dateFilter, false, CALENDAR_YEAR, CALENDAR_MONTH),
  }), [catFilter, merchantQuery, searchCategoryIds, amountFilter, dateFilter]);

  const activityQuery = useMemo<TransactionQuery>(() => ({
    ...transactionScope,
    limit: ACTIVITY_PAGE_SIZE,
    sort: sortBy,
  }), [sortBy, transactionScope]);

  const loadFirstActivityPage = useCallback((showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    setLoadingMore(false);
    try {
      const page = transactionsRepo.listPage(activityQuery);
      setActivityRows(page.rows);
      setNextCursor(page.nextCursor);
      setActivitySummary(transactionsRepo.getSummary(transactionScope));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [activityQuery, transactionScope, transactionsRepo]);

  useEffect(() => {
    loadFirstActivityPage(true);
  }, [loadFirstActivityPage, repoVersion]);

  const loadMoreActivity = useCallback(() => {
    if (loading || loadingMore || !nextCursor || selectedDay !== null) return;
    setLoadingMore(true);
    try {
      const page = transactionsRepo.listPage({ ...activityQuery, cursor: nextCursor });
      setActivityRows(rows => [...rows, ...page.rows]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [activityQuery, loading, loadingMore, nextCursor, selectedDay, transactionsRepo]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFirstActivityPage(false);
    setRefreshing(false);
  }, [loadFirstActivityPage]);

  const grouped = useMemo(() => {
    const g: Record<string, { txs: Transaction[]; total: number }> = {};
    activityRows.forEach(t => {
      if (!g[t.fullDate]) g[t.fullDate] = { txs: [], total: 0 };
      g[t.fullDate].txs.push(t);
      g[t.fullDate].total += t.amount;
    });
    return g;
  }, [activityRows]);

  const dayKeys = useMemo(() => Object.keys(grouped), [grouped]);
  const isFiltered = catFilter.length > 0 || dateFilter !== null || query.length > 0 || selectedDay !== null;

  // Expense-only count and sum for the filtered result set. Both exclude income
  // so count and total are consistent — no silent discrepancy between them.
  const filteredExpenseCount = activitySummary.expenseCount;
  const filteredSpendTotal = activitySummary.expenseTotal;

  // Average daily expense spend across visible day groups — used to add relative
  // weight signal to day headers without needing a budget target.
  const avgDaySpend = activitySummary.expenseDayCount > 0 ? filteredSpendTotal / activitySummary.expenseDayCount : 0;

  const calBills = useMemo(
    () => upcomingBills.filter(b => catFilter.length === 0 || catFilter.includes(b.cat)),
    [catFilter, upcomingBills],
  );

  const dayDetail = useMemo(() => {
    if (selectedDay == null) return { txs: [], bills: [], total: 0 };
    const selectedDate = new Date(calViewYear, calViewMonth, selectedDay);
    const txs = transactionsRepo.listPage({
      categoryIds: catFilter.length > 0 ? catFilter : undefined,
      merchantQuery,
      searchCategoryIds,
      from: startOfDay(selectedDate).toISOString(),
      to: endOfDay(selectedDate).toISOString(),
      sort: 'date-desc',
      limit: 200,
    }).rows;
    const bills = calBills.filter(b => {
      const pd = parseMonthDay(b.dueDate);
      return pd?.month === calViewMonth && pd.day === selectedDay;
    });
    return { txs, bills, total: txs.reduce((s, t) => s + t.amount, 0) };
  }, [selectedDay, calViewMonth, calViewYear, catFilter, merchantQuery, searchCategoryIds, calBills, transactionsRepo, repoVersion]);

  const dayDetailSpend = dayDetail.txs
    .filter(t => t.type !== 'income')
    .reduce((s, t) => s + t.amount, 0);

  const pWallpaper = makeP(true);
  const p          = makeP(theme.dark);
  const scrim      = makeScrim(theme.dark);

  const scrimTop    = scrim.top;
  const scrimMid    = scrim.mid;
  const scrimLower  = scrim.lower;
  const scrimBottom = scrim.bottom;

  const floorColor = deriveFloor(wallpaperFloorBase, theme.dark);
  const floorOpacity = scrollY.interpolate({
    inputRange: [0, SCREEN_H * 0.6],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const hasFilterPills = selectedDay !== null || dateFilter !== null || amountFilterActive(amountFilter) || catFilter.length > 0;
  const activityDayKeys = useMemo(
    () => !loading && !loadError && selectedDay === null && dayKeys.length > 0 ? dayKeys : [],
    [dayKeys, loadError, loading, selectedDay],
  );

  const renderActivityDay = useCallback((day: string) => (
    <SectionCard dark={theme.dark} style={S.dayGroupCard}>
      <DayGroup
        day={day}
        group={grouped[day]}
        theme={theme}
        cats={cats}
        categories={categories}
        onPress={handleOpenTx}
        onPrepare={handlePrepareTx}
        onDelete={handleDeleteTx}
        onSwipeOpen={handleSwipeOpen}
        onSwipeClose={handleSwipeClose}
        scrollRef={scrollViewRef}
        avgDaySpend={avgDaySpend}
        style={{ marginBottom: 0 }}
      />
    </SectionCard>
  ), [
    avgDaySpend,
    categories,
    cats,
    grouped,
    handleDeleteTx,
    handleOpenTx,
    handlePrepareTx,
    handleSwipeClose,
    handleSwipeOpen,
    theme,
  ]);

  // Stable renderItem identity. An inline `({item}) => ...` here gives the list a
  // fresh render function every screen render, which defeats VirtualizedList's
  // per-cell memoization and re-renders every visible (Swipeable) row on any
  // ActivityScreen state change — including opening the filter sheet, which then
  // waits behind that work before the native sheet can present.
  const renderActivityItem = useCallback(
    ({ item }: { item: unknown }) => renderActivityDay(String(item)),
    [renderActivityDay],
  );

  const selectedDateId = selectedDay !== null
    ? toDateId(new Date(calViewYear, calViewMonth, selectedDay))
    : undefined;
  const handleCalendarSelectDate = useCallback((dateId: string) => {
    const pressed = fromDateId(dateId);
    if (selectedDateId === dateId) {
      setSelectedDay(null);
    } else {
      setCalViewYear(pressed.getFullYear());
      setCalViewMonth(pressed.getMonth());
      setSelectedDay(pressed.getDate());
      setDateFilter(null);
    }
    setCalendarSheetOpen(false);
  }, [selectedDateId]);
  const handleCalendarSelectRange = useCallback(({ from, to }: { from: Date; to: Date }) => {
    setSelectedDay(null);
    setDateFilter({ from, to });
    setCalViewYear(from.getFullYear());
    setCalViewMonth(from.getMonth());
    setCalendarSheetOpen(false);
  }, []);
  const handleCalendarClear = useCallback(() => {
    setSelectedDay(null);
    setDateFilter(null);
  }, []);
  const closeCalendarSheet = useCallback(() => setCalendarSheetOpen(false), []);

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
        locations={[0, 0.30, 0.70, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floor — fades in over the wallpaper as the user scrolls down */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: floorColor, opacity: floorOpacity }]}
      />

      {/* ── Header — pinned ─────────────────────────────────────── */}
        <View style={[S.header, { paddingTop: insets.top + 8 }]}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: headerBgOpacity }]}
          >
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFill}
            />
            <View style={[S.headerDivider, {
              backgroundColor: theme.dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)',
            }]} />
          </Animated.View>
          <Pressable
            onPress={onOpenDrawer}
            pointerEvents="box-only"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[S.iconBtn, { backgroundColor: 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <HeaderIcon
              name="menu"
              wallpaperColor={pWallpaper.text}
              scrolledColor={p.text}
              scrolledOpacity={iconScrolledOpacity}
            />
          </Pressable>
          <View style={S.titleStack}>
            <Text style={[S.title, { color: pWallpaper.text }, DARK_TEXT_SHADOW]}>History</Text>
            <Animated.Text
              style={[S.title, S.titleScrolled, { color: p.text, opacity: iconScrolledOpacity }]}
              pointerEvents="none"
            >
              History
            </Animated.Text>
          </View>
          <ThemeToggle />
        </View>

        {/* ── Scrollable content ──────────────────────────────────── */}
        <AnimatedGHFlatList
          ref={scrollViewRef}
          data={activityDayKeys}
          keyExtractor={(day) => String(day)}
          renderItem={renderActivityItem}
          style={{ flex: 1 }}
          contentContainerStyle={[S.listContent, { paddingTop: insets.top + 64 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          onEndReached={loadMoreActivity}
          onEndReachedThreshold={0.7}
          onScrollBeginDrag={dismissOpenSwipe}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={pWallpaper.textSec}
              colors={[theme.accent.dot]}
              progressBackgroundColor={theme.dark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'}
            />
          }
          ListFooterComponent={loadingMore ? (
            <SectionCard dark={theme.dark} style={S.swipeHintCard}>
              <View style={S.loadingMore}>
                <Skeleton width={92} height={12} radius={4} onMedia={theme.dark} />
              </View>
            </SectionCard>
          ) : showSwipeHint && activityDayKeys.length > 0 ? (
            <SectionCard dark={theme.dark} style={S.swipeHintCard}>
              <SwipeHint dark={theme.dark} />
            </SectionCard>
          ) : null}
          ListHeaderComponent={(
            <View style={S.sectionStack}>
            {/* ── Search + filter — floats directly on wallpaper ── */}
            <View style={S.searchWrap}>
              <SearchFilterBar
                theme={theme}
                p={pWallpaper}
                query={query}
                onChangeQuery={setQuery}
                activeCount={activeCount}
                calendarActive={selectedDay !== null || (dateFilter !== null && typeof dateFilter !== 'string')}
                onOpenCalendar={() => setCalendarSheetOpen(true)}
                onOpenFilter={() => setFilterSheetOpen(true)}
              />

              {/* Active filter pills */}
              {hasFilterPills && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -16, marginTop: 12 }}
                  contentContainerStyle={[S.filterStripScroll, { paddingHorizontal: 16 }]}
                  keyboardShouldPersistTaps="handled"
                >
                  {selectedDay !== null && (
                    <View style={[S.filterPill, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.15)' : 'rgba(14,12,24,0.08)', borderWidth: 1, borderColor: p.hairline }]}>
                      <Icon name="cal" size={10} color={p.textSec} stroke={1.7} />
                      <Text style={[S.filterPillText, { color: p.text }]}>
                        {MONTHS[calViewMonth]} {selectedDay}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedDay(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Clear day selection"
                      >
                        <Icon name="close" size={10} color={p.textSec} stroke={2} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {dateFilter && typeof dateFilter === 'string' && (
                    <View style={[S.filterPill, { backgroundColor: theme.accent.fill }]}>
                      <Text style={[S.filterPillText, { color: theme.accent.ink }]}>
                        {DATE_PRESETS.find(p => p.id === dateFilter)?.label}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setDateFilter(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remove date filter"
                      >
                        <Icon name="close" size={10} color={theme.accent.ink} stroke={2} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {dateFilter && typeof dateFilter !== 'string' && (
                    <View style={[S.filterPill, { backgroundColor: theme.accent.fill }]}>
                      <Text style={[S.filterPillText, { color: theme.accent.ink }]}>
                        {fmtDate(dateFilter.from)} – {fmtDate(dateFilter.to)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setDateFilter(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remove date filter"
                      >
                        <Icon name="close" size={10} color={theme.accent.ink} stroke={2} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {amountFilterActive(amountFilter) && (
                    <View style={[S.filterPill, { backgroundColor: theme.accent.fill }]}>
                      <Icon name="wallet" size={10} color={theme.accent.ink} stroke={1.7} />
                      <Text style={[S.filterPillText, { color: theme.accent.ink }]}>
                        {amountFilterLabel(amountFilter)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setAmountFilter(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remove amount filter"
                      >
                        <Icon name="close" size={10} color={theme.accent.ink} stroke={2} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {catFilter.map(catId => {
                    const cat = cats[catId];
                    const groupColor = categoryGroupColor(catId, categories, theme.dark);
                    return (
                      <View key={catId} style={[S.filterPill, { backgroundColor: groupColor + '30' }]}>
                        <Icon name={cat?.icon} size={11} color={groupColor} stroke={1.6} />
                        <Text style={[S.filterPillText, { color: p.text }]}>{cat?.label}</Text>
                        <TouchableOpacity
                          onPress={() => setCatFilter(catFilter.filter(c => c !== catId))}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${cat?.label} filter`}
                        >
                          <Icon name="close" size={10} color={groupColor} stroke={2} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {loading ? (
              <SectionCard dark={theme.dark}>
                <TxListSkeleton dark={theme.dark} />
              </SectionCard>
            ) : loadError ? (
              <SectionCard dark={theme.dark}>
                <LoadError
                  theme={theme}
                  onRetry={() => { setLoadError(false); setLoading(true); setTimeout(() => setLoading(false), 1100); }}
                />
              </SectionCard>
            ) : selectedDay !== null ? (
              <SectionCard dark={theme.dark}>
                <>
                  {dayDetail.txs.length === 0 && dayDetail.bills.length === 0 ? (
                    <View style={S.detailEmptyWrap}>
                      <Host
                        matchContents
                        colorScheme={theme.dark ? 'dark' : 'light'}
                        style={S.unavailableHost}
                      >
                        <ContentUnavailableView
                          title="No activity"
                          systemImage="calendar"
                          description={`Nothing recorded on ${MONTHS[calViewMonth]} ${selectedDay}.`}
                        />
                      </Host>
                    </View>
                  ) : (
                    <View>
                      <View style={S.summaryRow}>
                        <Text style={[S.dayLabel, { color: p.textTer }]}>
                          {MONTHS[calViewMonth]} {selectedDay}
                        </Text>
                        {dayDetail.txs.length === 1 ? (
                          <Text style={[S.summaryLabel, { color: p.textSec }]}>1 transaction</Text>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 0 }}>
                            <Text style={[S.summaryLabel, { color: p.textSec }]}>{dayDetail.txs.length} transactions · </Text>
                            <Money value={dayDetailSpend} theme={theme} size={12} color={p.textSec} />
                            <Text style={[S.summaryLabel, { color: p.textSec }]}> total</Text>
                          </View>
                        )}
                      </View>
                      {dayDetail.txs.map((tx, i) => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          theme={theme}
                          cats={cats}
                          categories={categories}
                          onPress={() => handleOpenTx(tx)}
                          last={i === dayDetail.txs.length - 1 && dayDetail.bills.length === 0}
                        />
                      ))}
                      {dayDetail.bills.map((bill, i) => (
                        <BillRow key={bill.id} bill={bill} theme={theme} categories={categories} last={i === dayDetail.bills.length - 1} />
                      ))}
                    </View>
                  )}
                </>
              </SectionCard>
            ) : (
              dayKeys.length === 0 ? (
                <SectionCard dark={theme.dark}>
                  <EmptyState
                    theme={theme}
                    isFiltered={isFiltered}
                    onClearFilters={() => { setQuery(''); setCatFilter([]); setDateFilter(null); setAmountFilter(null); setSelectedDay(null); setSortBy('date-desc'); }}
                  />
                </SectionCard>
              ) : (
                <>
                  {isFiltered && (
                    <SectionCard dark={theme.dark}>
                      <View
                        accessibilityLiveRegion="polite"
                        style={[S.summaryRow, S.summaryRowSolo]}
                      >
                        <Text style={[S.summaryLabel, { color: p.textSec }]}>
                          {filteredExpenseCount} {filteredExpenseCount === 1 ? 'expense' : 'expenses'}
                        </Text>
                        <Money value={filteredSpendTotal} theme={theme} />
                      </View>
                    </SectionCard>
                  )}
                </>
              )
            )}

            </View>
          )}
        />

        <CalendarSheet
          visible={calendarSheetOpen}
          theme={theme}
          selectedDateId={selectedDateId}
          dateFilter={dateFilter}
          initialMonthDate={new Date(calViewYear, calViewMonth, 1)}
          transactionsRepo={transactionsRepo}
          repoVersion={repoVersion}
          categories={categories}
          catFilter={catFilter}
          merchantQuery={merchantQuery}
          searchCategoryIds={searchCategoryIds}
          amountFilter={amountFilter}
          onSelectDate={handleCalendarSelectDate}
          onSelectRange={handleCalendarSelectRange}
          onClear={handleCalendarClear}
          onClose={closeCalendarSheet}
        />

        <FilterSheet
          visible={filterSheetOpen}
          theme={theme}
          catFilter={catFilter}
          dateFilter={dateFilter}
          amountFilter={amountFilter}
          sortBy={sortBy}
          categories={categories}
          cats={cats}
          setCatFilter={setCatFilter}
          setDateFilter={handleSetDateFilter}
          setAmountFilter={setAmountFilter}
          setSortBy={setSortBy}
          clearDay={clearSelectedDay}
          onClose={closeFilterSheet}
        />

        <Toast
          theme={theme}
          message={pendingUndo ? 'Transaction deleted' : null}
          actionLabel="Undo"
          onAction={handleUndoDelete}
          onDismiss={() => setPendingUndo(null)}
        />
    </View>
  );
}

// ─── CalendarSheet ───────────────────────────────────────────────────────────

const HISTORY_CALENDAR_INSTANCE = 'history-calendar-sheet';
const HISTORY_CAL_DAY_HEIGHT = 58;
const HISTORY_CAL_WEEK_HEADER_HEIGHT = 22;
const HISTORY_CAL_MONTH_HEADER_HEIGHT = 34;
const HISTORY_CAL_ROW_GAP = 8;
const HISTORY_CAL_MONTH_GAP = 24;

function formatCalendarDay(date: Date) {
  return String(date.getDate());
}

function formatCalendarWeekDay(date: Date) {
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][date.getDay()];
}

function formatCalendarMonth(date: Date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function CalendarSheet({
  visible,
  theme,
  selectedDateId,
  dateFilter,
  initialMonthDate,
  transactionsRepo,
  repoVersion,
  categories,
  catFilter,
  merchantQuery,
  searchCategoryIds,
  amountFilter,
  onSelectDate,
  onSelectRange,
  onClear,
  onClose,
}: {
  visible: boolean;
  theme: Theme;
  selectedDateId?: string;
  dateFilter: DateFilter;
  initialMonthDate: Date;
  transactionsRepo: TransactionsRepo;
  repoVersion: number;
  categories: Category[];
  catFilter: string[];
  merchantQuery?: string;
  searchCategoryIds: string[];
  amountFilter: AmountFilter;
  onSelectDate: (dateId: string) => void;
  onSelectRange: (range: { from: Date; to: Date }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const presentedRef = useRef(false);
  const [contentReady, setContentReady] = useState(false);
  const activeRange = dateFilter && typeof dateFilter !== 'string'
    ? { startId: toDateId(dateFilter.from), endId: toDateId(dateFilter.to) }
    : null;
  const [mode, setMode] = useState<CalendarSelectMode>(activeRange ? 'range' : 'day');
  const [draftRange, setDraftRange] = useState<{ startId?: string; endId?: string }>({});

  useEffect(() => {
    if (activeRange) {
      setMode('range');
      setDraftRange(activeRange);
    }
  }, [activeRange?.startId, activeRange?.endId]);

  useEffect(() => {
    if (contentReady) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => setContentReady(true), visible ? 80 : 420);
    });
    return () => {
      task.cancel?.();
      if (timeout !== null) clearTimeout(timeout);
    };
  }, [contentReady, visible]);

  useEffect(() => {
    if (visible) {
      if (!presentedRef.current) {
        presentedRef.current = true;
        sheetRef.current?.snapToIndex(0);
      }
    } else if (presentedRef.current) {
      presentedRef.current = false;
      sheetRef.current?.close();
    }
  }, [visible]);

  const handleSheetChange = useCallback((idx: number) => {
    if (idx === -1 && presentedRef.current) {
      presentedRef.current = false;
      onClose();
    }
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

  const rangeStartId = draftRange.startId ?? activeRange?.startId;
  const rangeEndId = draftRange.endId ?? activeRange?.endId;
  const activeRanges = useMemo(() => {
    if (mode === 'range' && rangeStartId) {
      return [{ startId: rangeStartId, endId: rangeEndId ?? rangeStartId }];
    }
    return selectedDateId ? [{ startId: selectedDateId, endId: selectedDateId }] : [];
  }, [mode, rangeEndId, rangeStartId, selectedDateId]);
  const handleDatePress = useCallback((dateId: string) => {
    if (mode === 'day') {
      onSelectDate(dateId);
      return;
    }
    if (!rangeStartId || rangeEndId) {
      setDraftRange({ startId: dateId });
      return;
    }
    if (dateId === rangeStartId) {
      setDraftRange({});
      return;
    }
    const start = fromDateId(rangeStartId);
    const end = fromDateId(dateId);
    const ordered = start <= end ? { from: start, to: end } : { from: end, to: start };
    setDraftRange({ startId: toDateId(ordered.from), endId: toDateId(ordered.to) });
    onSelectRange(ordered);
  }, [mode, onSelectDate, onSelectRange, rangeEndId, rangeStartId]);
  const handleClear = useCallback(() => {
    setDraftRange({});
    onClear();
  }, [onClear]);
  const calendarTheme = useMemo<CalendarTheme>(() => ({
    rowMonth: {
      content: {
        color: theme.text,
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'left',
      },
    },
    itemWeekName: {
      content: {
        color: theme.textSec,
        fontSize: 11,
        fontWeight: '500',
      },
    },
  }), [theme.text, theme.textSec]);
  const handleIndicatorStyle = useMemo(() => ({ backgroundColor: theme.textTer }), [theme.textTer]);
  const backgroundStyle = useMemo(() => ({ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }), [theme.surface]);
  const calendarInitialMonthId = useMemo(() => toDateId(initialMonthDate), [initialMonthDate]);
  const listExtraData = useMemo(
    () => ({
      selectedDateId,
      mode,
      rangeStartId,
      rangeEndId,
      repoVersion,
      dark: theme.dark,
      catKey: catFilter.join('|'),
      merchantQuery,
      searchKey: searchCategoryIds.join('|'),
      amountKey: amountFilterLabel(amountFilter),
    }),
    [amountFilter, catFilter, merchantQuery, mode, rangeEndId, rangeStartId, repoVersion, searchCategoryIds, selectedDateId, theme.dark],
  );
  const renderMonth = useCallback(({ item }: { item: CalendarMonthEnhanced }) => (
    <HistoryCalendarMonth
      item={item}
      theme={theme}
      transactionsRepo={transactionsRepo}
      repoVersion={repoVersion}
      categories={categories}
      catFilter={catFilter}
      merchantQuery={merchantQuery}
      searchCategoryIds={searchCategoryIds}
      amountFilter={amountFilter}
      selectedDateId={selectedDateId}
      mode={mode}
      onSelectDate={handleDatePress}
    />
  ), [
    catFilter,
    categories,
    merchantQuery,
    amountFilter,
    repoVersion,
    searchCategoryIds,
    selectedDateId,
    mode,
    theme,
    transactionsRepo,
    handleDatePress,
  ]);
  const hasCalendarSelection = Boolean(selectedDateId || rangeStartId);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['82%']}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
    >
      {!contentReady ? (
        <View style={{ flex: 1, backgroundColor: theme.surface }} />
      ) : (
        <View style={[CS.sheetContent, { backgroundColor: theme.surface }]}>
          <View style={[CS.sheetHeader, { borderBottomColor: theme.sep }]}>
            <View style={CS.headerLeft}>
              <ScreenExitButton
                variant="close"
                onPress={onClose}
                tint={theme.textSec}
                fallbackBg={theme.chipBg}
                accessibilityLabel="Close calendar"
              />
              <Text style={[CS.sheetTitle, { color: theme.text }]}>Calendar</Text>
            </View>
            <View style={CS.headerActions}>
              {hasCalendarSelection && (
                <TouchableOpacity
                  onPress={handleClear}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear calendar selection"
                >
                  <Text style={[CS.clearLink, { color: theme.accent.dot }]}>Clear</Text>
                </TouchableOpacity>
              )}
              <Host ignoreSafeArea="all" style={CS.modePickerHost}>
                <Picker
                  selection={mode === 'range' ? 1 : 0}
                  onSelectionChange={(val) => {
                    const next = Number(val) === 1 ? 'range' : 'day';
                    setMode(next);
                    if (next === 'range' && activeRange) setDraftRange(activeRange);
                  }}
                  modifiers={[
                    pickerStyle('segmented'),
                    tint(theme.accent.dot),
                    environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                  ]}
                >
                  <SwiftText modifiers={[tag(0)]}>Day</SwiftText>
                  <SwiftText modifiers={[tag(1)]}>Range</SwiftText>
                </Picker>
              </Host>
            </View>
          </View>

          <Calendar.List
            calendarInstanceId={HISTORY_CALENDAR_INSTANCE}
            calendarInitialMonthId={calendarInitialMonthId}
            calendarActiveDateRanges={activeRanges}
            calendarFirstDayOfWeek="monday"
            calendarPastScrollRangeInMonths={8}
            calendarFutureScrollRangeInMonths={2}
            calendarDayHeight={HISTORY_CAL_DAY_HEIGHT}
            calendarWeekHeaderHeight={HISTORY_CAL_WEEK_HEADER_HEIGHT}
            calendarMonthHeaderHeight={HISTORY_CAL_MONTH_HEADER_HEIGHT}
            calendarRowVerticalSpacing={HISTORY_CAL_ROW_GAP}
            calendarRowHorizontalSpacing={4}
            calendarSpacing={HISTORY_CAL_MONTH_GAP}
            calendarColorScheme={theme.dark ? 'dark' : 'light'}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: Math.max(insets.bottom, 16) + 24,
            }}
            extraData={listExtraData}
            getCalendarDayFormat={formatCalendarDay}
            getCalendarWeekDayFormat={formatCalendarWeekDay}
            getCalendarMonthFormat={formatCalendarMonth}
            onCalendarDayPress={onSelectDate}
            renderItem={renderMonth}
            theme={calendarTheme}
          />
        </View>
      )}
    </BottomSheet>
  );
}

const HistoryCalendarMonth = React.memo(function HistoryCalendarMonth({
  item,
  theme,
  transactionsRepo,
  repoVersion,
  categories,
  catFilter,
  merchantQuery,
  searchCategoryIds,
  amountFilter,
  selectedDateId,
  mode,
  onSelectDate,
}: {
  item: CalendarMonthEnhanced;
  theme: Theme;
  transactionsRepo: TransactionsRepo;
  repoVersion: number;
  categories: Category[];
  catFilter: string[];
  merchantQuery?: string;
  searchCategoryIds: string[];
  amountFilter: AmountFilter;
  selectedDateId?: string;
  mode: CalendarSelectMode;
  onSelectDate: (dateId: string) => void;
}) {
  const year = item.date.getFullYear();
  const month = item.date.getMonth();
  const todayId = toDateId(NOW);
  const calendar = useMemo(() => buildCalendar({
    calendarMonthId: item.id,
    calendarActiveDateRanges: item.calendarProps.calendarActiveDateRanges,
    calendarDisabledDateIds: item.calendarProps.calendarDisabledDateIds,
    calendarFirstDayOfWeek: item.calendarProps.calendarFirstDayOfWeek ?? 'monday',
    calendarFormatLocale: item.calendarProps.calendarFormatLocale,
    calendarMaxDateId: item.calendarProps.calendarMaxDateId,
    calendarMinDateId: item.calendarProps.calendarMinDateId,
    getCalendarDayFormat: item.calendarProps.getCalendarDayFormat,
    getCalendarMonthFormat: item.calendarProps.getCalendarMonthFormat,
    getCalendarWeekDayFormat: item.calendarProps.getCalendarWeekDayFormat,
  }), [item]);
  const marksByDay = useMemo(() => {
    const rows = transactionsRepo.getCalendarMarks({
      year,
      month,
      categoryIds: catFilter.length > 0 ? catFilter : undefined,
      merchantQuery,
      searchCategoryIds,
      ...amountBounds(amountFilter),
    });
    const groupedRows: Record<number, string[]> = {};
    rows.forEach(mark => {
      if (!groupedRows[mark.day]) groupedRows[mark.day] = [];
      groupedRows[mark.day].push(mark.cat);
    });
    return groupedRows;
  }, [amountFilter, catFilter, merchantQuery, month, repoVersion, searchCategoryIds, transactionsRepo, year]);

  return (
    <View style={{ paddingBottom: HISTORY_CAL_MONTH_GAP }}>
      <Text style={[CS.monthTitle, { color: theme.text }]}>{calendar.calendarRowMonth}</Text>
      <View style={CS.weekHeaderRow}>
        {calendar.weekDaysList.map((day, i) => (
          <Text key={`${item.id}-week-${i}`} style={[CS.weekName, { color: theme.textSec }]}>
            {day}
          </Text>
        ))}
      </View>
      <View style={CS.monthGrid}>
        {calendar.weeksList.map((week, weekIndex) => (
          <View key={`${item.id}-week-row-${weekIndex}`} style={CS.weekRow}>
            {week.map(day => {
              if (day.isDifferentMonth) {
                return <View key={day.id} style={CS.daySlot} />;
              }

              const dayCats = marksByDay[day.date.getDate()] ?? [];
              const rangeActive = mode === 'range' && day.state === 'active';
              const rangeEndpoint = rangeActive && (day.isStartOfRange || day.isEndOfRange);
              const selected = mode === 'day' ? day.id === selectedDateId : rangeEndpoint;
              const rangeMiddle = rangeActive && !rangeEndpoint;
              const today = day.id === todayId;
              const dayText = selected ? theme.accent.ink : theme.text;
              const mutedText = selected ? theme.accent.ink : theme.textSec;

              return (
                <TouchableOpacity
                  key={day.id}
                  onPress={() => onSelectDate(day.id)}
                  activeOpacity={0.78}
                  style={[
                    CS.daySlot,
                    rangeMiddle && { backgroundColor: theme.chipBg },
                    selected && { backgroundColor: theme.accent.fill },
                    !rangeActive && today && { borderWidth: 1, borderColor: theme.textSec },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={day.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  accessibilityState={{ selected }}
                >
                  <Text style={[CS.dayNumber, { color: dayText }]}>
                    {day.displayLabel}
                  </Text>
                  <DayActivityMarks
                    catIds={dayCats}
                    theme={theme}
                    categories={categories}
                    textColor={mutedText}
                    selected={selected}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
});

const DayActivityMarks = React.memo(function DayActivityMarks({
  catIds,
  theme,
  categories,
  textColor,
  selected,
}: {
  catIds: string[];
  theme: Theme;
  categories: Category[];
  textColor: string;
  selected: boolean;
}) {
  if (catIds.length === 0) return <View style={CS.dayMarksPlaceholder} />;

  const visible = catIds.slice(0, 2);
  const remaining = catIds.length - visible.length;
  const uniqueColors = visible.map(catId => categoryGroupColor(catId, categories, theme.dark));
  const countLabel = remaining > 0 ? `+${remaining}` : '';

  return (
    <View style={CS.dayMarksRow}>
      <View style={CS.dayDots}>
        {uniqueColors.map((color, index) => (
          <View
            key={`${color}-${index}`}
            style={[
              CS.dayDot,
              {
                backgroundColor: selected ? theme.accent.ink : color,
                marginLeft: index === 0 ? 0 : -3,
              },
            ]}
          />
        ))}
      </View>
      {countLabel.length > 0 && (
        <Text style={[CS.dayCount, { color: textColor }]}>{countLabel}</Text>
      )}
    </View>
  );
});

// ─── FilterSheet ─────────────────────────────────────────────────────────────

const FilterSheet = React.memo(function FilterSheet({
  visible, theme, catFilter, dateFilter, amountFilter, sortBy,
  categories, cats, setCatFilter, setDateFilter, setAmountFilter, setSortBy, clearDay, onClose,
}: {
  visible: boolean;
  theme: Theme;
  catFilter: string[];
  dateFilter: DateFilter;
  amountFilter: AmountFilter;
  sortBy: SortOrder;
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  setCatFilter: (c: string[]) => void;
  setDateFilter: (d: DateFilter) => void;
  setAmountFilter: (a: AmountFilter) => void;
  setSortBy: (s: SortOrder) => void;
  clearDay: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const [localCatFilter, setLocalCatFilter] = useState(catFilter);
  const pendingLocalCatCommitRef = useRef(false);
  const catCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catCommitTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const [localMinDraft, setLocalMinDraft] = useState(formatAmountDraft(amountFilter?.min));
  const [localMaxDraft, setLocalMaxDraft] = useState(formatAmountDraft(amountFilter?.max));
  const [activeAmountField, setActiveAmountField] = useState<'min' | 'max' | null>(null);
  const pendingAmountCommitRef = useRef(false);
  const amountCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountCommitTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const localMinDraftRef = useRef(localMinDraft);
  const localMaxDraftRef = useRef(localMaxDraft);

  useEffect(() => {
    if (visible) {
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
  }, [visible]);

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

  // The sheet sits in the tree from the moment History mounts, but its body —
  // every category row plus two SwiftUI menu Hosts — is warmed after the screen
  // settles so the first presentation does not pay that mount cost.
  const [everVisible, setEverVisible] = useState(visible);
  useEffect(() => {
    if (visible && !everVisible) setEverVisible(true);
  }, [visible, everVisible]);
  useEffect(() => {
    if (everVisible) return;
    const task = InteractionManager.runAfterInteractions(() => setEverVisible(true));
    return () => task.cancel?.();
  }, [everVisible]);

  useEffect(() => {
    if (pendingLocalCatCommitRef.current) return;
    setLocalCatFilter(catFilter);
  }, [catFilter]);

  useEffect(() => {
    if (pendingAmountCommitRef.current) return;
    const nextMin = formatAmountDraft(amountFilter?.min);
    const nextMax = formatAmountDraft(amountFilter?.max);
    localMinDraftRef.current = nextMin;
    localMaxDraftRef.current = nextMax;
    setLocalMinDraft(nextMin);
    setLocalMaxDraft(nextMax);
  }, [amountFilter]);

  useEffect(() => () => {
    if (catCommitTimerRef.current !== null) clearTimeout(catCommitTimerRef.current);
    catCommitTaskRef.current?.cancel?.();
    if (amountCommitTimerRef.current !== null) clearTimeout(amountCommitTimerRef.current);
    amountCommitTaskRef.current?.cancel?.();
  }, []);

  const scheduleCatFilterCommit = useCallback((next: string[]) => {
    pendingLocalCatCommitRef.current = true;
    if (catCommitTimerRef.current !== null) clearTimeout(catCommitTimerRef.current);
    catCommitTaskRef.current?.cancel?.();
    catCommitTimerRef.current = setTimeout(() => {
      catCommitTimerRef.current = null;
      catCommitTaskRef.current = InteractionManager.runAfterInteractions(() => {
        startTransition(() => setCatFilter(next));
        pendingLocalCatCommitRef.current = false;
        catCommitTaskRef.current = null;
      });
    }, FILTER_COMMIT_DELAY_MS);
  }, [setCatFilter]);

  const commitCatFilter = useCallback((next: string[]) => {
    setLocalCatFilter(next);
    scheduleCatFilterCommit(next);
  }, [scheduleCatFilterCommit]);

  const toggleCatFilter = useCallback((catId: string) => {
    setLocalCatFilter(current => {
      const next = current.includes(catId)
        ? current.filter(id => id !== catId)
        : [...current, catId];
      scheduleCatFilterCommit(next);
      return next;
    });
  }, [scheduleCatFilterCommit]);

  const scheduleAmountFilterCommit = useCallback((minDraft: string, maxDraft: string) => {
    pendingAmountCommitRef.current = true;
    if (amountCommitTimerRef.current !== null) clearTimeout(amountCommitTimerRef.current);
    amountCommitTaskRef.current?.cancel?.();
    amountCommitTimerRef.current = setTimeout(() => {
      amountCommitTimerRef.current = null;
      amountCommitTaskRef.current = InteractionManager.runAfterInteractions(() => {
        startTransition(() => setAmountFilter(amountFilterFromDrafts(minDraft, maxDraft)));
        pendingAmountCommitRef.current = false;
        amountCommitTaskRef.current = null;
      });
    }, FILTER_COMMIT_DELAY_MS);
  }, [setAmountFilter]);

  const handleAmountKey = useCallback((key: KeypadKey) => {
    if (!activeAmountField) return;
    if (activeAmountField === 'min') {
      setLocalMinDraft(current => {
        const next = applyKeypadKey(current, key);
        localMinDraftRef.current = next;
        scheduleAmountFilterCommit(next, localMaxDraftRef.current);
        return next;
      });
      return;
    }
    setLocalMaxDraft(current => {
      const next = applyKeypadKey(current, key);
      localMaxDraftRef.current = next;
      scheduleAmountFilterCommit(localMinDraftRef.current, next);
      return next;
    });
  }, [activeAmountField, scheduleAmountFilterCommit]);

  const clearAmountFilter = useCallback(() => {
    if (amountCommitTimerRef.current !== null) {
      clearTimeout(amountCommitTimerRef.current);
      amountCommitTimerRef.current = null;
    }
    amountCommitTaskRef.current?.cancel?.();
    amountCommitTaskRef.current = null;
    pendingAmountCommitRef.current = false;
    localMinDraftRef.current = '0.00';
    localMaxDraftRef.current = '0.00';
    setLocalMinDraft('0.00');
    setLocalMaxDraft('0.00');
    setActiveAmountField(null);
    setAmountFilter(null);
  }, [setAmountFilter]);

  // Picker index ↔ dateFilter state mapping.
  // 0 = Any time, 1-4 = presets (in DATE_PRESETS order). Custom ranges are set
  // from the main calendar sheet and are displayed here as the current label.
  const datePickerIdx = typeof dateFilter === 'string'
      ? DATE_PRESETS.findIndex(p => p.id === dateFilter) + 1
      : 0;

  const handleDatePickerChange = useCallback((idx: number) => {
    if (idx === 0) {
      setDateFilter(null);
    } else if (idx >= 1 && idx <= 4) {
      setDateFilter(DATE_PRESETS[idx - 1].id);
    }
  }, [setDateFilter]);

  const clearAll = () => {
    commitCatFilter([]);
    setDateFilter(null);
    clearAmountFilter();
    setSortBy('date-desc');
    clearDay();
  };

  const hasAmountFilter = amountFilterActive(amountFilterFromDrafts(localMinDraft, localMaxDraft));
  const amountInvalid = amountRangeInvalid(localMinDraft, localMaxDraft);
  const activeCount = localCatFilter.length + (dateFilter ? 1 : 0) + (hasAmountFilter ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);

  const customLabel = dateFilter && typeof dateFilter !== 'string'
    ? `${fmtDate(dateFilter.from)} – ${fmtDate(dateFilter.to)}`
    : null;

  const sortIdx = SORT_OPTIONS.findIndex(o => o.id === sortBy);
  // Trigger label for the Date menu (mirrors menu indices: 0 = Any time, 1-4 = presets, 5 = Custom).
  const dateMenuLabel = datePickerIdx === 0
    ? (customLabel ?? 'Any time')
    : DATE_PRESETS[datePickerIdx - 1]?.label ?? 'Any time';
  const groupedCategories = useMemo(
    () => (['needs', 'wants', 'savings'] as const).map(key => ({
      key,
      label: key === 'needs' ? 'Needs' : key === 'wants' ? 'Wants' : 'Savings',
      cats: categories.filter(cat => cat.group === key).map(cat => cat.id),
    })).filter(g => g.cats.length > 0),
    [categories],
  );

  // The Sort and Date triggers are SwiftUI `Menu`s, each in its own `Host`.
  // Reconciling them across the RN↔SwiftUI bridge is expensive, so memoize the
  // whole subtree: a category toggle (which re-renders this sheet) leaves these
  // element references untouched and the bridge skips them entirely.
  const sortMenu = useMemo(() => (
    <View style={FS.sortRow}>
      <Text style={[FS.sortRowLabel, { color: theme.text }]}>Sort by</Text>
      <Host ignoreSafeArea="all" style={{ width: 160, height: 28 }}>
        <Menu
          label={
            <View style={[FS.menuTrigger, { width: 160, height: 28, justifyContent: 'flex-end' }]}>
              <Text style={[FS.menuTriggerText, { color: theme.accent.dot }]} numberOfLines={1}>
                {SORT_OPTIONS[sortIdx >= 0 ? sortIdx : 0]?.label}
              </Text>
              <Icon name="chevDown" size={11} color={theme.accent.dot} stroke={2} />
            </View>
          }
        >
          {SORT_OPTIONS.map((o, idx) => (
            <SwiftButton
              key={String(idx)}
              systemImage={idx === (sortIdx >= 0 ? sortIdx : 0) ? 'checkmark' : undefined}
              onPress={() => setSortBy(o.id)}
              label={o.label}
            />
          ))}
        </Menu>
      </Host>
    </View>
  ), [sortIdx, theme.text, theme.accent.dot, setSortBy]);

  const dateMenu = useMemo(() => (
    <View style={FS.sortRow}>
      <Text style={[FS.sortRowLabel, { color: theme.text }]}>Date</Text>
      <Host ignoreSafeArea="all" style={{ width: 200, height: 28 }}>
        <Menu
          label={
            <View style={[FS.menuTrigger, { width: 200, height: 28, justifyContent: 'flex-end' }]}>
              <Text style={[FS.menuTriggerText, { color: theme.accent.dot }]} numberOfLines={1}>
                {dateMenuLabel}
              </Text>
              <Icon name="chevDown" size={11} color={theme.accent.dot} stroke={2} />
            </View>
          }
        >
          <SwiftButton
            key="0"
            systemImage={datePickerIdx === 0 ? 'checkmark' : undefined}
            onPress={() => handleDatePickerChange(0)}
            label="Any time"
          />
          {DATE_PRESETS.map((o, i) => (
            <SwiftButton
              key={String(i + 1)}
              systemImage={datePickerIdx === i + 1 ? 'checkmark' : undefined}
              onPress={() => handleDatePickerChange(i + 1)}
              label={o.label}
            />
          ))}
        </Menu>
      </Host>
    </View>
  ), [datePickerIdx, dateMenuLabel, theme.text, theme.accent.dot, handleDatePickerChange]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['88%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
    >
      {!everVisible ? (
        <View style={{ flex: 1, backgroundColor: theme.surface }} />
      ) : (
        <View style={[FS.content, { backgroundColor: theme.surface }]}>

          {/* ── Header ──────────────────────────────────────── */}
          <View style={[FS.header, { borderBottomColor: theme.sep }]}>
            <View style={FS.headerLeft}>
              <ScreenExitButton
                variant="close"
                onPress={onClose}
                tint={theme.textSec}
                fallbackBg={theme.chipBg}
                accessibilityLabel="Done"
              />
              <Text style={[FS.title, { color: theme.text }]}>Filters</Text>
            </View>
            {activeCount > 0 && (
              <TouchableOpacity
                onPress={clearAll}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
              >
                <Text style={[FS.clearLink, { color: theme.accent.dot }]}>Clear all</Text>
              </TouchableOpacity>
            )}
          </View>

          <BottomSheetScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: (activeAmountField ? 420 : Math.max(insets.bottom, 16)) + 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Sort by — UIKit menu (styled trigger) ──────── */}
            {sortMenu}

            {/* ── Date — UIKit menu (styled trigger) ─────────── */}
            {dateMenu}

            {/* ── Amount range ───────────────────────────────── */}
            <View style={FS.amountSection}>
              <View style={FS.amountHeader}>
                <Text style={[FS.sortRowLabel, { color: theme.text }]}>Amount</Text>
                {hasAmountFilter && (
                  <TouchableOpacity
                    onPress={clearAmountFilter}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear amount filter"
                  >
                    <Text style={[FS.amountClear, { color: theme.accent.dot }]}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[FS.amountCard, { backgroundColor: theme.chipBg }]}>
                <AmountRangeField
                  label="Min"
                  value={localMinDraft}
                  active={activeAmountField === 'min'}
                  theme={theme}
                  onPress={() => setActiveAmountField('min')}
                />
                <View style={[FS.amountDivider, { backgroundColor: theme.sep }]} />
                <AmountRangeField
                  label="Max"
                  value={localMaxDraft}
                  active={activeAmountField === 'max'}
                  theme={theme}
                  onPress={() => setActiveAmountField('max')}
                />
              </View>
              {amountInvalid && (
                <Text style={[FS.amountHint, { color: OVER_DOT }]}>
                  Min should be less than max
                </Text>
              )}
            </View>

            {/* ── Category rows ─────────────────────────────── */}
            {groupedCategories.map(g => {
              const groupColor = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
              return (
                <View key={g.key}>
                  <View style={FS.groupDivider}>
                    <View style={{ height: 1, width: 14, backgroundColor: groupColor + '55' }} />
                    <Text style={[FS.groupDividerLabel, { color: groupColor, fontWeight: '600' }]}>
                      {g.label}
                    </Text>
                    <View style={{ height: 1, flex: 1, backgroundColor: groupColor + '55' }} />
                  </View>

                  {g.cats.length === 0 ? (
                    <Text style={[FS.groupEmpty, { color: theme.textSec }]}>
                      No savings transactions yet
                    </Text>
                  ) : (
                    <View style={FS.catGrid}>
                      {g.cats.map(catId => {
                        const c      = cats[catId];
                        const active = localCatFilter.includes(catId);
                        return (
                          <TouchableOpacity
                            key={catId}
                            onPress={() => toggleCatFilter(catId)}
                            activeOpacity={0.75}
                            style={[
                              FS.catChip,
                              {
                                backgroundColor: active ? groupColor : theme.chipBg,
                                borderColor: active ? groupColor : theme.hairline,
                              },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={c.label}
                          >
                            <View style={[
                              FS.catChipIcon,
                              { backgroundColor: active ? 'rgba(255,255,255,0.18)' : groupColor + '24' },
                            ]}>
                              <Icon name={c.icon} size={12} color={active ? '#fff' : groupColor} stroke={1.6} />
                            </View>
                            <Text
                              numberOfLines={1}
                              style={[
                                FS.catChipName,
                                { color: active ? '#fff' : theme.text },
                              ]}
                            >
                              {c.label}
                            </Text>
                            {active && <Icon name="check" size={12} color="#fff" stroke={2} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </BottomSheetScrollView>
          <PopupNumericKeypad
            visible={activeAmountField !== null}
            theme={theme}
            onKey={handleAmountKey}
            onDone={() => setActiveAmountField(null)}
            zIndex={80}
          />
        </View>
      )}
    </BottomSheetModal>
  );
});

function AmountRangeField({
  label, value, active, theme, onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  const hasValue = parseAmountDraft(value) !== undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} amount`}
      style={[
        FS.amountField,
        active && { backgroundColor: theme.accent.fill },
      ]}
    >
      <Text style={[FS.amountFieldLabel, { color: active ? theme.accent.ink : theme.textSec }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[FS.amountFieldValue, { color: active ? theme.accent.ink : hasValue ? theme.text : theme.textTer }]}
      >
        {hasValue ? `$${value}` : 'Any'}
      </Text>
    </Pressable>
  );
}

// ─── DayGroup ────────────────────────────────────────────────────────────────

function DayGroup({
  day, group, theme, cats, categories, onPress, onDelete,
  onPrepare, onSwipeOpen, onSwipeClose, scrollRef, avgDaySpend, style,
}: {
  day: string;
  group: { txs: Transaction[]; total: number };
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  onPress: (tx: Transaction) => void;
  onPrepare?: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onSwipeOpen: (ref: Swipeable) => void;
  onSwipeClose: () => void;
  scrollRef: React.RefObject<any>;
  avgDaySpend: number;
  style?: any;
}) {
  const p     = makeP(theme.dark);
  const { txs } = group;
  const expenseCount = txs.filter(t => t.type !== 'income').length;
  const spendTotal = txs.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0);
  // Relative spend weight: days above 2× the average get caution amber;
  // days above average get full-weight text instead of secondary.
  const isHeavyDay    = avgDaySpend > 0 && spendTotal > avgDaySpend * 2;
  const isAboveAvg    = avgDaySpend > 0 && spendTotal > avgDaySpend;
  const dayTotalColor = isHeavyDay ? cautionText(theme.dark) : isAboveAvg ? p.text : p.textSec;
  const label =
    txs[0]?.when === 'today'     ? 'Today'
    : txs[0]?.when === 'yesterday' ? 'Yesterday'
    : day;

  return (
    <View style={[{ marginBottom: 16 }, style]}>
      <View style={S.dayHeader}>
        <Text style={[S.dayLabel, { color: p.textTer }]}>{label}</Text>
        <Text style={[S.dayTotal, { color: expenseCount > 1 ? dayTotalColor : p.textTer }]}>
          {expenseCount > 1 ? `$${spendTotal.toFixed(2)} total` : `${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}`}
        </Text>
      </View>
      <View style={{ overflow: 'hidden' }}>
        {txs.map((tx, i) => (
          <SwipeRow
            key={tx.id}
            onDelete={() => onDelete(tx)}
            onOpen={onSwipeOpen}
            onClose={onSwipeClose}
            scrollRef={scrollRef}
          >
            <TxRow
              tx={tx}
              theme={theme}
              cats={cats}
              categories={categories}
              onPrepare={() => onPrepare?.(tx)}
              onPress={() => onPress(tx)}
              last={i === txs.length - 1}
              onDelete={() => onDelete(tx)}
            />
          </SwipeRow>
        ))}
      </View>
    </View>
  );
}

// ─── SwipeRow ────────────────────────────────────────────────────────────────

function SwipeRow({ children, onDelete, onOpen, onClose, scrollRef }: {
  children: React.ReactNode;
  onDelete: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
  scrollRef: React.RefObject<any>;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
    return (
      <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
        <TouchableOpacity
          onPress={() => { swipeRef.current?.close(); onDelete(); }}
          style={S.swipeActionBtn}
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
      simultaneousHandlers={[scrollRef]}
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

// ─── TxRow ───────────────────────────────────────────────────────────────────

function TxRow({
  tx, theme, cats, categories, onPress, onPrepare, last, onDelete,
}: {
  tx: Transaction;
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  onPress: () => void;
  onPrepare?: () => void;
  last: boolean;
  onDelete?: () => void;
}) {
  const p          = makeP(theme.dark);
  const cat        = cats[tx.cat];
  const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
  const isIncome   = tx.type === 'income';
  const incomeColor = theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light;

  return (
    <Pressable
      onPressIn={onPrepare}
      onPress={onPress}
      style={({ pressed }) => [S.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: p.hairline, opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${tx.merchant}, ${cat?.label ?? ''}, ${isIncome ? '+' : '−'}$${tx.amount.toFixed(2)}`}
      accessibilityActions={onDelete ? [{ name: 'delete', label: 'Delete transaction' }] : undefined}
      onAccessibilityAction={onDelete ? (e) => { if (e.nativeEvent.actionName === 'delete') onDelete(); } : undefined}
    >
      <MerchantMark
        merchant={tx.merchant}
        catIcon={cat?.icon}
        color={groupColor}
        logoEnabled={transactionUsesMerchantLogo(tx)}
        size={32}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={S.nameRow}>
          <Text style={[S.txName, { color: p.text, flexShrink: 1 }]} numberOfLines={1}>
            {tx.merchant}
          </Text>
          {tx.recurring && <Icon name="repeat" size={11} color={p.textTer} stroke={1.7} />}
        </View>
        <Text style={[S.txMeta, { color: p.textSec }]}>{cat?.label} · {tx.time}</Text>
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
}

// ─── BillRow ─────────────────────────────────────────────────────────────────

function BillRow({ bill, theme, categories, last }: { bill: Bill; theme: Theme; categories: Category[]; last: boolean }) {
  const p          = makeP(theme.dark);
  const groupColor = categoryGroupColor(bill.cat, categories, theme.dark);
  return (
    <View style={[S.txRow, {
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: p.hairline,
      backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(14,12,24,0.025)',
    }]}>
      <MerchantMark
        merchant={bill.merchant}
        catIcon={bill.icon}
        color={groupColor}
        size={36}
        iconSize={15}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={S.nameRow}>
          <Text style={[S.txName, { color: p.text, flexShrink: 1 }]} numberOfLines={1}>
            {bill.name}
          </Text>
          <Icon name="repeat" size={11} color={p.textTer} stroke={1.7} />
        </View>
        <Text style={[S.txMeta, { color: p.textSec }]}>
          {bill.estimate ? 'Estimated · Upcoming bill' : 'Upcoming bill'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Money
          value={bill.amount}
          size={13}
          weight="500"
          theme={theme}
          color={p.text}
          prefix="$"
        />
        <View style={[S.upcomingPill, { backgroundColor: cautionBg(theme.dark) }]}>
          <Text style={[S.upcomingText, { color: cautionText(theme.dark) }]}>Upcoming</Text>
        </View>
      </View>
    </View>
  );
}

// ─── LoadError ───────────────────────────────────────────────────────────────

function LoadError({ theme, onRetry }: { theme: Theme; onRetry: () => void }) {
  const p = makeP(theme.dark);
  return (
    <View style={S.empty}>
      {/* Native iOS empty-state view; colorScheme is pinned to the app theme
          (which is decoupled from system appearance) and matchContents sizes
          the host to the SwiftUI content. The action stays an RN button since
          ContentUnavailableView exposes no actions slot. */}
      <Host
        matchContents
        colorScheme={theme.dark ? 'dark' : 'light'}
        style={S.unavailableHost}
      >
        <ContentUnavailableView
          title="Couldn't load transactions"
          systemImage="exclamationmark.triangle"
          description="Check your connection and try again."
        />
      </Host>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.7}
        style={[S.emptyClear, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,12,24,0.07)' }]}
        accessibilityRole="button"
        accessibilityLabel="Retry loading transactions"
      >
        <Text style={[S.emptyClearText, { color: p.textSec }]}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── SwipeHint ───────────────────────────────────────────────────────────────

function SwipeHint({ dark }: { dark: boolean }) {
  const p = makeP(dark);
  return (
    <View style={S.swipeHint}>
      <Icon name="chevL" size={11} color={p.textTer} stroke={2} />
      <Text style={[S.swipeHintText, { color: p.textTer }]}>Swipe to delete</Text>
    </View>
  );
}

// ─── TxListSkeleton ──────────────────────────────────────────────────────────
// Mirrors the day-grouped row layout so the pending state holds the same shape
// the real list will fill. Swap the simulated `loading` timer for the async
// data source when the backend lands.

function TxListSkeleton({ dark }: { dark: boolean }) {
  return (
    <View>
      {[0, 1].map(g => (
        <View key={g} style={{ marginBottom: 16 }}>
          <View style={[S.dayHeader, { marginBottom: 12 }]}>
            <Skeleton width={64} height={11} radius={4} onMedia={dark} />
            <Skeleton width={52} height={11} radius={4} onMedia={dark} />
          </View>
          {[0, 1, 2].map(r => (
            <View key={r} style={S.txRow}>
              <Skeleton width={36} height={36} radius={18} onMedia={dark} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width={g === 0 ? '55%' : '42%'} height={13} radius={4} onMedia={dark} />
                <Skeleton width="34%" height={11} radius={4} onMedia={dark} />
              </View>
              <Skeleton width={54} height={13} radius={4} onMedia={dark} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({ theme, isFiltered, onClearFilters }: {
  theme: Theme;
  isFiltered: boolean;
  onClearFilters?: () => void;
}) {
  const p = makeP(theme.dark);
  return (
    <View style={S.empty}>
      <Host
        matchContents
        colorScheme={theme.dark ? 'dark' : 'light'}
        style={S.unavailableHost}
      >
        <ContentUnavailableView
          title={isFiltered ? 'No results' : 'No transactions yet'}
          systemImage={isFiltered ? 'magnifyingglass' : 'tray'}
          description={
            isFiltered
              ? 'Try adjusting your filters'
              : 'Tap the add button below to record your first expense, or use the mic to log one by voice.'
          }
        />
      </Host>
      {isFiltered && onClearFilters && (
        <TouchableOpacity
          onPress={onClearFilters}
          activeOpacity={0.7}
          style={[S.emptyClear, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,12,24,0.07)' }]}
        >
          <Text style={[S.emptyClearText, { color: p.textSec }]}>Clear filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  iconBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  titleStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TYPE.pageTitle,
  },
  titleScrolled: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },

  // Section stack
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 160,
  },
  sectionStack: {
    gap: 16,
    marginBottom: 16,
  },
  dayGroupCard: {
    marginBottom: 16,
  },
  swipeHintCard: {
    marginBottom: 16,
  },
  loadingMore: {
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  swipeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    justifyContent: 'flex-end', paddingTop: 8, paddingBottom: 2,
  },
  swipeHintText: {
    ...TYPE.caption,
  },

  searchWrap: {
    paddingHorizontal: 4,
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 12, paddingRight: 8, paddingVertical: 8,
    borderRadius: 100, gap: 8,
  },
  filterPillText: {
    ...TYPE.caption,
  },
  filterStripScroll: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4,
  },
  emptyClear: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 100,
  },
  emptyClearText: {
    ...TYPE.bodySm,
  },
  // Day detail
  detailEmptyWrap: {
    alignItems: 'center', paddingVertical: 12,
  },
  // Rows
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  upcomingPill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100,
  },
  upcomingText: {
    ...TYPE.labelSmPlain,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: 2, marginBottom: 8,
  },
  dayLabel: {
    ...TYPE.txDateLabel,
  },
  dayTotal: {
    ...TYPE.bodySmEm,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: 2,
    paddingBottom: 12, marginBottom: 16,
  },
  summaryRowSolo: {
    paddingBottom: 0,
    marginBottom: 0,
  },
  summaryLabel: {
    ...TYPE.bodySm,
  },
  summaryTotal: {
    ...TYPE.subsectionTitle,
  },
  swipeActionBtn: {
    flex: 1, marginLeft: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: OVER_DOT,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 16,
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  txName: { ...TYPE.body },
  txMeta: { ...TYPE.caption, marginTop: 2 },
  empty:      { alignItems: 'center', paddingTop: 40, paddingBottom: 24 },
  unavailableHost: { width: '100%' },
});

// ─── CalendarSheet styles ───────────────────────────────────────────────────

const CS = StyleSheet.create({
  sheetContent: {
    flex: 1,
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    flexShrink: 0,
  },
  sheetTitle: {
    ...TYPE.pageTitle,
  },
  clearLink: {
    ...TYPE.bodySm,
  },
  modePickerHost: {
    width: 126,
    height: 32,
  },
  monthTitle: {
    ...TYPE.subsectionTitle,
    height: HISTORY_CAL_MONTH_HEADER_HEIGHT,
    lineHeight: HISTORY_CAL_MONTH_HEADER_HEIGHT,
  },
  weekHeaderRow: {
    height: HISTORY_CAL_WEEK_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekName: {
    flex: 1,
    textAlign: 'center',
    ...TYPE.labelPlain,
  },
  monthGrid: {
    gap: HISTORY_CAL_ROW_GAP,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  daySlot: {
    flex: 1,
    height: HISTORY_CAL_DAY_HEIGHT,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 5,
  },
  dayNumber: {
    ...TYPE.bodySmEm,
    textAlign: 'center',
  },
  dayMarksPlaceholder: {
    height: 12,
    marginTop: 3,
  },
  dayMarksRow: {
    height: 12,
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 22,
  },
  dayDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  dayCount: {
    ...TYPE.labelPlain,
    marginLeft: 4,
    fontWeight: '600',
  },
});

// ─── FilterSheet styles ───────────────────────────────────────────────────────

const FS = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    ...TYPE.pageTitle,
  },
  clearLink: {
    ...TYPE.bodySm,
  },
  doneLink: {
    ...TYPE.bodySmEm,
  },

  // Sort by / Date — single row with a styled UIKit menu trigger
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
    minHeight: 44,
  },
  sortRowLabel: {
    ...TYPE.body,
  },
  menuTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingLeft: 8,
  },
  menuTriggerText: {
    ...TYPE.body,
    fontWeight: '500',
  },

  amountSection: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  amountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    marginBottom: 8,
  },
  amountClear: {
    ...TYPE.bodySm,
  },
  amountCard: {
    minHeight: 66,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  amountField: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  amountFieldLabel: {
    ...TYPE.labelPlain,
    marginBottom: 4,
  },
  amountFieldValue: {
    ...TYPE.subsectionTitle,
  },
  amountDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  amountHint: {
    ...TYPE.caption,
    marginTop: 8,
  },

  // Category section
  groupDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 12,
    gap: 12,
  },
  groupDividerLabel: {
    ...TYPE.labelSmPlain,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
  },
  catChip: {
    width: '48.6%',
    minHeight: 42,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  catChipIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catChipName: {
    flex: 1,
    ...TYPE.bodySmEm,
  },
  groupEmpty: {
    paddingHorizontal: 20, paddingVertical: 12,
    ...TYPE.caption, fontStyle: 'italic',
  },

});
