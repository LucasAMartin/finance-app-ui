import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, catPastel } from '../theme';
import { CATS, TRANSACTIONS, Transaction } from '../data';
import { Icon } from '../components/Icon';
import { Money } from '../components/shared';

interface Props {
  theme: Theme;
  onBack: () => void;
  onOpenTx: (tx: Transaction) => void;
}

const DATE_OPTS = [
  { id: 'all',       label: 'All time' },
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'earlier',   label: 'This week' },
];

export function ActivityScreen({ theme, onBack, onOpenTx }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const card = getCardStyle(theme);

  const filtered = useMemo(() => {
    return TRANSACTIONS.filter(t => {
      if (catFilter !== 'all' && t.cat !== catFilter) return false;
      if (dateFilter !== 'all' && t.when !== dateFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!t.merchant.toLowerCase().includes(q) && !CATS[t.cat].label.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [query, catFilter, dateFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, Transaction[]> = {};
    filtered.forEach(t => {
      if (!g[t.fullDate]) g[t.fullDate] = [];
      g[t.fullDate].push(t);
    });
    return g;
  }, [filtered]);

  const dayKeys = Object.keys(grouped);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header — outside ScrollView */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onBack}
          delayPressIn={0}
          hitSlop={{ top: 60, bottom: 16, left: 16, right: 16 }}
          style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
        >
          <Icon name="chevL" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '600', letterSpacing: -0.5, color: theme.text }}>All activity</Text>
        <View style={{ width: 38 }} />
      </View>

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 50 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
        <Icon name="search" size={16} color={theme.textSec} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions…"
          placeholderTextColor={theme.textTer}
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Icon name="close" size={16} color={theme.textSec} />
          </TouchableOpacity>
        )}
      </View>

      {/* Date filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 6, paddingRight: 4 }}>
        {DATE_OPTS.map(o => (
          <TouchableOpacity
            key={o.id}
            onPress={() => setDateFilter(o.id)}
            style={[
              styles.filterChip,
              {
                backgroundColor: dateFilter === o.id ? theme.text : theme.chipBg,
              },
            ]}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: dateFilter === o.id ? theme.bg : theme.text }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Category filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ gap: 6, paddingRight: 4 }}>
        {[{ id: 'all', label: 'All' }, ...Object.entries(CATS).map(([id, c]) => ({ id, label: c.label }))].map(o => (
          <TouchableOpacity
            key={o.id}
            onPress={() => setCatFilter(o.id)}
            style={[
              styles.filterChip,
              {
                backgroundColor: catFilter === o.id
                  ? (o.id === 'all' ? theme.text : catPastel(o.id, theme.dark) + 'BB')
                  : theme.chipBg,
                opacity: catFilter === 'all' || catFilter === o.id || o.id === 'all' ? 1 : 0.7,
              },
            ]}
          >
            {o.id !== 'all' && (
              <View style={[
                styles.catDot,
                {
                  backgroundColor: catFilter === o.id ? (theme.dark ? '#fff' : '#0E0E10') : catPastel(o.id, theme.dark),
                },
              ]} />
            )}
            <Text style={{
              fontSize: 12, fontWeight: '600',
              color: catFilter === o.id ? (o.id === 'all' ? theme.bg : theme.text) : theme.textSec,
            }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results */}
      {dayKeys.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="search" size={28} color={theme.textTer} />
          <Text style={{ fontSize: 14, fontWeight: '500', color: theme.textSec, marginTop: 8 }}>No results</Text>
        </View>
      ) : (
        dayKeys.map(day => (
          <View key={day} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 11, color: theme.textTer, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', paddingHorizontal: 2, marginBottom: 8 }}>
              {day}
            </Text>
            <View style={[card, { overflow: 'hidden' }]}>
              {grouped[day].map((tx, i, arr) => (
                <TxRow key={tx.id} tx={tx} theme={theme} onPress={() => onOpenTx(tx)} last={i === arr.length - 1} />
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
    </View>
  );
}

function TxRow({ tx, theme, onPress, last }: { tx: Transaction; theme: Theme; onPress: () => void; last: boolean }) {
  const cat = CATS[tx.cat];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.txRow,
        { borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.sep },
      ]}
    >
      <View style={[styles.txIcon, { backgroundColor: theme.chipBg }]}>
        <Icon name={cat?.icon} size={16} color={theme.text} stroke={1.5} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: theme.text }} numberOfLines={1}>{tx.merchant}</Text>
        <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 1 }}>{cat?.label} · {tx.time}</Text>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  circleBtn: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 100,
    gap: 5,
  },
  catDot: {
    width: 7, height: 7, borderRadius: 3.5,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});
