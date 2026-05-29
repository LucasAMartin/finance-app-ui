import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Swipeable,
  ScrollView as GHScrollView,
} from 'react-native-gesture-handler';

const AnimatedGHScrollView = Animated.createAnimatedComponent(GHScrollView);
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheet, Group, Host, RNHostView, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { background, presentationDetents, presentationDragIndicator, pickerStyle, tag, tint, fixedSize, environment } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import type { Bill, Category, Transaction } from '../repositories/types';
import { txToCreateInput, upcomingBillsFromRecurring } from '../selectors/finance';
import type { ActivityInitialFilter } from '../selectors/spending';

const CALENDAR_YEAR  = 2026;
const CALENDAR_MONTH = 4; // 0-indexed → May
const CALENDAR_COLLAPSE_FALLBACK_HEIGHT = 430;
const MINI_CALENDAR_COLLAPSE_FALLBACK_HEIGHT = 360;
const EASE_OUT_QUINT = Easing.bezier(0.22, 1, 0.36, 1);

// Calendar open state persists across screen remounts (and across the rest of
// the app session). Module-scope so it survives even if ActivityScreen ever
// unmounts; today the App keeps all screens mounted, but this is the cheap
// safeguard against future architectural changes.
// Defaults closed so the transaction list — the primary content of a "History"
// screen — sits above the fold; the calendar is a secondary filter tool opened
// on demand via the handle.
let cachedCalOpen = false;
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';
import { Skeleton } from '../components/Skeleton';
import { TxSheet } from '../components/TxSheet';
import { Toast } from '../components/Toast';
import { ThemeToggle } from '../components/ThemeToggle';
import { TransactionCalendar, CalDayMark } from '../components/TransactionCalendar';
import { HeaderIcon, useHeaderScroll } from '../components/headerScroll';
import { Theme, GROUP_COLORS, OVER_DOT, cautionBg, cautionText } from '../theme';
import { MEDIA, DARK_TEXT_SHADOW, makeP, makeScrim } from '../wallpaperPalette';
import { TYPE } from '../typography';
import { useTheme } from '../ThemeProvider';

function SectionCard({ children, style, noPad, dark }: { children: React.ReactNode; style?: any; noPad?: boolean; dark: boolean }) {
  const borderColor = dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';
  return (
    <BlurView
      intensity={dark ? 70 : 100}
      tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
      style={[S.sectionCard, style]}
    >
      <View style={[S.sectionCardBorder, noPad && S.sectionCardBorderFlush, { borderColor }]}>
        {children}
      </View>
    </BlurView>
  );
}

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
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;
  const expandedHeight = measuredHeight ?? fallbackHeight;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration,
      easing: EASE_OUT_QUINT,
      useNativeDriver: false,
    }).start();
  }, [anim, duration, open]);

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={{
        overflow: 'hidden',
        height: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, expandedHeight],
        }),
        opacity: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        }),
      }}
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
    </Animated.View>
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

const todayDom = (transactions: Transaction[]) => {
  const t = transactions.find(tx => tx.when === 'today');
  const pd = t ? parseMonthDay(t.fullDate) : null;
  return pd ? pd.day : null;
};

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function fmtDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

interface Props {
  theme: Theme;
  onOpenDrawer?: () => void;
  initialFilter?: ActivityInitialFilter | null;
  filterToken?: number;
}

export function ActivityScreen({ theme, onOpenDrawer, initialFilter, filterToken }: Props) {
  const { transactionsRepo, categoriesRepo, recurringRulesRepo } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const upcomingBills = useMemo(() => upcomingBillsFromRecurring(recurringRules, categories), [recurringRules, categories]);
  const insets = useSafeAreaInsets();
  const { wallpaper } = useTheme();

  const [query, setQuery]                   = useState('');
  const [catFilter, setCatFilter]           = useState<string[]>([]);
  const [dateFilter, setDateFilter]         = useState<DateFilter>(null);
  const [sortBy, setSortBy]                 = useState<SortOrder>('date-desc');
  const [sheetTx, setSheetTx]               = useState<Transaction | null>(null);
  const [pendingUndo, setPendingUndo]       = useState<{ tx: Transaction } | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedDay, setSelectedDay]       = useState<number | null>(null);
  const [calViewYear, setCalViewYear]       = useState(CALENDAR_YEAR);
  const [calViewMonth, setCalViewMonth]     = useState(CALENDAR_MONTH);
  const [calOpen, _setCalOpen]              = useState(cachedCalOpen);
  const setCalOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    _setCalOpen(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      cachedCalOpen = resolved;
      return resolved;
    });
  };

  // Loading / refresh lifecycle mirrors HomeScreen: a simulated settle today,
  // the seam where the async data source (CloudKit) hooks in later.
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1100);
  };

  const handleSetDateFilter = (d: DateFilter) => {
    setDateFilter(d);
    if (d !== null) setSelectedDay(null);
  };

  const resetCal = () => {
    setSelectedDay(null);
    setDateFilter(null);
    setCalViewYear(CALENDAR_YEAR);
    setCalViewMonth(CALENDAR_MONTH);
  };

  const handleDeleteTx = (t: Transaction) => {
    transactionsRepo.delete(t.id);
    setPendingUndo({ tx: t });
  };
  const handleUndoDelete = () => {
    if (pendingUndo) transactionsRepo.create(txToCreateInput(pendingUndo.tx));
    setPendingUndo(null);
  };

  // Swipe-to-delete coordination (mirrors BudgetScreen): only one row open at a
  // time, and any open row closes when the user scrolls or taps elsewhere.
  const scrollViewRef = useRef<GHScrollView>(null);
  const openSwipeRef  = useRef<Swipeable | null>(null);

  const handleSwipeOpen = useCallback((ref: Swipeable) => {
    if (openSwipeRef.current && openSwipeRef.current !== ref) openSwipeRef.current.close();
    openSwipeRef.current = ref;
  }, []);
  const handleSwipeClose = useCallback(() => { openSwipeRef.current = null; }, []);
  const dismissOpenSwipe = useCallback(() => { openSwipeRef.current?.close(); }, []);

  const activeCount = catFilter.length + (dateFilter ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);

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

  const { scrollY, headerBgOpacity, iconScrolledOpacity } = useHeaderScroll();

  // Calendar-driven month filter: when the user navigates the calendar
  // away from the default month, the transaction list narrows to that
  // month. Explicit date filters (preset / custom range) take precedence,
  // since they encode a more specific user intent.
  const isViewingNonDefaultMonth =
    calViewMonth !== CALENDAR_MONTH || calViewYear !== CALENDAR_YEAR;

  const filtered = useMemo(() => {
    const result = transactions.filter(t => {
      if (catFilter.length > 0 && !catFilter.includes(t.cat)) return false;
      if (isViewingNonDefaultMonth && dateFilter === null) {
        const pd = parseMonthDay(t.fullDate);
        if (!pd || pd.month !== calViewMonth) return false;
      }
      if (dateFilter !== null) {
        if (typeof dateFilter === 'string') {
          if (dateFilter === 'today'     && t.when !== 'today')     return false;
          if (dateFilter === 'yesterday' && t.when !== 'yesterday') return false;
          if (dateFilter === 'this-week' && t.when === 'earlier')   return false;
          if (dateFilter === 'this-month') {
            const pd = parseMonthDay(t.fullDate);
            if (!pd || pd.month !== CALENDAR_MONTH) return false;
          }
        } else {
          const pd = parseMonthDay(t.fullDate);
          if (pd) {
            const tx   = new Date(CALENDAR_YEAR, pd.month, pd.day);
            const from = new Date(dateFilter.from.getFullYear(), dateFilter.from.getMonth(), dateFilter.from.getDate());
            const to   = new Date(dateFilter.to.getFullYear(),   dateFilter.to.getMonth(),   dateFilter.to.getDate());
            if (tx < from || tx > to) return false;
          }
        }
      }
      if (query) {
        const q = query.toLowerCase();
        return t.merchant.toLowerCase().includes(q) || (cats[t.cat]?.label ?? t.cat).toLowerCase().includes(q);
      }
      return true;
    });
    if      (sortBy === 'amount-desc') result.sort((a, b) => b.amount - a.amount);
    else if (sortBy === 'amount-asc')  result.sort((a, b) => a.amount - b.amount);
    else if (sortBy === 'date-asc')    result.reverse();
    else if (sortBy === 'cat')         result.sort((a, b) => a.cat.localeCompare(b.cat) || a.merchant.localeCompare(b.merchant));
    return result;
  }, [query, catFilter, dateFilter, sortBy, isViewingNonDefaultMonth, calViewMonth, transactions, cats]);

  const grouped = useMemo(() => {
    const g: Record<string, { txs: Transaction[]; total: number }> = {};
    filtered.forEach(t => {
      if (!g[t.fullDate]) g[t.fullDate] = { txs: [], total: 0 };
      g[t.fullDate].txs.push(t);
      g[t.fullDate].total += t.amount;
    });
    return g;
  }, [filtered]);

  const dayKeys    = Object.keys(grouped);
  const isFiltered = catFilter.length > 0 || dateFilter !== null || query.length > 0 || selectedDay !== null;

  // Spending sum for the active result set, excluding income inflows so the
  // figure reads as "spent", not net.
  const filteredSpendTotal = useMemo(
    () => filtered.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0),
    [filtered],
  );

  // ── Calendar marks ───────────────────────────────────────────────────────
  const calSource = useMemo(
    () => transactions.filter(t => {
      if (catFilter.length > 0 && !catFilter.includes(t.cat)) return false;
      if (query) {
        const q = query.toLowerCase();
        return t.merchant.toLowerCase().includes(q) || (cats[t.cat]?.label ?? t.cat).toLowerCase().includes(q);
      }
      return true;
    }),
    [catFilter, query, transactions, cats],
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
    calSource.forEach(t => {
      const pd = parseMonthDay(t.fullDate);
      if (pd && pd.month === calViewMonth) ensure(pd.day).txCats.push(t.cat);
    });
    calBills.forEach(b => {
      const pd = parseMonthDay(b.dueDate);
      if (pd && pd.month === calViewMonth) ensure(pd.day).billCats.push(b.cat);
    });
    return m;
  }, [calSource, calBills, calViewMonth]);

  const dayDetail = useMemo(() => {
    if (selectedDay == null) return { txs: [], bills: [], total: 0 };
    const txs = calSource.filter(t => {
      const pd = parseMonthDay(t.fullDate);
      return pd?.month === calViewMonth && pd.day === selectedDay;
    });
    const bills = calBills.filter(b => {
      const pd = parseMonthDay(b.dueDate);
      return pd?.month === calViewMonth && pd.day === selectedDay;
    });
    return { txs, bills, total: txs.reduce((s, t) => s + t.amount, 0) };
  }, [selectedDay, calViewMonth, calSource, calBills]);

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

  const hasFilterPills = selectedDay !== null || dateFilter !== null || catFilter.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? '#000' : '#F8F6FF' }}>
      <ImageBackground source={wallpaper.source} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
        <LinearGradient
          pointerEvents="none"
          colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
          locations={[0, 0.30, 0.70, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* ── Header — pinned ─────────────────────────────────────── */}
        <View style={[S.header, { paddingTop: insets.top + 8 }]}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { opacity: headerBgOpacity }]}
          >
            <BlurView
              intensity={theme.dark ? 70 : 100}
              tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
              style={StyleSheet.absoluteFillObject}
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
        <AnimatedGHScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
        >
          <View style={S.sectionStack}>

            {/* ── Calendar card ─────────────────────────────────── */}
            <SectionCard noPad dark={theme.dark}>
              <AnimatedCollapse
                open={calOpen}
                fallbackHeight={CALENDAR_COLLAPSE_FALLBACK_HEIGHT}
              >
                <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
                  <TransactionCalendar
                    theme={theme}
                    year={calViewYear}
                    month={calViewMonth}
                    marks={calMarks}
                    selectedDay={selectedDay}
                    today={todayDom(transactions)}
                    categories={categories}
                    onSelectDay={(day) => {
                      setSelectedDay(day);
                      if (day !== null) setDateFilter(null);
                    }}
                    onViewMonthChange={(y, m) => {
                      setCalViewYear(y);
                      setCalViewMonth(m);
                      setSelectedDay(null);
                    }}
                    overrideColors={theme.dark ? {
                      text: MEDIA.text,
                      textSec: MEDIA.textSec,
                      textTer: MEDIA.textTer,
                      selectedBg: MEDIA.text,
                      selectedText: '#111111',
                      todayBorder: MEDIA.textSec,
                      dotFill: MEDIA.textSec,
                      billDotBorder: MEDIA.textTer,
                    } : undefined}
                  />
                </View>
              </AnimatedCollapse>

              {/* Toggle handle */}
              <Pressable
                onPress={() => setCalOpen(o => !o)}
                pointerEvents="box-only"
                style={[S.calHandle, { borderTopColor: calOpen ? p.hairline : 'transparent' }]}
                accessibilityRole="button"
                accessibilityLabel={calOpen ? 'Hide calendar' : 'Show calendar'}
                accessibilityState={{ expanded: calOpen }}
              >
                <View style={S.calShowRow}>
                  <Icon name="cal" size={12} color={p.textSec} stroke={1.5} />
                  <Text style={[S.calShowText, { color: p.textSec }]}>
                    {calOpen ? 'Hide calendar' : 'Show calendar'}
                  </Text>
                  {selectedDay !== null && (
                    <View style={[S.calActiveDot, { backgroundColor: p.textSec }]} />
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
                  <Icon name="filter" size={15} color={activeCount > 0 ? (theme.dark ? 'rgba(0,0,0,0.75)' : '#FBF8FF') : p.textSec} stroke={1.6} />
                  {activeCount > 0 && (
                    <View style={[S.filterBadge, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)' }]}>
                      <Text style={[S.filterBadgeText, { color: theme.dark ? 'rgba(0,0,0,0.75)' : '#FBF8FF' }]}>{activeCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Active filter pills */}
              {hasFilterPills && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -18, marginTop: 10 }}
                  contentContainerStyle={[S.filterStripScroll, { paddingHorizontal: 18 }]}
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

            {/* ── Transactions card ─────────────────────────────── */}
            <SectionCard dark={theme.dark}>
              {loading ? (
                <TxListSkeleton dark={theme.dark} />
              ) : selectedDay !== null ? (
                <>
                  {dayDetail.txs.length === 0 && dayDetail.bills.length === 0 ? (
                    <Text style={[S.detailEmpty, { color: p.textTer }]}>No activity this day</Text>
                  ) : (
                    <View>
                      <View style={S.summaryRow}>
                        <Text style={[S.dayLabel, { color: p.textTer }]}>
                          {MONTHS[calViewMonth]} {selectedDay}
                        </Text>
                        <Text style={[S.summaryTotal, { color: p.text }]}>${dayDetailSpend.toFixed(2)}</Text>
                      </View>
                      {dayDetail.txs.map((tx, i) => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          theme={theme}
                          cats={cats}
                          categories={categories}
                          onPress={() => setSheetTx(tx)}
                          last={i === dayDetail.txs.length - 1 && dayDetail.bills.length === 0}
                        />
                      ))}
                      {dayDetail.bills.map((bill, i) => (
                        <BillRow key={bill.id} bill={bill} theme={theme} categories={categories} last={i === dayDetail.bills.length - 1} />
                      ))}
                    </View>
                  )}
                </>
              ) : (
                dayKeys.length === 0 ? (
                  <EmptyState
                    theme={theme}
                    isFiltered={isFiltered}
                    onClearFilters={() => { setCatFilter([]); setDateFilter(null); setSelectedDay(null); setSortBy('date-desc'); }}
                  />
                ) : (
                  <>
                    {isFiltered && (
                      <View style={[S.summaryRow, { borderBottomColor: p.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                        <Text style={[S.summaryLabel, { color: p.textSec }]}>
                          {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'}
                        </Text>
                        <Text style={[S.summaryTotal, { color: p.text }]}>${filteredSpendTotal.toFixed(2)}</Text>
                      </View>
                    )}
                    {dayKeys.map(day => (
                      <DayGroup
                        key={day}
                        day={day}
                        group={grouped[day]}
                        theme={theme}
                        cats={cats}
                        categories={categories}
                        onPress={setSheetTx}
                        onDelete={handleDeleteTx}
                        onSwipeOpen={handleSwipeOpen}
                        onSwipeClose={handleSwipeClose}
                        scrollRef={scrollViewRef}
                      />
                    ))}
                  </>
                )
              )}
            </SectionCard>

          </View>
        </AnimatedGHScrollView>

        <TxSheet
          tx={sheetTx}
          theme={theme}
          onClose={() => setSheetTx(null)}
          onDeleted={(deleted) => setPendingUndo({ tx: deleted })}
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
          clearDay={() => setSelectedDay(null)}
          onClose={() => setFilterSheetOpen(false)}
        />

        <Toast
          theme={theme}
          message={pendingUndo ? 'Transaction deleted' : null}
          actionLabel="Undo"
          onAction={handleUndoDelete}
          onDismiss={() => setPendingUndo(null)}
        />
      </ImageBackground>
    </View>
  );
}

// ─── FilterSheet ─────────────────────────────────────────────────────────────

function FilterSheet({
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

  const handleDatePickerChange = (idx: number) => {
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
  };

  const clearAll = () => {
    setCatFilter([]);
    setDateFilter(null);
    setSortBy('date-desc');
    clearDay();
    setCustomMode(false);
    setLocalFrom(null);
    setLocalTo(null);
  };

  const activeCount = catFilter.length + (dateFilter ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);

  const customLabel = (() => {
    if (dateFilter && typeof dateFilter !== 'string') {
      return `${fmtDate(dateFilter.from)} – ${fmtDate(dateFilter.to)}`;
    }
    if (localFrom && !localTo) return `${fmtDate(localFrom)} – …`;
    return 'Custom range';
  })();

  const sortIdx = SORT_OPTIONS.findIndex(o => o.id === sortBy);
  const groupedCategories = (['needs', 'wants', 'savings'] as const).map(key => ({
    key,
    label: key === 'needs' ? 'Needs' : key === 'wants' ? 'Wants' : 'Savings',
    cats: categories.filter(cat => cat.group === key).map(cat => cat.id),
  })).filter(g => g.cats.length > 0);

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
            <View style={[FS.content, { backgroundColor: theme.surface }]}>

              {/* ── Header ──────────────────────────────────────── */}
              <View style={[FS.header, { borderBottomColor: theme.sep }]}>
                <Text style={[FS.title, { color: theme.text }]}>Filters</Text>
                <View style={FS.headerActions}>
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
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                  >
                    <Text style={[FS.doneLink, { color: theme.text }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 20 }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
              >
                {/* ── Sort by — native iOS menu picker ───────────── */}
                <View style={FS.sortRow}>
                  <Text style={[FS.sortRowLabel, { color: theme.text }]}>Sort by</Text>
                  <Host matchContents>
                    <Picker
                      selection={sortIdx >= 0 ? sortIdx : 0}
                      onSelectionChange={(val) => setSortBy(SORT_OPTIONS[Number(val)].id)}
                      modifiers={[
                        pickerStyle('menu'),
                        tint(theme.accent.dot),
                        environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                        fixedSize({ horizontal: true, vertical: false }),
                      ]}
                    >
                      {SORT_OPTIONS.map((o, idx) => (
                        <SwiftText key={o.id} modifiers={[tag(idx)]}>{o.label}</SwiftText>
                      ))}
                    </Picker>
                  </Host>
                </View>

                {/* ── Date — native picker dropdown ──────────────── */}
                {/* Picker indices: 0 = Any time, 1-4 = presets, 5 = Custom range */}
                <View style={FS.sortRow}>
                  <Text style={[FS.sortRowLabel, { color: theme.text }]}>Date</Text>
                  <Host matchContents>
                    <Picker
                      selection={datePickerIdx}
                      onSelectionChange={(val) => handleDatePickerChange(Number(val))}
                      modifiers={[
                        pickerStyle('menu'),
                        tint(theme.accent.dot),
                        environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                        fixedSize({ horizontal: true, vertical: false }),
                      ]}
                    >
                      <SwiftText modifiers={[tag(0)]}>Any time</SwiftText>
                      {DATE_PRESETS.map((o, i) => (
                        <SwiftText key={o.id} modifiers={[tag(i + 1)]}>{o.label}</SwiftText>
                      ))}
                      <SwiftText modifiers={[tag(5)]}>{customLabel}</SwiftText>
                    </Picker>
                  </Host>
                </View>

                <AnimatedCollapse
                  open={customMode}
                  fallbackHeight={MINI_CALENDAR_COLLAPSE_FALLBACK_HEIGHT}
                >
                  <View style={{ paddingHorizontal: 22, paddingTop: 4 }}>
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
                          const active = catFilter.includes(catId);
                          return (
                            <TouchableOpacity
                              key={catId}
                              onPress={() => setCatFilter(active ? catFilter.filter(id => id !== catId) : [...catFilter, catId])}
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
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

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
                      StyleSheet.absoluteFillObject,
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
  onSwipeOpen, onSwipeClose, scrollRef,
}: {
  day: string;
  group: { txs: Transaction[]; total: number };
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  onPress: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onSwipeOpen: (ref: Swipeable) => void;
  onSwipeClose: () => void;
  scrollRef: React.RefObject<any>;
}) {
  const p     = makeP(theme.dark);
  const { txs } = group;
  const spendTotal = txs.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0);
  const label =
    txs[0]?.when === 'today'     ? 'Today'
    : txs[0]?.when === 'yesterday' ? 'Yesterday'
    : day;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={S.dayHeader}>
        <Text style={[S.dayLabel, { color: p.textTer }]}>{label}</Text>
        <Text style={[S.dayTotal, { color: p.textSec }]}>${spendTotal.toFixed(2)}</Text>
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
              onPress={() => onPress(tx)}
              last={i === txs.length - 1}
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
  tx, theme, cats, categories, onPress, last,
}: {
  tx: Transaction;
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  onPress: () => void;
  last: boolean;
}) {
  const p          = makeP(theme.dark);
  const cat        = cats[tx.cat];
  const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
  const isIncome   = tx.type === 'income';
  const incomeColor = theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [S.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: p.hairline, opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${tx.merchant}, ${cat?.label ?? ''}, ${isIncome ? '+' : '−'}$${tx.amount.toFixed(2)}`}
    >
      <View style={[S.txIcon, { backgroundColor: groupColor }]}>
        <Icon name={cat?.icon} size={16} color="#FBF8FF" stroke={1.6} />
      </View>
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
    <View style={[S.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: p.hairline }]}>
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

// ─── TxListSkeleton ──────────────────────────────────────────────────────────
// Mirrors the day-grouped row layout so the pending state holds the same shape
// the real list will fill. Swap the simulated `loading` timer for the async
// data source when the backend lands.

function TxListSkeleton({ dark }: { dark: boolean }) {
  return (
    <View>
      {[0, 1].map(g => (
        <View key={g} style={{ marginBottom: 16 }}>
          <View style={[S.dayHeader, { marginBottom: 10 }]}>
            <Skeleton width={64} height={11} radius={4} onMedia={dark} />
            <Skeleton width={52} height={11} radius={4} onMedia={dark} />
          </View>
          {[0, 1, 2].map(r => (
            <View key={r} style={S.txRow}>
              <Skeleton width={36} height={36} radius={18} onMedia={dark} />
              <View style={{ flex: 1, gap: 6 }}>
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
      <Icon name={isFiltered ? 'search' : 'receipt'} size={28} color={p.textTer} />
      <Text style={[S.emptyTitle, { color: p.textSec }]}>
        {isFiltered ? 'No results' : 'No transactions yet'}
      </Text>
      <Text style={[S.emptyBody, { color: p.textTer }]}>
        {isFiltered
          ? 'Try adjusting your filters'
          : 'Tap the add button below to record your first expense, or use the mic to log one by voice.'}
      </Text>
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
    paddingBottom: 10,
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
  sectionStack: {
    paddingHorizontal: 16,
    gap: 14,
  },
  sectionCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  sectionCardBorder: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  sectionCardBorderFlush: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },

  // Calendar toggle handle
  calHandle: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
  },
  calShowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 6,
    width: '100%',
  },
  calShowText: {
    ...TYPE.caption,
  },
  calActiveDot: {
    width: 6, height: 6, borderRadius: 3,
  },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: 8,
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1,
  },
  searchInput: { flex: 1, ...TYPE.bodyRegular, padding: 0 },
  filterBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  filterBadge: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { ...TYPE.label, letterSpacing: 0 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 11, paddingRight: 8, paddingVertical: 6,
    borderRadius: 100, gap: 5,
  },
  filterPillText: {
    ...TYPE.caption,
  },
  filterStripScroll: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4,
  },
  emptyClear: {
    marginTop: 16, paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 100,
  },
  emptyClearText: {
    ...TYPE.bodySm,
  },
  // Day detail
  detailEmpty: {
    ...TYPE.bodySm,
    paddingHorizontal: 2, paddingBottom: 8,
  },
  // Rows
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  billIcon: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  upcomingPill: {
    paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 100,
  },
  upcomingText: {
    ...TYPE.labelSm,
    textTransform: 'none',
    letterSpacing: 0,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: 2, marginBottom: 6,
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
    paddingBottom: 12, marginBottom: 14,
  },
  summaryLabel: {
    ...TYPE.bodySm,
  },
  summaryTotal: {
    ...TYPE.subsectionTitle,
  },
  swipeActionBtn: {
    flex: 1, marginLeft: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: OVER_DOT,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 14,
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  txName: { ...TYPE.body },
  txMeta: { ...TYPE.caption, marginTop: 2 },
  empty:      { alignItems: 'center', paddingTop: 40, paddingBottom: 24 },
  emptyTitle: { ...TYPE.subsectionTitle, marginTop: 12 },
  emptyBody:  { ...TYPE.bodySm, marginTop: 5, textAlign: 'center', lineHeight: 20 },
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
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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

  // Sort by — single row with native iOS Picker
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 4,
    minHeight: 44,
  },
  sortRowLabel: {
    ...TYPE.body,
  },

  // Category section
  groupDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 10,
    gap: 10,
  },
  groupDividerLabel: {
    ...TYPE.labelSm,
    textTransform: 'none',
    letterSpacing: 0,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 13,
    gap: 13,
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
    paddingHorizontal: 22, paddingVertical: 10,
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
    marginBottom: 14,
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
    ...TYPE.label,
    textTransform: 'none',
    letterSpacing: 0,
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
    marginTop: 14, paddingTop: 14, borderTopWidth: 1,
  },
  summaryItem: {
    flex: 1, alignItems: 'center', gap: 3,
  },
  summaryLabel: {
    ...TYPE.label,
    textTransform: 'none',
    letterSpacing: 0,
  },
  summaryValue: {
    ...TYPE.body,
  },
  summarySep: {
    width: 1, height: 28,
  },
});
