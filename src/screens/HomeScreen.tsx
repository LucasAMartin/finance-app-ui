import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Picker, Text as SwiftText, Host } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint, fixedSize } from '@expo/ui/swift-ui/modifiers';
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
import { HomeSpendGroups } from '../components/HomeSpendGroups';
import { TxSheet } from '../components/TxSheet';
import { ThemeToggle } from '../components/ThemeToggle';
import { TYPE } from '../typography';


// ── Budget progress bar — color encodes spending state ───────────
function BudgetBar({ pct }: { pct: number }) {
  const [barW, setBarW] = useState(0);
  const H = 5, R = 3;
  const color = pct >= 1.0 ? '#D4522A'
    : pct >= 0.9  ? '#C5A946'
    : pct >= 0.75 ? '#B86C60'
    : '#5CC4BA';
  return (
    <View
      style={{ height: H, borderRadius: R, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.13)' }}
      onLayout={e => setBarW(e.nativeEvent.layout.width)}
    >
      {barW > 0 && pct > 0 && (
        <View style={{ height: H, borderRadius: R, width: Math.round(barW * Math.min(pct, 1)), backgroundColor: color }} />
      )}
    </View>
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
  const HERO_BG   = '#1E1050';
  const H_TEXT    = '#EDE9FF';
  const H_SEC     = 'rgba(237,233,255,0.55)';
  const H_INK     = theme.dark ? theme.accent.ink : 'rgba(237,233,255,0.88)';
  const H_AVAIL   = '#5CC4BA';
  const H_BUDG    = 'rgba(92,196,186,0.72)';

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
                <View style={[styles.bellDot, { backgroundColor: OVER_DOT, borderColor: HERO_BG }]} />
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
        paddingHorizontal: 20,
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
                <Text style={[styles.heroStatusLabel, { color: over ? OVER_DOT : H_AVAIL }]}>
                  {over ? 'Over budget' : 'Available'}
                </Text>
                <View style={[styles.heroStatusDiv, { backgroundColor: over ? OVER_DOT : H_AVAIL }]} />
                <Text style={[styles.heroStatusSub, { color: H_SEC }]}>
                  {mb.remainingLabel}
                </Text>
              </>
            )}
          </View>
          {loading ? (
            <Skeleton width={88} height={13} radius={4} />
          ) : (
            <Host matchContents>
              <Picker
                selection={monthIdx}
                onSelectionChange={(val) => setMonthIdx(Number(val))}
                modifiers={[pickerStyle('menu'), tint(H_INK), fixedSize({ horizontal: true, vertical: false })]}
              >
                {MONTH_BUDGETS.map((m, idx) => (
                  <SwiftText key={m.key} modifiers={[tag(idx)]}>
                    {m.month} {m.key.split('-')[0]}
                  </SwiftText>
                ))}
              </Picker>
            </Host>
          )}
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
              <Money value={over ? overage : available} size={32} weight="600"
                prefix={over ? '-$' : '$'} theme={theme}
                color={over ? OVER_DOT : H_TEXT} />
            </View>

            <BudgetBar pct={rawPct} />

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
                <Text style={[styles.incomeValue, { color: over ? H_TEXT : H_BUDG }]}>
                  ${mb.budget.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.incomeDiv, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
              <View style={styles.incomeStat}>
                <Text style={[styles.incomeLabel, { color: H_SEC }]}>Unallocated</Text>
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
              <Text style={[styles.ledgerLabel, { color: theme.text }]}>Spending</Text>
              <TouchableOpacity onPress={onViewSpending} activeOpacity={0.6} delayPressIn={0}>
                <Text style={[styles.ledgerAction, { color: theme.accent.dot }]}>See all</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <CategorySkeleton theme={theme} />
            ) : (
              <HomeSpendGroups theme={theme} groups={SPEND_GROUPS} income={MONTHLY_INCOME} compact />
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
                        in {b.daysUntil} days
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

    </View>
  );
}

// ── Skeleton loaders ─────────────────────────────────────────────
function CategorySkeleton({ theme }: { theme: Theme }) {
  // Mirrors the HomeSpendGroups structure: header zone + sub-rows per group
  const groups = [
    { subs: 4 },  // Needs
    { subs: 0 },  // Wants (chips, not rows)
    { subs: 2 },  // Savings
  ];
  return (
    <View>
      {groups.map((g, gi) => (
        <View key={gi} style={{ paddingBottom: 4, borderBottomWidth: gi < 2 ? 1 : 0, borderBottomColor: theme.sep }}>
          {/* Header zone */}
          <View style={{ paddingVertical: 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width={52} height={11} radius={4} />
              <Skeleton width={52} height={14} radius={4} />
            </View>
            <Skeleton width="100%" height={6} radius={3} />
            <Skeleton width={140} height={11} radius={4} />
          </View>
          {/* Sub-rows */}
          {g.subs > 0 ? (
            <View style={{ gap: 13, paddingBottom: 18 }}>
              {Array.from({ length: g.subs }).map((_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Skeleton width={28} height={28} radius={8} />
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Skeleton width={72} height={12} radius={4} />
                      <Skeleton width={64} height={12} radius={4} />
                    </View>
                    <Skeleton width="100%" height={4} radius={2} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 7, paddingBottom: 18 }}>
              {[0, 1, 2].map(i => (
                <Skeleton key={i} width={undefined} height={46} radius={10} style={{ flex: 1 }} />
              ))}
            </View>
          )}
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
    ...TYPE.labelLg,
    textTransform: 'none',
    letterSpacing: 0,
    fontSize: 13,
    lineHeight: 18,
  },
  heroStatusDiv: {
    width: 1,
    height: 13,
    opacity: 0.4,
  },
  heroStatusSub: {
    ...TYPE.labelLg,
    textTransform: 'none',
    letterSpacing: -0.1,
    fontSize: 13,
    lineHeight: 18,
  },
  heroAmountRow: {
    marginBottom: 16,
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
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  incomeStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  incomeLabel: {
    ...TYPE.label,
    textTransform: 'none',
    letterSpacing: 0,
  },
  incomeValue: {
    ...TYPE.subsectionTitle,
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
    marginVertical: 24,
  },
  section: {},
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ledgerLabel: {
    ...TYPE.sectionTitle,
  },
  ledgerAction: {
    ...TYPE.captionEm,
    paddingTop: 3,
  },

  // Day label in activity
  dayLabel: {
    ...TYPE.txDateLabel,
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
    ...TYPE.body,
  },
  rowSub: {
    ...TYPE.caption,
    marginTop: 2,
  },
  rowAmt: {
    ...TYPE.bodySm,
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

});
