import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, OVER_DOT, OVER_BG, OVER_TEXT } from '../theme';
import { CATS, TRANSACTIONS, TREND } from '../data';
import { Icon } from '../components/Icon';
import { Money, Segmented, CircleBtn } from '../components/shared';
import { TrendChart } from '../components/TrendChart';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 40 - 36; // 20px padding each side, 18px inner padding each side

interface Props {
  theme: Theme;
  onBack: () => void;
}

const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

export function SpendingScreen({ theme, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState('Month');
  const card = getCardStyle(theme);

  const cfg = TREND[period];
  const { data, budget, prev, periodLabel, span } = cfg;

  const total = data.reduce((s, d) => s + d.v, 0);
  const avg = total / data.length;
  const ratio = avg / budget;
  const status = ratio < 0.92 ? 'below' : ratio > 1.05 ? 'above' : 'on';

  const deltaPct = Math.round(((total - prev) / prev) * 100);
  const overCount = data.filter(d => d.v > budget).length;
  const underCount = data.length - overCount;
  const projected = period === 'Year' ? Math.round(data[data.length - 1].v * (30 / 13)) : null;

  const statusMeta = {
    below: {
      label: 'Below budget', arrow: '↓',
      bgColor: theme.accent.fill, textColor: theme.accent.ink,
      hint: `${underCount} of ${data.length} ${periodLabel}s under target`,
      icon: theme.accent.dot,
    },
    on: {
      label: 'On target', arrow: '→',
      bgColor: theme.accent.fill, textColor: theme.accent.ink,
      hint: `Averaging right around your ${periodLabel}ly target`,
      icon: theme.accent.dot,
    },
    above: {
      label: 'Above budget', arrow: '↑',
      bgColor: OVER_BG, textColor: OVER_TEXT,
      hint: `${overCount} of ${data.length} ${periodLabel}s over target`,
      icon: OVER_DOT,
    },
  }[status];

  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    TRANSACTIONS.forEach(t => { m[t.cat] = (m[t.cat] || 0) + t.amount; });
    return Object.entries(m)
      .map(([cat, value]) => ({ cat, value, budget: CATS[cat].budget }))
      .sort((a, b) => b.value - a.value);
  }, []);

  const topMerchants = useMemo(() => {
    const m: Record<string, { merchant: string; cat: string; total: number; count: number }> = {};
    TRANSACTIONS.forEach(t => {
      if (!m[t.merchant]) m[t.merchant] = { merchant: t.merchant, cat: t.cat, total: 0, count: 0 };
      m[t.merchant].total += t.amount;
      m[t.merchant].count += 1;
    });
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 4);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 50 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
        >
          <Icon name="chevL" size={18} color={theme.text} />
        </TouchableOpacity>
        <CircleBtn theme={theme}><Icon name="filter" size={18} color={theme.text} /></CircleBtn>
      </View>

      {/* Big number + status */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 11, color: theme.textSec, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600', marginBottom: 8 }}>
          Total · {span}
        </Text>
        <Money value={total} size={44} weight="600" prefix="$" theme={theme} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <View style={[styles.statusBadge, { backgroundColor: statusMeta.bgColor }]}>
            <Text style={{ fontSize: 13 }}>{statusMeta.arrow}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: statusMeta.textColor, marginLeft: 5 }}>{statusMeta.label}</Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.textSec, fontWeight: '500' }}>
            {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct)}% vs prior {periodLabel === 'day' ? 'week' : periodLabel === 'week' ? 'month' : 'year'}
          </Text>
        </View>
      </View>

      {/* Trend chart card */}
      <View style={[card, { paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: theme.text }}>Spending trend</Text>
            <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 1 }}>
              {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}ly total vs budget
            </Text>
          </View>
          <Segmented value={period} onChange={setPeriod} options={['Week', 'Month', 'Year']} theme={theme} />
        </View>
        <TrendChart data={data} theme={theme} width={CHART_W} budget={budget} />
        {/* Status insight inline */}
        <View style={[styles.statusHint, { backgroundColor: theme.chipBg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusMeta.icon }]}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{statusMeta.arrow}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1, color: theme.text }}>{statusMeta.hint}</Text>
            <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 1 }}>
              Avg {fmt(avg)} / {periodLabel} · target {fmt(budget)}
            </Text>
          </View>
        </View>
      </View>

      {/* Quick stats */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
        {[
          { label: 'Avg', value: fmt(avg), sub: `per ${periodLabel}` },
          { label: 'Highest', value: fmt(Math.max(...data.map(d => d.v))), sub: data.find(d => d.v === Math.max(...data.map(d => d.v)))?.label ?? '' },
          period === 'Year'
            ? { label: 'Projected', value: fmt(projected ?? 0), sub: 'this month' }
            : { label: 'Saved', value: fmt(Math.max(0, budget * data.length - total)), sub: 'vs budget' },
        ].map(s => (
          <View key={s.label} style={[card, { flex: 1, padding: 12, paddingBottom: 14 }]}>
            <Text style={{ fontSize: 10, color: theme.textSec, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: '600', marginBottom: 6 }}>{s.label}</Text>
            <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 10.5, color: theme.textSec, marginTop: 2 }}>{s.sub}</Text>
          </View>
        ))}
      </View>

      {/* Insight banner */}
      <View style={[styles.insightBanner, { backgroundColor: theme.accent.fill, marginBottom: 24 }]}>
        <Icon name="sparkle" size={18} color={theme.accent.ink} stroke={1.5} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent.ink }}>
            {status === 'below' && 'Strong month so far'}
            {status === 'on' && 'Steady as she goes'}
            {status === 'above' && 'Consider easing up'}
          </Text>
          <Text style={{ fontSize: 12, marginTop: 3, lineHeight: 18, color: theme.accent.ink, opacity: 0.82 }}>
            {status === 'below' && `If you keep this pace, you'll save ${fmt(Math.max(0, (budget - avg)) * data.length)} this ${periodLabel === 'day' ? 'week' : periodLabel === 'week' ? 'month' : 'year'} vs target.`}
            {status === 'on' && `You're averaging right around your ${periodLabel}ly target. Healthy rhythm.`}
            {status === 'above' && `You've gone over target in ${overCount} of the last ${data.length} ${periodLabel}s. Top categories are worth a look.`}
          </Text>
        </View>
      </View>

      {/* By category */}
      <View style={styles.sectionHead}>
        <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: theme.text }}>By category</Text>
        <Text style={{ fontSize: 12, color: theme.textSec }}>{byCat.length} active</Text>
      </View>
      <View style={[card, { overflow: 'hidden', marginBottom: 24 }]}>
        {byCat.map((d, i) => {
          const pct = Math.round((d.value / d.budget) * 100);
          const over = d.value > d.budget;
          return (
            <View key={d.cat} style={[styles.catRow, { borderBottomWidth: i < byCat.length - 1 ? 1 : 0, borderBottomColor: theme.sep }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <View style={[styles.catIcon, { backgroundColor: theme.chipBg }]}>
                  <Icon name={CATS[d.cat]?.icon} size={14} color={theme.text} stroke={1.5} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>{CATS[d.cat]?.label}</Text>
                  <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 1 }}>${d.value.toFixed(0)} of ${d.budget}</Text>
                </View>
                <View style={[styles.pctBadge, { backgroundColor: over ? OVER_BG : theme.chipBg }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: over ? OVER_TEXT : theme.textSec }}>{pct}%</Text>
                </View>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: theme.hairline }]}>
                <View style={[styles.progressFill, {
                  width: `${Math.min(pct, 100)}%` as any,
                  backgroundColor: over ? OVER_DOT : theme.text,
                  opacity: over ? 1 : 0.85,
                }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Top merchants */}
      <View style={styles.sectionHead}>
        <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: theme.text }}>Top merchants</Text>
      </View>
      <View style={[card, { overflow: 'hidden' }]}>
        {topMerchants.map((m, i) => (
          <View key={m.merchant} style={[styles.merchantRow, { borderBottomWidth: i < topMerchants.length - 1 ? 1 : 0, borderBottomColor: theme.sep }]}>
            <View style={[styles.catIcon, { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.chipBg }]}>
              <Icon name={CATS[m.cat]?.icon} size={14} color={theme.text} stroke={1.5} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>{m.merchant}</Text>
              <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 1 }}>
                {m.count} {m.count === 1 ? 'transaction' : 'transactions'}
              </Text>
            </View>
            <Money value={m.total} size={14} weight="600" prefix="$" theme={theme} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 18,
  },
  circleBtn: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusHint: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  statusDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  insightBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 18,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  catRow: {
    padding: 14,
    paddingHorizontal: 16,
  },
  catIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pctBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, minWidth: 38, alignItems: 'center',
  },
  progressTrack: {
    height: 3, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 2,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
});
