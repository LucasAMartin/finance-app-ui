import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle } from '../theme';
import { Transaction, CATS } from '../data';
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';

interface Props {
  tx: Transaction | null;
  theme: Theme;
  onBack: () => void;
}

export function DetailScreen({ tx, theme, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const card = getCardStyle(theme);
  if (!tx) return null;
  const cat = CATS[tx.cat];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 50 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Nav bar */}
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
        >
          <Icon name="chevL" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 12, color: theme.textSec, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Transaction
        </Text>
        <TouchableOpacity style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', letterSpacing: 2 }}>···</Text>
        </TouchableOpacity>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={[styles.catIcon, { backgroundColor: theme.chipBg }]}>
          <Icon name={cat?.icon} size={26} color={theme.text} stroke={1.5} />
        </View>
        <Text style={{ fontSize: 14, color: theme.textSec, fontWeight: '500', marginBottom: 8 }}>{tx.merchant}</Text>
        <Money value={tx.amount} size={48} weight="600" prefix="−$" theme={theme} />
        <View style={[styles.catBadge, { backgroundColor: theme.chipBg }]}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: theme.text }}>{cat?.label}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {/* Details card */}
        <View style={[card, { overflow: 'hidden', marginBottom: 12 }]}>
          {[
            { label: 'Date',     value: `${tx.date}, ${tx.time}` },
            { label: 'Category', value: cat?.label ?? '' },
            { label: 'Note',     value: tx.note },
            { label: 'Repeat',   value: 'One-time', last: true },
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

        {/* Insight */}
        <View style={[styles.insight, { backgroundColor: theme.accent.fill }]}>
          <View style={{ marginTop: 2 }}>
            <Icon name="sparkle" size={18} color={theme.accent.ink} stroke={1.5} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent.ink }}>
              14% under your {cat?.label.toLowerCase()} average
            </Text>
            <Text style={{ fontSize: 12, marginTop: 3, lineHeight: 18, color: theme.accent.ink, opacity: 0.78 }}>
              You're trending below last month. Steady progress.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
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
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  catIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  catBadge: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
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
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 18,
  },
});
