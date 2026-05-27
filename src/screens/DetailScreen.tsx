import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, catGroupColor } from '../theme';
import { CATS } from '../data';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import type { Transaction } from '../repositories/types';
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';

interface Props {
  tx: Transaction | null;
  theme: Theme;
  onBack: () => void;
}

export function DetailScreen({ tx, theme, onBack }: Props) {
  const { transactionsRepo } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const insets = useSafeAreaInsets();
  const card = getCardStyle(theme);
  if (!tx) return null;
  const cat = CATS[tx.cat];
  const catTotal = transactions.filter(t => t.cat === tx.cat).reduce((s, t) => s + t.amount, 0);
  const catBudget = CATS[tx.cat]?.budget ?? 0;
  const catPct = catBudget > 0 ? Math.round((catTotal / catBudget) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Nav bar — outside ScrollView */}
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onBack}
          delayPressIn={0}
          hitSlop={{ top: 60, bottom: 16, left: 16, right: 16 }}
          style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
        >
          <Icon name="chevL" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 12, color: theme.textSec, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {cat?.label}
        </Text>
        <TouchableOpacity
          delayPressIn={0}
          hitSlop={{ top: 60, bottom: 16, left: 16, right: 16 }}
          style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
        >
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', letterSpacing: 2 }}>···</Text>
        </TouchableOpacity>
      </View>

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 50 }}
      showsVerticalScrollIndicator={false}
    >

      {/* Hero */}
      <View style={styles.hero}>
        <View style={[styles.catIcon, { backgroundColor: catGroupColor(tx.cat, theme.dark) }]}>
          <Icon name={cat?.icon} size={22} color="#fff" stroke={1.5} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: theme.text, textAlign: 'center', marginTop: 14 }}>
          {tx.merchant}
        </Text>
        <Text style={{ fontSize: 13, color: theme.textSec, marginTop: 4, textAlign: 'center' }}>
          {tx.date} · {tx.time}
        </Text>
        <View style={{ marginTop: 16 }}>
          <Money value={tx.amount} size={42} weight="700" prefix="−$" theme={theme} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {/* Details card */}
        <View style={[card, { overflow: 'hidden', marginBottom: 12 }]}>
          {[
            { label: 'Date', value: `${tx.fullDate}, ${tx.time}` },
            { label: 'Note', value: tx.note, last: true },
          ].map(r => (
            <View
              key={r.label}
              style={[
                styles.detailRow,
                { borderBottomWidth: r.last ? 0 : 1, borderBottomColor: theme.sep },
              ]}
            >
              <Text style={{ fontSize: 13, color: theme.textSec, flex: 1 }}>{r.label}</Text>
              <Text style={{ fontSize: 13, color: theme.text, fontWeight: '500' }}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* Account card */}
        <View style={[card, { padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={[styles.visaChip, { backgroundColor: theme.text }]}>
            <Text style={{ color: theme.bg, fontSize: 10, fontWeight: '700' }}>VISA</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>Chase Sapphire</Text>
            <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 1 }}>•••• 4429</Text>
          </View>
          <View style={[styles.postedBadge, { backgroundColor: theme.chipBg }]}>
            <Text style={{ fontSize: 11, color: theme.textSec, fontWeight: '500' }}>Posted</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          {[{ icon: 'split', label: 'Split' }, { icon: 'repeat', label: 'Make recurring' }].map(a => (
            <TouchableOpacity key={a.label} style={[card, styles.actionBtn]}>
              <Icon name={a.icon} size={16} color={theme.text} stroke={1.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginLeft: 8 }}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category context — data only */}
        <View style={styles.catContext}>
          <View style={styles.catContextRow}>
            <Text style={{ fontSize: 13, color: theme.textSec }}>{cat?.label} this month</Text>
            <Text style={{ fontSize: 13, color: theme.text }}>
              <Text style={{ fontWeight: '600' }}>${catTotal.toFixed(0)}</Text>
              <Text style={{ color: theme.textSec }}> of ${catBudget}</Text>
            </Text>
          </View>
          <View style={[styles.catBar, { backgroundColor: theme.hairline }]}>
            <View style={[styles.catBarFill, {
              width: `${Math.min(catPct, 100)}%` as any,
              backgroundColor: catGroupColor(tx.cat, theme.dark),
            }]} />
          </View>
          <Text style={{ fontSize: 11, color: theme.textTer, marginTop: 5 }}>
            {catPct}% of budget
          </Text>
        </View>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    alignItems: 'center',
  },
  catIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  visaChip: {
    width: 40,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postedBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 100,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  catContext: {
    paddingTop: 4,
  },
  catContextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  catBar: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});
