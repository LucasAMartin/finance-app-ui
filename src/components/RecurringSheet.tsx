import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, Group, Host, Picker, RNHostView, Text as SwiftText } from '@expo/ui/swift-ui';
import { background, environment, fixedSize, pickerStyle, presentationDetents, presentationDragIndicator, tag, tint, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';
import { Theme, GROUP_COLORS } from '../theme';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupFor, categoryMap } from '../repositories/categoryUtils';
import type { Category, GroupKey, RecurringRule } from '../repositories/types';
import { Icon } from './Icon';
import { SheetPrimaryButton } from './shared';
import { TYPE } from '../typography';

const DETENT: PresentationDetent = { fraction: 0.72 };

const GROUP_META: Record<GroupKey, { label: string; icon: string }> = {
  needs: { label: 'Needs', icon: 'home' },
  wants: { label: 'Wants', icon: 'sparkle' },
  savings: { label: 'Savings', icon: 'wallet' },
};

const CADENCES: { value: RecurringRule['cadence']; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'annual', label: 'Yearly' },
  { value: 'customMonthly', label: 'Day of month' },
];

function parseAmount(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === '' || clean === '.') return null;
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function nextDueDate(cadence: RecurringRule['cadence'], dayDraft: string): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  if (cadence === 'weekly') {
    next.setDate(next.getDate() + 7);
    return next.toISOString();
  }
  if (cadence === 'annual') {
    next.setFullYear(next.getFullYear() + 1);
    return next.toISOString();
  }
  const day = Math.max(1, Math.min(28, Number(dayDraft) || now.getDate()));
  next.setDate(day);
  if (next <= now) next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

export function RecurringSheet({ theme, visible, onClose }: Props) {
  const { recurringRulesRepo, categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const cats = useMemo(() => categoryMap(categories), [categories]);
  const insets = useSafeAreaInsets();

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('');
  const [cadence, setCadence] = useState<RecurringRule['cadence']>('customMonthly');
  const [dayDraft, setDayDraft] = useState(String(new Date().getDate()));

  useEffect(() => {
    if (!visible) return;
    setMerchant('');
    setAmount('');
    setCat(categories[0]?.id ?? '');
    setCadence('customMonthly');
    setDayDraft(String(new Date().getDate()));
  }, [visible, categories]);

  const save = () => {
    const parsed = parseAmount(amount);
    const selectedCat = cat || categories[0]?.id;
    if (!parsed || !selectedCat) return;
    const due = nextDueDate(cadence, dayDraft);
    recurringRulesRepo.create({
      merchant: merchant.trim() || cats[selectedCat]?.label || 'Recurring expense',
      cat: selectedCat,
      amount: parsed,
      cadence,
      startDate: new Date().toISOString().slice(0, 10),
      nextDueDate: due,
      dayOfMonth: cadence === 'customMonthly' ? Math.max(1, Math.min(28, Number(dayDraft) || new Date(due).getDate())) : undefined,
      active: true,
      estimate: false,
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    onClose();
  };

  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}
      >
        <Group modifiers={[
          presentationDetents([DETENT]),
          presentationDragIndicator('visible'),
          environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
          background(theme.surface),
        ]}>
          <RNHostView>
            <View style={[S.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
              <View style={S.head}>
                <Text style={[TYPE.sectionTitle, { color: theme.text }]}>Recurring expense</Text>
                <Pressable
                  onPress={onClose}
                  pointerEvents="box-only"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[S.closeBtn, { backgroundColor: theme.chipBg }]}
                >
                  <Icon name="close" size={15} color={theme.textSec} stroke={1.8} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={[S.fieldCard, { backgroundColor: theme.chipBg }]}>
                  <View style={[S.fieldRow, { borderBottomColor: theme.sep }]}>
                    <Text style={[TYPE.body, { color: theme.textSec }]}>Merchant</Text>
                    <TextInput
                      value={merchant}
                      onChangeText={setMerchant}
                      placeholder="Name"
                      placeholderTextColor={theme.textTer}
                      style={[TYPE.bodySmEm, S.input, { color: theme.text }]}
                    />
                  </View>
                  <View style={S.fieldRow}>
                    <Text style={[TYPE.body, { color: theme.textSec }]}>Amount</Text>
                    <View style={S.amountInputRow}>
                      <Text style={[TYPE.bodySmEm, { color: theme.textSec }]}>$</Text>
                      <TextInput
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        placeholderTextColor={theme.textTer}
                        keyboardType="decimal-pad"
                        style={[TYPE.bodySmEm, S.amountInput, { color: theme.text }]}
                      />
                    </View>
                  </View>
                </View>

                <View style={[S.optionRow, { borderTopColor: theme.hairline }]}>
                  <Text style={[TYPE.body, { color: theme.text }]}>Cadence</Text>
                  <Host matchContents>
                    <Picker
                      selection={cadence}
                      onSelectionChange={(val) => setCadence(val as RecurringRule['cadence'])}
                      modifiers={[
                        pickerStyle('menu'),
                        tint(theme.text),
                        fixedSize({ horizontal: true, vertical: false }),
                      ]}
                    >
                      {CADENCES.map(item => (
                        <SwiftText key={item.value} modifiers={[tag(item.value)]}>{item.label}</SwiftText>
                      ))}
                    </Picker>
                  </Host>
                </View>

                {cadence === 'customMonthly' && (
                  <View style={[S.fieldCard, { backgroundColor: theme.chipBg, marginTop: 12 }]}>
                    <View style={S.fieldRow}>
                      <Text style={[TYPE.body, { color: theme.textSec }]}>Due day</Text>
                      <TextInput
                        value={dayDraft}
                        onChangeText={setDayDraft}
                        keyboardType="number-pad"
                        placeholder="1-28"
                        placeholderTextColor={theme.textTer}
                        style={[TYPE.bodySmEm, S.input, { color: theme.text }]}
                      />
                    </View>
                  </View>
                )}

                <Text style={[TYPE.labelLg, S.sectionLabel, { color: theme.textTer }]}>Category</Text>
                <CategoryPicker theme={theme} activeCat={cat} categories={categories} cats={cats} onChange={setCat} />

                <SheetPrimaryButton
                  label="Save recurring"
                  onPress={save}
                  theme={theme}
                  style={S.saveBtn}
                />
              </ScrollView>
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

function CategoryPicker({
  theme,
  activeCat,
  categories,
  cats,
  onChange,
}: {
  theme: Theme;
  activeCat: string;
  categories: Category[];
  cats: Record<string, { label: string; icon: string; budget: number }>;
  onChange: (cat: string) => void;
}) {
  const grouped = (['needs', 'wants', 'savings'] as GroupKey[]).map(key => ({
    key,
    ...GROUP_META[key],
    cats: categories.filter(category => category.group === key && !category.archived),
  }));
  return (
    <View style={S.categoryGrid}>
      {grouped.map(group => {
        const activeGroup = categoryGroupFor(activeCat, categories);
        const isActive = activeGroup === group.key;
        const color = theme.dark ? GROUP_COLORS[group.key].dark : GROUP_COLORS[group.key].light;
        const defaultCat = group.cats[0]?.id ?? activeCat;
        return (
          <View key={group.key} style={{ flex: 1 }}>
            <Pressable
              onPress={() => onChange(defaultCat)}
              pointerEvents="box-only"
              style={[S.groupHeader, {
                backgroundColor: isActive ? color : theme.chipBg,
                borderColor: isActive ? color : theme.hairline,
              }]}
            >
              <Icon name={group.icon} size={13} color={isActive ? theme.bg : theme.textTer} stroke={1.6} />
              <Text style={[TYPE.captionEm, { color: isActive ? theme.bg : theme.textSec }]}>
                {group.label}
              </Text>
            </Pressable>
            <View style={S.subcatList}>
              {group.cats.map(category => {
                const item = cats[category.id] ?? category;
                const selected = activeCat === category.id;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => onChange(category.id)}
                    pointerEvents="box-only"
                    style={[S.subcatRow, { backgroundColor: selected ? theme.text : 'transparent' }]}
                  >
                    <Icon name={item.icon} size={12} color={selected ? theme.bg : theme.textTer} stroke={1.5} />
                    <Text numberOfLines={1} style={[TYPE.caption, { flex: 1, color: selected ? theme.bg : theme.textSec }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const S = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  fieldRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    gap: 2,
  },
  amountInput: {
    minWidth: 74,
    textAlign: 'right',
    paddingVertical: 0,
  },
  optionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    marginTop: 14,
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: 7,
  },
  groupHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  subcatList: {
    minHeight: 98,
  },
  subcatRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 7,
    marginBottom: 2,
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 22,
  },
});
