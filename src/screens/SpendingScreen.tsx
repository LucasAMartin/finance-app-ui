import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, OVER_DOT, overBg, overText, catGroupColor } from '../theme';
import { CATS, TRANSACTIONS, TREND, PERIOD_DATA } from '../data';
import { Icon } from '../components/Icon';
import { Segmented, SectionHeader } from '../components/shared';
import { TrendChart } from '../components/TrendChart';
import { ThemeToggle } from '../components/ThemeToggle';
import { PieChart } from '../components/PieChart';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 40;
const PIE_SIZE = Math.min(SCREEN_W - 40, 280);

interface Props {
  theme: Theme;
  onOpenDrawer: () => void;
}

function IconBtn({ onPress, children, size = 40 }: { onPress?: () => void; children: React.ReactNode; size?: number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.5}
      delayPressIn={0}
      hitSlop={{ top: 60, bottom: 16, left: 16, right: 16 }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </TouchableOpacity>
  );
}

const VS_LABEL: Record<string, string> = {
  Week: 'vs last week',
  Month: 'vs last month',
  Year: 'vs last year',
};

export function SpendingScreen({ theme, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState('Month');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const card = getCardStyle(theme);

  const pd = PERIOD_DATA[period];
  const trendCfg = TREND[period];

  const delta = pd.spent - pd.prevTotal;
  const deltaPct = Math.round(Math.abs(delta / pd.prevTotal) * 100);
  const isDown = delta <= 0;
  const budgetPct = Math.round((pd.spent / pd.budget) * 100);

  const amountDisplay = pd.spent >= 1000
    ? `$${(pd.spent / 1000).toFixed(1)}k`
    : `$${pd.spent.toFixed(0)}`;

  const movers = useMemo(() => {
    const prevMap: Record<string, number> = {};
    pd.prevByCat.forEach(p => { prevMap[p.cat] = p.value; });

    const changes = pd.byCat
      .filter(c => prevMap[c.cat] != null)
      .map(c => ({
        cat: c.cat,
        current: c.value,
        prev: prevMap[c.cat],
        pctChange: ((c.value - prevMap[c.cat]) / prevMap[c.cat]) * 100,
        absChange: c.value - prevMap[c.cat],
      }))
      .sort((a, b) => b.pctChange - a.pctChange);

    return {
      up: changes.length > 0 ? changes[0] : null,
      down: changes.length > 1 ? changes[changes.length - 1] : null,
    };
  }, [pd]);

  const topTx = useMemo(() =>
    [...TRANSACTIONS].sort((a, b) => b.amount - a.amount).slice(0, 5),
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconBtn onPress={onOpenDrawer}>
          <Icon name="menu" size={22} color={theme.text} stroke={1.7} />
        </IconBtn>
        <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: theme.text }}>
          Insights
        </Text>
        <ThemeToggle />
      </View>

      {/* Period selector — sticky below header */}
      <View style={styles.segRow}>
        <Segmented
          value={period}
          onChange={(p) => { setPeriod(p); setSelectedCat(null); }}
          options={['Week', 'Month', 'Year']}
          theme={theme}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Spend summary ──────────────────────────── */}
        <View style={styles.summaryBlock}>
          <Text style={[styles.eyebrow, { color: theme.textTer }]}>
            {pd.spentLabel.replace('Spent ', '').toUpperCase()}
          </Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountText, { color: theme.text }]}>{amountDisplay}</Text>
            <View style={[
              styles.deltaBadge,
              { backgroundColor: isDown ? theme.accent.fill : overBg(theme.dark) },
            ]}>
              <Text style={[
                styles.deltaText,
                { color: isDown ? theme.accent.ink : overText(theme.dark) },
              ]}>
                {isDown ? '↓' : '↑'}{deltaPct}%
              </Text>
            </View>
          </View>
          <Text style={[styles.budgetCtx, { color: theme.textSec }]}>
            ${pd.remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} of ${pd.budget.toLocaleString()} remaining · {budgetPct}% used
          </Text>
        </View>

        {/* ── Trend chart ────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 36 }}>
          <Text style={[styles.eyebrow, { color: theme.textTer, marginBottom: 10 }]}>
            {trendCfg.span.toUpperCase()}
          </Text>
          <TrendChart
            data={trendCfg.data}
            theme={theme}
            width={CHART_W}
            height={148}
            budget={trendCfg.budget}
          />
        </View>

        {/* ── By category (pie chart) ─────────────────── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <SectionHeader title="By category" theme={theme} />
          <PieChart
            data={pd.byCat}
            theme={theme}
            size={PIE_SIZE}
            selected={selectedCat}
            onSelect={setSelectedCat}
          />

          {/* Expanded category detail */}
          {selectedCat && (() => {
            const cat = CATS[selectedCat];
            const catData = pd.byCat.find(c => c.cat === selectedCat);
            const value = catData?.value ?? 0;
            const budget = cat?.budget ?? 0;
            const pct = Math.round((value / budget) * 100);
            const over = value > budget;
            const groupColor = catGroupColor(selectedCat, theme.dark);
            const catTxs = TRANSACTIONS.filter(tx => tx.cat === selectedCat);

            return (
              <View style={[card, { overflow: 'hidden', marginTop: 16 }]}>
                {/* Category header row */}
                <View style={[styles.catRow, { borderBottomWidth: 1, borderBottomColor: theme.sep }]}>
                  <View style={[styles.catIconWrap, { backgroundColor: groupColor + '22' }]}>
                    <Icon name={cat?.icon ?? 'tag'} size={14} color={groupColor} stroke={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.catLabelRow}>
                      <Text style={[styles.catLabel, { color: theme.text }]}>{cat?.label}</Text>
                      <Text style={[styles.catAmount, { color: theme.text }]}>${value.toFixed(0)}</Text>
                    </View>
                    <View style={[styles.progressTrack, { backgroundColor: theme.hairline }]}>
                      <View style={[styles.progressFill, {
                        width: `${Math.min(pct, 100)}%` as any,
                        backgroundColor: over ? OVER_DOT : groupColor,
                      }]} />
                    </View>
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: over ? overBg(theme.dark) : theme.chipBg }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: over ? overText(theme.dark) : theme.textSec }}>
                      {pct}%
                    </Text>
                  </View>
                </View>

                {/* Transactions in this category */}
                {catTxs.length === 0 ? (
                  <View style={{ padding: 16 }}>
                    <Text style={{ fontSize: 13, color: theme.textSec }}>No transactions this period</Text>
                  </View>
                ) : catTxs.map((tx, i) => (
                  <View
                    key={tx.id}
                    style={[
                      styles.txRow,
                      { borderBottomWidth: i < catTxs.length - 1 ? 1 : 0, borderBottomColor: theme.sep },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.catLabel, { color: theme.text }]} numberOfLines={1}>
                        {tx.merchant}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: theme.textSec, marginTop: 2 }}>
                        {tx.date} · {tx.time}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, letterSpacing: -0.3 }}>
                      ${tx.amount.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>

        {/* ── Biggest movers ─────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <SectionHeader title="Biggest movers" theme={theme} />
          <View style={[card, { overflow: 'hidden' }]}>
            {[movers.up, movers.down].filter(Boolean).map((m, i, arr) => {
              if (!m) return null;
              const cat = CATS[m.cat];
              const groupColor = catGroupColor(m.cat, theme.dark);
              const isUp = m.pctChange >= 0;
              const absPct = Math.abs(Math.round(m.pctChange));
              const absAmt = Math.abs(m.absChange).toFixed(0);
              return (
                <View
                  key={m.cat}
                  style={[
                    styles.moverRow,
                    { borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: theme.sep },
                  ]}
                >
                  <View style={[styles.catIconWrap, { backgroundColor: groupColor + '22' }]}>
                    <Icon name={cat?.icon ?? 'tag'} size={14} color={groupColor} stroke={1.6} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.catLabel, { color: theme.text }]}>{cat?.label}</Text>
                    <Text style={{ fontSize: 11.5, color: theme.textSec, marginTop: 2 }}>
                      ${absAmt} {isUp ? 'more' : 'less'} {VS_LABEL[period]}
                    </Text>
                  </View>
                  <View style={[
                    styles.moverBadge,
                    { backgroundColor: isUp ? overBg(theme.dark) : theme.accent.fill },
                  ]}>
                    <Text style={[
                      styles.moverPct,
                      { color: isUp ? overText(theme.dark) : theme.accent.ink },
                    ]}>
                      {isUp ? '↑' : '↓'}{absPct}%
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Top transactions ───────────────────────── */}
        <View style={{ paddingHorizontal: 20 }}>
          <SectionHeader title="Top transactions" theme={theme} />
          <View style={[card, { overflow: 'hidden' }]}>
            {topTx.map((tx, i) => {
              const cat = CATS[tx.cat];
              const groupColor = catGroupColor(tx.cat, theme.dark);
              return (
                <View
                  key={tx.id}
                  style={[
                    styles.txRow,
                    { borderBottomWidth: i < topTx.length - 1 ? 1 : 0, borderBottomColor: theme.sep },
                  ]}
                >
                  <View style={[styles.catIconWrap, { backgroundColor: groupColor + '22' }]}>
                    <Icon name={cat?.icon ?? 'tag'} size={14} color={groupColor} stroke={1.6} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                    <Text style={[styles.catLabel, { color: theme.text }]} numberOfLines={1}>
                      {tx.merchant}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: theme.textSec, marginTop: 2 }}>
                      {cat?.label} · {tx.date}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, letterSpacing: -0.3 }}>
                    ${tx.amount.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  segRow: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  summaryBlock: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 36,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  amountText: {
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -2.5,
    lineHeight: 56,
  },
  deltaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    alignSelf: 'center',
    marginTop: 2,
  },
  deltaText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  budgetCtx: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  catIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 7,
  },
  catLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  catAmount: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  pctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    minWidth: 38,
    alignItems: 'center',
    flexShrink: 0,
  },
  moverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  moverBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    flexShrink: 0,
  },
  moverPct: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
});
