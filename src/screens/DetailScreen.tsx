import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, getCardStyle, OVER_DOT } from '../theme';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import type { Transaction } from '../repositories/types';
import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { Money } from '../components/shared';

interface Props {
  tx: Transaction | null;
  theme: Theme;
  onBack: () => void;
}

export function DetailScreen({ tx, theme, onBack }: Props) {
  const { transactionsRepo, categoriesRepo } = useRepositories();
  const [repoVersion, setRepoVersion] = useState(0);
  const categories = useRepositoryList(categoriesRepo);
  const cats = categoryMap(categories);
  const insets = useSafeAreaInsets();
  const card = getCardStyle(theme);
  const currentTx = tx ? (transactionsRepo.get(tx.id) ?? tx) : null;
  const [editing, setEditing] = useState(false);
  const [merchantDraft, setMerchantDraft] = useState('');
  const [amountDraft, setAmountDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => transactionsRepo.subscribe(() => setRepoVersion(v => v + 1)), [transactionsRepo]);

  useEffect(() => {
    if (!currentTx) return;
    setMerchantDraft(currentTx.merchant);
    setAmountDraft(currentTx.amount.toFixed(2));
    setNoteDraft(currentTx.note ?? '');
  }, [currentTx?.id, currentTx?.merchant, currentTx?.amount, currentTx?.note, repoVersion]);

  if (!currentTx) return null;

  const saveEdit = () => {
    const amount = parseFloat(amountDraft.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    transactionsRepo.update(currentTx.id, {
      amount,
      merchant: merchantDraft.trim() || currentTx.merchant,
      note: noteDraft,
      cat: currentTx.cat,
      occurredAt: currentTx.occurredAt,
      recurring: currentTx.recurring,
      type: currentTx.type ?? 'expense',
      recurringRuleId: currentTx.recurringRuleId,
      visibility: currentTx.visibility ?? 'shared',
      createdByUserId: currentTx.createdByUserId,
      updatedByUserId: 'local',
      meta: currentTx.meta,
    });
    setEditing(false);
  };

  const deleteTx = () => {
    transactionsRepo.delete(currentTx.id);
    onBack();
  };

  const cat = cats[currentTx.cat];
  const txDate = currentTx.occurredAt ? new Date(currentTx.occurredAt) : new Date();
  const catTotal = transactionsRepo.getSummary({
    categoryIds: [currentTx.cat],
    from: new Date(txDate.getFullYear(), txDate.getMonth(), 1).toISOString(),
    to: new Date(txDate.getFullYear(), txDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(),
  }).expenseTotal;
  const catBudget = cat?.budget ?? 0;
  const catPct = catBudget > 0 ? Math.round((catTotal / catBudget) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Nav bar — outside ScrollView */}
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <ScreenExitButton
          variant="back"
          onPress={onBack}
          tint={theme.text}
          fallbackBg={theme.surface}
          accessibilityLabel="Back"
        />
        <Text style={{ fontSize: 12, color: theme.textSec, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {cat?.label}
        </Text>
        <TouchableOpacity
          onPress={() => setEditing(e => !e)}
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
        <View style={[styles.catIcon, { backgroundColor: categoryGroupColor(currentTx.cat, categories, theme.dark) }]}>
          <Icon name={cat?.icon} size={22} color="#fff" stroke={1.5} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: theme.text, textAlign: 'center', marginTop: 16 }}>
          {currentTx.merchant}
        </Text>
        <Text style={{ fontSize: 13, color: theme.textSec, marginTop: 4, textAlign: 'center' }}>
          {currentTx.date} · {currentTx.time}
        </Text>
        <View style={{ marginTop: 16 }}>
          <Money value={currentTx.amount} size={42} weight="700" prefix="−$" theme={theme} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {/* Details card */}
        <View style={[card, { overflow: 'hidden', marginBottom: 12 }]}>
          {(editing ? [
            { label: 'Amount', value: amountDraft, setter: setAmountDraft },
            { label: 'Merchant', value: merchantDraft, setter: setMerchantDraft },
            { label: 'Note', value: noteDraft, setter: setNoteDraft, last: true },
          ] : [
            { label: 'Date', value: `${currentTx.fullDate}, ${currentTx.time}` },
            { label: 'Note', value: currentTx.note, last: true },
          ]).map(r => (
            <View
              key={r.label}
              style={[
                styles.detailRow,
                { borderBottomWidth: r.last ? 0 : 1, borderBottomColor: theme.sep },
              ]}
            >
              <Text style={{ fontSize: 13, color: theme.textSec, flex: 1 }}>{r.label}</Text>
              {'setter' in r ? (
                <TextInput
                  value={r.value}
                  onChangeText={r.setter}
                  keyboardType={r.label === 'Amount' ? 'decimal-pad' : 'default'}
                  placeholderTextColor={theme.textTer}
                  style={{ fontSize: 13, color: theme.text, fontWeight: '500', textAlign: 'right', flex: 1, padding: 0 }}
                />
              ) : (
                <Text style={{ fontSize: 13, color: theme.text, fontWeight: '500' }}>{r.value}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          {(editing
            ? [{ icon: null, label: 'Save', onPress: saveEdit }, { icon: 'trash', label: 'Delete', onPress: deleteTx, danger: true }]
            : [{ icon: 'chevR', label: 'Edit', onPress: () => setEditing(true) }, { icon: 'trash', label: 'Delete', onPress: deleteTx, danger: true }]
          ).map(a => (
            <TouchableOpacity key={a.label} onPress={a.onPress} accessibilityRole="button" style={[card, styles.actionBtn]}>
              {a.icon && <Icon name={a.icon} size={16} color={theme.text} stroke={1.5} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: a.danger ? OVER_DOT : theme.text, marginLeft: a.icon ? 8 : 0 }}>{a.label}</Text>
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
              backgroundColor: categoryGroupColor(currentTx.cat, categories, theme.dark),
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
    paddingVertical: 16,
    paddingHorizontal: 20,
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
    paddingVertical: 16,
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
