import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');
import {
  FlatList as GHFlatList,
  Swipeable,
} from 'react-native-gesture-handler';

const AnimatedGHFlatList = Animated.createAnimatedComponent(GHFlatList);
import Reanimated, {
  Easing as ReEasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheet, Button as SwiftButton, ContentUnavailableView, Group, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { background, presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import type { Bill, Category, Transaction, TransactionCursor, TransactionQuery, TransactionSummary, TransactionSummaryQuery } from '../repositories/types';
import { txToCreateInput, upcomingBillsFromRecurring } from '../selectors/finance';
import type { ActivityInitialFilter } from '../selectors/spending';

// Default calendar position and the "current month" reference derive from the
// real clock. occurredAt (ISO, set by the data layer) is the source of truth
// for every transaction, so the screen tracks actual dates rather than a pinned
// mock month — it stays correct in any month/year.
const NOW            = new Date();
const CALENDAR_YEAR  = NOW.getFullYear();
const CALENDAR_MONTH = NOW.getMonth();
const CALENDAR_COLLAPSE_FALLBACK_HEIGHT = 430;
const MINI_CALENDAR_COLLAPSE_FALLBACK_HEIGHT = 360;
const ACTIVITY_PAGE_SIZE = 80;
const FILTER_COMMIT_DELAY_MS = 90;

// Calendar open state persists across screen remounts (and across the rest of
// the app session). Module-scope so it survives even if ActivityScreen ever
// unmounts; today the App keeps all screens mounted, but this is the cheap
// safeguard against future architectural changes.
// Defaults closed so the transaction list — the primary content of a "History"
// screen — sits above the fold; the calendar is a secondary filter tool opened
// on demand via the handle.
let cachedCalOpen = false;
let hasShownDeleteHint = false;
import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { MerchantMark } from '../components/MerchantMark';
import { transactionUsesMerchantLogo } from '../merchantLogos';
import { Money } from '../components/shared';
import { Skeleton } from '../components/Skeleton';
import { Toast } from '../components/Toast';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionCard } from '../components/SectionCard';
import { TransactionCalendar, CalDayMark } from '../components/TransactionCalendar';
import { HeaderIcon, useHeaderScroll, BG_PARALLAX_MAX } from '../components/headerScroll';
import { Theme, GROUP_COLORS, OVER_DOT, cautionBg, cautionText } from '../theme';
import { MEDIA, DARK_TEXT_SHADOW, makeP, makeScrim, deriveFloor } from '../wallpaperPalette';
import { TYPE } from '../typography';
import { useTheme } from '../ThemeProvider';


function AnimatedCollapse({
  open,
  children,
  duration = 300,
  fallbackHeight,
}: {
  open: boolean;
  children: React.ReactNode;
  duration?: number;
  fallbackHeight: number;
}) {
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const expandedHeight = measuredHeight ?? fallbackHeight;

  // Drives the collapse on the UI thread via reanimated. Animating height on
  // the JS-thread Animated API re-ran Yoga layout + re-composited the BlurView
  // backing this card every frame, which dropped frames on open/close.
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration,
      easing: ReEasing.bezier(0.22, 1, 0.36, 1),
    });
  }, [duration, open, progress]);

  const collapseStyle = useAnimatedStyle(() => ({
    height: progress.value * expandedHeight,
    opacity: progress.value,
  }));

  return (
    <Reanimated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[{ overflow: 'hidden' }, collapseStyle]}
    >
      {/* Absolutely positioned so the parent's animated height clamp doesn't
          shrink this child during the close animation — otherwise onLayout
          would fire with intermediate small heights and pin measuredHeight to
          a tiny value, leaving the next open stuck at ~5% expansion. */}
      <View
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs((measuredHeight ?? 0) - h) > 0.5) setMeasuredHeight(h);
        }}
      >
        {children}
      </View>
    </Reanimated.View>
  );
}

type DateFilterPreset = 'today' | 'yesterday' | 'this-week' | 'this-month';
type DateFilter = DateFilterPreset | { from: Date; to: Date } | null;
type SortOrder = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'cat';

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
  const [sortBy, setSortBy]                 = useState<SortOrder>('date-desc');
  const [pendingUndo, setPendingUndo]       = useState<{ tx: Transaction } | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedDay, setSelectedDay]       = useState<number | null>(null);
  const [calViewYear, setCalViewYear]       = useState(CALENDAR_YEAR);
  const [calViewMonth, setCalViewMonth]     = useState(CALENDAR_MONTH);
  const [calOpen, _setCalOpen]              = useState(cachedCalOpen);
  const calOpenedOnPressInRef = useRef(false);
  const setCalOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    _setCalOpen(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      cachedCalOpen = resolved;
      return resolved;
    });
  };
  // The calendar grid (42 cells) and its 36-action native month picker are heavy
  // to mount, yet most History visits never open the calendar. Defer mounting
  // until the first open, then keep it mounted so subsequent opens are instant.
  const [calMounted, setCalMounted] = useState(cachedCalOpen);
  useEffect(() => {
    if (calOpen && !calMounted) setCalMounted(true);
  }, [calOpen, calMounted]);
  useEffect(() => {
    if (calMounted) return;
    const task = InteractionManager.runAfterInteractions(() => setCalMounted(true));
    return () => task.cancel?.();
  }, [calMounted]);

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
  const activeCount = catFilter.length + (dateFilter ? 1 : 0);

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
    setSelectedDay(null);
  }, [filterToken]);

  const { scrollY, headerBgOpacity, iconScrolledOpacity, bgTranslateY } = useHeaderScroll();

  // Calendar-driven month filter: when the user navigates the calendar
  // away from the default month, the transaction list narrows to that
  // month. Explicit date filters (preset / custom range) take precedence,
  // since they encode a more specific user intent.
  const isViewingNonDefaultMonth =
    calViewMonth !== CALENDAR_MONTH || calViewYear !== CALENDAR_YEAR;

  // The text box stays bound to `query` for instant feedback; the repo scans
  // and calendar marks key off the debounced value so they don't run per keystroke.
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
    ...dateRangeForFilter(dateFilter, isViewingNonDefaultMonth, calViewYear, calViewMonth),
  }), [catFilter, merchantQuery, searchCategoryIds, dateFilter, isViewingNonDefaultMonth, calViewYear, calViewMonth]);

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

  // ── Calendar marks ───────────────────────────────────────────────────────
  // Calendar marks only feed the grid, which is only visible when the calendar
  // is open. Skipping the DB scan while collapsed removes a query from every
  // filter/sort/search change made with the calendar closed (the common case).
  //
  // Keying off the *deferred* open flag keeps the marks query off the frame that
  // handles the open tap: the collapse animation commits immediately with no
  // marks, then React runs the scan in a follow-up low-priority render and the
  // dots fade in a frame later — so the open gesture never blocks on the DB.
  const deferredCalOpen = useDeferredValue(calOpen);
  const calTxMarks = useMemo(
    () => deferredCalOpen
      ? transactionsRepo.getCalendarMarks({
          year: calViewYear,
          month: calViewMonth,
          categoryIds: catFilter.length > 0 ? catFilter : undefined,
          merchantQuery,
          searchCategoryIds,
        })
      : [],
    [deferredCalOpen, calViewYear, calViewMonth, catFilter, merchantQuery, searchCategoryIds, transactionsRepo, repoVersion],
  );

  const calBills = useMemo(
    () => upcomingBills.filter(b => catFilter.length === 0 || catFilter.includes(b.cat)),
    [catFilter, upcomingBills],
  );

  const calMarks = useMemo(() => {
    const m: Record<number, CalDayMark> = {};
    const ensure = (d: number) => {
      if (!m[d]) m[d] = { txCats: [], billCats: [] };
      return m[d];
    };
    calTxMarks.forEach(mark => ensure(mark.day).txCats.push(mark.cat));
    calBills.forEach(b => {
      const pd = parseMonthDay(b.dueDate);
      if (pd && pd.month === calViewMonth) ensure(pd.day).billCats.push(b.cat);
    });
    return m;
  }, [calTxMarks, calBills]);

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

  const hasFilterPills = selectedDay !== null || dateFilter !== null || catFilter.length > 0;
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

  // Stable identities for TransactionCalendar's props so the memoized grid only
  // re-renders when something it actually displays changes — not on every
  // keystroke, toast, or pagination render of this screen.
  const calToday = useMemo(
    () => (calViewYear === NOW.getFullYear() && calViewMonth === NOW.getMonth() ? NOW.getDate() : null),
    [calViewYear, calViewMonth],
  );
  const calOverrideColors = useMemo(
    () => (theme.dark ? {
      text: MEDIA.text,
      textSec: MEDIA.textSec,
      textTer: MEDIA.textTer,
      selectedBg: MEDIA.text,
      selectedText: theme.bg,
      todayBorder: MEDIA.textSec,
      dotFill: MEDIA.textSec,
      billDotBorder: MEDIA.textTer,
    } : undefined),
    [theme.dark],
  );
  const handleCalSelectDay = useCallback((day: number | null) => {
    setSelectedDay(day);
    if (day !== null) setDateFilter(null);
  }, []);
  const handleCalViewMonthChange = useCallback((y: number, m: number) => {
    setCalViewYear(y);
    setCalViewMonth(m);
    setSelectedDay(null);
    // Clear "This month" preset when the user navigates the calendar to a
    // different month — prevents the calendar showing June with no marks while
    // the list stays pinned to May transactions.
    if (dateFilter === 'this-month' && (m !== CALENDAR_MONTH || y !== CALENDAR_YEAR)) {
      setDateFilter(null);
    }
  }, [dateFilter]);
  const handleCalHandlePressIn = useCallback(() => {
    if (calOpen) {
      calOpenedOnPressInRef.current = false;
      return;
    }
    calOpenedOnPressInRef.current = true;
    setCalOpen(true);
  }, [calOpen]);
  const handleCalHandlePress = useCallback(() => {
    if (calOpenedOnPressInRef.current) {
      calOpenedOnPressInRef.current = false;
      return;
    }
    if (calOpen) setCalOpen(false);
  }, [calOpen]);

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
          renderItem={({ item }) => renderActivityDay(String(item))}
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

            {/* ── Calendar card ─────────────────────────────────── */}
            <SectionCard noPad dark={theme.dark}>
              <AnimatedCollapse
                open={calOpen}
                duration={190}
                fallbackHeight={CALENDAR_COLLAPSE_FALLBACK_HEIGHT}
              >
                <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
                  {calMounted && (
                    <TransactionCalendar
                      theme={theme}
                      year={calViewYear}
                      month={calViewMonth}
                      marks={calMarks}
                      selectedDay={selectedDay}
                      today={calToday}
                      categories={categories}
                      onSelectDay={handleCalSelectDay}
                      onViewMonthChange={handleCalViewMonthChange}
                      overrideColors={calOverrideColors}
                    />
                  )}
                </View>
              </AnimatedCollapse>

              {/* Toggle handle */}
              <Pressable
                onPressIn={handleCalHandlePressIn}
                onPress={handleCalHandlePress}
                pointerEvents="box-only"
                style={[S.calHandle, { borderTopColor: calOpen ? p.hairline : 'transparent' }]}
                accessibilityRole="button"
                accessibilityLabel={calOpen ? 'Hide calendar' : 'Show calendar'}
                accessibilityState={{ expanded: calOpen }}
              >
                <View style={S.calShowRow}>
                  <Icon name="cal" size={12} color={p.textSec} stroke={1.5} />
                  <Text style={[S.calShowText, { color: p.textSec }]}>
                    {calOpen
                      ? 'Hide calendar'
                      : selectedDay !== null
                        ? `${MONTHS[calViewMonth]} ${selectedDay} selected`
                        : 'Show calendar'}
                  </Text>
                  {selectedDay !== null && !calOpen && (
                    <View style={[S.calActiveDot, { backgroundColor: theme.accent.dot }]} />
                  )}
                  <View style={{ flex: 1 }} />
                  <Icon name={calOpen ? 'chevUp' : 'chevDown'} size={10} color={p.textSec} stroke={1.8} />
                </View>
              </Pressable>
            </SectionCard>

            {/* ── Search + filter card ──────────────────────────── */}
            <SectionCard dark={theme.dark}>
              <View style={S.searchRow}>
                <View style={[S.search, { flex: 1, backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(14,12,24,0.06)', borderColor: p.hairline }]}>
                  <Icon name="search" size={16} color={p.textSec} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search transactions…"
                    placeholderTextColor={p.textTer}
                    style={[S.searchInput, { color: p.text }]}
                    returnKeyType="search"
                    accessibilityLabel="Search transactions"
                    accessibilityHint="Searches by merchant name or category"
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
                <TouchableOpacity
                  onPress={() => setFilterSheetOpen(true)}
                  activeOpacity={0.7}
                  style={[S.filterBtn, { backgroundColor: activeCount > 0
                    ? (theme.dark ? 'rgba(255,255,255,0.90)' : 'rgba(14,12,24,0.85)')
                    : (theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,12,24,0.08)') }]}
                  accessibilityRole="button"
                  accessibilityLabel={activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'}
                >
                  <Icon name="filter" size={15} color={activeCount > 0 ? (theme.dark ? theme.bg : theme.surface) : p.textSec} stroke={1.6} />
                  {activeCount > 0 && (
                    <View style={[S.filterBadge, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)' }]}>
                      <Text style={[S.filterBadgeText, { color: theme.dark ? theme.bg : theme.surface }]}>{activeCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Active filter pills */}
              {hasFilterPills && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -20, marginTop: 12 }}
                  contentContainerStyle={[S.filterStripScroll, { paddingHorizontal: 20 }]}
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
            </SectionCard>

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
                    onClearFilters={() => { setQuery(''); setCatFilter([]); setDateFilter(null); setSelectedDay(null); setSortBy('date-desc'); }}
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

        <FilterSheet
          visible={filterSheetOpen}
          theme={theme}
          catFilter={catFilter}
          dateFilter={dateFilter}
          sortBy={sortBy}
          categories={categories}
          cats={cats}
          setCatFilter={setCatFilter}
          setDateFilter={handleSetDateFilter}
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

// ─── FilterSheet ─────────────────────────────────────────────────────────────

const FilterSheet = React.memo(function FilterSheet({
  visible, theme, catFilter, dateFilter, sortBy,
  categories, cats, setCatFilter, setDateFilter, setSortBy, clearDay, onClose,
}: {
  visible: boolean;
  theme: Theme;
  catFilter: string[];
  dateFilter: DateFilter;
  sortBy: SortOrder;
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  setCatFilter: (c: string[]) => void;
  setDateFilter: (d: DateFilter) => void;
  setSortBy: (s: SortOrder) => void;
  clearDay: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [customMode, setCustomMode] = useState(false);
  const [localFrom, setLocalFrom]   = useState<Date | null>(null);
  const [localTo, setLocalTo]       = useState<Date | null>(null);
  const [localCatFilter, setLocalCatFilter] = useState(catFilter);
  const pendingLocalCatCommitRef = useRef(false);
  const catCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catCommitTaskRef = useRef<{ cancel?: () => void } | null>(null);

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

  useEffect(() => () => {
    if (catCommitTimerRef.current !== null) clearTimeout(catCommitTimerRef.current);
    catCommitTaskRef.current?.cancel?.();
  }, []);

  useEffect(() => {
    if (visible) {
      if (dateFilter && typeof dateFilter !== 'string') {
        setCustomMode(true);
        setLocalFrom(dateFilter.from);
        setLocalTo(dateFilter.to);
      } else {
        setCustomMode(false);
        setLocalFrom(null);
        setLocalTo(null);
      }
    }
  }, [visible]);

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

  const handleRangeChange = ({ from, to }: { from: Date | null; to: Date | null }) => {
    setLocalFrom(from);
    setLocalTo(to);
    if (from && to)        setDateFilter({ from, to });
    else if (!from && !to) setDateFilter(null);
  };

  // Picker index ↔ dateFilter state mapping.
  // 0 = Any time, 1-4 = presets (in DATE_PRESETS order), 5 = Custom range.
  const datePickerIdx = customMode || (dateFilter !== null && typeof dateFilter !== 'string')
    ? 5
    : typeof dateFilter === 'string'
      ? DATE_PRESETS.findIndex(p => p.id === dateFilter) + 1
      : 0;

  const handleDatePickerChange = useCallback((idx: number) => {
    if (idx === 0) {
      setDateFilter(null);
      setCustomMode(false);
      setLocalFrom(null);
      setLocalTo(null);
    } else if (idx >= 1 && idx <= 4) {
      setDateFilter(DATE_PRESETS[idx - 1].id);
      setCustomMode(false);
      setLocalFrom(null);
      setLocalTo(null);
    } else if (idx === 5) {
      // Switch to custom mode; preserve any existing custom range
      setCustomMode(true);
      if (typeof dateFilter === 'string') setDateFilter(null);
    }
  }, [dateFilter, setDateFilter]);

  const clearAll = () => {
    commitCatFilter([]);
    setDateFilter(null);
    setSortBy('date-desc');
    clearDay();
    setCustomMode(false);
    setLocalFrom(null);
    setLocalTo(null);
  };

  const activeCount = localCatFilter.length + (dateFilter ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);

  const customLabel = (() => {
    if (dateFilter && typeof dateFilter !== 'string') {
      return `${fmtDate(dateFilter.from)} – ${fmtDate(dateFilter.to)}`;
    }
    if (localFrom && !localTo) return `${fmtDate(localFrom)} – …`;
    return 'Custom range';
  })();

  const sortIdx = SORT_OPTIONS.findIndex(o => o.id === sortBy);
  // Trigger label for the Date menu (mirrors menu indices: 0 = Any time, 1-4 = presets, 5 = Custom).
  const dateMenuLabel = datePickerIdx === 0
    ? 'Any time'
    : datePickerIdx === 5
      ? customLabel
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
          <SwiftButton
            key="5"
            systemImage={datePickerIdx === 5 ? 'checkmark' : undefined}
            onPress={() => handleDatePickerChange(5)}
            label={customLabel}
          />
        </Menu>
      </Host>
    </View>
  ), [datePickerIdx, dateMenuLabel, customLabel, theme.text, theme.accent.dot, handleDatePickerChange]);

  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}
      >
        <Group modifiers={[
          presentationDetents([{ fraction: 0.88 }]),
          presentationDragIndicator('visible'),
          background(theme.surface),
        ]}>
          <RNHostView>
            {!everVisible ? (
            <View style={{ backgroundColor: theme.surface }} />
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

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 20 }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
              >
                {/* ── Sort by — UIKit menu (styled trigger) ──────── */}
                {sortMenu}

                {/* ── Date — UIKit menu (styled trigger) ─────────── */}
                {/* Menu indices: 0 = Any time, 1-4 = presets, 5 = Custom range */}
                {dateMenu}

                <AnimatedCollapse
                  open={customMode}
                  fallbackHeight={MINI_CALENDAR_COLLAPSE_FALLBACK_HEIGHT}
                >
                  <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
                    <MiniCalendar
                      theme={theme}
                      from={localFrom}
                      to={localTo}
                      onRangeChange={handleRangeChange}
                    />
                  </View>
                </AnimatedCollapse>

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
                        g.cats.map((catId, ci) => {
                          const c      = cats[catId];
                          const active = localCatFilter.includes(catId);
                          return (
                            <TouchableOpacity
                              key={catId}
                              onPress={() => toggleCatFilter(catId)}
                              activeOpacity={0.7}
                              style={[
                                FS.catRow,
                                active && { backgroundColor: groupColor + '14' },
                                ci < g.cats.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.hairline },
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              accessibilityLabel={c.label}
                            >
                              <View style={[
                                FS.catIcon,
                                { backgroundColor: active ? groupColor : groupColor + '28' },
                              ]}>
                                <Icon name={c.icon} size={13} color={active ? '#fff' : groupColor} stroke={1.6} />
                              </View>
                              <Text style={[
                                FS.catName,
                                active && TYPE.body,
                                { color: theme.text },
                              ]}>
                                {c.label}
                              </Text>
                              {active && <View style={[FS.activeDot, { backgroundColor: groupColor }]} />}
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            )}
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
});

// ─── MiniCalendar ─────────────────────────────────────────────────────────────

function MiniCalendar({
  theme, from, to, onRangeChange,
}: {
  theme: Theme;
  from: Date | null;
  to: Date | null;
  onRangeChange: (range: { from: Date | null; to: Date | null }) => void;
}) {
  const [viewYear, setViewYear]   = useState(from?.getFullYear() ?? CALENDAR_YEAR);
  const [viewMonth, setViewMonth] = useState(from?.getMonth()    ?? CALENDAR_MONTH);

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;

  const cells: Array<number | null> = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const cellDate  = (day: number) => new Date(viewYear, viewMonth, day);
  const hasRange  = from !== null && to !== null && !isSameDay(from, to);

  const dayIsStart   = (day: number) => from !== null && isSameDay(cellDate(day), from);
  const dayIsEnd     = (day: number) => to   !== null && isSameDay(cellDate(day), to);
  const dayIsInRange = (day: number) => {
    if (!hasRange) return false;
    const d = cellDate(day);
    return d > from! && d < to!;
  };

  const handleDayPress = (day: number) => {
    const pressed = cellDate(day);
    if (!from || (from && to)) {
      onRangeChange({ from: pressed, to: null });
    } else if (isSameDay(pressed, from)) {
      onRangeChange({ from: null, to: null });
    } else if (pressed < from) {
      onRangeChange({ from: pressed, to: from });
    } else {
      onRangeChange({ from, to: pressed });
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <View style={CAL.container}>
      <View style={CAL.monthRow}>
        <Pressable
          onPress={prevMonth}
          pointerEvents="box-only"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Icon name="chevL" size={18} color={theme.textSec} />
        </Pressable>
        <Text style={[CAL.monthLabel, { color: theme.text }]}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <Pressable
          onPress={nextMonth}
          pointerEvents="box-only"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Icon name="chevR" size={18} color={theme.textSec} />
        </Pressable>
      </View>

      <View style={CAL.dowRow}>
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
          <View key={i} style={CAL.dowCell}>
            <Text style={[CAL.dowText, { color: theme.textSec }]}>{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={CAL.weekRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={CAL.dayCell} />;

            const start    = dayIsStart(day);
            const end      = dayIsEnd(day);
            const inRange  = dayIsInRange(day);
            const selected = start || end;

            const showFill   = inRange || (start && hasRange) || (end && hasRange);
            const fillLeft: number | string  = (start && hasRange) ? '50%' : 0;
            const fillRight: number | string = (end   && hasRange) ? '50%' : 0;

            return (
              <TouchableOpacity
                key={di}
                onPress={() => handleDayPress(day)}
                style={CAL.dayCell}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_NAMES[viewMonth]} ${day}`}
                accessibilityState={{ selected: start || end }}
              >
                {showFill && (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        top: 3, bottom: 3,
                        left: fillLeft, right: fillRight,
                        backgroundColor: theme.accent.fill,
                        borderTopLeftRadius:     (di === 0 && inRange) ? 6 : 0,
                        borderBottomLeftRadius:  (di === 0 && inRange) ? 6 : 0,
                        borderTopRightRadius:    (di === 6 && inRange) ? 6 : 0,
                        borderBottomRightRadius: (di === 6 && inRange) ? 6 : 0,
                      } as any,
                    ]}
                  />
                )}
                <View style={[CAL.dayCircle, selected && { backgroundColor: theme.text }]}>
                  <Text
                    style={[
                      selected ? TYPE.bodySmEm : TYPE.bodySm,
                      { color: selected ? theme.bg : inRange ? theme.text : theme.textSec },
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {(from || to) && (
        <View style={[CAL.summary, { borderTopColor: theme.sep }]}>
          <View style={CAL.summaryItem}>
            <Text style={[CAL.summaryLabel, { color: theme.textSec }]}>From</Text>
            <Text style={[CAL.summaryValue, { color: from ? theme.text : theme.textSec }]}>
              {from ? fmtDate(from) : '—'}
            </Text>
          </View>
          <View style={[CAL.summarySep, { backgroundColor: theme.hairline }]} />
          <View style={CAL.summaryItem}>
            <Text style={[CAL.summaryLabel, { color: theme.textSec }]}>To</Text>
            <Text style={[CAL.summaryValue, { color: to ? theme.text : theme.textSec }]}>
              {to ? fmtDate(to) : '—'}
            </Text>
          </View>
        </View>
      )}
    </View>
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
      <View style={[S.billIcon, { borderColor: groupColor }]}>
        <Icon name={bill.icon} size={15} color={groupColor} stroke={1.7} />
      </View>
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

  // Calendar toggle handle
  calHandle: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
  },
  calShowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    width: '100%',
  },
  calShowText: {
    ...TYPE.caption,
  },
  calActiveDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  swipeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    justifyContent: 'flex-end', paddingTop: 8, paddingBottom: 2,
  },
  swipeHintText: {
    ...TYPE.caption,
  },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: 8,
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, ...TYPE.bodyRegular, padding: 0 },
  filterBtn: {
    borderRadius: 14,
    paddingHorizontal: 16,
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  filterBadge: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { ...TYPE.labelPlain },
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
  billIcon: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  catIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  catName: {
    flex: 1, ...TYPE.bodyRegular,
  },
  activeDot: {
    width: 7, height: 7, borderRadius: 3.5, flexShrink: 0,
  },
  groupEmpty: {
    paddingHorizontal: 20, paddingVertical: 12,
    ...TYPE.caption, fontStyle: 'italic',
  },

});

// ─── MiniCalendar styles ──────────────────────────────────────────────────────

const CAL = StyleSheet.create({
  container: {
    marginTop: 16, marginBottom: 4,
  },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthLabel: {
    ...TYPE.bodySmEm,
  },
  dowRow: {
    flexDirection: 'row', marginBottom: 2,
  },
  dowCell: {
    flex: 1, alignItems: 'center', paddingVertical: 4,
  },
  dowText: {
    ...TYPE.labelPlain,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  dayCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  summary: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 16, paddingTop: 16, borderTopWidth: 1,
  },
  summaryItem: {
    flex: 1, alignItems: 'center', gap: 3,
  },
  summaryLabel: {
    ...TYPE.labelPlain,
  },
  summaryValue: {
    ...TYPE.body,
  },
  summarySep: {
    width: 1, height: 28,
  },
});
