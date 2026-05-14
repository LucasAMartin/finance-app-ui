import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, catPastel } from '../theme';
import {
  CATS,
  TRANSACTIONS,
  UPCOMING_BILLS,
  SPARK_7D,
  PERIOD_DATA,
  Transaction,
} from '../data';
import { Icon } from '../components/Icon';
import { Money, Segmented, CircleBtn } from '../components/shared';
import { Donut } from '../components/Donut';
import { Sparkline } from '../components/Sparkline';
import { MonthlySpendingTracker } from '../components/MonthlySpendingTracker';
import { ThemeToggle } from '../components/ThemeToggle';

interface Props {
  theme: Theme;
  onOpenTx: (tx: Transaction) => void;
  onViewSpending: () => void;
  onViewActivity: () => void;
}

export function HomeScreen({ theme, onOpenTx, onViewSpending, onViewActivity }: Props) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<'Week' | 'Month' | 'Year'>('Month');
  const card = getCardStyle(theme);

  // ── Period-driven data ───────────────────────────────────
  const pd = PERIOD_DATA[period];
  const { spent, budget, expectedPct, remainingLabel, spentLabel, byCat } = pd;

  const groups = useMemo(() => {
    const g: Record<string, Transaction[]> = { today: [], yesterday: [], earlier: [] };
    TRANSACTIONS.forEach(t => g[t.when].push(t));
    return g;
  }, []);

  const topCat = byCat[0];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Header ────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={{ fontSize: 13, color: theme.textSec, fontWeight: '500', marginBottom: 2 }}>
            Hi,
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: theme.text }}>
            Alex
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <CircleBtn theme={theme} dot><Icon name="bell" size={18} color={theme.text} /></CircleBtn>
          <ThemeToggle />
          <CircleBtn theme={theme}><Icon name="menu" size={18} color={theme.text} stroke={1.6} /></CircleBtn>
        </View>
      </View>

      {/* ─── 1. Monthly spending tracker (replaces status + hero) ─ */}
      <MonthlySpendingTracker
        theme={theme}
        spent={spent}
        budget={budget}
        remainingLabel={remainingLabel}
        expectedPct={expectedPct}
      />

      {/* ─── 2. Category breakdown + period toggle ─────────── */}
      <View style={[card, { padding: 22, marginBottom: 14 }]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity onPress={onViewSpending} style={styles.linkBtn} activeOpacity={0.6}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Spending by category</Text>
            <Icon name="chevR" size={15} color={theme.textSec} />
          </TouchableOpacity>
          <Segmented
            value={period}
            onChange={(v) => setPeriod(v as 'Week' | 'Month' | 'Year')}
            options={[
              { value: 'Week', label: 'W' },
              { value: 'Month', label: 'M' },
              { value: 'Year', label: 'Y' },
            ]}
            theme={theme}
          />
        </View>
        <Text style={{ color: theme.textSec, fontSize: 12, fontWeight: '500', marginTop: 4 }}>
          {spentLabel} · ${Math.round(spent).toLocaleString()}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 }}>
          <Donut
            data={byCat}
            theme={theme}
            size={140}
            thickness={14}
            centerTop="Top"
            centerLabel={CATS[topCat.cat]?.label}
            centerSub={`$${topCat.value.toFixed(0)}`}
          />
          <View style={{ flex: 1, gap: 10 }}>
            {byCat.slice(0, 4).map(d => {
              const pct = Math.round((d.value / spent) * 100);
              return (
                <View key={d.cat} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: catPastel(d.cat, theme.dark) }]} />
                  <Text style={{ fontSize: 12.5, color: theme.text, fontWeight: '500', flex: 1 }}>
                    {CATS[d.cat]?.label}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSec }}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Mini trend — last 7 days */}
        <View style={[styles.miniDivider, { backgroundColor: theme.sep }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSec }]}>Last 7 days</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginTop: 2 }}>
              $300 · avg $43/day
            </Text>
          </View>
          <View style={{ width: 110 }}>
            <Sparkline data={SPARK_7D} theme={theme} height={32} />
          </View>
        </View>
      </View>

      {/* ─── 4. Upcoming bills ──────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming</Text>
        <TouchableOpacity>
          <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textSec }}>See all</Text>
        </TouchableOpacity>
      </View>
      <View style={[card, { overflow: 'hidden', marginBottom: 26 }]}>
        {UPCOMING_BILLS.map((b, i) => (
          <View
            key={b.id}
            style={[
              styles.billRow,
              { borderBottomWidth: i < UPCOMING_BILLS.length - 1 ? 1 : 0, borderBottomColor: theme.sep },
            ]}
          >
            <View style={[styles.txIcon, { backgroundColor: theme.chipBg }]}>
              <Icon name={b.icon} size={16} color={theme.text} stroke={1.5} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: theme.text }}>
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

      {/* ─── 6. Activity feed ────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Activity</Text>
        <TouchableOpacity onPress={onViewActivity}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textSec }}>See all</Text>
        </TouchableOpacity>
      </View>

      {(['today', 'yesterday', 'earlier'] as const).map(key => groups[key].length > 0 && (
        <View key={key} style={{ marginBottom: 16 }}>
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
      ))}
    </ScrollView>
  );
}

// ── Small components ────────────────────────────────────────
function TxRow({ tx, theme, onPress, last }: { tx: Transaction; theme: Theme; onPress: () => void; last: boolean }) {
  const cat = CATS[tx.cat];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.txRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.sep }]}
    >
      <View style={[styles.txIcon, { backgroundColor: theme.chipBg }]}>
        <Icon name={cat?.icon} size={16} color={theme.text} stroke={1.5} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
  },

  // Status card
  miniDivider: {
    height: 1,
    marginVertical: 14,
  },
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '600',
  },

  // Card header pattern
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Sections
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 8,
  },

  // Rows (bills + tx)
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
});
