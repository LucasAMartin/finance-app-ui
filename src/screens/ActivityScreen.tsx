import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATS, TRANSACTIONS, Transaction,
  UPCOMING_BILLS, UpcomingBill,
} from '../data';

const CALENDAR_YEAR  = 2026;
const CALENDAR_MONTH = 4; // 0-indexed → May
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';
import { TxSheet } from '../components/TxSheet';
import { ThemeToggle } from '../components/ThemeToggle';
import { TransactionCalendar, CalDayMark } from '../components/TransactionCalendar';
import { Theme, catGroupColor, GROUP_COLORS, cautionBg, cautionText, flagBg } from '../theme';
import { TYPE } from '../typography';

const SWIPE_W = 72;


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


const EXPENSE_GROUPS = [
  { key: 'needs',   label: 'Needs',   cats: ['groceries', 'transport', 'bills']         },
  { key: 'wants',   label: 'Wants',   cats: ['dining', 'shopping', 'entertainment']     },
  { key: 'savings', label: 'Savings', cats: [] as string[]                              },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = s.trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3));
  return month < 0 ? null : { month, day: parseInt(m[2], 10) };
}

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
  const [catFilter, setCatFilter]           = useState<string[]>([]);
  const [dateFilter, setDateFilter]         = useState<DateFilter>(null);
  const [sortBy, setSortBy]                 = useState<SortOrder>('date-desc');
  const [sheetTx, setSheetTx]               = useState<Transaction | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedDay, setSelectedDay]       = useState<number | null>(null);
  const [calViewYear, setCalViewYear]       = useState(CALENDAR_YEAR);
  const [calViewMonth, setCalViewMonth]     = useState(CALENDAR_MONTH);
  const [calOpen, setCalOpen]               = useState(true);

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

  const activeCount = catFilter.length + (dateFilter ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);

  const filtered = useMemo(() => {
    const result = TRANSACTIONS.filter(t => {
      if (catFilter.length > 0 && !catFilter.includes(t.cat)) return false;
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
        return t.merchant.toLowerCase().includes(q) || CATS[t.cat].label.toLowerCase().includes(q);
      }
      return true;
    });
    if      (sortBy === 'amount-desc') result.sort((a, b) => b.amount - a.amount);
    else if (sortBy === 'amount-asc')  result.sort((a, b) => a.amount - b.amount);
    else if (sortBy === 'date-asc')    result.reverse();
    else if (sortBy === 'cat')         result.sort((a, b) => a.cat.localeCompare(b.cat) || a.merchant.localeCompare(b.merchant));
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
  const isFiltered = catFilter.length > 0 || dateFilter !== null || query.length > 0 || selectedDay !== null;

  // ── Calendar marks ───────────────────────────────────────────────────────
  const calSource = useMemo(
    () => TRANSACTIONS.filter(t => {
      if (catFilter.length > 0 && !catFilter.includes(t.cat)) return false;
      if (query) {
        const q = query.toLowerCase();
        return t.merchant.toLowerCase().includes(q) || CATS[t.cat].label.toLowerCase().includes(q);
      }
      return true;
    }),
    [catFilter, query],
  );

  const calBills = useMemo(
    () => UPCOMING_BILLS.filter(b => catFilter.length === 0 || catFilter.includes(b.cat)),
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={[S.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={onOpenDrawer}
          pointerEvents="box-only"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[S.iconBtn, { backgroundColor: 'transparent' }]}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Icon name="menu" size={22} color={theme.text} stroke={1.7} />
        </Pressable>
        <Text style={[S.title, { color: theme.text }]}>History</Text>
        <ThemeToggle />
      </View>

      {/* ── All content scrolls together ─────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Inline calendar ──────────────────────────────────── */}
        <View style={[S.calInline, { backgroundColor: theme.chipBg }]}>
          {calOpen && (
            <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
              <TransactionCalendar
                theme={theme}
                year={calViewYear}
                month={calViewMonth}
                marks={calMarks}
                selectedDay={selectedDay}
                today={TODAY_DOM}
                onSelectDay={(day) => {
                  setSelectedDay(day);
                  if (day !== null) setDateFilter(null);
                }}
                onViewMonthChange={(y, m) => {
                  setCalViewYear(y);
                  setCalViewMonth(m);
                  setSelectedDay(null);
                }}
                overrideColors={{
                  text: theme.text,
                  textSec: theme.textSec,
                  textTer: theme.textTer,
                  selectedBg: theme.text,
                  selectedText: theme.surface,
                  todayBorder: theme.textSec,
                  dotFill: theme.textSec,
                  billDotBorder: theme.textTer,
                }}
              />
            </View>
          )}

          {/* Tap to toggle calendar */}
          <Pressable
            onPress={() => setCalOpen(o => !o)}
            pointerEvents="box-only"
            style={[S.calHandle, { borderTopColor: calOpen ? theme.sep : 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel={calOpen ? 'Hide calendar' : 'Show calendar'}
            accessibilityState={{ expanded: calOpen }}
          >
            <View style={S.calShowRow}>
              <Icon name="cal" size={12} color={theme.textSec} stroke={1.5} />
              <Text style={[S.calShowText, { color: theme.textSec }]}>
                {calOpen ? 'Hide calendar' : 'Show calendar'}
              </Text>
              {selectedDay !== null && (
                <View style={[S.calActiveDot, { backgroundColor: theme.textSec }]} />
              )}
              <View style={{ flex: 1 }} />
              <Icon name={calOpen ? 'chevUp' : 'chevDown'} size={10} color={theme.textSec} stroke={1.8} />
            </View>
          </Pressable>
        </View>

        {/* ── Search + filter ──────────────────────────────────── */}
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
              accessibilityLabel="Search transactions"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Icon name="close" size={14} color={theme.textSec} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setFilterSheetOpen(true)}
            activeOpacity={0.7}
            style={[S.filterBtn, { backgroundColor: activeCount > 0 ? theme.text : theme.chipBg }]}
            accessibilityRole="button"
            accessibilityLabel={activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'}
          >
            <Icon name="filter" size={15} color={activeCount > 0 ? theme.bg : theme.textSec} stroke={1.6} />
            {activeCount > 0 && (
              <View style={[S.filterBadge, { backgroundColor: theme.bg }]}>
                <Text style={[S.filterBadgeText, { color: theme.text }]}>{activeCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Active filter pills ───────────────────────────────── */}
        {(selectedDay !== null || dateFilter !== null || catFilter.length > 0) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ paddingLeft: 20, marginBottom: 8 }}
            contentContainerStyle={S.filterStripScroll}
            keyboardShouldPersistTaps="handled"
          >
            {selectedDay !== null && (
              <View style={[S.filterPill, { backgroundColor: theme.chipBg, borderWidth: 1, borderColor: theme.hairline }]}>
                <Icon name="cal" size={10} color={theme.textSec} stroke={1.7} />
                <Text style={[S.filterPillText, { color: theme.text }]}>
                  {MONTHS[calViewMonth]} {selectedDay}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedDay(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear day selection"
                >
                  <Icon name="close" size={10} color={theme.textSec} stroke={2} />
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
              const cat = CATS[catId];
              const groupColor = catGroupColor(catId, theme.dark);
              return (
                <View key={catId} style={[S.filterPill, { backgroundColor: groupColor + '1A' }]}>
                  <Icon name={cat?.icon} size={11} color={groupColor} stroke={1.6} />
                  <Text style={[S.filterPillText, { color: theme.text }]}>{cat?.label}</Text>
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

        {/* ── Content ──────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20 }}>
          {selectedDay !== null ? (
            <>
              {dayDetail.txs.length === 0 && dayDetail.bills.length === 0 ? (
                <Text style={[S.detailEmpty, { color: theme.textTer }]}>No activity this day</Text>
              ) : (
                <View>
                  {dayDetail.txs.map((tx, i) => (
                    <TxRow
                      key={tx.id}
                      tx={tx}
                      theme={theme}
                      onPress={() => setSheetTx(tx)}
                      last={i === dayDetail.txs.length - 1 && dayDetail.bills.length === 0}
                    />
                  ))}
                  {dayDetail.bills.map((bill, i) => (
                    <BillRow key={bill.id} bill={bill} theme={theme} last={i === dayDetail.bills.length - 1} />
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
              dayKeys.map(day => (
                <DayGroup key={day} day={day} group={grouped[day]} theme={theme} onPress={setSheetTx} />
              ))
            )
          )}
        </View>
      </ScrollView>

      <TxSheet tx={sheetTx} theme={theme} onClose={() => setSheetTx(null)} />

      <FilterSheet
        visible={filterSheetOpen}
        theme={theme}
        catFilter={catFilter}
        dateFilter={dateFilter}
        sortBy={sortBy}
        setCatFilter={setCatFilter}
        setDateFilter={handleSetDateFilter}
        setSortBy={setSortBy}
        clearDay={() => setSelectedDay(null)}
        onClose={() => setFilterSheetOpen(false)}
      />
    </View>
  );
}

// ─── FilterSheet ─────────────────────────────────────────────────────────────

function FilterSheet({
  visible, theme, catFilter, dateFilter, sortBy,
  setCatFilter, setDateFilter, setSortBy, clearDay, onClose,
}: {
  visible: boolean;
  theme: Theme;
  catFilter: string[];
  dateFilter: DateFilter;
  sortBy: SortOrder;
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
    setCatFilter([]);
    setDateFilter(null);
    setSortBy('date-desc');
    clearDay();
    setCustomMode(false);
    setLocalFrom(null);
    setLocalTo(null);
  };

  const activeCount = catFilter.length + (dateFilter ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);
  const isCustomActive = customMode || (dateFilter !== null && typeof dateFilter !== 'string');

  const customLabel = (() => {
    if (dateFilter && typeof dateFilter !== 'string') {
      return `${fmtDate(dateFilter.from)} – ${fmtDate(dateFilter.to)}`;
    }
    if (localFrom && !localTo) return `${fmtDate(localFrom)} – …`;
    return 'Custom range';
  })();

  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}
      >
        <Group modifiers={[
          presentationDetents([{ fraction: 0.88 }]),
          presentationDragIndicator('visible'),
        ]}>
          <RNHostView>
            <View style={[FS.content, { backgroundColor: theme.surface }]}>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 20 }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
              >
                {/* ── Sort by ────────────────────────────────────── */}
                <View style={[FS.groupDivider, { paddingTop: 18 }]}>
                  <View style={{ height: 1, width: 14, backgroundColor: theme.hairline }} />
                  <Text style={[FS.groupDividerLabel, { color: theme.textTer }]}>Sort by</Text>
                  <View style={{ height: 1, flex: 1, backgroundColor: theme.hairline }} />
                  {activeCount > 0 && (
                    <TouchableOpacity
                      onPress={clearAll}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={[FS.clearLink, { color: theme.accent.dot }]}>Clear all</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={FS.sortGrid}>
                  {SORT_OPTIONS.map(o => {
                    const active = sortBy === o.id;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        onPress={() => setSortBy(o.id)}
                        activeOpacity={0.7}
                        style={[FS.sortCell, { backgroundColor: active ? theme.text : theme.chipBg }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={o.label}
                      >
                        <Text style={[FS.sortCellText, { color: active ? theme.bg : theme.textSec }]}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── Date presets ───────────────────────────────── */}
                <View style={FS.groupDivider}>
                  <View style={{ height: 1, width: 14, backgroundColor: theme.hairline }} />
                  <Text style={[FS.groupDividerLabel, { color: theme.textTer }]}>Date</Text>
                  <View style={{ height: 1, flex: 1, backgroundColor: theme.hairline }} />
                </View>

                <View style={FS.dateGrid}>
                  <View style={FS.dateGridRow}>
                    {[DATE_PRESETS[0], DATE_PRESETS[1]].map(o => {
                      const active = typeof dateFilter === 'string' && dateFilter === o.id;
                      return (
                        <TouchableOpacity
                          key={o.id}
                          onPress={() => handlePresetPress(o.id)}
                          activeOpacity={0.7}
                          style={[FS.dateCell, { backgroundColor: active ? theme.text : theme.chipBg }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={o.label}
                        >
                          <Text style={[FS.dateCellText, { color: active ? theme.bg : theme.textSec }]}>
                            {o.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={FS.dateGridRow}>
                    {[DATE_PRESETS[2], DATE_PRESETS[3]].map(o => {
                      const active = typeof dateFilter === 'string' && dateFilter === o.id;
                      return (
                        <TouchableOpacity
                          key={o.id}
                          onPress={() => handlePresetPress(o.id)}
                          activeOpacity={0.7}
                          style={[FS.dateCell, { backgroundColor: active ? theme.text : theme.chipBg }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={o.label}
                        >
                          <Text style={[FS.dateCellText, { color: active ? theme.bg : theme.textSec }]}>
                            {o.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleCustomToggle}
                  activeOpacity={0.7}
                  style={[FS.dateCustomRow, {
                    backgroundColor: isCustomActive ? theme.text : theme.chipBg,
                  }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCustomActive }}
                  accessibilityLabel={customLabel}
                >
                  <Icon name="cal" size={13} color={isCustomActive ? theme.bg : theme.textSec} stroke={1.5} />
                  <Text style={[FS.dateCustomText, { color: isCustomActive ? theme.bg : theme.textSec }]}>
                    {customLabel}
                  </Text>
                  <View style={{ transform: [{ rotate: customMode ? '180deg' : '0deg' }] }}>
                    <Icon name="chevDown" size={11} color={isCustomActive ? theme.bg : theme.textTer} stroke={1.8} />
                  </View>
                </TouchableOpacity>

                {customMode && (
                  <View style={{ paddingHorizontal: 22, paddingTop: 4 }}>
                    <MiniCalendar
                      theme={theme}
                      from={localFrom}
                      to={localTo}
                      onRangeChange={handleRangeChange}
                    />
                  </View>
                )}

                {/* ── Category rows ─────────────────────────────── */}
                {EXPENSE_GROUPS.filter(g => g.cats.length > 0).map(g => {
                  const groupColor = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
                  return (
                    <View key={g.key}>
                      <View style={FS.groupDivider}>
                        <View style={{ height: 1, width: 14, backgroundColor: groupColor + '40' }} />
                        <Text style={[FS.groupDividerLabel, { color: groupColor }]}>
                          {g.label}
                        </Text>
                        <View style={{ height: 1, flex: 1, backgroundColor: groupColor + '40' }} />
                      </View>

                      {g.cats.length === 0 ? (
                        <Text style={[FS.groupEmpty, { color: theme.textTer }]}>
                          No savings transactions yet
                        </Text>
                      ) : (
                        g.cats.map((catId, ci) => {
                          const c      = CATS[catId];
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
                                { color: active ? theme.text : theme.textSec },
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
            <Text style={[CAL.summaryLabel, { color: theme.textTer }]}>From</Text>
            <Text style={[CAL.summaryValue, { color: from ? theme.text : theme.textTer }]}>
              {from ? fmtDate(from) : '—'}
            </Text>
          </View>
          <View style={[CAL.summarySep, { backgroundColor: theme.hairline }]} />
          <View style={CAL.summaryItem}>
            <Text style={[CAL.summaryLabel, { color: theme.textTer }]}>To</Text>
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
  const { txs } = group;
  const label =
    txs[0]?.when === 'today'     ? 'Today'
    : txs[0]?.when === 'yesterday' ? 'Yesterday'
    : day;

  return (
    <View style={{ marginBottom: 24 }}>
      <View style={[S.groupSep, { backgroundColor: theme.hairline }]} />
      <View style={S.dayHeader}>
        <Text style={[S.dayLabel, { color: theme.text }]}>{label}</Text>
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

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[S.swipeAction, { backgroundColor: flagBg(theme.dark), opacity: actionOpacity }]}
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
      style={[S.txRow, { backgroundColor: theme.bg }]}
      accessibilityRole="button"
      accessibilityLabel={`${tx.merchant}, ${cat?.label ?? ''}, $${tx.amount.toFixed(2)}`}
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
      {!last && <View style={[S.rowSep, { backgroundColor: theme.sep }]} />}
    </TouchableOpacity>
  );
}

// ─── BillRow ─────────────────────────────────────────────────────────────────

function BillRow({ bill, theme, last }: { bill: UpcomingBill; theme: Theme; last: boolean }) {
  const groupColor = catGroupColor(bill.cat, theme.dark);
  return (
    <View style={S.txRow}>
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
          <Text style={[S.upcomingText, { color: cautionText(theme.dark) }]}>Upcoming</Text>
        </View>
      </View>
      {!last && <View style={[S.rowSep, { backgroundColor: theme.sep }]} />}
    </View>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({ theme, isFiltered, onClearFilters }: {
  theme: Theme;
  isFiltered: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <View style={S.empty}>
      <Icon name="search" size={28} color={theme.textTer} />
      <Text style={[S.emptyTitle, { color: theme.textSec }]}>
        {isFiltered ? 'No results' : 'No transactions yet'}
      </Text>
      <Text style={[S.emptyBody, { color: theme.textTer }]}>
        {isFiltered ? 'Try adjusting your filters' : 'Your spending will appear here'}
      </Text>
      {isFiltered && onClearFilters && (
        <TouchableOpacity
          onPress={onClearFilters}
          activeOpacity={0.7}
          style={[S.emptyClear, { backgroundColor: theme.chipBg }]}
        >
          <Text style={[S.emptyClearText, { color: theme.textSec }]}>Clear filters</Text>
        </TouchableOpacity>
      )}
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
    ...TYPE.pageTitle,
  },
  // Inline calendar
  calInline: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  calHandle: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
  },
  calShowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
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
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1,
  },
  searchInput: { flex: 1, ...TYPE.bodyRegular, padding: 0 },
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
  filterBadgeText: { ...TYPE.label, letterSpacing: 0 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 11, paddingRight: 8, paddingVertical: 6,
    borderRadius: 100, gap: 5,
  },
  filterPillText: {
    ...TYPE.caption,
  },
  filterStrip: {
    flexDirection: 'row', alignItems: 'center',
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
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 14,
  },
  detailDate: {
    ...TYPE.pageTitle,
    marginBottom: 2,
  },
  detailDow: {
    ...TYPE.bodySm,
  },
  detailClear: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
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
  groupSep: {
    height: 1,
    marginHorizontal: -20,
    marginBottom: 16,
  },
  rowSep: {
    position: 'absolute',
    bottom: 0,
    left: 48,
    right: 0,
    height: 1,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: 2, marginBottom: 10,
  },
  dayLabel: {
    ...TYPE.txDateLabel,
  },
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
  txName: { ...TYPE.body },
  txMeta: { ...TYPE.caption, marginTop: 2 },
  empty:      { alignItems: 'center', paddingTop: 64, paddingBottom: 40 },
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
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    ...TYPE.pageTitle,
  },
  clearLink: {
    ...TYPE.bodySm,
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

  // Date section
  dateGrid: {
    paddingHorizontal: 22,
    gap: 8,
    marginBottom: 8,
  },
  dateGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateCell: {
    flex: 1, paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
  },
  dateCellText: {
    ...TYPE.bodySm,
  },
  dateCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 22,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 10,
  },
  dateCustomText: {
    flex: 1, ...TYPE.bodySm,
  },

  // Sort by section
  sortGrid: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  sortCell: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: '45%',
    flex: 1,
    alignItems: 'center',
  },
  sortCellText: {
    ...TYPE.bodySm,
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
  dayText: {
    fontSize: 13,
    lineHeight: 16,
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
