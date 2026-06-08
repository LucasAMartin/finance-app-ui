import React, { startTransition, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
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
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import Reanimated, { FadeIn, FadeOut, LinearTransition, runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import {
  Calendar,
  buildCalendar,
  fromDateId,
  toDateId,
  type CalendarMonthEnhanced,
  type CalendarTheme,
} from '@marceloterreiro/flash-calendar';
import { Button as SwiftButton, ContentUnavailableView, GlassEffectContainer, Host, Menu, Picker, RNHostView, Text as SwiftText } from '@expo/ui/swift-ui';
import { buttonStyle, environment, glassEffect, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLedgerMembers, useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap, UNCATEGORIZED_LABEL } from '../repositories/categoryUtils';
import { appendMemberLabel, memberDisplayName } from '../repositories/memberLabels';
import type { Bill, Category, LedgerMember, Transaction, TransactionCursor, TransactionQuery, TransactionsRepo, TransactionSummary, TransactionSummaryQuery } from '../repositories/types';
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
const RANGE_CLOSE_DELAY_MS = 420;

let hasShownDeleteHint = false;
import { Icon } from '../components/Icon';
import { GlassCircleButton, ScreenExitButton, SUPPORTS_GLASS, glassTintForTheme } from '../components/GlassButton';
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
import { Theme, GROUP_COLORS, OVER_DOT, cautionBg, cautionText, ON_GROUP_ICON } from '../theme';
import { MEDIA, DARK_TEXT_SHADOW, makeP, makeScrim, deriveFloor, ONMEDIA_BORDER_LIGHT } from '../wallpaperPalette';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';
import { useTheme } from '../ThemeProvider';
import type { WallpaperP } from '../wallpaperPalette';

const GLASS_TINT_ACTIVE = 'rgba(255,255,255,0.18)';

type DateFilterPreset = 'today' | 'yesterday' | 'this-week' | 'this-month';
type DateFilter = DateFilterPreset | { from: Date; to: Date } | null;
type AmountFilter = { min?: number; max?: number } | null;
type SortOrder = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'cat';
type CalendarSelectMode = 'day' | 'range';
type CalendarPreviewSelection =
  | { kind: 'day'; dateId: string }
  | { kind: 'range'; startId: string; endId: string }
  | null;
type SheetHandle = {
  open: () => void;
  close: () => void;
  resetSelection?: () => void;
};

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

function isGoalContributionTx(tx: Transaction): boolean {
  return tx.meta?.kind === 'goal-contribution';
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

// ─── FilterPill ──────────────────────────────────────────────────────────────

function FilterPill({ dark, overlay, onPress, accessibilityLabel, children }: {
  dark: boolean;
  overlay?: string;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  // iOS 26+: a real interactive Liquid Glass capsule. The press grow / finger-
  // tracking / refraction only happens when the glass lives on a native `Button`
  // (the touch target) wrapped in a `GlassEffectContainer` — a glass layer behind
  // a JS Pressable renders the material but stays inert. The RN label (custom SVG
  // icons + Inter text) is embedded via `RNHostView`, and `matchContents` sizes
  // the capsule to hug it. The active-filter tint maps to the glass's native tint.
  if (SUPPORTS_GLASS) {
    return (
      <Host matchContents ignoreSafeArea="all" colorScheme={dark ? 'dark' : 'light'}>
        <GlassEffectContainer>
          <SwiftButton
            onPress={onPress}
            modifiers={[
              buttonStyle('plain'),
              glassEffect({
                glass: overlay
                  ? { variant: 'regular', interactive: true, tint: overlay }
                  : { variant: 'regular', interactive: true },
                shape: 'capsule',
              }),
            ]}
          >
            <RNHostView matchContents>
              <View style={S.filterPill}>{children}</View>
            </RNHostView>
          </SwiftButton>
        </GlassEffectContainer>
      </Host>
    );
  }

  // Pre-iOS-26 fallback: the prior BlurView capsule with a tint overlay.
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <BlurView
        intensity={dark ? 55 : 72}
        tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
        style={[S.filterPill, S.filterPillBlur, {
          borderColor: dark ? GLASS_TINT_ACTIVE : 'rgba(0,0,0,0.10)',
        }]}
      >
        {overlay ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} pointerEvents="none" />
        ) : null}
        {children}
      </BlurView>
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export type ActivityHandle = {
  /** Call synchronously before navigate() to pre-load the filtered skeleton. */
  beginNavFilter: (filter: ActivityInitialFilter, filterToken?: number) => void;
};

interface Props {
  theme: Theme;
  onOpenDrawer?: () => void;
  onOpenTx?: (tx: Transaction) => void;
  onPrepareTx?: (tx: Transaction) => void;
  onOverlayOpenChange?: (open: boolean) => void;
  initialFilter?: ActivityInitialFilter | null;
  filterToken?: number;
  onNavSkeletonReady?: (filterToken: number) => void;
  /** App-level optimistic delete: hide this row immediately before the repo commit lands. */
  pendingDeleteId?: string | null;
}

export const ActivityScreen = React.forwardRef<ActivityHandle, Props>(
function ActivityScreen({ theme, onOpenDrawer, onOpenTx, onPrepareTx, onOverlayOpenChange, initialFilter, filterToken, onNavSkeletonReady, pendingDeleteId: externalPendingDeleteId }: Props, ref) {
  const { transactionsRepo, categoriesRepo, recurringRulesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const ledgerMembers = useLedgerMembers();
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const upcomingBills = useMemo(() => upcomingBillsFromRecurring(recurringRules, categories), [recurringRules, categories]);
  const insets = useSafeAreaInsets();
  const { wallpaper, wallpaperFloorBase } = useTheme();

  const [query, setQuery]                   = useState('');
  const [immediateQuery, setImmediateQuery] = useState<string | null>(null);
  const [catFilter, setCatFilter]           = useState<string[]>([]);
  const [dateFilter, setDateFilter]         = useState<DateFilter>(null);
  const [amountFilter, setAmountFilter]     = useState<AmountFilter>(null);
  const [sortBy, setSortBy]                 = useState<SortOrder>('date-desc');
  const [pendingUndo, setPendingUndo]       = useState<{ tx: Transaction } | null>(null);
  const [deniedMessage, setDeniedMessage]   = useState<string | null>(null);
  const [selectedDay, setSelectedDay]       = useState<number | null>(null);
  const [calViewYear, setCalViewYear]       = useState(CALENDAR_YEAR);
  const [calViewMonth, setCalViewMonth]     = useState(CALENDAR_MONTH);
  const filterSheetRef = useRef<SheetHandle>(null);
  const calendarSheetRef = useRef<SheetHandle>(null);

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

  const listOpacity    = useRef(new Animated.Value(1)).current;
  const listFadePending = useRef(false);

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
    if (d === null || typeof d === 'string') {
      calendarSheetRef.current?.resetSelection?.();
    }
  }, []);
  const clearSelectedDay = useCallback(() => setSelectedDay(null), []);
  const openFilterSheet = useCallback(() => filterSheetRef.current?.open(), []);
  const openCalendarSheet = useCallback(() => calendarSheetRef.current?.open(), []);

  const clearDateRange = useCallback(() => {
    setDateFilter(null);
    calendarSheetRef.current?.resetSelection?.();
  }, []);

  // Removing a filter pill triggers a full transaction-list rebuild, which holds
  // the JS thread for a beat on long lists. Fire the haptic tick synchronously so
  // the touch is acknowledged instantly, then dim the list imperatively (no render
  // needed — native driver) so the user sees immediate acknowledgment. The RAF
  // defers the state change one frame so the pill's exit animation paints before
  // the rebuild blocks the thread. listFadePending lets loadFirstActivityPage know
  // to fade the list back in once results land.
  const removeFilter = useCallback((apply: () => void) => {
    Haptics.selectionAsync();
    listFadePending.current = true;
    listOpacity.setValue(0.65);
    requestAnimationFrame(apply);
  }, [listOpacity]);

  const clearAllFilters = useCallback(() => {
    setCatFilter([]);
    setDateFilter(null);
    setAmountFilter(null);
    setSelectedDay(null);
    calendarSheetRef.current?.resetSelection?.();
  }, []);

  // Optimistic delete: hide the row immediately (via pendingUndo filter in
  // `grouped`) without touching the repo. The actual delete fires when the toast
  // auto-dismisses or the user swipes it away — so the row is already gone from
  // the UI by the time any async work lands. Undo just restores local state;
  // no re-create needed since the repo was never modified.
  const handleDeleteTx = useCallback((t: Transaction) => {
    if (!transactionsRepo.canEdit(t)) {
      const owner = memberDisplayName(ledgerMembers, t.createdByUserId);
      setDeniedMessage(`${owner ?? 'This member'} has locked edits for this transaction.`);
      return;
    }
    setPendingUndo({ tx: t });
  }, [ledgerMembers, transactionsRepo]);

  const handleOpenTx = useCallback((selected: Transaction) => {
    onOpenTx?.(selected);
  }, [onOpenTx]);
  const handlePrepareTx = useCallback((selected: Transaction) => {
    onPrepareTx?.(selected);
  }, [onPrepareTx]);

  const handleUndoDelete = useCallback(() => {
    setPendingUndo(null); // row reappears — never left the repo
  }, []);

  const commitDelete = useCallback(() => {
    if (pendingUndo) transactionsRepo.delete(pendingUndo.tx.id);
    setPendingUndo(null);
  }, [pendingUndo, transactionsRepo]);

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

  const appliedTokenRef    = useRef<number | undefined>(undefined);
  const navAppliedRef      = useRef(false);
  const reportedSkeletonTokenRef = useRef<number | undefined>(undefined);
  const [listInstanceKey, setListInstanceKey] = useState('activity-list-initial');
  const [navLoading, setNavLoading] = useState(false);
  const [navLoadToken, setNavLoadToken] = useState(0);
  const navLoadingTokenRef = useRef<number | null>(null);

  const beginNavLoading = useCallback((token?: number) => {
    if (token !== undefined) {
      reportedSkeletonTokenRef.current = undefined;
      setListInstanceKey(`activity-list-${token}`);
      navLoadingTokenRef.current = token;
      setNavLoadToken(token);
    } else {
      navLoadingTokenRef.current = -1;
      setNavLoadToken(token => token + 1);
    }
    setNavLoading(true);
  }, []);

  const applyNavFilter = useCallback((filter: ActivityInitialFilter) => {
    setActivityRows([]);
    setNextCursor(undefined);
    setActivitySummary(EMPTY_SUMMARY);
    setLoadingMore(false);
    setLoadError(false);
    setCatFilter(filter.catIds ?? []);
    const nextQuery = filter.merchantQuery ?? '';
    setImmediateQuery(nextQuery);
    setQuery(nextQuery);
    if (filter.dateFrom && filter.dateTo) {
      setDateFilter({ from: filter.dateFrom, to: filter.dateTo });
      setCalViewMonth(filter.dateFrom.getMonth());
      setCalViewYear(filter.dateFrom.getFullYear());
    } else {
      setDateFilter(null);
    }
    setAmountFilter(null);
    setSelectedDay(null);
  }, []);

  // Called synchronously in the same event handler as navigate(), so all state
  // changes batch into one commit with the navigation. The prop-token guard
  // below still covers the first frame if this ref is unavailable.
  const beginNavFilter = useCallback((filter: ActivityInitialFilter, token?: number) => {
    navAppliedRef.current = true;
    beginNavLoading(token);
    applyNavFilter(filter);
  }, [applyNavFilter, beginNavLoading]);

  useImperativeHandle(ref, () => ({ beginNavFilter }), [beginNavFilter]);

  // Fallback for any path that changes filterToken without going through
  // beginNavFilter (e.g. deep-link or re-mount). If beginNavFilter already ran
  // this cycle, just stamp the token and return — state is already set.
  useLayoutEffect(() => {
    if (filterToken === undefined || filterToken === appliedTokenRef.current) return;
    if (!initialFilter) return;
    appliedTokenRef.current = filterToken;
    if (navAppliedRef.current) {
      navAppliedRef.current = false;
      return;
    }
    beginNavLoading(filterToken);
    applyNavFilter(initialFilter);
  }, [applyNavFilter, beginNavLoading, filterToken, initialFilter]);

  const { scrollY, headerBgOpacity, iconScrolledOpacity, bgTranslateY } = useHeaderScroll();

  // The text box stays bound to `query` for instant feedback; repo scans key off
  // the debounced value so they don't run per keystroke.
  const debouncedQuery = useDebouncedValue(query, 220);
  useEffect(() => {
    if (immediateQuery !== null && debouncedQuery === immediateQuery) {
      setImmediateQuery(null);
    }
  }, [debouncedQuery, immediateQuery]);
  const queryForResults = immediateQuery !== null && query === immediateQuery ? query : debouncedQuery;
  const merchantQuery = queryForResults.trim() || undefined;
  const searchCategoryIds = useMemo(() => {
    const q = queryForResults.trim().toLowerCase();
    if (!q) return [];
    return categories
      .filter(cat => cat.label.toLowerCase().includes(q))
      .map(cat => cat.id);
  }, [categories, queryForResults]);

  const handleChangeQuery = useCallback((nextQuery: string) => {
    setImmediateQuery(null);
    setQuery(nextQuery);
  }, []);

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
  const activityQueryKey = useMemo(() => JSON.stringify(activityQuery), [activityQuery]);
  const latestActivityQueryKeyRef = useRef(activityQueryKey);
  latestActivityQueryKeyRef.current = activityQueryKey;

  const loadFirstActivityPage = useCallback((showSkeleton = true) => {
    const loadKey = activityQueryKey;
    if (showSkeleton) setLoading(true);
    setLoadingMore(false);
    try {
      const page = transactionsRepo.listPage(activityQuery);
      if (loadKey !== latestActivityQueryKeyRef.current) return;
      setActivityRows(page.rows);
      setNextCursor(page.nextCursor);
      setActivitySummary(transactionsRepo.getSummary(transactionScope));
      setLoadError(false);
    } catch {
      if (loadKey !== latestActivityQueryKeyRef.current) return;
      setLoadError(true);
    } finally {
      const currentLoad = loadKey === latestActivityQueryKeyRef.current;
      if (showSkeleton && currentLoad) setLoading(false);
      if (currentLoad && navLoadingTokenRef.current !== null) {
        navLoadingTokenRef.current = null;
        setNavLoading(false);
      }
      if (currentLoad && listFadePending.current) {
        listFadePending.current = false;
        Animated.timing(listOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }
    }
  }, [activityQuery, activityQueryKey, transactionScope, transactionsRepo, listOpacity]);

  useEffect(() => {
    loadFirstActivityPage(true);
  }, [loadFirstActivityPage, repoVersion, navLoadToken]);

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
    // Merge internal swipe-delete pending ID with the external App-level signal so
    // any delete path (TxSheet, HomeScreen, swipe) hides the row in the same frame.
    const pendingId = pendingUndo?.tx.id ?? externalPendingDeleteId;
    const g: Record<string, { txs: Transaction[]; total: number }> = {};
    activityRows.forEach(t => {
      if (pendingId && t.id === pendingId) return;
      if (!g[t.fullDate]) g[t.fullDate] = { txs: [], total: 0 };
      g[t.fullDate].txs.push(t);
      g[t.fullDate].total += t.amount;
    });
    return g;
  }, [activityRows, pendingUndo?.tx.id, externalPendingDeleteId]);

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

  const filterPillCount = (selectedDay !== null ? 1 : 0) + (dateFilter !== null ? 1 : 0) + (amountFilterActive(amountFilter) ? 1 : 0) + catFilter.length;
  const hasFilterPills = filterPillCount > 0;

  // Safety net: removeFilter() dims listOpacity and relies on loadFirstActivityPage
  // to restore it. That callback only re-runs when activityQuery changes — but
  // selectedDay is not part of activityQuery, so clearing it (alone or via
  // "Clear all") can leave the list stuck at 0.65 opacity. Restore whenever all
  // pills are gone and a fade is still pending.
  useEffect(() => {
    if (!hasFilterPills && listFadePending.current) {
      listFadePending.current = false;
      Animated.timing(listOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [hasFilterPills, listOpacity]);

  const hasUnappliedInitialFilter = Boolean(initialFilter && filterToken !== undefined && filterToken !== appliedTokenRef.current);
  const showNavSkeleton = navLoading || hasUnappliedInitialFilter;
  useLayoutEffect(() => {
    if (!showNavSkeleton || filterToken === undefined) return;
    if (reportedSkeletonTokenRef.current === filterToken) return;
    reportedSkeletonTokenRef.current = filterToken;
    onNavSkeletonReady?.(filterToken);
  }, [filterToken, onNavSkeletonReady, showNavSkeleton]);
  const activityDayKeys = useMemo(
    () => !loading && !showNavSkeleton && !loadError && selectedDay === null && dayKeys.length > 0 ? dayKeys : [],
    [dayKeys, loadError, loading, selectedDay, showNavSkeleton],
  );

  const renderActivityDay = useCallback((day: string) => (
    <SectionCard dark={theme.dark} style={S.dayGroupCard}>
      <DayGroup
        day={day}
        group={grouped[day]}
        theme={theme}
        cats={cats}
        categories={categories}
        members={ledgerMembers}
        p={p}
        onPress={handleOpenTx}
        onPrepare={handlePrepareTx}
        onDelete={handleDeleteTx}
        canEditTx={(tx) => transactionsRepo.canEdit(tx)}
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
    ledgerMembers,
    p,
    theme,
    transactionsRepo,
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
      clearDateRange();
    }
  }, [clearDateRange, selectedDateId]);
  const handleCalendarSelectRange = useCallback(({ from, to }: { from: Date; to: Date }) => {
    setSelectedDay(null);
    setDateFilter({ from, to });
    setCalViewYear(from.getFullYear());
    setCalViewMonth(from.getMonth());
  }, []);
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
              backgroundColor: theme.dark ? MEDIA.hairline : ONMEDIA_BORDER_LIGHT,
            }]} />
          </Animated.View>
          {SUPPORTS_GLASS ? (
            <GlassCircleButton
              onPress={() => onOpenDrawer?.()}
              systemImage="line.3.horizontal"
              size={40}
              iconSize={18}
              iconColor={theme.dark ? MEDIA.text : '#0E0C18'}
              glassTint={glassTintForTheme(theme.dark)}
              colorScheme={theme.dark ? 'dark' : 'light'}
              accessibilityLabel="Open menu"
            />
          ) : (
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
          )}
          <View style={S.title} pointerEvents="none">
            <Text style={[S.titleText, { color: pWallpaper.text }]}>Activity</Text>
            <Animated.Text style={[S.titleText, StyleSheet.absoluteFill, { color: theme.text, opacity: iconScrolledOpacity }]}>Activity</Animated.Text>
          </View>
          <ThemeToggle />
        </View>

        {/* ── Scrollable content ──────────────────────────────────── */}
        <Animated.View style={{ flex: 1, opacity: listOpacity }}>
        <AnimatedGHFlatList
          key={listInstanceKey}
          ref={scrollViewRef}
          data={activityDayKeys}
          keyExtractor={(day) => String(day)}
          renderItem={renderActivityItem}
          accessibilityRole="list"
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
              <SwipeHint p={p} />
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
                onChangeQuery={handleChangeQuery}
                activeCount={activeCount}
                calendarActive={selectedDay !== null || (dateFilter !== null && typeof dateFilter !== 'string')}
                onOpenCalendar={openCalendarSheet}
                onOpenFilter={openFilterSheet}
              />

              {/* Active filter pills */}
              {hasFilterPills && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -16, marginTop: 4, marginVertical: -6 }}
                  contentContainerStyle={[S.filterStripScroll, { paddingHorizontal: 16, paddingVertical: 6 }]}
                  keyboardShouldPersistTaps="handled"
                >
                  {filterPillCount >= 2 && (
                    <Reanimated.View key="pill-clear-all" entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(200)}>
                      <FilterPill dark={theme.dark} overlay={glassTintForTheme(theme.dark)} onPress={() => removeFilter(clearAllFilters)} accessibilityLabel="Clear all filters">
                        <Text numberOfLines={1} style={[S.filterPillText, S.filterPillClearAll, { color: p.text }]}>Clear all</Text>
                      </FilterPill>
                    </Reanimated.View>
                  )}
                  {selectedDay !== null && (
                    <Reanimated.View key="pill-day" exiting={FadeOut.duration(160)} layout={LinearTransition.duration(200)}>
                      <FilterPill dark={theme.dark} onPress={() => removeFilter(() => setSelectedDay(null))} accessibilityLabel="Clear day selection">
                        <Icon name="cal" size={10} color={p.text} stroke={1.7} />
                        <Text numberOfLines={1} style={[S.filterPillText, { color: p.text }]}>
                          {MONTHS[calViewMonth]} {selectedDay}
                        </Text>
                        <Icon name="close" size={10} color={p.text} stroke={2} />
                      </FilterPill>
                    </Reanimated.View>
                  )}
                  {dateFilter && typeof dateFilter === 'string' && (
                    <Reanimated.View key="pill-date" exiting={FadeOut.duration(160)} layout={LinearTransition.duration(200)}>
                      <FilterPill dark={theme.dark} onPress={() => removeFilter(clearDateRange)} accessibilityLabel="Remove date filter">
                        <Icon name="cal" size={10} color={p.text} stroke={1.7} />
                        <Text numberOfLines={1} style={[S.filterPillText, { color: p.text }]}>
                          {DATE_PRESETS.find(dp => dp.id === dateFilter)?.label}
                        </Text>
                        <Icon name="close" size={10} color={p.text} stroke={2} />
                      </FilterPill>
                    </Reanimated.View>
                  )}
                  {dateFilter && typeof dateFilter !== 'string' && (
                    <Reanimated.View key="pill-date-range" exiting={FadeOut.duration(160)} layout={LinearTransition.duration(200)}>
                      <FilterPill dark={theme.dark} onPress={() => removeFilter(clearDateRange)} accessibilityLabel="Remove date filter">
                        <Icon name="cal" size={10} color={p.text} stroke={1.7} />
                        <Text numberOfLines={1} style={[S.filterPillText, { color: p.text }]}>
                          {fmtDate(dateFilter.from)} – {fmtDate(dateFilter.to)}
                        </Text>
                        <Icon name="close" size={10} color={p.text} stroke={2} />
                      </FilterPill>
                    </Reanimated.View>
                  )}
                  {amountFilterActive(amountFilter) && (
                    <Reanimated.View key="pill-amount" exiting={FadeOut.duration(160)} layout={LinearTransition.duration(200)}>
                      <FilterPill dark={theme.dark} overlay={theme.dark ? 'rgba(231,234,237,0.38)' : 'rgba(14,17,22,0.38)'} onPress={() => removeFilter(() => setAmountFilter(null))} accessibilityLabel="Remove amount filter">
                        <Icon name="wallet" size={10} color={p.text} stroke={1.7} />
                        <Text numberOfLines={1} style={[S.filterPillText, { color: p.text }]}>
                          {amountFilterLabel(amountFilter)}
                        </Text>
                        <Icon name="close" size={10} color={p.text} stroke={2} />
                      </FilterPill>
                    </Reanimated.View>
                  )}
                  {catFilter.map(catId => {
                    const cat = cats[catId];
                    return (
                      <Reanimated.View key={catId} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(200)}>
                        <FilterPill dark={theme.dark} overlay={categoryGroupColor(catId, categories, theme.dark) + '26'} onPress={() => removeFilter(() => setCatFilter(catFilter.filter(c => c !== catId)))} accessibilityLabel={`Remove ${cat?.label} filter`}>
                          <Icon name={cat?.icon} size={11} color={p.text} stroke={1.6} />
                          <Text numberOfLines={1} style={[S.filterPillText, { color: p.text }]}>{cat?.label}</Text>
                          <Icon name="close" size={10} color={p.text} stroke={2} />
                        </FilterPill>
                      </Reanimated.View>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {(loading || showNavSkeleton) ? (
              <SectionCard dark={theme.dark}>
                <TxListSkeleton dark={theme.dark} />
              </SectionCard>
            ) : loadError ? (
              <SectionCard dark={theme.dark}>
                <LoadError
                  theme={theme}
                  p={p}
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
                        style={S.detailUnavailableHost}
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
                          members={ledgerMembers}
                          p={p}
                          onPress={() => handleOpenTx(tx)}
                          last={i === dayDetail.txs.length - 1 && dayDetail.bills.length === 0}
                        />
                      ))}
                      {dayDetail.bills.map((bill, i) => (
                        <BillRow key={bill.id} bill={bill} theme={theme} categories={categories} p={p} last={i === dayDetail.bills.length - 1} />
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
                    p={p}
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
                        <Text style={[S.summaryLabel, { color: p.text }]}>
                          {filteredExpenseCount} {filteredExpenseCount === 1 ? 'expense' : 'expenses'}
                        </Text>
                        <View style={S.summaryValueWrap}>
                          <Money
                            value={filteredSpendTotal}
                            theme={theme}
                            size={15}
                            color={p.text}
                            prefix="$"
                          />
                          <Text style={[S.summaryTotal, { color: p.text }]}> total</Text>
                        </View>
                      </View>
                    </SectionCard>
                  )}
                </>
              )
            )}

            </View>
          )}
        />
        </Animated.View>

        <CalendarSheet
          ref={calendarSheetRef}
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
          onClearDay={clearSelectedDay}
          onClearRange={clearDateRange}
          onOpenChange={onOverlayOpenChange}
        />

        <FilterSheet
          ref={filterSheetRef}
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
          onOpenChange={onOverlayOpenChange}
        />

        <Toast
          theme={theme}
          message={pendingUndo ? 'Transaction deleted' : deniedMessage}
          actionLabel={pendingUndo ? 'Undo' : undefined}
          onAction={pendingUndo ? handleUndoDelete : undefined}
          onDismiss={pendingUndo ? commitDelete : () => setDeniedMessage(null)}
        />
    </View>
  );
});

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

const CalendarSheet = React.memo(React.forwardRef<SheetHandle, {
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
  onClearDay: () => void;
  onClearRange: () => void;
  onOpenChange?: (open: boolean) => void;
}>(function CalendarSheet({
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
  onClearDay,
  onClearRange,
  onOpenChange,
}, ref) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const animatedIndex = useSharedValue(-1);
  const presentedRef = useRef(false);
  const [contentReady, setContentReady] = useState(false);
  const activeRange = dateFilter && typeof dateFilter !== 'string'
    ? { startId: toDateId(dateFilter.from), endId: toDateId(dateFilter.to) }
    : null;
  const [mode, setMode] = useState<CalendarSelectMode>(activeRange ? 'range' : 'day');
  const [draftRange, setDraftRange] = useState<{ startId?: string; endId?: string }>({});
  const [previewSelection, setPreviewSelection] = useState<CalendarPreviewSelection>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeRange) {
      setMode('range');
      setDraftRange(activeRange);
    }
  }, [activeRange?.startId, activeRange?.endId]);

  useEffect(() => {
    if (contentReady) return;
    const task = InteractionManager.runAfterInteractions(() => setContentReady(true));
    return () => task.cancel?.();
  }, [contentReady]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const markOpen = useCallback(() => {
    if (presentedRef.current) return;
    presentedRef.current = true;
    onOpenChange?.(true);
  }, [onOpenChange]);

  const markClosed = useCallback(() => {
    if (!presentedRef.current) return;
    presentedRef.current = false;
    onOpenChange?.(false);
  }, [onOpenChange]);

  const close = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    markClosed();
    setPreviewSelection(null);
    sheetRef.current?.close();
  }, [markClosed]);

  const resetSelection = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setMode('day');
    setDraftRange({});
    setPreviewSelection(null);
  }, []);

  const open = useCallback(() => {
    if (!contentReady) setContentReady(true);
    if (presentedRef.current) return;
    markOpen();
    sheetRef.current?.snapToIndex(0);
  }, [contentReady, markOpen]);

  useImperativeHandle(ref, () => ({ open, close, resetSelection }), [close, open, resetSelection]);

  useAnimatedReaction(
    () => {
      const index = animatedIndex.value;
      if (index <= -0.35) return 'closed';
      if (index >= -0.02) return 'open';
      return 'moving';
    },
    (state, previous) => {
      if (state === previous) return;
      if (state === 'closed') runOnJS(markClosed)();
      if (state === 'open') runOnJS(markOpen)();
    },
    [markClosed, markOpen],
  );

  const handleSheetChange = useCallback((idx: number) => {
    if (idx === -1) markClosed();
  }, [markClosed]);

  const handleSheetAnimate = useCallback((_fromIndex: number, toIndex: number) => {
    if (toIndex === -1) markClosed();
  }, [markClosed]);

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
    if (previewSelection?.kind === 'day') {
      return [{ startId: previewSelection.dateId, endId: previewSelection.dateId }];
    }
    if (previewSelection?.kind === 'range') {
      return [{ startId: previewSelection.startId, endId: previewSelection.endId }];
    }
    if (mode === 'range' && rangeStartId) {
      return [{ startId: rangeStartId, endId: rangeEndId ?? rangeStartId }];
    }
    return selectedDateId ? [{ startId: selectedDateId, endId: selectedDateId }] : [];
  }, [mode, previewSelection, rangeEndId, rangeStartId, selectedDateId]);
  const handleDatePress = useCallback((dateId: string) => {
    const commitSelection = (commit: () => void) => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      requestAnimationFrame(() => {
        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          commit();
        }, 0);
      });
    };

    if (mode === 'day') {
      setPreviewSelection({ kind: 'day', dateId });
      commitSelection(() => {
        onSelectDate(dateId);
        if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          close();
        }, 160);
      });
      return;
    }
    if (!rangeStartId || rangeEndId) {
      setDraftRange({ startId: dateId });
      setPreviewSelection({ kind: 'day', dateId });
      return;
    }
    if (dateId === rangeStartId) {
      setDraftRange({});
      setPreviewSelection(null);
      return;
    }
    const start = fromDateId(rangeStartId);
    const end = fromDateId(dateId);
    const ordered = start <= end ? { from: start, to: end } : { from: end, to: start };
    setDraftRange({ startId: toDateId(ordered.from), endId: toDateId(ordered.to) });
    setPreviewSelection({
      kind: 'range',
      startId: toDateId(ordered.from),
      endId: toDateId(ordered.to),
    });
    commitSelection(() => {
      onSelectRange(ordered);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        close();
      }, RANGE_CLOSE_DELAY_MS);
    });
  }, [close, mode, onSelectDate, onSelectRange, rangeEndId, rangeStartId]);
  const handleClear = useCallback(() => {
    setDraftRange({});
    setPreviewSelection(null);
    resetSelection();
    if (rangeStartId) {
      onClearRange();
      return;
    }
    onClearDay();
  }, [onClearDay, onClearRange, rangeStartId, resetSelection]);
  const calendarTheme = useMemo<CalendarTheme>(() => ({
    rowMonth: {
      content: {
        color: theme.text,
        fontSize: TYPE.subsectionTitle.fontSize,
        fontWeight: TYPE.subsectionTitle.fontWeight,
        textAlign: 'left',
      },
    },
    itemWeekName: {
      content: {
        color: theme.textSec,
        fontSize: TYPE.labelLg.fontSize,
        fontWeight: TYPE.labelLg.fontWeight,
      },
    },
  }), [theme.text, theme.textSec]);
  const handleIndicatorStyle = useMemo(() => ({ backgroundColor: theme.textTer }), [theme.textTer]);
  const backgroundStyle = useMemo(() => ({ backgroundColor: theme.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }), [theme.surface]);
  const calendarInitialMonthId = useMemo(() => toDateId(initialMonthDate), [initialMonthDate]);
  const marksQueryKey = useMemo(() => [
    repoVersion,
    catFilter.join('|'),
    merchantQuery ?? '',
    searchCategoryIds.join('|'),
    amountFilterLabel(amountFilter),
  ].join('::'), [amountFilter, catFilter, merchantQuery, repoVersion, searchCategoryIds]);
  const marksCacheRef = useRef(new Map<string, Record<number, string[]>>());

  useEffect(() => {
    marksCacheRef.current.clear();
  }, [marksQueryKey]);

  const getMarksByDay = useCallback((year: number, month: number) => {
    const cacheKey = `${marksQueryKey}:${year}-${month}`;
    const cached = marksCacheRef.current.get(cacheKey);
    if (cached) return cached;

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
    marksCacheRef.current.set(cacheKey, groupedRows);
    return groupedRows;
  }, [amountFilter, catFilter, marksQueryKey, merchantQuery, searchCategoryIds, transactionsRepo]);
  const colorForCat = useMemo(() => {
    const cache: Record<string, string> = {};
    return (catId: string) => (
      cache[catId] ??= categoryGroupColor(catId, categories, theme.dark)
    );
  }, [categories, theme.dark]);
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
      colorForCat={colorForCat}
      getMarksByDay={getMarksByDay}
      selectedDateId={selectedDateId}
      mode={mode}
      onSelectDate={handleDatePress}
    />
  ), [
    colorForCat,
    getMarksByDay,
    selectedDateId,
    mode,
    theme,
    handleDatePress,
  ]);
  const hasCalendarSelection = Boolean(selectedDateId || rangeStartId);

  return (
    <BottomSheet
      ref={sheetRef}
      animatedIndex={animatedIndex}
      index={-1}
      snapPoints={['82%']}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      onChange={handleSheetChange}
      onClose={markClosed}
      onAnimate={handleSheetAnimate}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
      containerStyle={CS.sheetLayer}
    >
      {!contentReady ? (
        <View style={{ flex: 1, backgroundColor: theme.surface }} />
      ) : (
        <View style={[CS.sheetContent, { backgroundColor: theme.surface }]}>
          <View style={[CS.sheetHeader, { borderBottomColor: theme.sep }]}>
            <View style={CS.headerLeft}>
              <ScreenExitButton
                variant="close"
                onPress={close}
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
                    if (next === 'day') {
                      resetSelection();
                      onClearRange();
                      return;
                    }
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
            onCalendarDayPress={handleDatePress}
            renderItem={renderMonth}
            theme={calendarTheme}
          />
        </View>
      )}
    </BottomSheet>
  );
}));

const HistoryCalendarMonth = React.memo(function HistoryCalendarMonth({
  item,
  theme,
  colorForCat,
  getMarksByDay,
  selectedDateId,
  mode,
  onSelectDate,
}: {
  item: CalendarMonthEnhanced;
  theme: Theme;
  colorForCat: (catId: string) => string;
  getMarksByDay: (year: number, month: number) => Record<number, string[]>;
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
  const marksByDay = useMemo(() => getMarksByDay(year, month), [getMarksByDay, month, year]);

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
                    colorForCat={colorForCat}
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
  colorForCat,
  textColor,
  selected,
}: {
  catIds: string[];
  theme: Theme;
  colorForCat: (catId: string) => string;
  textColor: string;
  selected: boolean;
}) {
  if (catIds.length === 0) return <View style={CS.dayMarksPlaceholder} />;

  const visible = catIds.slice(0, 2);
  const remaining = catIds.length - visible.length;
  const uniqueColors = visible.map(colorForCat);
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
                borderColor: theme.dark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.20)',
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

const FilterSheet = React.memo(React.forwardRef<SheetHandle, {
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
  onOpenChange?: (open: boolean) => void;
}>(
function FilterSheet({
  theme, catFilter, dateFilter, amountFilter, sortBy,
  categories, cats, setCatFilter, setDateFilter, setAmountFilter, setSortBy, clearDay, onOpenChange,
}, ref) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const animatedIndex = useSharedValue(-1);
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
  const [everVisible, setEverVisible] = useState(false);
  const everVisibleRef = useRef(false);

  const markOpen = useCallback(() => {
    if (presentedRef.current) return;
    presentedRef.current = true;
    onOpenChange?.(true);
  }, [onOpenChange]);

  const markClosed = useCallback(() => {
    if (!presentedRef.current) return;
    presentedRef.current = false;
    onOpenChange?.(false);
  }, [onOpenChange]);

  const close = useCallback(() => {
    markClosed();
    sheetRef.current?.close();
  }, [markClosed]);

  const open = useCallback(() => {
    if (!everVisibleRef.current) {
      everVisibleRef.current = true;
      setEverVisible(true);
    }
    if (presentedRef.current) return;
    markOpen();
    sheetRef.current?.snapToIndex(0);
  }, [markOpen]);

  useImperativeHandle(ref, () => ({ open, close }), [close, open]);

  useAnimatedReaction(
    () => {
      const index = animatedIndex.value;
      if (index <= -0.35) return 'closed';
      if (index >= -0.02) return 'open';
      return 'moving';
    },
    (state, previous) => {
      if (state === previous) return;
      if (state === 'closed') runOnJS(markClosed)();
      if (state === 'open') runOnJS(markOpen)();
    },
    [markClosed, markOpen],
  );

  const handleSheetChange = useCallback((idx: number) => {
    if (idx === -1) markClosed();
  }, [markClosed]);

  const handleSheetAnimate = useCallback((_fromIndex: number, toIndex: number) => {
    if (toIndex === -1) markClosed();
  }, [markClosed]);

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
  useEffect(() => {
    if (everVisibleRef.current) return;
    const task = InteractionManager.runAfterInteractions(() => {
      everVisibleRef.current = true;
      setEverVisible(true);
    });
    return () => task.cancel?.();
  }, []);

  useEffect(() => {
    if (everVisible) everVisibleRef.current = true;
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

  const dateMenu = useMemo(() => {
    const isCustom = customLabel !== null;
    const activeLabel = isCustom
      ? customLabel
      : (dateFilter === null ? 'Any time' : DATE_PRESETS.find(p => p.id === dateFilter)?.label ?? 'Any time');
    return (
      <View style={FS.sortRow}>
        <Text style={[FS.sortRowLabel, { color: theme.text }]}>Date</Text>
        <Host ignoreSafeArea="all" style={{ width: 160, height: 28 }}>
          <Menu
            label={
              <View style={[FS.menuTrigger, { width: 160, height: 28, justifyContent: 'flex-end' }]}>
                <Text style={[FS.menuTriggerText, { color: theme.accent.dot }]} numberOfLines={1}>
                  {activeLabel}
                </Text>
                <Icon name="chevDown" size={11} color={theme.accent.dot} stroke={2} />
              </View>
            }
          >
            <SwiftButton
              systemImage={dateFilter === null && !isCustom ? 'checkmark' : undefined}
              onPress={() => handleDatePickerChange(0)}
              label="Any time"
            />
            {DATE_PRESETS.map((preset, i) => (
              <SwiftButton
                key={String(i)}
                systemImage={typeof dateFilter === 'string' && dateFilter === preset.id ? 'checkmark' : undefined}
                onPress={() => handleDatePickerChange(i + 1)}
                label={preset.label}
              />
            ))}
            {isCustom && (
              <SwiftButton
                systemImage="checkmark"
                onPress={() => setDateFilter(null)}
                label={customLabel!}
              />
            )}
          </Menu>
        </Host>
      </View>
    );
  }, [customLabel, dateFilter, theme.text, theme.accent.dot, handleDatePickerChange, setDateFilter]);

  return (
    <BottomSheet
      ref={sheetRef}
      animatedIndex={animatedIndex}
      index={-1}
      snapPoints={['88%']}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      onChange={handleSheetChange}
      onClose={markClosed}
      onAnimate={handleSheetAnimate}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={backgroundStyle}
      containerStyle={CS.sheetLayer}
    >
      {!everVisible ? (
        <View style={{ flex: 1, backgroundColor: theme.surface }} />
      ) : (
        <View style={[FS.content, { backgroundColor: theme.surface }]}>

          {/* ── Header ──────────────────────────────────────── */}
          <View style={[FS.header, { borderBottomColor: theme.sep }]}>
            <ScreenExitButton
              variant="close"
              onPress={close}
              tint={theme.textSec}
              fallbackBg={theme.chipBg}
              accessibilityLabel="Done"
            />
            <Text style={[FS.title, { color: theme.text }]} pointerEvents="none">Filters</Text>
            <TouchableOpacity
              onPress={clearAll}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              disabled={activeCount === 0}
              style={{ opacity: activeCount > 0 ? 1 : 0 }}
            >
              <Text style={[FS.clearLink, { color: theme.accent.dot }]}>Clear all</Text>
            </TouchableOpacity>
          </View>

          <BottomSheetScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 440 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Sort + Date — control card ──────────────────── */}
            <View style={[FS.controlsCard, { backgroundColor: theme.chipBg }]}>
              {sortMenu}
              <View style={[FS.cardRowDivider, { backgroundColor: theme.sep }]} />
              {dateMenu}
            </View>

            {/* ── Amount range ────────────────────────────────── */}
            <View style={[FS.groupEyebrow, { gap: 0, justifyContent: 'space-between' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <View style={[FS.groupDot, { backgroundColor: theme.textTer }]} />
                <Text style={[FS.groupEyebrowText, { color: theme.textSec }]}>Amount</Text>
              </View>
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
            <View style={[FS.amountCard, { marginHorizontal: LAYOUT.cardPadX, backgroundColor: theme.chipBg }]}>
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
              <Text style={[FS.amountHint, { color: OVER_DOT, marginHorizontal: LAYOUT.cardPadX }]}>
                Min should be less than max
              </Text>
            )}

            {/* ── Category rows ─────────────────────────────── */}
            {groupedCategories.map(g => {
              const groupColor = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
              return (
                <View key={g.key}>
                  <View style={FS.groupEyebrow}>
                    <View style={[FS.groupDot, { backgroundColor: groupColor }]} />
                    <Text style={[FS.groupEyebrowText, { color: theme.textSec }]}>{g.label}</Text>
                  </View>

                  {g.cats.length === 0 ? (
                    <Text style={[FS.groupEmpty, { color: theme.textSec }]}>
                      No {g.label.toLowerCase()} transactions yet
                    </Text>
                  ) : (
                    <View style={[FS.catGroupCard, { backgroundColor: theme.chipBg }]}>
                      {g.cats.map((catId, i) => {
                        const c      = cats[catId];
                        const active = localCatFilter.includes(catId);
                        return (
                          <TouchableOpacity
                            key={catId}
                            onPress={() => toggleCatFilter(catId)}
                            activeOpacity={0.75}
                            style={[
                              FS.catRow,
                              i < g.cats.length - 1 && { borderBottomColor: active ? groupColor + '30' : theme.sep, borderBottomWidth: StyleSheet.hairlineWidth },
                              active && { backgroundColor: groupColor + '20' },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={c.label}
                          >
                            <View style={[FS.catRowIcon, { backgroundColor: groupColor + (active ? '40' : '24') }]}>
                              <Icon name={c.icon} size={16} color={groupColor} stroke={1.6} />
                            </View>
                            <Text style={[FS.catRowLabel, { color: theme.text }]}>{c.label}</Text>
                            {active && <Icon name="check" size={16} color={groupColor} stroke={2} />}
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
            passthrough
          />
        </View>
      )}
    </BottomSheet>
  );
}));

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
  const accessibilityLabel = label === 'Min' ? 'Minimum amount' : label === 'Max' ? 'Maximum amount' : `${label} amount`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
        {hasValue ? `$${value}` : '$0.00'}
      </Text>
    </Pressable>
  );
}

// ─── DayGroup ────────────────────────────────────────────────────────────────

const DayGroup = React.memo(function DayGroup({
  day, group, theme, cats, categories, members, p, onPress, onDelete, canEditTx,
  onPrepare, onSwipeOpen, onSwipeClose, scrollRef, avgDaySpend, style,
}: {
  day: string;
  group: { txs: Transaction[]; total: number };
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  members: LedgerMember[];
  p: WallpaperP;
  onPress: (tx: Transaction) => void;
  onPrepare?: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  canEditTx: (tx: Transaction) => boolean;
  onSwipeOpen: (ref: Swipeable) => void;
  onSwipeClose: () => void;
  scrollRef: React.RefObject<any>;
  avgDaySpend: number;
  style?: any;
}) {
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
        <Text style={[S.dayLabel, { color: p.text }]}>{label}</Text>
        {expenseCount > 1 && (
          <Text style={[S.dayTotal, { color: p.text }]}>
            {`$${spendTotal.toFixed(2)} total`}
          </Text>
        )}
      </View>
      <View style={{ overflow: 'hidden' }}>
        {txs.map((tx, i) => {
          const canDelete = canEditTx(tx);
          return (
            <SwipeRow
              key={tx.id}
              onDelete={canDelete ? () => onDelete(tx) : undefined}
              onOpen={onSwipeOpen}
              onClose={onSwipeClose}
              scrollRef={scrollRef}
            >
              <TxRow
                tx={tx}
                theme={theme}
                cats={cats}
                categories={categories}
                members={members}
                p={p}
                onPrepare={() => onPrepare?.(tx)}
                onPress={() => onPress(tx)}
                last={i === txs.length - 1}
                onDelete={canDelete ? () => onDelete(tx) : undefined}
              />
            </SwipeRow>
          );
        })}
      </View>
    </View>
  );
});

// ─── SwipeRow ────────────────────────────────────────────────────────────────

function SwipeRow({ children, onDelete, onOpen, onClose, scrollRef }: {
  children: React.ReactNode;
  onDelete?: () => void;
  onOpen: (ref: Swipeable) => void;
  onClose: () => void;
  scrollRef: React.RefObject<any>;
}) {
  const swipeRef = useRef<Swipeable>(null);
  if (!onDelete) return <>{children}</>;

  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
      return (
        <Animated.View style={{ width: 78, transform: [{ translateX }] }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onDelete();
            }}
            style={S.swipeActionBtn}
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
          >
            <Icon name="trash" size={18} color={ON_GROUP_ICON} stroke={1.6} />
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [onDelete],
  );

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

const TxRow = React.memo(function TxRow({
  tx, theme, cats, categories, members, p, onPress, onPrepare, last, onDelete,
}: {
  tx: Transaction;
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  members: LedgerMember[];
  p: WallpaperP;
  onPress: () => void;
  onPrepare?: () => void;
  last: boolean;
  onDelete?: () => void;
}) {
  const cat        = cats[tx.cat];
  const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
  const isIncome   = tx.type === 'income';
  const isGoalContribution = isGoalContributionTx(tx);
  const incomeColor = theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light;
  const baseMeta = appendMemberLabel(cat?.label ?? UNCATEGORIZED_LABEL, members, tx.createdByUserId);
  const meta = isGoalContribution ? `Goal contribution · ${baseMeta}` : baseMeta;
  const title = isGoalContribution ? (cat?.label ? `${cat.label} contribution` : tx.merchant) : tx.merchant;

  return (
    <Pressable
      onPressIn={onPrepare}
      onPress={onPress}
      style={({ pressed }) => [S.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: p.hairline, opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}, ${isIncome ? '+' : '−'}$${tx.amount.toFixed(2)}`}
      accessibilityActions={onDelete ? [{ name: 'delete', label: 'Delete transaction' }] : undefined}
      onAccessibilityAction={onDelete ? (e) => { if (e.nativeEvent.actionName === 'delete') onDelete(); } : undefined}
    >
      <MerchantMark
        merchant={title}
        catIcon={isGoalContribution ? 'target' : cat?.icon}
        color={groupColor}
        logoEnabled={!isGoalContribution && transactionUsesMerchantLogo(tx)}
        size={32}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={S.nameRow}>
          <Text style={[S.txName, { color: p.text, flexShrink: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          {tx.recurring && <Icon name="repeat" size={11} color={p.textTer} stroke={1.7} />}
          {isGoalContribution && <Icon name="target" size={11} color={groupColor} stroke={1.7} />}
        </View>
        <Text style={[S.txMeta, { color: p.textSec }]}>{meta} · {tx.time}</Text>
      </View>
      <Money
        value={tx.amount}
        size={13}
        weight="500"
        theme={theme}
        prefix={isIncome ? '+$' : '−$'}
        color={isIncome ? incomeColor : p.textSec}
      />
    </Pressable>
  );
});

// ─── BillRow ─────────────────────────────────────────────────────────────────

function BillRow({ bill, theme, categories, p, last }: { bill: Bill; theme: Theme; categories: Category[]; p: WallpaperP; last: boolean }) {
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

function LoadError({ theme, p, onRetry }: { theme: Theme; p: WallpaperP; onRetry: () => void }) {
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

function SwipeHint({ p }: { p: WallpaperP }) {
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

function EmptyState({ theme, p, isFiltered, onClearFilters }: {
  theme: Theme;
  p: WallpaperP;
  isFiltered: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <View style={S.empty}>
      <Host
        ignoreSafeArea="all"
        colorScheme={theme.dark ? 'dark' : 'light'}
        style={S.unavailableHost}
      >
        <ContentUnavailableView
          title={isFiltered ? 'No results' : 'No transactions yet'}
          systemImage={isFiltered ? 'magnifyingglass' : 'tray'}
          description={
            isFiltered
              ? 'Try adjusting your filters'
              : '\nTap the add button below to record your first expense'
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
    paddingHorizontal: LAYOUT.cardPadX,
    paddingBottom: LAYOUT.rowPadY,
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
  title: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    textAlign: 'center',
    ...TYPE.pageTitle,
  },

  // Section stack
  listContent: {
    paddingHorizontal: LAYOUT.screenGutter,
    paddingBottom: 160,
  },
  sectionStack: {
    gap: SPACE.lg,
    marginBottom: SPACE.lg,
  },
  dayGroupCard: {
    marginBottom: SPACE.lg,
  },
  swipeHintCard: {
    marginBottom: SPACE.lg,
  },
  loadingMore: {
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  swipeHint: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.xs,
    justifyContent: 'flex-end', paddingTop: SPACE.sm, paddingBottom: SPACE.px2,
  },
  swipeHintText: {
    ...TYPE.caption,
  },

  searchWrap: {
    paddingHorizontal: SPACE.xs,
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: SPACE.md, paddingRight: SPACE.sm, paddingVertical: SPACE.sm,
    borderRadius: RADIUS.full, gap: SPACE.sm,
  },
  filterPillBlur: {
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterPillText: {
    ...TYPE.caption,
    flexShrink: 1,
    maxWidth: 150,
  },
  filterPillClearAll: {
    ...TYPE.captionEm,
    paddingRight: SPACE.xs,
  },
  filterStripScroll: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingRight: SPACE.xs,
  },
  emptyClear: {
    marginTop: SPACE.lg, paddingHorizontal: LAYOUT.cardPadX, paddingVertical: LAYOUT.rowPadY,
    borderRadius: RADIUS.full,
  },
  emptyClearText: {
    ...TYPE.bodySm,
  },
  // Day detail
  detailEmptyWrap: {
    alignItems: 'center', paddingVertical: LAYOUT.rowPadY,
  },
  // Rows
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
  },
  upcomingPill: {
    paddingHorizontal: SPACE.sm, paddingVertical: SPACE.px2, borderRadius: RADIUS.full,
  },
  upcomingText: {
    ...TYPE.labelSmPlain,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: SPACE.px2, marginBottom: SPACE.sm,
  },
  dayLabel: {
    ...TYPE.txDateLabel,
  },
  dayTotal: {
    ...TYPE.bodySmEm,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: SPACE.px2,
    paddingBottom: SPACE.md, marginBottom: SPACE.lg,
  },
  summaryRowSolo: {
    paddingBottom: 0,
    marginBottom: 0,
  },
  summaryLabel: {
    ...TYPE.subsectionTitle,
  },
  summaryTotal: {
    ...TYPE.subsectionTitle,
  },
  summaryValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swipeActionBtn: {
    flex: 1, marginLeft: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: OVER_DOT,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: SPACE.md, paddingVertical: LAYOUT.rowPadY,
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18, // width/2 — circle
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  txName: { ...TYPE.body },
  txMeta: { ...TYPE.caption, marginTop: 2 },
  empty:      { alignItems: 'center', paddingTop: 40, paddingBottom: 24 },
  // Fixed frame (not matchContents) so the SwiftUI ContentUnavailableView has
  // real bounds to wrap its description within — matchContents sizes to the
  // text's intrinsic width, which runs it off-screen on one line.
  unavailableHost: { width: '100%', height: 240 },
  // Day-detail empty has a short description that fits, so matchContents is fine.
  detailUnavailableHost: { width: '100%' },
});

// ─── CalendarSheet styles ───────────────────────────────────────────────────

const CS = StyleSheet.create({
  sheetLayer: {
    zIndex: 80,
    elevation: 80,
  },
  sheetContent: {
    flex: 1,
    paddingTop: SPACE.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACE.md,
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
    gap: SPACE.xs,
  },
  daySlot: {
    flex: 1,
    height: HISTORY_CAL_DAY_HEIGHT,
    borderRadius: RADIUS.button,
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
    borderRadius: 3.5, // height/2 — pill dot
    borderWidth: 1,
    // borderColor is set inline in DayActivityMarks (theme-aware)
  },
  dayCount: {
    ...TYPE.labelPlain,
    marginLeft: SPACE.xs,
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
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  title: {
    ...TYPE.pageTitle,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  clearLink: {
    ...TYPE.bodySm,
  },
  // Sort by — card container
  controlsCard: {
    marginHorizontal: LAYOUT.cardPadX,
    marginTop: SPACE.lg,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },

  // Single row inside the controls card
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LAYOUT.screenGutter,
    paddingVertical: 13, // off-grid by design — slightly taller than rowPadY for form rows
    minHeight: 44,
  },
  sortRowLabel: {
    ...TYPE.body,
  },
  menuTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingVertical: SPACE.xs,
    paddingLeft: SPACE.sm,
  },
  menuTriggerText: {
    ...TYPE.body,
    fontWeight: '500',
  },

  amountClear: {
    ...TYPE.bodySm,
  },
  amountCard: {
    minHeight: 66,
    borderRadius: RADIUS.field,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  amountField: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenGutter,
    paddingVertical: 11, // off-grid by design — tighter than rowPadY for form fields
  },
  amountFieldLabel: {
    ...TYPE.labelPlain,
    marginBottom: SPACE.xs,
  },
  amountFieldValue: {
    ...TYPE.body,
  },
  amountDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: SPACE.md,
  },
  amountHint: {
    ...TYPE.caption,
    marginTop: SPACE.sm,
  },

  cardRowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: LAYOUT.screenGutter,
  },

  // Category section
  groupEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.sm,
    gap: SPACE.sm,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  groupEyebrowText: {
    ...TYPE.labelLg,
  },
  catGroupCard: {
    marginHorizontal: LAYOUT.cardPadX,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: LAYOUT.screenGutter,
    paddingVertical: LAYOUT.rowPadY,
    gap: SPACE.md,
    minHeight: 52,
  },
  catRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catRowLabel: {
    ...TYPE.body,
    flex: 1,
  },
  groupEmpty: {
    paddingHorizontal: LAYOUT.cardPadX, paddingVertical: LAYOUT.rowPadY,
    ...TYPE.caption, fontStyle: 'italic',
  },

});
