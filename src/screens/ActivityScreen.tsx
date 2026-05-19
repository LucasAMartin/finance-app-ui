import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATS, TRANSACTIONS, Transaction,
  UPCOMING_BILLS, UpcomingBill, CALENDAR_YEAR, CALENDAR_MONTH,
} from '../data';
import { Icon } from '../components/Icon';
import { Money, Segmented } from '../components/shared';
import { TxSheet } from '../components/TxSheet';
import { ThemeToggle } from '../components/ThemeToggle';
import { TransactionCalendar, CalDayMark } from '../components/TransactionCalendar';
import { Theme, catGroupColor, GROUP_COLORS, cautionBg, cautionText } from '../theme';

const { height: SCREEN_H } = Dimensions.get('window');
const FILTER_SHEET_H = Math.round(SCREEN_H * 0.82);
const SWIPE_W = 72;

type DateFilterPreset = 'today' | 'yesterday' | 'this-week' | 'this-month';
type DateFilter = DateFilterPreset | { from: Date; to: Date } | null;

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

const SORT_OPTS = [
  { id: 'date'   as const, label: 'Newest first'  },
  { id: 'amount' as const, label: 'Highest first' },
];

const EXPENSE_GROUPS = [
  { key: 'needs', label: 'Needs', cats: ['groceries', 'transport', 'bills']             },
  { key: 'wants', label: 'Wants', cats: ['dining', 'shopping', 'entertainment']         },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Parses a "May 13" style label into { month: 4, day: 13 }. Null if unrecognized.
function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = s.trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3));
  return month < 0 ? null : { month, day: parseInt(m[2], 10) };
}

// Day-of-month the mock data treats as "today".
const TODAY_DOM = (() => {
  const t = TRANSACTIONS.find(tx => tx.when === 'today');
  const pd = t ? parseMonthDay(t.fullDate) : null;
  return pd ? pd.day : null;
})();

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
}

export function ActivityScreen({ theme, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();

  const [query, setQuery]                   = useState('');
  const [catFilter, setCatFilter]           = useState<string | null>(null);
  const [dateFilter, setDateFilter]         = useState<DateFilter>(null);
  const [sortBy, setSortBy]                 = useState<'date' | 'amount'>('date');
  const [sheetTx, setSheetTx]               = useState<Transaction | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen]     = useState(true);
  const [selectedDay, setSelectedDay]       = useState<number | null>(TODAY_DOM);
  const [calViewYear, setCalViewYear]       = useState(CALENDAR_YEAR);
  const [calViewMonth, setCalViewMonth]     = useState(CALENDAR_MONTH);

  const activeCount = (catFilter ? 1 : 0) + (dateFilter ? 1 : 0) + (sortBy !== 'date' ? 1 : 0);

  const filtered = useMemo(() => {
    const result = TRANSACTIONS.filter(t => {
      if (catFilter && t.cat !== catFilter) return false;
      if (dateFilter !== null) {
        if (typeof dateFilter === 'string') {
          if (dateFilter === 'today'     && t.when !== 'today')     return false;
          if (dateFilter === 'yesterday' && t.when !== 'yesterday') return false;
          if (dateFilter === 'this-week' && t.when === 'earlier')   return false;
          // 'this-month' shows all mock data
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
        return t.merchant.toLowerCase().includes(q) || CATS[t.cat].label.toLowerCase().includes(q);
      }
      return true;
    });
    if (sortBy === 'amount') result.sort((a, b) => b.amount - a.amount);
    return result;
  }, [query, catFilter, dateFilter, sortBy]);

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
  const isFiltered = catFilter !== null || dateFilter !== null || query.length > 0;

  // ── Calendar data ────────────────────────────────────────────
  // Transactions narrowed by search + category only — the calendar owns date selection.
  const calSource = useMemo(
    () => TRANSACTIONS.filter(t => {
      if (catFilter && t.cat !== catFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        return t.merchant.toLowerCase().includes(q) || CATS[t.cat].label.toLowerCase().includes(q);
      }
      return true;
    }),
    [catFilter, query],
  );

  const calBills = useMemo(
    () => UPCOMING_BILLS.filter(b => !catFilter || b.cat === catFilter),
    [catFilter],
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
    const txs   = calSource.filter(t => {
      const pd = parseMonthDay(t.fullDate);
      return pd?.month === calViewMonth && pd.day === selectedDay;
    });
    const bills = calBills.filter(b => {
      const pd = parseMonthDay(b.dueDate);
      return pd?.month === calViewMonth && pd.day === selectedDay;
    });
    return { txs, bills, total: txs.reduce((s, t) => s + t.amount, 0) };
  }, [selectedDay, calViewMonth, calSource, calBills]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <View style={[S.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={onOpenDrawer}
          pointerEvents="box-only"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[S.iconBtn, { backgroundColor: 'transparent' }]}
        >
          <Icon name="menu" size={22} color={theme.text} stroke={1.7} />
        </Pressable>
        <Text style={[S.title, { color: theme.text }]}>History</Text>
        <ThemeToggle />
      </View>

      {/* ── Search + filter ─────────────────────────────────── */}
      <View style={[S.searchRow, { paddingHorizontal: 20, marginBottom: 12 }]}>
        <View style={[S.search, { flex: 1, backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Icon name="search" size={16} color={theme.textSec} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search transactions…"
            placeholderTextColor={theme.textTer}
            style={[S.searchInput, { color: theme.text }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={14} color={theme.textSec} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setFilterSheetOpen(true)}
          activeOpacity={0.7}
          style={[S.filterBtn, { backgroundColor: activeCount > 0 ? theme.text : theme.chipBg }]}
        >
          <Icon
            name="filter"
            size={15}
            color={activeCount > 0 ? theme.bg : theme.textSec}
            stroke={1.6}
          />
          {activeCount > 0 && (
            <View style={[S.filterBadge, { backgroundColor: theme.bg }]}>
              <Text style={[S.filterBadgeText, { color: theme.text }]}>{activeCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Content ─────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {calendarOpen ? (
          <CalendarPane
            theme={theme}
            marks={calMarks}
            selectedDay={selectedDay}
            calViewYear={calViewYear}
            calViewMonth={calViewMonth}
            onSelectDay={setSelectedDay}
            onViewMonthChange={(y, m) => {
              setCalViewYear(y);
              setCalViewMonth(m);
              setSelectedDay(null);
            }}
            detail={dayDetail}
            onTxPress={setSheetTx}
            onCollapse={() => setCalendarOpen(false)}
          />
        ) : (
          <>
            <Pressable
              onPress={() => setCalendarOpen(true)}
              pointerEvents="box-only"
              style={[S.calExpandRow, { borderBottomColor: theme.sep }]}
            >
              <Icon name="cal" size={14} color={theme.textSec} stroke={1.5} />
              <Text style={[S.calExpandText, { color: theme.textSec }]}>Show calendar</Text>
              <View style={{ flex: 1 }} />
              <Icon name="chevDown" size={12} color={theme.textTer} stroke={1.5} />
            </Pressable>
            {dayKeys.length === 0 ? (
              <EmptyState theme={theme} isFiltered={isFiltered} />
            ) : (
              dayKeys.map(day => (
                <DayGroup
                  key={day}
                  day={day}
                  group={grouped[day]}
                  theme={theme}
                  onPress={setSheetTx}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <TxSheet tx={sheetTx} theme={theme} onClose={() => setSheetTx(null)} />

      <FilterSheet
        visible={filterSheetOpen}
        theme={theme}
        catFilter={catFilter}
        dateFilter={dateFilter}
        sortBy={sortBy}
        setCatFilter={setCatFilter}
        setDateFilter={setDateFilter}
        setSortBy={setSortBy}
        onClose={() => setFilterSheetOpen(false)}
      />
    </View>
  );
}

// ─── FilterSheet ─────────────────────────────────────────────────────────────

function FilterSheet({
  visible, theme, catFilter, dateFilter, sortBy,
  setCatFilter, setDateFilter, setSortBy, onClose,
}: {
  visible: boolean;
  theme: Theme;
  catFilter: string | null;
  dateFilter: DateFilter;
  sortBy: 'date' | 'amount';
  setCatFilter: (c: string | null) => void;
  setDateFilter: (d: DateFilter) => void;
  setSortBy: (s: 'date' | 'amount') => void;
  onClose: () => void;
}) {
  const insets      = useSafeAreaInsets();
  const [mounted, setMounted]       = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [localFrom, setLocalFrom]   = useState<Date | null>(null);
  const [localTo, setLocalTo]       = useState<Date | null>(null);
  const slideY     = useRef(new Animated.Value(FILTER_SHEET_H)).current;
  const fade       = useRef(new Animated.Value(0)).current;
  const dismissing = useRef(false);

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
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 200, friction: 24 }),
        Animated.timing(fade,   { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (!dismissing.current) {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: FILTER_SHEET_H, duration: 260, useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, gs) => gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
    onPanResponderMove: (_, gs) => {
      if (gs.dy > 0) slideY.setValue(gs.dy);
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 80 || gs.vy > 0.5) {
        dismissing.current = true;
        const remaining = Math.max(FILTER_SHEET_H - gs.dy, 0);
        const duration  = Math.max(80, (remaining / FILTER_SHEET_H) * 260);
        Animated.parallel([
          Animated.timing(slideY, {
            toValue: FILTER_SHEET_H, duration, useNativeDriver: true,
            easing: Easing.in(Easing.cubic),
          }),
          Animated.timing(fade, {
            toValue: 0, duration: Math.min(duration, 200), useNativeDriver: true,
          }),
        ]).start(() => {
          dismissing.current = false;
          setMounted(false);
          onClose();
        });
      } else {
        Animated.spring(slideY, {
          toValue: 0, useNativeDriver: true, tension: 200, friction: 24,
        }).start();
      }
    },
  })).current;

  const handleRangeChange = ({ from, to }: { from: Date | null; to: Date | null }) => {
    setLocalFrom(from);
    setLocalTo(to);
    if (from && to)     setDateFilter({ from, to });
    else if (!from && !to) setDateFilter(null);
  };

  const handlePresetPress = (id: DateFilterPreset) => {
    const isActive = typeof dateFilter === 'string' && dateFilter === id;
    setDateFilter(isActive ? null : id);
    setCustomMode(false);
    setLocalFrom(null);
    setLocalTo(null);
  };

  const handleCustomToggle = () => {
    if (customMode) {
      setCustomMode(false);
      if (typeof dateFilter !== 'string') setDateFilter(null);
      setLocalFrom(null);
      setLocalTo(null);
    } else {
      setCustomMode(true);
      if (typeof dateFilter === 'string') setDateFilter(null);
    }
  };

  const clearAll = () => {
    setCatFilter(null);
    setDateFilter(null);
    setSortBy('date');
    setCustomMode(false);
    setLocalFrom(null);
    setLocalTo(null);
  };

  const activeCount    = (catFilter ? 1 : 0) + (dateFilter ? 1 : 0) + (sortBy !== 'date' ? 1 : 0);
  const isCustomActive = customMode || (dateFilter !== null && typeof dateFilter !== 'string');

  const customLabel = (() => {
    if (dateFilter && typeof dateFilter !== 'string') {
      return `${fmtDate(dateFilter.from)} – ${fmtDate(dateFilter.to)}`;
    }
    if (localFrom && !localTo) return `${fmtDate(localFrom)} – ?`;
    return 'Custom';
  })();

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} statusBarTranslucent>

      {/* Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: '#000', opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.46] }) },
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Sheet — fixed height so ScrollView body can fill the rest */}
      <Animated.View
        style={[
          FS.sheet,
          {
            backgroundColor: theme.surface,
            borderColor: theme.hairline,
            height: FILTER_SHEET_H,
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        {/* Header — panHandlers only here so the body ScrollView scrolls freely */}
        <View {...pan.panHandlers}>
          <View style={[FS.handle, { backgroundColor: theme.sep }]} />
          <View style={FS.titleRow}>
            <Text style={[FS.title, { color: theme.text }]}>Filters</Text>
            {activeCount > 0 && (
              <TouchableOpacity
                onPress={clearAll}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[FS.clearAll, { color: theme.textSec }]}>Clear all</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={[FS.divider, { backgroundColor: theme.sep }]} />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[FS.body, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
        >

          {/* ── Sort ── */}
          <Text style={[FS.sectionLabel, { color: theme.textTer }]}>SORT BY</Text>
          <Segmented
            value={sortBy}
            onChange={(v) => setSortBy(v as 'date' | 'amount')}
            options={SORT_OPTS.map(o => ({ value: o.id, label: o.label }))}
            theme={theme}
          />

          {/* ── Date ── */}
          <Text style={[FS.sectionLabel, { color: theme.textTer, marginTop: 26 }]}>DATE</Text>
          <View style={FS.chipRow}>
            {DATE_PRESETS.map(o => {
              const active = typeof dateFilter === 'string' && dateFilter === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => handlePresetPress(o.id)}
                  style={[FS.chip, { backgroundColor: active ? theme.text : theme.chipBg }]}
                >
                  <Text style={[FS.chipText, { color: active ? theme.bg : theme.textSec }]}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={handleCustomToggle}
              style={[FS.chip, { backgroundColor: isCustomActive ? theme.text : theme.chipBg }]}
            >
              <Icon
                name="cal"
                size={12}
                color={isCustomActive ? theme.bg : theme.textSec}
                stroke={1.5}
              />
              <Text style={[FS.chipText, { color: isCustomActive ? theme.bg : theme.textSec }]}>
                {customLabel}
              </Text>
            </TouchableOpacity>
          </View>

          {customMode && (
            <MiniCalendar
              theme={theme}
              from={localFrom}
              to={localTo}
              onRangeChange={handleRangeChange}
            />
          )}

          {/* ── Category ── */}
          <Text style={[FS.sectionLabel, { color: theme.textTer, marginTop: 26 }]}>CATEGORY</Text>
          {EXPENSE_GROUPS.map((g, gi) => {
            const groupColor = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
            return (
              <View key={g.key} style={{ marginBottom: gi < EXPENSE_GROUPS.length - 1 ? 16 : 0 }}>
                <Text style={[FS.groupLabel, { color: groupColor }]}>{g.label}</Text>
                <View style={FS.chipRow}>
                  {g.cats.map(catId => {
                    const c      = CATS[catId];
                    const active = catFilter === catId;
                    return (
                      <TouchableOpacity
                        key={catId}
                        onPress={() => setCatFilter(active ? null : catId)}
                        style={[FS.chip, { backgroundColor: active ? groupColor : groupColor + '18' }]}
                      >
                        <Icon
                          name={c.icon}
                          size={12}
                          color={active ? '#fff' : groupColor}
                          stroke={1.5}
                        />
                        <Text style={[FS.chipText, { color: active ? '#fff' : groupColor }]}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

        </ScrollView>
      </Animated.View>
    </Modal>
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
  const startOffset = firstDow === 0 ? 6 : firstDow - 1; // Monday-first grid

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

      {/* Month navigation */}
      <View style={CAL.monthRow}>
        <Pressable
          onPress={prevMonth}
          pointerEvents="box-only"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}
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
        >
          <Icon name="chevR" size={18} color={theme.textSec} />
        </Pressable>
      </View>

      {/* Day-of-week header */}
      <View style={CAL.dowRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <View key={i} style={CAL.dowCell}>
            <Text style={[CAL.dowText, { color: theme.textTer }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={CAL.weekRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={CAL.dayCell} />;

            const start    = dayIsStart(day);
            const end      = dayIsEnd(day);
            const inRange  = dayIsInRange(day);
            const selected = start || end;

            // Range fill: right-half for start, left-half for end, full for in-between
            const showFill   = inRange || (start && hasRange) || (end && hasRange);
            const fillLeft: number | string  = (start && hasRange) ? '50%' : 0;
            const fillRight: number | string = (end   && hasRange) ? '50%' : 0;

            return (
              <TouchableOpacity
                key={di}
                onPress={() => handleDayPress(day)}
                style={CAL.dayCell}
                activeOpacity={0.7}
              >
                {showFill && (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        top: 3, bottom: 3,
                        left: fillLeft, right: fillRight,
                        backgroundColor: theme.chipBg,
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
                      CAL.dayText,
                      {
                        color:      selected ? theme.bg : inRange ? theme.text : theme.textSec,
                        fontWeight: selected ? '600' : '400',
                      },
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

      {/* Selection summary row */}
      {(from || to) && (
        <View style={[CAL.summary, { borderTopColor: theme.sep }]}>
          <View style={CAL.summaryItem}>
            <Text style={[CAL.summaryLabel, { color: theme.textTer }]}>FROM</Text>
            <Text style={[CAL.summaryValue, { color: from ? theme.text : theme.textTer }]}>
              {from ? fmtDate(from) : '—'}
            </Text>
          </View>
          <View style={[CAL.summarySep, { backgroundColor: theme.hairline }]} />
          <View style={CAL.summaryItem}>
            <Text style={[CAL.summaryLabel, { color: theme.textTer }]}>TO</Text>
            <Text style={[CAL.summaryValue, { color: to ? theme.text : theme.textTer }]}>
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
  day, group, theme, onPress,
}: {
  day: string;
  group: { txs: Transaction[]; total: number };
  theme: Theme;
  onPress: (tx: Transaction) => void;
}) {
  const { txs, total } = group;
  const label =
    txs[0]?.when === 'today'     ? 'Today'
    : txs[0]?.when === 'yesterday' ? 'Yesterday'
    : day;

  return (
    <View style={{ marginBottom: 24 }}>
      <View style={S.dayHeader}>
        <Text style={[S.dayLabel, { color: theme.textSec }]}>{label}</Text>
        <Text style={[S.dayTotal, { color: theme.text }]}>${total.toFixed(2)}</Text>
      </View>
      <View style={{ overflow: 'hidden' }}>
        {txs.map((tx, i) => (
          <SwipeRow key={tx.id} theme={theme}>
            <TxRow
              tx={tx}
              theme={theme}
              onPress={() => onPress(tx)}
              last={i === txs.length - 1}
            />
          </SwipeRow>
        ))}
      </View>
    </View>
  );
}

// ─── CalendarPane ────────────────────────────────────────────────────────────

function CalendarPane({
  theme, marks, selectedDay, calViewYear, calViewMonth,
  onSelectDay, onViewMonthChange, detail, onTxPress, onCollapse,
}: {
  theme: Theme;
  marks: Record<number, CalDayMark>;
  selectedDay: number | null;
  calViewYear: number;
  calViewMonth: number;
  onSelectDay: (d: number | null) => void;
  onViewMonthChange: (y: number, m: number) => void;
  detail: { txs: Transaction[]; bills: UpcomingBill[]; total: number };
  onTxPress: (tx: Transaction) => void;
  onCollapse: () => void;
}) {
  const { txs, bills } = detail;

  return (
    <View style={{ paddingTop: 8 }}>
      <TransactionCalendar
        theme={theme}
        year={calViewYear}
        month={calViewMonth}
        marks={marks}
        selectedDay={selectedDay}
        today={TODAY_DOM}
        onSelectDay={onSelectDay}
        onViewMonthChange={onViewMonthChange}
        onCollapse={onCollapse}
      />

      {selectedDay !== null && (
        <>
          <View style={[S.calDivider, { backgroundColor: theme.sep }]} />

          {/* Date heading + clear button */}
          <View style={S.detailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[S.detailDate, { color: theme.text }]}>
                {MONTHS[calViewMonth]} {selectedDay}
              </Text>
              <Text style={[S.detailDow, { color: theme.textSec }]}>
                {WEEKDAY_NAMES[new Date(calViewYear, calViewMonth, selectedDay).getDay()]}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onSelectDay(null)}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[S.detailClear, { backgroundColor: theme.chipBg }]}
            >
              <Icon name="close" size={11} color={theme.textSec} stroke={2} />
            </TouchableOpacity>
          </View>

          {/* Activity list */}
          {txs.length === 0 && bills.length === 0 ? (
            <Text style={[S.detailEmpty, { color: theme.textTer }]}>No activity this day</Text>
          ) : (
            <View>
              {txs.map((tx, i) => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  theme={theme}
                  onPress={() => onTxPress(tx)}
                  last={i === txs.length - 1 && bills.length === 0}
                />
              ))}
              {bills.map((bill, i) => (
                <BillRow key={bill.id} bill={bill} theme={theme} last={i === bills.length - 1} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── SwipeRow ────────────────────────────────────────────────────────────────

function SwipeRow({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  const swipeX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, gs) =>
        Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        const base = isOpen.current ? -SWIPE_W : 0;
        swipeX.setValue(Math.min(0, Math.max(-SWIPE_W, base + gs.dx)));
      },
      onPanResponderRelease: (_, gs) => {
        const base      = isOpen.current ? -SWIPE_W : 0;
        const projected = Math.min(0, Math.max(-SWIPE_W, base + gs.dx));
        const willOpen  = projected < -SWIPE_W / 2 || (!isOpen.current && gs.vx < -0.5);
        isOpen.current  = willOpen;
        Animated.spring(swipeX, {
          toValue: willOpen ? -SWIPE_W : 0,
          useNativeDriver: true,
          tension: 260,
          friction: 24,
        }).start();
      },
    }),
  ).current;

  const actionOpacity = swipeX.interpolate({
    inputRange:  [-SWIPE_W, -SWIPE_W * 0.25, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: 'clamp',
  });
  const iconScale = swipeX.interpolate({
    inputRange:  [-SWIPE_W, -SWIPE_W * 0.4, 0],
    outputRange: [1, 0.7, 0.3],
    extrapolate: 'clamp',
  });

  const flagBg = theme.dark ? '#C8881C' : '#B87018';

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[S.swipeAction, { backgroundColor: flagBg, opacity: actionOpacity }]}
      >
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Icon name="tag" size={17} color="#fff" stroke={1.6} />
        </Animated.View>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: swipeX }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

// ─── TxRow ───────────────────────────────────────────────────────────────────

function TxRow({
  tx, theme, onPress, last,
}: {
  tx: Transaction; theme: Theme; onPress: () => void; last: boolean;
}) {
  const cat        = CATS[tx.cat];
  const groupColor = catGroupColor(tx.cat, theme.dark);

  return (
    <TouchableOpacity
      onPress={onPress}
      delayPressIn={0}
      activeOpacity={0.6}
      style={[
        S.txRow,
        {
          backgroundColor:   theme.bg,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: theme.sep,
        },
      ]}
    >
      <View style={[S.txIcon, { backgroundColor: groupColor }]}>
        <Icon name={cat?.icon} size={16} color="#fff" stroke={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={S.nameRow}>
          <Text style={[S.txName, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
            {tx.merchant}
          </Text>
          {tx.recurring && <Icon name="repeat" size={11} color={theme.textTer} stroke={1.7} />}
        </View>
        <Text style={[S.txMeta, { color: theme.textSec }]}>{cat?.label} · {tx.time}</Text>
      </View>
      <Money value={tx.amount} size={13} weight="500" theme={theme} color={theme.textSec} />
    </TouchableOpacity>
  );
}

// ─── BillRow ─────────────────────────────────────────────────────────────────

function BillRow({ bill, theme, last }: { bill: UpcomingBill; theme: Theme; last: boolean }) {
  const groupColor = catGroupColor(bill.cat, theme.dark);
  return (
    <View
      style={[
        S.txRow,
        { borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.sep },
      ]}
    >
      <View style={[S.billIcon, { borderColor: groupColor }]}>
        <Icon name={bill.icon} size={15} color={groupColor} stroke={1.7} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={S.nameRow}>
          <Text style={[S.txName, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
            {bill.name}
          </Text>
          <Icon name="repeat" size={11} color={theme.textTer} stroke={1.7} />
        </View>
        <Text style={[S.txMeta, { color: theme.textSec }]}>
          {bill.estimate ? 'Estimated · Upcoming bill' : 'Upcoming bill'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Money
          value={bill.amount}
          size={13}
          weight="500"
          theme={theme}
          color={theme.textSec}
          prefix="$"
        />
        <View style={[S.upcomingPill, { backgroundColor: cautionBg(theme.dark) }]}>
          <Text style={[S.upcomingText, { color: cautionText(theme.dark) }]}>UPCOMING</Text>
        </View>
      </View>
    </View>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({ theme, isFiltered }: { theme: Theme; isFiltered: boolean }) {
  return (
    <View style={S.empty}>
      <Icon name="search" size={28} color={theme.textTer} />
      <Text style={[S.emptyTitle, { color: theme.textSec }]}>
        {isFiltered ? 'No results' : 'No transactions yet'}
      </Text>
      <Text style={[S.emptyBody, { color: theme.textTer }]}>
        {isFiltered ? 'Try adjusting your filters' : 'Your spending will appear here'}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 17, fontWeight: '700', letterSpacing: -0.4,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: 8,
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  filterBtn: {
    borderRadius: 16,
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
  filterBadgeText: { fontSize: 10, fontWeight: '700' },
  calExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 2,
    marginBottom: 14,
    borderBottomWidth: 1,
  },
  calExpandText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 14,
  },
  detailDate: {
    fontSize: 17, fontWeight: '700', letterSpacing: -0.4,
    marginBottom: 2,
  },
  detailDow: {
    fontSize: 13, fontWeight: '400',
  },
  detailClear: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  detailEmpty: {
    fontSize: 13, paddingHorizontal: 2, paddingBottom: 8,
  },
  calDivider: {
    height: 1,
    marginHorizontal: -20,
    marginVertical: 14,
  },
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
    fontSize: 9, fontWeight: '700', letterSpacing: 0.4,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: 2, marginBottom: 8,
  },
  dayLabel: {
    fontSize: 11, fontWeight: '600',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  dayTotal: { fontSize: 16, fontWeight: '700', letterSpacing: -0.4 },
  swipeAction: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: SWIPE_W, alignItems: 'center', justifyContent: 'center',
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 12, paddingHorizontal: 2,
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  txName: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  txMeta: { fontSize: 12, marginTop: 1 },
  empty:      { alignItems: 'center', paddingTop: 64, paddingBottom: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptyBody:  { fontSize: 13, marginTop: 5, textAlign: 'center', lineHeight: 20 },
});

// ─── FilterSheet styles ───────────────────────────────────────────────────────

const FS = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderBottomWidth: 0,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14,
  },
  title: {
    fontSize: 17, fontWeight: '700', letterSpacing: -0.5,
  },
  clearAll: {
    fontSize: 13, fontWeight: '500', letterSpacing: -0.1,
  },
  divider: { height: 1 },
  body: {
    paddingHorizontal: 22, paddingTop: 22,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '500', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 11,
  },
  groupLabel: {
    fontSize: 11, fontWeight: '500', letterSpacing: 0.3,
    textTransform: 'uppercase', marginBottom: 9,
  },
  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 7,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 13, paddingVertical: 8,
    borderRadius: 100, gap: 5,
  },
  chipText: {
    fontSize: 13, fontWeight: '500', letterSpacing: -0.1,
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
    fontSize: 13, fontWeight: '600', letterSpacing: -0.2,
  },
  dowRow: {
    flexDirection: 'row', marginBottom: 2,
  },
  dowCell: {
    flex: 1, alignItems: 'center', paddingVertical: 4,
  },
  dowText: {
    fontSize: 10, fontWeight: '600', letterSpacing: 0.3,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  dayCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  dayText: {
    fontSize: 13,
  },
  summary: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, paddingTop: 14, borderTopWidth: 1,
  },
  summaryItem: {
    flex: 1, alignItems: 'center', gap: 3,
  },
  summaryLabel: {
    fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 14, fontWeight: '600', letterSpacing: -0.3,
  },
  summarySep: {
    width: 1, height: 28,
  },
});
