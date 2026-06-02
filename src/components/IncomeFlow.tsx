import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, ScrollView,
} from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, OVER_DOT } from '../theme';
import { Icon } from './Icon';
import { SheetPrimaryButton } from './shared';
import { TYPE } from '../typography';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import type { Income } from '../repositories/types';
import { monthlyIncome } from '../selectors/finance';
import {
  DatePicker, Host, Picker, Text as SwiftText, Button,
} from '@expo/ui/swift-ui';
import {
  datePickerStyle, environment, fixedSize, pickerStyle, tag, tint,
} from '@expo/ui/swift-ui/modifiers';
import { ScreenExitButton, EXIT_BTN_SIZE } from './GlassButton';

export interface SavedIncomeInfo {
  id: string;
  amount: number;
  source: string;
}

interface IncomeFlowProps {
  theme: Theme;
  onClose: () => void;
  onSaved?: (info: SavedIncomeInfo) => void;
}

// ─── helpers (same logic as BudgetScreen) ─────────────────────────────────────

type Cadence = 'Mo' | '2w' | 'Wk' | 'Yr';
const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'Mo', label: 'Monthly' },
  { value: '2w', label: 'Every 2 weeks' },
  { value: 'Wk', label: 'Weekly' },
  { value: 'Yr', label: 'Yearly' },
];
const CADENCE_TO_INCOME: Record<Cadence, Income['cadence']> = {
  Mo: 'monthly', '2w': 'biweekly', Wk: 'weekly', Yr: 'annual',
};
const INCOME_TO_CADENCE: Partial<Record<Income['cadence'], Cadence>> = {
  monthly: 'Mo', biweekly: '2w', weekly: 'Wk', annual: 'Yr',
};

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

const dateFromYMD = (s: string): Date => new Date(`${s}T12:00:00`);
const toYMD = (d: Date): string => d.toISOString().slice(0, 10);
const toISODateTime = (d: Date): string => d.toISOString();
const monthEndDate = (key: string): Date => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0, 12);
};
const defaultDate = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12);
};
const monthLabel = (key: string) =>
  new Date(`${key}-15`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const fmtMoney = (n: number) => Math.round(n).toLocaleString();
const guardDollar = (t: string): string => {
  if (t === '' || t === '$') return t;
  return t.startsWith('$') ? t : `$${t.replace(/\$/g, '')}`;
};
const parseAmountDraft = (text: string): number | null => {
  const n = parseFloat(text.replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ─── component ────────────────────────────────────────────────────────────────

export function IncomeFlow({ theme, onClose, onSaved }: IncomeFlowProps) {
  const { incomeRepo } = useRepositories();
  const incomes = useRepositoryList(incomeRepo);
  const insets = useSafeAreaInsets();

  const regularIncomes = useMemo(
    () => incomes.filter(i => (i.kind ?? 'regular') === 'regular'),
    [incomes],
  );
  const oneTimeIncomes = useMemo(
    () => incomes
      .filter(i => i.kind === 'irregular')
      .filter(i => (i.receivedAt ?? i.startDate).slice(0, 7) === CURRENT_MONTH)
      .sort((a, b) => (b.receivedAt ?? b.startDate).localeCompare(a.receivedAt ?? a.startDate)),
    [incomes],
  );

  const totalMonthlyIncome = useMemo(() => monthlyIncome(incomes, CURRENT_MONTH), [incomes]);
  const oneTimeTotal = useMemo(
    () => oneTimeIncomes.reduce((s, i) => s + i.amount, 0),
    [oneTimeIncomes],
  );

  const [kind, setKind] = useState<'regular' | 'irregular'>('regular');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [draft, setDraft] = useState('');
  const [cadence, setCadence] = useState<Cadence>('Mo');
  const [startDate, setStartDate] = useState<Date>(defaultDate);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [receivedDate, setReceivedDate] = useState<Date>(defaultDate);
  const [feedback, setFeedback] = useState('');

  const loadRegular = (inc: Income) => {
    setKind('regular');
    setEditingId(inc.id);
    setSource(inc.source);
    setCadence(INCOME_TO_CADENCE[inc.cadence] ?? 'Mo');
    setDraft(`$${inc.amount}`);
    setStartDate(dateFromYMD(inc.startDate));
    setEndDate(inc.endDate ? dateFromYMD(inc.endDate) : null);
    setFeedback('');
  };

  const loadOneTime = (inc: Income) => {
    setKind('irregular');
    setEditingId(inc.id);
    setSource(inc.source === 'One-time income' ? '' : inc.source);
    setDraft(`$${inc.amount}`);
    setReceivedDate(dateFromYMD(inc.receivedAt ?? inc.startDate));
    setFeedback('');
  };

  const resetRegular = () => {
    setKind('regular'); setEditingId(null); setSource('');
    setCadence('Mo'); setDraft(''); setStartDate(defaultDate()); setEndDate(null); setFeedback('');
  };

  const resetOneTime = () => {
    setKind('irregular'); setEditingId(null); setSource('');
    setDraft(''); setReceivedDate(defaultDate()); setFeedback('');
  };

  // Pre-load the first regular income on mount, if any.
  useEffect(() => {
    if (regularIncomes.length > 0) loadRegular(regularIncomes[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountValue = parseAmountDraft(draft);
  const dateRangeValid = !endDate || endDate >= startDate;
  const canSave = amountValue !== null && amountValue > 0
    && (kind === 'irregular' || (source.trim().length > 0 && dateRangeValid));

  const removeIncome = (id: string) => {
    incomeRepo.delete(id);
    if (kind === 'regular') {
      const next = regularIncomes.find(i => i.id !== id);
      if (next) loadRegular(next); else resetRegular();
    } else {
      const next = oneTimeIncomes.find(i => i.id !== id);
      if (next) loadOneTime(next); else resetOneTime();
    }
  };

  const commit = () => {
    const v = amountValue;
    if (!v) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (kind === 'irregular') {
      const src = source.trim() || 'One-time income';
      const receivedAt = toISODateTime(receivedDate);
      if (editingId) {
        incomeRepo.update(editingId, {
          kind: 'irregular', amount: v, source: src, cadence: 'oneTime',
          startDate: toYMD(receivedDate), receivedAt, updatedByUserId: 'local',
        });
        setFeedback(`Updated one-time income for ${monthLabel(CURRENT_MONTH)}`);
      } else {
        const created = incomeRepo.create({
          kind: 'irregular', amount: v, source: src, cadence: 'oneTime',
          startDate: toYMD(receivedDate), receivedAt,
          createdByUserId: 'local', updatedByUserId: 'local',
        });
        onSaved?.({ id: created.id, amount: v, source: src });
        setFeedback(`Logged one-time income for ${monthLabel(CURRENT_MONTH)}`);
        setDraft(''); setSource(''); setReceivedDate(defaultDate());
        setEditingId(null);
      }
      return;
    }
    const src = source.trim();
    if (!src) return;
    const incomeCadence = CADENCE_TO_INCOME[cadence];
    const payload = {
      amount: v, source: src, kind: 'regular' as const, cadence: incomeCadence,
      startDate: toYMD(startDate),
      endDate: endDate ? toYMD(endDate) : undefined,
      updatedByUserId: 'local',
    };
    if (editingId) {
      incomeRepo.update(editingId, payload);
      setFeedback(`Saved ${src}`);
    } else {
      const created = incomeRepo.create({ ...payload, createdByUserId: 'local' });
      setEditingId(created.id);
      setFeedback(`Added ${src}`);
      onSaved?.({ id: created.id, amount: v, source: src });
    }
  };

  const sep = { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth };
  const darkScheme = theme.dark ? 'dark' : 'light';

  return (
    <View style={[S.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={S.header}>
        <ScreenExitButton
          variant="back"
          onPress={onClose}
          tint={theme.text}
          fallbackBg={theme.chipBg}
          accessibilityLabel="Back"
        />
        <Text style={[TYPE.pageTitle, { color: theme.text }]}>Income</Text>
        <View style={S.headerSpacer} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[S.scroll, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary */}
        <View style={S.hero}>
          <View style={[S.heroCircle, { backgroundColor: theme.accent.fill }]}>
            <Icon name="wallet" size={18} color={theme.accent.ink} stroke={1.7} />
          </View>
          <Text style={[TYPE.labelLg, { color: theme.textTer, marginTop: 12 }]}>Monthly income</Text>
          <Text style={[TYPE.headline, { color: theme.text, marginTop: 2 }]}>
            ${fmtMoney(totalMonthlyIncome + oneTimeTotal)}
          </Text>
          <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2 }]}>
            {monthLabel(CURRENT_MONTH)}
          </Text>
          {oneTimeTotal > 0 && (
            <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2, textAlign: 'center' }]}>
              Includes ${fmtMoney(oneTimeTotal)} one-time this month
            </Text>
          )}
        </View>

        {/* Regular / One-time tab */}
        <SegmentedControl
          values={['Regular', 'One-time']}
          selectedIndex={kind === 'regular' ? 0 : 1}
          onChange={e => {
            const idx = e.nativeEvent.selectedSegmentIndex;
            if (idx === 0) { if (kind !== 'regular') resetRegular(); }
            else { resetOneTime(); }
          }}
          tintColor={theme.accent.dot}
          appearance={theme.dark ? 'dark' : 'light'}
          backgroundColor={theme.dark ? 'rgba(242,244,245,0.08)' : 'rgba(11,13,16,0.045)'}
          fontStyle={{ color: theme.dark ? 'rgba(242,244,245,0.68)' : 'rgba(11,13,16,0.62)' }}
          activeFontStyle={{ color: theme.dark ? '#080A0D' : '#F2F4F5', fontWeight: '600' }}
          style={{ marginBottom: 2 }}
        />

        {feedback.length > 0 && (
          <View style={[S.feedback, { backgroundColor: theme.accent.fill }]}>
            <Icon name="check" size={13} color={theme.accent.ink} stroke={2} />
            <Text style={[TYPE.captionEm, { color: theme.accent.ink }]}>{feedback}</Text>
          </View>
        )}

        {kind === 'regular' ? (
          <>
            <View style={[S.fieldCard, { backgroundColor: theme.chipBg, marginTop: 12 }]}>
              {regularIncomes.length > 0 && (
                <View style={[S.fieldRow, sep]}>
                  <Text style={[S.fieldLabel, { color: theme.textSec }]}>Source</Text>
                  <Host matchContents ignoreSafeArea="all">
                    <Picker
                      selection={editingId ?? '__new__'}
                      onSelectionChange={(val) => {
                        const id = String(val);
                        if (id === '__new__') resetRegular();
                        else {
                          const inc = regularIncomes.find(i => i.id === id);
                          if (inc) loadRegular(inc);
                        }
                      }}
                      modifiers={[pickerStyle('menu'), tint(theme.text), fixedSize({ horizontal: true, vertical: false })]}
                    >
                      {regularIncomes.map(inc => (
                        <SwiftText key={inc.id} modifiers={[tag(inc.id)]}>{inc.source}</SwiftText>
                      ))}
                      <SwiftText key="__new__" modifiers={[tag('__new__')]}>New source</SwiftText>
                    </Picker>
                  </Host>
                </View>
              )}
              <View style={[S.fieldRow, sep]}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Name</Text>
                <TextInput
                  value={source} onChangeText={setSource}
                  placeholder="e.g. Salary, Weekend job" placeholderTextColor={theme.textTer}
                  keyboardAppearance={darkScheme} returnKeyType="done" selectTextOnFocus
                  style={[S.fieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
                />
              </View>
              <View style={[S.fieldRow, sep]}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Amount</Text>
                <TextInput
                  value={draft} onChangeText={(t) => setDraft(guardDollar(t))}
                  keyboardType="decimal-pad" keyboardAppearance={darkScheme}
                  placeholder="$0" placeholderTextColor={theme.textTer}
                  returnKeyType="done" selectTextOnFocus
                  style={[S.fieldInput, S.amountInput, { color: theme.text }]}
                />
              </View>
              <View style={[S.fieldRow, sep]}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Frequency</Text>
                <Host matchContents ignoreSafeArea="all">
                  <Picker
                    selection={cadence}
                    onSelectionChange={(val) => setCadence(val as Cadence)}
                    modifiers={[pickerStyle('menu'), tint(theme.text), fixedSize({ horizontal: true, vertical: false })]}
                  >
                    {CADENCES.map(c => (
                      <SwiftText key={c.value} modifiers={[tag(c.value)]}>{c.label}</SwiftText>
                    ))}
                  </Picker>
                </Host>
              </View>
              <View style={[S.fieldRow, sep]}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Starts</Text>
                <Host matchContents ignoreSafeArea="all">
                  <DatePicker
                    selection={startDate} onDateChange={setStartDate}
                    displayedComponents={['date']}
                    modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: darkScheme })]}
                  />
                </Host>
              </View>
              <View style={S.fieldRow}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Ends</Text>
                {endDate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Host matchContents ignoreSafeArea="all">
                      <DatePicker
                        selection={endDate} onDateChange={setEndDate}
                        displayedComponents={['date']}
                        modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: darkScheme })]}
                      />
                    </Host>
                    <Pressable onPress={() => setEndDate(null)} hitSlop={8} accessibilityRole="button">
                      <Icon name="close" size={11} color={theme.textTer} stroke={2} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setEndDate(monthEndDate(CURRENT_MONTH))} accessibilityRole="button">
                    <Text style={[TYPE.bodySm, { color: theme.accent.dot }]}>Set end date</Text>
                  </Pressable>
                )}
              </View>
            </View>
            {!dateRangeValid && (
              <Text style={[TYPE.caption, { color: OVER_DOT, marginTop: 6 }]}>
                End date must be after the start date
              </Text>
            )}
            <SheetPrimaryButton
              label={editingId ? 'Save income' : 'Add income'}
              onPress={commit} theme={theme} disabled={!canSave}
              style={{ marginTop: 16 }}
            />
            {editingId && regularIncomes.some(i => i.id === editingId) && (
              <Pressable
                onPress={() => removeIncome(editingId)}
                accessibilityRole="button"
                style={S.deleteBtn}
              >
                <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Remove income source</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <View style={[S.fieldCard, { backgroundColor: theme.chipBg, marginTop: 12 }]}>
              {oneTimeIncomes.length > 0 && (
                <View style={[S.fieldRow, sep]}>
                  <Text style={[S.fieldLabel, { color: theme.textSec }]}>Income</Text>
                  <Host matchContents ignoreSafeArea="all">
                    <Picker
                      selection={editingId ?? '__new__'}
                      onSelectionChange={(val) => {
                        const id = String(val);
                        if (id === '__new__') resetOneTime();
                        else {
                          const inc = oneTimeIncomes.find(i => i.id === id);
                          if (inc) loadOneTime(inc);
                        }
                      }}
                      modifiers={[pickerStyle('menu'), tint(theme.text), fixedSize({ horizontal: true, vertical: false })]}
                    >
                      {oneTimeIncomes.map(inc => (
                        <SwiftText key={inc.id} modifiers={[tag(inc.id)]}>
                          {inc.source === 'One-time income' ? 'One-time income' : inc.source}
                        </SwiftText>
                      ))}
                      <SwiftText key="__new__" modifiers={[tag('__new__')]}>Add new</SwiftText>
                    </Picker>
                  </Host>
                </View>
              )}
              <View style={[S.fieldRow, sep]}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Name</Text>
                <TextInput
                  value={source} onChangeText={setSource}
                  placeholder="Optional" placeholderTextColor={theme.textTer}
                  keyboardAppearance={darkScheme} returnKeyType="done" selectTextOnFocus
                  style={[S.fieldInput, { color: theme.text, flex: 1, textAlign: 'right' }]}
                />
              </View>
              <View style={[S.fieldRow, sep]}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Amount</Text>
                <TextInput
                  value={draft} onChangeText={(t) => setDraft(guardDollar(t))}
                  keyboardType="decimal-pad" keyboardAppearance={darkScheme}
                  placeholder="$0" placeholderTextColor={theme.textTer}
                  returnKeyType="done" selectTextOnFocus
                  style={[S.fieldInput, S.amountInput, { color: theme.text, textAlign: 'right' }]}
                />
              </View>
              <View style={S.fieldRow}>
                <Text style={[S.fieldLabel, { color: theme.textSec }]}>Received</Text>
                <Host matchContents ignoreSafeArea="all">
                  <DatePicker
                    selection={receivedDate} onDateChange={setReceivedDate}
                    displayedComponents={['date']}
                    modifiers={[datePickerStyle('compact'), tint(theme.text), environment({ key: 'colorScheme', value: darkScheme })]}
                  />
                </Host>
              </View>
            </View>
            <SheetPrimaryButton
              label={editingId ? 'Save income' : 'Log income'}
              onPress={commit} theme={theme} disabled={!canSave}
              style={{ marginTop: 16 }}
            />
            {editingId && oneTimeIncomes.some(i => i.id === editingId) && (
              <Pressable onPress={() => removeIncome(editingId)} accessibilityRole="button" style={S.deleteBtn}>
                <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Remove income</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerSpacer: { width: EXIT_BTN_SIZE },
  scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 0 },
  hero: { alignItems: 'center', paddingTop: 6, paddingBottom: 20 },
  heroCircle: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
  },
  feedback: {
    minHeight: 34, borderRadius: 17, marginTop: 10, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  fieldCard: { borderRadius: 14, overflow: 'hidden' },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 50, paddingVertical: 11, paddingHorizontal: 16, gap: 12,
  },
  fieldLabel: { ...TYPE.body, flexShrink: 0 },
  fieldInput: { ...TYPE.subsectionTitle, fontWeight: '500', padding: 0 },
  amountInput: { minWidth: 60, textAlign: 'right' },
  deleteBtn: { alignItems: 'center', paddingVertical: 16 },
});
