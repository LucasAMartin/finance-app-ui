import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ImageBackground,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheet, Group, Host, RNHostView, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator, pickerStyle, tag, tint, fixedSize, environment } from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATS, TRANSACTIONS, Transaction,
  UPCOMING_BILLS, UpcomingBill,
} from '../data';

const CALENDAR_YEAR  = 2026;
const CALENDAR_MONTH = 4; // 0-indexed → May

// Calendar open state persists across screen remounts (and across the rest of
// the app session). Module-scope so it survives even if ActivityScreen ever
// unmounts; today the App keeps all screens mounted, but this is the cheap
// safeguard against future architectural changes.
let cachedCalOpen = true;
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';
import { TxSheet } from '../components/TxSheet';
import { ThemeToggle } from '../components/ThemeToggle';
import { TransactionCalendar, CalDayMark } from '../components/TransactionCalendar';
import { Collapsible } from '../components/Collapsible';
import { Theme, catGroupColor, GROUP_COLORS, cautionBg, cautionText, flagBg } from '../theme';
import { TYPE } from '../typography';

const WALLPAPER = require('../../assets/example-images/wallpaper.jpg');

const MEDIA = {
  text: '#FFFFFF',
  textSec: 'rgba(255,255,255,0.78)',
  textTer: 'rgba(255,255,255,0.62)',
  hairline: 'rgba(255,255,255,0.18)',
  hairlineStrong: 'rgba(255,255,255,0.28)',
};

const ON_MEDIA_TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

function SectionCard({ children, style, noPad }: { children: React.ReactNode; style?: any; noPad?: boolean }) {
  return (
    <BlurView intensity={70} tint="systemMaterialDark" style={[S.sectionCard, style]}>
      <View style={[S.sectionCardBorder, noPad && S.sectionCardBorderFlush]}>
        {children}
      </View>
    </BlurView>
  );
}

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
  const [calOpen, _setCalOpen]              = useState(cachedCalOpen);
  const setCalOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    _setCalOpen(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      cachedCalOpen = resolved;
      return resolved;
    });
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

  const scrimTop    = theme.dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.40)';
  const scrimMid    = theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.05)';
  const scrimLower  = theme.dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';
  const scrimBottom = theme.dark ? 'rgba(0,0,0,0.80)' : 'rgba(0,0,0,0.65)';

  const hasFilterPills = selectedDay !== null || dateFilter !== null || catFilter.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ImageBackground source={WALLPAPER} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
        <LinearGradient
          pointerEvents="none"
          colors={[scrimTop, scrimMid, scrimLower, scrimBottom]}
          locations={[0, 0.30, 0.70, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* ── Header — pinned ─────────────────────────────────────── */}
        <View style={[S.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onOpenDrawer}
            pointerEvents="box-only"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[S.iconBtn, { backgroundColor: 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Icon name="menu" size={22} color={MEDIA.text} stroke={1.7} />
          </Pressable>
          <Text style={[S.title, { color: MEDIA.text }, ON_MEDIA_TEXT_SHADOW]}>History</Text>
          <ThemeToggle />
        </View>

        {/* ── Scrollable content ──────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={S.sectionStack}>

            {/* ── Calendar card ─────────────────────────────────── */}
            <SectionCard noPad>
              <Collapsible open={calOpen}>
                <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
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
                      text: MEDIA.text,
                      textSec: MEDIA.textSec,
                      textTer: MEDIA.textTer,
                      selectedBg: MEDIA.text,
                      selectedText: '#111111',
                      todayBorder: MEDIA.textSec,
                      dotFill: MEDIA.textSec,
                      billDotBorder: MEDIA.textTer,
                    }}
                  />
                </View>
              </Collapsible>

              {/* Toggle handle */}
              <Pressable
                onPress={() => setCalOpen(o => !o)}
                pointerEvents="box-only"
                style={[S.calHandle, { borderTopColor: calOpen ? MEDIA.hairline : 'transparent' }]}
                accessibilityRole="button"
                accessibilityLabel={calOpen ? 'Hide calendar' : 'Show calendar'}
                accessibilityState={{ expanded: calOpen }}
              >
                <View style={S.calShowRow}>
                  <Icon name="cal" size={12} color={MEDIA.textSec} stroke={1.5} />
                  <Text style={[S.calShowText, { color: MEDIA.textSec }]}>
                    {calOpen ? 'Hide calendar' : 'Show calendar'}
                  </Text>
                  {selectedDay !== null && (
                    <View style={[S.calActiveDot, { backgroundColor: MEDIA.textSec }]} />
                  )}
                  <View style={{ flex: 1 }} />
                  <Icon name={calOpen ? 'chevUp' : 'chevDown'} size={10} color={MEDIA.textSec} stroke={1.8} />
                </View>
              </Pressable>
            </SectionCard>

            {/* ── Search + filter card ──────────────────────────── */}
            <SectionCard>
              <View style={S.searchRow}>
                <View style={[S.search, { flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderColor: MEDIA.hairline }]}>
                  <Icon name="search" size={16} color={MEDIA.textSec} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search transactions…"
                    placeholderTextColor={MEDIA.textTer}
                    style={[S.searchInput, { color: MEDIA.text }]}
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
                      <Icon name="close" size={14} color={MEDIA.textSec} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => setFilterSheetOpen(true)}
                  activeOpacity={0.7}
                  style={[S.filterBtn, { backgroundColor: activeCount > 0 ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.12)' }]}
                  accessibilityRole="button"
                  accessibilityLabel={activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'}
                >
                  <Icon name="filter" size={15} color={activeCount > 0 ? 'rgba(0,0,0,0.75)' : MEDIA.textSec} stroke={1.6} />
                  {activeCount > 0 && (
                    <View style={[S.filterBadge, { backgroundColor: 'rgba(0,0,0,0.12)' }]}>
                      <Text style={[S.filterBadgeText, { color: 'rgba(0,0,0,0.75)' }]}>{activeCount}</Text>
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
                    <View style={[S.filterPill, { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: MEDIA.hairline }]}>
                      <Icon name="cal" size={10} color={MEDIA.textSec} stroke={1.7} />
                      <Text style={[S.filterPillText, { color: MEDIA.text }]}>
                        {MONTHS[calViewMonth]} {selectedDay}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedDay(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Clear day selection"
                      >
                        <Icon name="close" size={10} color={MEDIA.textSec} stroke={2} />
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
                      <View key={catId} style={[S.filterPill, { backgroundColor: groupColor + '30' }]}>
                        <Icon name={cat?.icon} size={11} color={groupColor} stroke={1.6} />
                        <Text style={[S.filterPillText, { color: MEDIA.text }]}>{cat?.label}</Text>
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
            <SectionCard>
              {selectedDay !== null ? (
                <>
                  {dayDetail.txs.length === 0 && dayDetail.bills.length === 0 ? (
                    <Text style={[S.detailEmpty, { color: MEDIA.textTer }]}>No activity this day</Text>
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
            </SectionCard>

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
      </ImageBackground>
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

                <Collapsible open={customMode}>
                  <View style={{ paddingHorizontal: 22, paddingTop: 4 }}>
                    <MiniCalendar
                      theme={theme}
                      from={localFrom}
                      to={localTo}
                      onRangeChange={handleRangeChange}
                    />
                  </View>
                </Collapsible>

                {/* ── Category rows ─────────────────────────────── */}
                {EXPENSE_GROUPS.filter(g => g.cats.length > 0).map(g => {
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
    <View style={{ marginBottom: 16 }}>
      <View style={S.dayHeader}>
        <Text style={[S.dayLabel, { color: MEDIA.textTer }]}>{label}</Text>
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
      style={S.txRow}
      accessibilityRole="button"
      accessibilityLabel={`${tx.merchant}, ${cat?.label ?? ''}, $${tx.amount.toFixed(2)}`}
    >
      <View style={[S.txIcon, { backgroundColor: groupColor }]}>
        <Icon name={cat?.icon} size={16} color="#fff" stroke={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={S.nameRow}>
          <Text style={[S.txName, { color: MEDIA.text, flexShrink: 1 }]} numberOfLines={1}>
            {tx.merchant}
          </Text>
          {tx.recurring && <Icon name="repeat" size={11} color={MEDIA.textTer} stroke={1.7} />}
        </View>
        <Text style={[S.txMeta, { color: MEDIA.textSec }]}>{cat?.label} · {tx.time}</Text>
      </View>
      <Money value={tx.amount} size={13} weight="500" theme={theme} color={MEDIA.textSec} />
      {!last && <View style={[S.rowSep, { backgroundColor: MEDIA.hairline }]} />}
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
          <Text style={[S.txName, { color: MEDIA.text, flexShrink: 1 }]} numberOfLines={1}>
            {bill.name}
          </Text>
          <Icon name="repeat" size={11} color={MEDIA.textTer} stroke={1.7} />
        </View>
        <Text style={[S.txMeta, { color: MEDIA.textSec }]}>
          {bill.estimate ? 'Estimated · Upcoming bill' : 'Upcoming bill'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Money
          value={bill.amount}
          size={13}
          weight="500"
          theme={theme}
          color={MEDIA.textSec}
          prefix="$"
        />
        <View style={[S.upcomingPill, { backgroundColor: 'rgba(255,200,80,0.18)' }]}>
          <Text style={[S.upcomingText, { color: 'rgba(255,200,80,0.9)' }]}>Upcoming</Text>
        </View>
      </View>
      {!last && <View style={[S.rowSep, { backgroundColor: MEDIA.hairline }]} />}
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
      <Icon name="search" size={28} color={MEDIA.textTer} />
      <Text style={[S.emptyTitle, { color: MEDIA.textSec }]}>
        {isFiltered ? 'No results' : 'No transactions yet'}
      </Text>
      <Text style={[S.emptyBody, { color: MEDIA.textTer }]}>
        {isFiltered ? 'Try adjusting your filters' : 'Your spending will appear here'}
      </Text>
      {isFiltered && onClearFilters && (
        <TouchableOpacity
          onPress={onClearFilters}
          activeOpacity={0.7}
          style={[S.emptyClear, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
        >
          <Text style={[S.emptyClearText, { color: MEDIA.textSec }]}>Clear filters</Text>
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
  },
  iconBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    ...TYPE.pageTitle,
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
    borderColor: 'rgba(255,255,255,0.18)',
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
  rowSep: {
    position: 'absolute',
    bottom: 0,
    left: 48,
    right: 0,
    height: 1,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: 2, marginBottom: 6,
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
