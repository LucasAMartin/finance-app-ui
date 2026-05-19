import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATS, TRANSACTIONS, Transaction } from '../data';
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';
import { TxSheet } from '../components/TxSheet';
import { ThemeToggle } from '../components/ThemeToggle';
import { Theme, catGroupColor } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

const DATE_OPTS = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'earlier',   label: 'This week' },
];

const SORT_OPTS = [
  { id: 'date'   as const, label: 'Newest first' },
  { id: 'amount' as const, label: 'Highest first' },
];

const ALL_CATS = ['groceries', 'dining', 'transport', 'shopping', 'bills', 'entertainment'];

// Panel inner width: screen − 2×20 outer padding − 2×16 panel padding; 3 tiles with 2 gaps of 8
const TILE_W = Math.floor((SCREEN_W - 40 - 32 - 16) / 3);

const SWIPE_W = 72;
const PANEL_H = 410;

// ─── Screen ──────────────────────────────────────────────────────────────────

interface Props {
  theme: Theme;
  onOpenDrawer?: () => void;
}

export function ActivityScreen({ theme, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();

  const [query, setQuery]           = useState('');
  const [catFilter, setCatFilter]   = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [sortBy, setSortBy]         = useState<'date' | 'amount'>('date');
  const [sheetTx, setSheetTx]       = useState<Transaction | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const panelAnim = useRef(new Animated.Value(0)).current;
  const chevAnim  = useRef(new Animated.Value(0)).current;

  const activeCount = (catFilter ? 1 : 0) + (dateFilter ? 1 : 0) + (sortBy !== 'date' ? 1 : 0);

  const toggleFilter = () => {
    const next = !filterOpen;
    setFilterOpen(next);
    Animated.parallel([
      Animated.timing(panelAnim, {
        toValue: next ? 1 : 0,
        duration: 240,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(chevAnim, {
        toValue: next ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const panelMaxH = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, PANEL_H] });
  const chevRot   = chevAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const filtered = useMemo(() => {
    const result = TRANSACTIONS.filter(t => {
      if (catFilter  && t.cat !== catFilter)  return false;
      if (dateFilter && t.when !== dateFilter) return false;
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

  const clearAll = () => {
    setCatFilter(null);
    setDateFilter(null);
    setSortBy('date');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <View style={[S.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onOpenDrawer}
          activeOpacity={0.5}
          delayPressIn={0}
          hitSlop={{ top: 60, bottom: 16, left: 16, right: 16 }}
          style={S.iconBtn}
        >
          <Icon name="menu" size={22} color={theme.text} stroke={1.7} />
        </TouchableOpacity>
        <Text style={[S.title, { color: theme.text }]}>History</Text>
        <ThemeToggle />
      </View>

      {/* ── Sticky controls ─────────────────────────────────── */}
      <View style={{ paddingHorizontal: 20 }}>

        {/* Search + filter on same row */}
        <View style={S.searchRow}>
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

          {/* Filter icon button */}
          <TouchableOpacity
            onPress={toggleFilter}
            activeOpacity={0.7}
            style={[
              S.filterBtn,
              { backgroundColor: activeCount > 0 ? theme.text : theme.chipBg },
            ]}
          >
            <Icon
              name="filter"
              size={14}
              color={activeCount > 0 ? theme.bg : theme.textSec}
              stroke={1.6}
            />
            {activeCount > 0 ? (
              <View style={[S.filterBadge, { backgroundColor: theme.bg }]}>
                <Text style={[S.filterBadgeText, { color: theme.text }]}>{activeCount}</Text>
              </View>
            ) : (
              <Animated.View style={{ transform: [{ rotate: chevRot }] }}>
                <Icon name="chevDown" size={11} color={theme.textSec} />
              </Animated.View>
            )}
          </TouchableOpacity>
        </View>

        {/* Dropdown panel */}
        <Animated.View style={{ maxHeight: panelMaxH, overflow: 'hidden' }}>
          <View style={[S.panel, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>

            {/* Panel title + clear */}
            <View style={S.panelTitleRow}>
              <Text style={[S.panelTitle, { color: theme.text }]}>Filters</Text>
              {activeCount > 0 && (
                <TouchableOpacity onPress={clearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 12, color: theme.textTer, fontWeight: '600' }}>
                    Clear all
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Sort */}
            <Text style={[S.panelSection, { color: theme.textTer }]}>Sort</Text>
            <View style={[S.panelChips, { marginBottom: 14 }]}>
              {SORT_OPTS.map(o => {
                const active = sortBy === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => setSortBy(o.id)}
                    style={[S.chip, { backgroundColor: active ? theme.text : theme.chipBg }]}
                  >
                    <Text style={[S.chipText, { color: active ? theme.bg : theme.textSec }]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[S.panelDiv, { backgroundColor: theme.hairline }]} />

            {/* Date */}
            <Text style={[S.panelSection, { color: theme.textTer }]}>Date</Text>
            <View style={[S.panelChips, { marginBottom: 14 }]}>
              {DATE_OPTS.map(o => {
                const active = dateFilter === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => setDateFilter(active ? null : o.id)}
                    style={[S.chip, { backgroundColor: active ? theme.text : theme.chipBg }]}
                  >
                    <Text style={[S.chipText, { color: active ? theme.bg : theme.textSec }]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[S.panelDiv, { backgroundColor: theme.hairline }]} />

            {/* Category grid */}
            <Text style={[S.panelSection, { color: theme.textTer }]}>Category</Text>
            <View style={S.catGrid}>
              {ALL_CATS.map(catId => {
                const c          = CATS[catId];
                const active     = catFilter === catId;
                const groupColor = catGroupColor(catId, theme.dark);
                return (
                  <TouchableOpacity
                    key={catId}
                    onPress={() => setCatFilter(active ? null : catId)}
                    activeOpacity={0.75}
                    style={[
                      S.catTile,
                      {
                        width: TILE_W,
                        backgroundColor: active ? groupColor : groupColor + '18',
                        borderWidth: 1.5,
                        borderColor: active ? groupColor : 'transparent',
                      },
                    ]}
                  >
                    <View style={[
                      S.catTileIcon,
                      { backgroundColor: active ? 'rgba(255,255,255,0.22)' : groupColor + '28' },
                    ]}>
                      <Icon name={c.icon} size={16} color={active ? '#fff' : groupColor} stroke={1.5} />
                    </View>
                    <Text style={[S.catTileLabel, { color: active ? '#fff' : theme.textSec }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

          </View>
        </Animated.View>

        <View style={{ height: 14 }} />
      </View>

      {/* ── Transaction list ────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
      </ScrollView>

      <TxSheet tx={sheetTx} theme={theme} onClose={() => setSheetTx(null)} />
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
        <Text style={[S.txName, { color: theme.text }]} numberOfLines={1}>
          {tx.merchant}
        </Text>
        <Text style={[S.txMeta, { color: theme.textSec }]}>{cat?.label} · {tx.time}</Text>
      </View>
      <Money value={tx.amount} size={13} weight="500" theme={theme} color={theme.textSec} />
    </TouchableOpacity>
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
  // Search row — search input + filter button side by side
  searchRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 8,
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  // Filter icon button — lives to the right of search bar
  filterBtn: {
    borderRadius: 16,
    paddingHorizontal: 14,
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
  // Dropdown panel
  panel: {
    borderRadius: 18, borderWidth: 1,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    marginBottom: 2,
  },
  panelTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  panelTitle: {
    fontSize: 14, fontWeight: '700', letterSpacing: -0.3,
  },
  panelSection: {
    fontSize: 10, fontWeight: '600', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 8,
  },
  panelChips: { flexDirection: 'row', gap: 6 },
  panelDiv:   { height: 1, marginVertical: 12 },
  // Chips
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 100, gap: 5,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  // Category icon grid
  catGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  catTile: {
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6,
    alignItems: 'center', gap: 6,
  },
  catTileIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  catTileLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: -0.1, textAlign: 'center',
  },
  // Day group — clear hierarchy: total is dominant, label is secondary
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', paddingHorizontal: 2, marginBottom: 8,
  },
  dayLabel: {
    fontSize: 11, fontWeight: '600',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  dayTotal: { fontSize: 16, fontWeight: '700', letterSpacing: -0.4 },
  // Swipe
  swipeAction: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: SWIPE_W, alignItems: 'center', justifyContent: 'center',
  },
  // Transaction row
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
  // Empty state
  empty:      { alignItems: 'center', paddingTop: 64, paddingBottom: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptyBody:  { fontSize: 13, marginTop: 5, textAlign: 'center', lineHeight: 20 },
});
