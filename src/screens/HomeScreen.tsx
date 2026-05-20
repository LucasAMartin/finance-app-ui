import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  RefreshControl,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, catGroupColor, OVER_DOT, cautionText } from '../theme';
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
import { CategoryGroups } from '../components/CategoryGroups';
import { TxSheet } from '../components/TxSheet';
import { ThemeToggle } from '../components/ThemeToggle';


// ── Month donut (picker) ─────────────────────────────────────────
function MonthDonut({ spent, budget, dark }: { spent: number; budget: number; dark: boolean }) {
  const SIZE = 38, STROKE = 3.5;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const fill = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const over = spent > budget;
  const dashOffset = CIRC * (1 - fill);
  const trackColor = dark ? 'rgba(173,189,222,0.14)' : 'rgba(14,14,16,0.08)';
  const fillColor = over ? OVER_DOT : '#6E9B82';
  return (
    <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={SIZE/2} cy={SIZE/2} r={R} stroke={trackColor} strokeWidth={STROKE} fill="none" />
      {fill > 0 && (
        <Circle cx={SIZE/2} cy={SIZE/2} r={R} stroke={fillColor} strokeWidth={STROKE} fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={dashOffset} strokeLinecap="round" />
      )}
    </Svg>
  );
}

function IconBtn({ onPress, children, size = 40 }: { onPress?: () => void; children: React.ReactNode; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.iconBtn, { width: size, height: size, backgroundColor: 'transparent' }]}
    >
      {children}
    </Pressable>
  );
}

interface Props {
  theme: Theme;
  onViewSpending: () => void;
  onViewActivity: () => void;
  onOpenDrawer: () => void;
}

export function HomeScreen({ theme, onViewSpending, onViewActivity, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();

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

  const [sheetTx, setSheetTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    setTimeout(() => { setLoading(false); setRefreshing(false); }, 1100);
  };

  const openMonthPicker = () => {
    triggerRef.current?.measureInWindow((_x, y, _w, h) => {
      setDropdownY(y + h + 6);
      setMonthDropdownOpen(true);
    });
  };

  const closeDropdown = () => { setMonthDropdownOpen(false); setFilterText(''); };

  const filteredMonths = MONTH_BUDGETS.map((m, idx) => ({ m, idx })).filter(({ m }) => {
    const q = filterText.toLowerCase().trim();
    if (!q) return true;
    const year = m.key.split('-')[0];
    return m.month.toLowerCase().includes(q) || year.includes(q);
  });

  // Budget computations
  const BAR_MAX = 1.2;
  const rawPct = mb.budget > 0 ? mb.spent / mb.budget : 0;
  const barPct = Math.min(Math.max(rawPct, 0), BAR_MAX) / BAR_MAX;
  const available = Math.max(mb.budget - mb.spent, 0);
  const overage = mb.spent - mb.budget;
  const over = mb.spent > mb.budget;
  const year = mb.key.split('-')[0];
  const afterBudget = MONTHLY_INCOME - mb.budget;

  // Hero is always dark plum regardless of theme mode.
  const HERO_BG   = '#3A2860';
  const H_TEXT    = '#EDE8F5';
  const H_SEC     = 'rgba(237,232,245,0.60)';
  const H_INK     = theme.dark ? theme.accent.ink : 'rgba(237,232,245,0.85)';
  const H_DOT_BG  = theme.dark ? theme.accent.dot : 'rgba(237,232,245,0.85)';

  return (
    <View style={{ flex: 1, backgroundColor: HERO_BG }}>
      {/* White backdrop covers bottom half — absorbs bounce without affecting scroll */}
      <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, bottom: 0, backgroundColor: theme.surface }} pointerEvents="none" />
      {/* ─── Header — pinned ─────────────────────────────── */}
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8, backgroundColor: HERO_BG }]}>
        <View style={styles.headerRow}>
          <IconBtn onPress={onOpenDrawer}>
            <Icon name="menu" size={22} color={H_TEXT} stroke={1.7} />
          </IconBtn>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconBtn>
              <View>
                <Icon name="bell" size={22} color={H_TEXT} stroke={1.7} />
                <View style={[styles.bellDot, { backgroundColor: H_DOT_BG, borderColor: HERO_BG }]} />
              </View>
            </IconBtn>
            <ThemeToggle />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={H_SEC} colors={[theme.accent.dot]}
            progressBackgroundColor={theme.surface} />
        }
      >
      {/* ─── Budget hero ─────────────────────────────────── */}
      <View style={[styles.budgetHero, {
        backgroundColor: HERO_BG,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 52,
      }]}>

        {/* Top row: status labels left, month trigger right — always rendered for picker ref */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroStatusGroup}>
            {loading ? (
              <Skeleton width={130} height={12} radius={4} />
            ) : (
              <>
                <Text style={[styles.heroStatusLabel, { color: over ? OVER_DOT : H_INK }]}>
                  {over ? 'Over budget' : 'Available'}
                </Text>
                <View style={[styles.heroStatusDiv, { backgroundColor: over ? OVER_DOT : H_INK }]} />
                <Text style={[styles.heroStatusSub, { color: H_SEC }]}>
                  {mb.remainingLabel}
                </Text>
              </>
            )}
          </View>
          <View ref={triggerRef} collapsable={false}>
            <TouchableOpacity onPress={openMonthPicker} activeOpacity={0.7} delayPressIn={0}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={styles.monthTrigger}>
              <Text style={[styles.monthLabel, { color: H_INK }]}>
                {mb.month} {year}
              </Text>
              <Icon name="chevDown" size={11} color={H_INK} stroke={2} />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <>
            <Skeleton width={180} height={28} radius={6} style={{ marginBottom: 20 }} />
            <Skeleton width="100%" height={5} radius={3} />
            <Skeleton width="100%" height={40} radius={6} style={{ marginTop: 22 }} />
          </>
        ) : (
          <>
            <View style={styles.heroAmountRow}>
              <Money value={over ? overage : available} size={32} weight="700"
                prefix={over ? '-$' : '$'} theme={theme}
                color={over ? OVER_DOT : H_TEXT} />
            </View>

            {/* Simple progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.13)' }]}>
              <View style={[styles.progressFill, {
                width: `${Math.round(Math.min(rawPct, 1) * 100)}%`,
                backgroundColor: over ? OVER_DOT : H_INK,
              }]} />
            </View>

            {/* Income / Budget / After-budget strip */}
            <View style={[styles.incomeStrip, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={styles.incomeStat}>
                <Text style={[styles.incomeLabel, { color: H_SEC }]}>Income</Text>
                <Text style={[styles.incomeValue, { color: H_TEXT }]}>
                  ${MONTHLY_INCOME.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.incomeDiv, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
              <View style={styles.incomeStat}>
                <Text style={[styles.incomeLabel, { color: H_SEC }]}>Budget</Text>
                <Text style={[styles.incomeValue, { color: H_TEXT }]}>
                  ${mb.budget.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.incomeDiv, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
              <View style={styles.incomeStat}>
                <Text style={[styles.incomeLabel, { color: H_SEC }]}>After budget</Text>
                <Text style={[styles.incomeValue, { color: afterBudget >= 0 ? H_INK : OVER_DOT }]}>
                  ${afterBudget.toLocaleString()}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

        {/* ─── Card — same ScrollView, always on top of hero ── */}
        <View style={[styles.contentPanel, { backgroundColor: theme.surface, marginTop: -28 }]}>

          {/* ─── Spending by category ─────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={[styles.ledgerLabel, { color: theme.text }]}>Spending</Text>
                {!loading && (
                  <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 2 }}>
                    ${Math.round(mb.spent).toLocaleString()} of ${mb.budget.toLocaleString()} this month
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={onViewSpending} activeOpacity={0.6} delayPressIn={0}>
                <Text style={[styles.ledgerAction, { color: theme.accent.dot }]}>See all</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <CategorySkeleton theme={theme} />
            ) : (
              <CategoryGroups theme={theme} groups={SPEND_GROUPS} income={MONTHLY_INCOME} naked />
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.sep }]} />

          {/* ─── Upcoming bills ───────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.ledgerLabel, { color: theme.text }]}>Upcoming</Text>
            </View>
            {loading ? (
              <BillsSkeleton theme={theme} />
            ) : (
              UPCOMING_BILLS.map((b, i) => (
                <View key={b.id} style={[
                  styles.billRow,
                  { borderBottomWidth: i < UPCOMING_BILLS.length - 1 ? 1 : 0, borderBottomColor: theme.sep },
                ]}>
                  <View style={[styles.rowIcon, { backgroundColor: catGroupColor(b.cat, theme.dark) }]}>
                    <Icon name={b.icon} size={16} color="#fff" stroke={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{b.name}</Text>
                    <Text style={[styles.rowSub, { color: theme.textSec }]}>
                      {b.dueDate}
                      {'  ·  '}
                      <Text style={{ color: b.daysUntil <= 7 ? OVER_DOT : b.daysUntil <= 14 ? cautionText(theme.dark) : theme.textSec }}>
                        {b.daysUntil}d
                      </Text>
                    </Text>
                  </View>
                  <Text style={[styles.rowAmt, { color: theme.textSec }]}>
                    {b.estimate ? '~' : ''}${b.amount.toFixed(b.amount % 1 === 0 ? 0 : 2)}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.sep }]} />

          {/* ─── Activity ─────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.ledgerLabel, { color: theme.text }]}>Activity</Text>
              <TouchableOpacity onPress={onViewActivity} activeOpacity={0.6} delayPressIn={0}>
                <Text style={[styles.ledgerAction, { color: theme.accent.dot }]}>See all</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivitySkeleton theme={theme} />
            ) : (
              (['today', 'yesterday', 'earlier'] as const).map(key =>
                groups[key].length > 0 && (
                  <View key={key} style={{ marginBottom: 14 }}>
                    <Text style={[styles.dayLabel, { color: theme.textTer }]}>
                      {key === 'today' ? 'Today' : key === 'yesterday' ? 'Yesterday' : 'This week'}
                    </Text>
                    {groups[key].map((tx, i, arr) => (
                      <TxRow key={tx.id} tx={tx} theme={theme}
                        onPress={() => setSheetTx(tx)} last={i === arr.length - 1} />
                    ))}
                  </View>
                )
              )
            )}
          </View>

        </View>

      </ScrollView>

      <TxSheet tx={sheetTx} theme={theme} onClose={() => setSheetTx(null)} />

      {/* ─── Month picker modal ──────────────────────────── */}
      <Modal visible={monthDropdownOpen} transparent animationType="fade"
        onRequestClose={closeDropdown} statusBarTranslucent>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeDropdown} />
        <View style={[styles.dropdown, {
          top: dropdownY,
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
          shadowColor: '#000',
        }]}>
          <View style={[styles.dropdownSearchRow, { borderBottomColor: theme.sep }]}>
            <Icon name="search" size={15} color={theme.textTer} stroke={1.7} />
            <TextInput value={filterText} onChangeText={setFilterText}
              placeholder="Search months..." placeholderTextColor={theme.textTer}
              style={[styles.dropdownSearchInput, { color: theme.text }]}
              autoCapitalize="none" autoCorrect={false} />
          </View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
            {filteredMonths.length === 0 ? (
              <Text style={[styles.dropdownEmpty, { color: theme.textTer }]}>No months found</Text>
            ) : (
              filteredMonths.map(({ m, idx }, fi) => {
                const year = m.key.split('-')[0];
                const selected = idx === monthIdx;
                return (
                  <TouchableOpacity key={m.key} activeOpacity={0.7} delayPressIn={0}
                    onPress={() => { setMonthIdx(idx); closeDropdown(); }}
                    style={[styles.dropdownRow, {
                      borderBottomColor: theme.sep,
                      borderBottomWidth: fi < filteredMonths.length - 1 ? 1 : 0,
                      backgroundColor: selected ? theme.chipBg : 'transparent',
                    }]}>
                    <MonthDonut spent={m.spent} budget={m.budget} dark={theme.dark} />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={[styles.dropdownLabel, { color: selected ? theme.accent.dot : theme.text }]}>
                        {m.month} {year}
                      </Text>
                    </View>
                    {selected && <View style={[styles.dropdownDot, { backgroundColor: theme.accent.dot }]} />}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Skeleton loaders ─────────────────────────────────────────────
function CategorySkeleton({ theme }: { theme: Theme }) {
  return (
    <View>
      {[0, 1, 2].map(i => (
        <View key={i} style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16,
          borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: theme.sep,
        }}>
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

function BillsSkeleton({ theme }: { theme: Theme }) {
  return (
    <View>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={[styles.billRow, {
          borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: theme.sep,
        }]}>
          <Skeleton width={36} height={36} radius={18} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="48%" height={13} radius={4} />
            <Skeleton width="42%" height={11} radius={4} />
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
          {Array.from({ length: rowCount }).map((_, i) => (
            <View key={i} style={[styles.txRow, {
              borderBottomWidth: i < rowCount - 1 ? 1 : 0, borderBottomColor: theme.sep,
            }]}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="48%" height={13} radius={4} />
                <Skeleton width="32%" height={11} radius={4} />
              </View>
              <Skeleton width={54} height={14} radius={4} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── TxRow ────────────────────────────────────────────────────────
function TxRow({ tx, theme, onPress, last }: { tx: Transaction; theme: Theme; onPress: () => void; last: boolean }) {
  const cat = CATS[tx.cat];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} delayPressIn={0}
      style={[styles.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.sep }]}>
      <View style={[styles.rowIcon, { backgroundColor: catGroupColor(tx.cat, theme.dark) }]}>
        <Icon name={cat?.icon} size={16} color="#fff" stroke={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{tx.merchant}</Text>
        <Text style={[styles.rowSub, { color: theme.textSec }]}>{cat?.label} · {tx.time}</Text>
      </View>
      <Money value={tx.amount} size={13} weight="500" theme={theme} color={theme.textSec} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Header
  headerWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
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
  // Budget hero
  budgetHero: {
    marginBottom: 0,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroStatusLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroStatusDiv: {
    width: 1,
    height: 11,
    opacity: 0.4,
  },
  heroStatusSub: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  monthLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  monthTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroAmountRow: {
    marginBottom: 18,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    marginBottom: 0,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
  },

  // Income / Budget / After-budget strip
  incomeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
  },
  incomeStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  incomeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  incomeValue: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  incomeDiv: {
    width: 1,
    height: 28,
  },

  // Content panel — slides over pinned hero on scroll
  contentPanel: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  // Ledger section structure
  divider: {
    height: 1,
    marginHorizontal: -20,
    marginVertical: 22,
  },
  section: {},
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  ledgerLabel: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  ledgerAction: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
    paddingTop: 3,
  },

  // Day label in activity
  dayLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 8,
  },

  // Shared row pieces
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  rowAmt: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
  },

  // Bill row
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },

  // Transaction row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
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
