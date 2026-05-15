import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  RefreshControl,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, catGroupColor, OVER_DOT } from '../theme';
import { Skeleton } from '../components/Skeleton';
import {
  CATS,
  TRANSACTIONS,
  UPCOMING_BILLS,
  SPEND_GROUPS,
  MONTHLY_INCOME,
  MONTH_BUDGETS,
  Transaction,
} from '../data';
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';
import { MonthlySpendingTracker } from '../components/MonthlySpendingTracker';
import { ThemeToggle } from '../components/ThemeToggle';
import { CategoryGroups } from '../components/CategoryGroups';

interface Props {
  theme: Theme;
  onOpenTx: (tx: Transaction) => void;
  onViewSpending: () => void;
  onViewActivity: () => void;
  onOpenDrawer: () => void;
}

function IconBtn({
  onPress,
  children,
  size = 40,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.5}
      delayPressIn={0}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={[styles.iconBtn, { width: size, height: size }]}
    >
      {children}
    </TouchableOpacity>
  );
}

// Donut progress ring for the month picker
function MonthDonut({
  spent,
  budget,
  dark,
}: {
  spent: number;
  budget: number;
  dark: boolean;
}) {
  const SIZE = 38;
  const STROKE = 3.5;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const fill = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const over = spent > budget;
  const dashOffset = CIRC * (1 - fill);
  const trackColor = dark ? 'rgba(173,189,222,0.14)' : 'rgba(14,14,16,0.08)';
  const fillColor = over ? OVER_DOT : '#6E9B82';

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      style={{ transform: [{ rotate: '-90deg' }] }}
    >
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        stroke={trackColor}
        strokeWidth={STROKE}
        fill="none"
      />
      {fill > 0 && (
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={fillColor}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

export function HomeScreen({ theme, onOpenTx, onViewSpending, onViewActivity, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();
  const card = getCardStyle(theme);

  const groups = useMemo(() => {
    const g: Record<string, Transaction[]> = { today: [], yesterday: [], earlier: [] };
    TRANSACTIONS.forEach(t => g[t.when].push(t));
    return g;
  }, []);

  const [monthIdx, setMonthIdx] = useState(0);
  const mb = MONTH_BUDGETS[monthIdx];

  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [dropdownY, setDropdownY] = useState(0);
  const [filterText, setFilterText] = useState('');
  const triggerRef = useRef<View>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 1100);
  };

  const openMonthPicker = () => {
    triggerRef.current?.measureInWindow((_x, y, _w, h) => {
      setDropdownY(y + h + 6);
      setMonthDropdownOpen(true);
    });
  };

  const closeDropdown = () => {
    setMonthDropdownOpen(false);
    setFilterText('');
  };

  const filteredMonths = MONTH_BUDGETS.map((m, idx) => ({ m, idx })).filter(({ m }) => {
    const q = filterText.toLowerCase().trim();
    if (!q) return true;
    const year = m.key.split('-')[0];
    return m.month.toLowerCase().includes(q) || year.includes(q);
  });

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSec}
            colors={[theme.accent.dot]}
            progressBackgroundColor={theme.surface}
          />
        }
      >
        {/* ─── Header ─────────────────────────────────────── */}
        <View style={[styles.headerChrome, { paddingTop: insets.top + 8 }]}>
          <IconBtn onPress={onOpenDrawer}>
            <Icon name="menu" size={22} color={theme.text} stroke={1.7} />
          </IconBtn>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconBtn>
              <View>
                <Icon name="bell" size={22} color={theme.text} stroke={1.7} />
                <View
                  style={[
                    styles.bellDot,
                    { backgroundColor: theme.accent.dot, borderColor: theme.bg },
                  ]}
                />
              </View>
            </IconBtn>
            <ThemeToggle />
          </View>
        </View>

        {/* ─── 1. {Month} Budget ──────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View ref={triggerRef} collapsable={false}>
              <TouchableOpacity
                onPress={openMonthPicker}
                activeOpacity={0.7}
                delayPressIn={0}
                style={styles.monthTrigger}
              >
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {mb.month} Budget
                </Text>
                <View style={{ marginLeft: 6, marginTop: 1 }}>
                  <Icon name="chevDown" size={14} color={theme.textSec} stroke={1.9} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          {loading ? (
            <TrackerSkeleton theme={theme} />
          ) : (
            <MonthlySpendingTracker
              theme={theme}
              spent={mb.spent}
              budget={mb.budget}
              remainingLabel={mb.remainingLabel}
              expectedPct={mb.expectedPct}
            />
          )}
        </View>

        {/* ─── 2. Spending by category ─────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Spending by category</Text>
            <TouchableOpacity onPress={onViewSpending} activeOpacity={0.6} delayPressIn={0}>
              <Text style={[styles.sectionAction, { color: theme.textSec }]}>View all</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <CategorySkeleton theme={theme} />
          ) : (
            <CategoryGroups theme={theme} groups={SPEND_GROUPS} income={MONTHLY_INCOME} />
          )}
        </View>

        {/* ─── 3. Upcoming bills ───────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming</Text>
            <TouchableOpacity activeOpacity={0.6} delayPressIn={0}>
              <Text style={[styles.sectionAction, { color: theme.textSec }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <RowsSkeleton theme={theme} count={3} />
          ) : (
            <View style={[card, { overflow: 'hidden', marginBottom: 14 }]}>
              {UPCOMING_BILLS.map((b, i) => (
                <View
                  key={b.id}
                  style={[
                    styles.billRow,
                    {
                      borderBottomWidth: i < UPCOMING_BILLS.length - 1 ? 1 : 0,
                      borderBottomColor: theme.sep,
                    },
                  ]}
                >
                  <View style={[styles.txIcon, { backgroundColor: catGroupColor(b.cat, theme.dark) }]}>
                    <Icon name={b.icon} size={16} color="#fff" stroke={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        letterSpacing: -0.2,
                        color: theme.text,
                      }}
                    >
                      {b.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 1 }}>
                      {b.dueDate} · in {b.daysUntil} days
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
                    {b.estimate ? '~' : ''}${b.amount.toFixed(b.amount % 1 === 0 ? 0 : 2)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ─── 4. Activity ─────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Activity</Text>
            <TouchableOpacity onPress={onViewActivity} activeOpacity={0.6} delayPressIn={0}>
              <Text style={[styles.sectionAction, { color: theme.textSec }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivitySkeleton theme={theme} />
          ) : (
            <View>
              {(['today', 'yesterday', 'earlier'] as const).map(
                key =>
                  groups[key].length > 0 && (
                    <View key={key} style={{ marginBottom: 14 }}>
                      <Text style={[styles.dayLabel, { color: theme.textTer }]}>
                        {key === 'today' ? 'Today' : key === 'yesterday' ? 'Yesterday' : 'This week'}
                      </Text>
                      <View style={[card, { overflow: 'hidden' }]}>
                        {groups[key].map((tx, i, arr) => (
                          <TxRow
                            key={tx.id}
                            tx={tx}
                            theme={theme}
                            onPress={() => onOpenTx(tx)}
                            last={i === arr.length - 1}
                          />
                        ))}
                      </View>
                    </View>
                  )
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ─── Month picker modal ─────────────────────────────── */}
      <Modal
        visible={monthDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDropdown}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={closeDropdown}
        />
        <View
          style={[
            styles.dropdown,
            {
              top: dropdownY,
              backgroundColor: theme.surface,
              borderColor: theme.hairline,
              shadowColor: '#000',
            },
          ]}
        >
          {/* Search bar */}
          <View style={[styles.dropdownSearchRow, { borderBottomColor: theme.sep }]}>
            <Icon name="search" size={15} color={theme.textTer} stroke={1.7} />
            <TextInput
              value={filterText}
              onChangeText={setFilterText}
              placeholder="Search months..."
              placeholderTextColor={theme.textTer}
              style={[styles.dropdownSearchInput, { color: theme.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Month list */}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
            {filteredMonths.length === 0 ? (
              <Text style={[styles.dropdownEmpty, { color: theme.textTer }]}>No months found</Text>
            ) : (
              filteredMonths.map(({ m, idx }) => {
                const year = m.key.split('-')[0];
                const selected = idx === monthIdx;
                const over = m.spent > m.budget;
                return (
                  <TouchableOpacity
                    key={m.key}
                    activeOpacity={0.7}
                    delayPressIn={0}
                    onPress={() => {
                      setMonthIdx(idx);
                      closeDropdown();
                    }}
                    style={[
                      styles.dropdownRow,
                      {
                        borderBottomColor: theme.sep,
                        borderBottomWidth: idx < MONTH_BUDGETS.length - 1 ? 1 : 0,
                        backgroundColor: selected ? theme.chipBg : 'transparent',
                      },
                    ]}
                  >
                    <MonthDonut spent={m.spent} budget={m.budget} dark={theme.dark} />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text
                        style={[
                          styles.dropdownLabel,
                          { color: selected ? theme.accent.dot : theme.text },
                        ]}
                      >
                        {m.month} {year}
                      </Text>
                      <Text style={[styles.dropdownSub, { color: theme.textSec }]}>
                        ${Math.round(m.spent).toLocaleString()} of ${m.budget.toLocaleString()}
                        {over ? '  ·  Over budget' : ''}
                      </Text>
                    </View>
                    {selected && (
                      <View style={[styles.dropdownDot, { backgroundColor: theme.accent.dot }]} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ── Skeleton loaders ────────────────────────────────────────────
function TrackerSkeleton({ theme }: { theme: Theme }) {
  const card = getCardStyle(theme);
  return (
    <View style={[card, { padding: 22, marginBottom: 14 }]}>
      <Skeleton width="100%" height={22} radius={5} style={{ marginBottom: 22 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Skeleton width={120} height={11} radius={4} style={{ marginBottom: 8 }} />
          <Skeleton width={96} height={24} radius={6} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Skeleton width={84} height={11} radius={4} style={{ marginBottom: 8 }} />
          <Skeleton width={96} height={24} radius={6} />
        </View>
      </View>
      <View style={{ height: 1, marginTop: 16, marginBottom: 12, backgroundColor: theme.sep }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width={64} height={11} radius={4} />
        <Skeleton width={96} height={11} radius={4} />
      </View>
    </View>
  );
}

function CategorySkeleton({ theme }: { theme: Theme }) {
  const card = getCardStyle(theme);
  return (
    <View style={[card, { paddingVertical: 4, marginBottom: 14 }]}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 16,
            paddingHorizontal: 18,
            borderBottomWidth: i < 2 ? 1 : 0,
            borderBottomColor: theme.sep,
          }}
        >
          <Skeleton width={13} height={13} radius={4} />
          <View style={{ flex: 1, gap: 9 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width={68} height={14} radius={4} />
              <Skeleton width={96} height={12} radius={4} />
            </View>
            <Skeleton width="100%" height={7} radius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

function RowsSkeleton({
  theme,
  count,
  marginBottom = 14,
}: {
  theme: Theme;
  count: number;
  marginBottom?: number;
}) {
  const card = getCardStyle(theme);
  return (
    <View style={[card, { overflow: 'hidden', marginBottom }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.billRow,
            { borderBottomWidth: i < count - 1 ? 1 : 0, borderBottomColor: theme.sep },
          ]}
        >
          <Skeleton width={36} height={36} radius={18} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="48%" height={13} radius={4} />
            <Skeleton width="32%" height={11} radius={4} />
          </View>
          <Skeleton width={54} height={14} radius={4} />
        </View>
      ))}
    </View>
  );
}

function ActivitySkeleton({ theme }: { theme: Theme }) {
  return (
    <View>
      {[2, 3].map((rowCount, g) => (
        <View key={g} style={{ marginBottom: 14 }}>
          <Skeleton width={70} height={11} radius={4} style={{ marginBottom: 8, marginLeft: 2 }} />
          <RowsSkeleton theme={theme} count={rowCount} marginBottom={0} />
        </View>
      ))}
    </View>
  );
}

// ── TxRow ───────────────────────────────────────────────────────
function TxRow({
  tx,
  theme,
  onPress,
  last,
}: {
  tx: Transaction;
  theme: Theme;
  onPress: () => void;
  last: boolean;
}) {
  const cat = CATS[tx.cat];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.sep }]}
    >
      <View style={[styles.txIcon, { backgroundColor: catGroupColor(tx.cat, theme.dark) }]}>
        <Icon name={cat?.icon} size={16} color="#fff" stroke={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: theme.text }}
          numberOfLines={1}
        >
          {tx.merchant}
        </Text>
        <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 1 }}>
          {cat?.label} · {tx.time}
        </Text>
      </View>
      <Money value={tx.amount} size={14} weight="600" theme={theme} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerChrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },

  section: {
    marginBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
    minHeight: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '500',
  },
  monthTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  dayLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 8,
  },

  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Month picker dropdown
  dropdown: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 16,
  },
  dropdownSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dropdownSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  dropdownLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  dropdownSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  dropdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 12,
  },
  dropdownEmpty: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 24,
  },
});
