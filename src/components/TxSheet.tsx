import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, DatePicker, Group, Host, Picker, RNHostView, Text as SwiftText } from '@expo/ui/swift-ui';
import { background, controlSize, datePickerStyle, fixedSize, font, pickerStyle, presentationDetents, presentationDragIndicator, tag, tint, environment, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

const DETENT_DEFAULT: PresentationDetent = { fraction: 0.48 };
const DETENT_LARGE: PresentationDetent = 'large';
const DETENTS: PresentationDetent[] = [DETENT_DEFAULT, DETENT_LARGE];
const DATE_PICKER_EXPANDED_HEIGHT = 236;

import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryGroupFor, categoryMap } from '../repositories/categoryUtils';
import type { Category, GroupKey, Transaction } from '../repositories/types';
import { Icon } from './Icon';
import { Money, SheetPrimaryButton } from './shared';
import { Theme, catPastel, GROUP_COLORS, OVER_DOT } from '../theme';
import { TYPE } from '../typography';

const GROUP_KEYS: GroupKey[] = ['needs', 'wants', 'savings'];
const GROUP_LABELS: Record<GroupKey, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};

const dateFromIso = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const formatOccurredAt = (d: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);

export function TxSheet({
  tx,
  theme,
  onClose,
  onDeleted,
}: {
  tx: Transaction | null;
  theme: Theme;
  onClose: () => void;
  onDeleted?: (tx: Transaction) => void;
}) {
  const { transactionsRepo, categoriesRepo } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const cats = categoryMap(categories);
  const insets = useSafeAreaInsets();
  const lastTx = useRef<Transaction | null>(null);
  if (tx) lastTx.current = tx;
  const t = lastTx.current;

  const [detent, setDetent] = useState<PresentationDetent>(DETENT_DEFAULT);
  const [editCat, setEditCat] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editAmt, setEditAmt] = useState('');
  const [editOccurredAt, setEditOccurredAt] = useState<Date>(new Date());
  const [datePickerInlineOpen, setDatePickerInlineOpen] = useState(false);

  useEffect(() => {
    if (tx !== null) {
      setDetent(DETENT_DEFAULT);
      setEditCat(tx.cat);
      setEditMerchant(tx.merchant);
      setEditNote(tx.note ?? '');
      setEditAmt(tx.amount.toFixed(2));
      setEditOccurredAt(dateFromIso(tx.occurredAt));
      setDatePickerInlineOpen(false);
    }
  }, [tx]);

  const isExpanded = detent === DETENT_LARGE;

  const saveEdit = () => {
    if (!t) return;
    const amount = parseFloat(editAmt.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    transactionsRepo.update(t.id, {
      amount,
      cat: editCat,
      merchant: editMerchant.trim() || t.merchant,
      note: editNote,
      occurredAt: Number.isNaN(editOccurredAt.getTime()) ? t.occurredAt : editOccurredAt.toISOString(),
      recurring: t.recurring,
      type: t.type ?? 'expense',
      recurringRuleId: t.recurringRuleId,
      visibility: t.visibility ?? 'shared',
      createdByUserId: t.createdByUserId,
      updatedByUserId: 'local',
      meta: t.meta,
    });
    onClose();
  };

  const deleteTx = () => {
    if (!t) return;
    transactionsRepo.delete(t.id);
    onDeleted?.(t);
    onClose();
  };

  return (
    <>
      <Host style={{ width: 0, height: 0, position: 'absolute' }}>
          <BottomSheet
            isPresented={tx !== null}
            onIsPresentedChange={(v) => { if (!v) onClose(); }}
          >
            <Group modifiers={[
              presentationDetents(DETENTS, { selection: detent, onSelectionChange: setDetent }),
              presentationDragIndicator('visible'),
              environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
              background(theme.surface),
            ]}>
              <RNHostView>
                <View style={[S.content, {
                  backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.40)',
                }]}>
                  {t && (
                    <>
                      {!isExpanded && (
                        <Pressable
                          onPress={onClose}
                          pointerEvents="box-only"
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={[S.closeBtn, { backgroundColor: theme.chipBg }]}
                        >
                          <Icon name="close" size={15} color={theme.textSec} />
                        </Pressable>
                      )}
                      <ScrollView
                        bounces={false}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{
                          flexGrow: 1,
                          justifyContent: isExpanded ? 'flex-start' : 'center',
                          paddingBottom: Math.max(insets.bottom, 16) + 12,
                        }}
                      >
                        <SheetBody tx={t} transactions={transactions} theme={theme} isExpanded={isExpanded} cats={cats} categories={categories} />
                        {!isExpanded ? (
                          <View>
                            <CompactSummary tx={t} transactions={transactions} theme={theme} cats={cats} categories={categories} />
                            <Pressable
                              onPress={() => setDetent(DETENT_LARGE)}
                              pointerEvents="box-only"
                              style={S.expandHint}
                              accessibilityRole="button"
                              accessibilityLabel="Edit transaction"
                            >
                              <Icon name="chevUp" size={13} color={theme.textSec} stroke={2} />
                              <Text style={[S.expandHintText, { color: theme.textSec }]}>Edit</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <EditSection
                            theme={theme}
                            editCat={editCat}
                            setEditCat={setEditCat}
                            editMerchant={editMerchant}
                            setEditMerchant={setEditMerchant}
                            editNote={editNote}
                            setEditNote={setEditNote}
                            editAmt={editAmt}
                            setEditAmt={setEditAmt}
                            editOccurredAt={editOccurredAt}
                            datePickerInlineOpen={datePickerInlineOpen}
                            onToggleDatePicker={() => setDatePickerInlineOpen(v => !v)}
                            onDateChange={setEditOccurredAt}
                            cats={cats}
                            categories={categories}
                            onSave={saveEdit}
                            onDelete={deleteTx}
                          />
                        )}
                      </ScrollView>
                    </>
                  )}
                </View>
              </RNHostView>
            </Group>
          </BottomSheet>
      </Host>
    </>
  );
}

function SheetBody({
  tx,
  transactions,
  theme,
  isExpanded,
  cats,
  categories,
}: {
  tx: Transaction;
  transactions: Transaction[];
  theme: Theme;
  isExpanded: boolean;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
}) {
  const cat = cats[tx.cat];
  const color = catPastel(tx.cat, theme.dark);
  const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);

  return (
    <View style={[S.hero, isExpanded && S.heroCompact]}>
      <View style={[S.catCircle, isExpanded && S.catCircleCompact, { backgroundColor: color + '42' }]}>
        <Icon name={cat?.icon ?? 'tag'} size={isExpanded ? 18 : 24} color={groupColor} stroke={1.5} />
      </View>
      <Text style={[S.merchant, isExpanded && S.merchantCompact, { color: theme.text }]}>{tx.merchant}</Text>
      <Text style={[S.metaLine, isExpanded && S.metaLineCompact, { color: theme.textSec }]} numberOfLines={1}>
        {cat?.label}
        <Text style={{ color: theme.textTer }}> · </Text>
        {tx.fullDate}
        <Text style={{ color: theme.textTer }}> · </Text>
        {tx.time}
      </Text>
      <View style={{ marginTop: isExpanded ? 12 : 18 }}>
        <Money value={tx.amount} size={isExpanded ? 28 : 32} weight="600" prefix="−$" theme={theme} />
      </View>
    </View>
  );
}

function CompactSummary({
  tx,
  transactions,
  theme,
  cats,
  categories,
}: {
  tx: Transaction;
  transactions: Transaction[];
  theme: Theme;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
}) {
  const cat = cats[tx.cat];
  const groupColor = categoryGroupColor(tx.cat, categories, theme.dark);
  const catTotal = transactions.filter(x => x.cat === tx.cat).reduce((s, x) => s + x.amount, 0);
  const catBudget = cat?.budget ?? 0;
  const catPct = catBudget > 0 ? Math.min(100, Math.round((catTotal / catBudget) * 100)) : 0;

  return (
    <>
      {tx.note ? (
        <View style={[S.noteRow, { backgroundColor: theme.chipBg }]}>
          <Text style={[S.noteLabel, { color: theme.textSec }]}>Note</Text>
          <Text style={[S.noteValue, { color: theme.text }]}>{tx.note}</Text>
        </View>
      ) : null}
      <View style={S.budgetBlock}>
        <View style={S.usageRow}>
          <Text style={[S.usageLabel, { color: theme.textSec }]}>{cat?.label} this month</Text>
          <Text style={[S.usageAmount, { color: theme.textSec }]}>
            <Text style={[TYPE.bodySmEm, { color: theme.text }]}>${catTotal.toFixed(0)}</Text>
            {' of $'}{catBudget}
          </Text>
        </View>
        <View style={[S.bar, { backgroundColor: theme.hairline }]}>
          <View style={[S.barFill, { width: `${catPct}%` as any, backgroundColor: groupColor }]} />
        </View>
      </View>
    </>
  );
}

function EditSection({
  theme, editCat, setEditCat, editMerchant, setEditMerchant,
  editNote, setEditNote, editAmt, setEditAmt, editOccurredAt, datePickerInlineOpen, onToggleDatePicker, onDateChange,
  cats, categories, onSave, onDelete,
}: {
  theme: Theme;
  editCat: string; setEditCat: (v: string) => void;
  editMerchant: string; setEditMerchant: (v: string) => void;
  editNote: string; setEditNote: (v: string) => void;
  editAmt: string; setEditAmt: (v: string) => void;
  editOccurredAt: Date;
  datePickerInlineOpen: boolean;
  onToggleDatePicker: () => void;
  onDateChange: (v: Date) => void;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  onSave: () => void;
  onDelete: () => void;
}) {
  const selectedGroup = categoryGroupFor(editCat, categories);
  const selectedGroupIdx = Math.max(0, GROUP_KEYS.indexOf(selectedGroup));
  const subcats = categories.filter(cat => cat.group === selectedGroup && !cat.archived);
  const selectedSubIdx = Math.max(0, subcats.findIndex(cat => cat.id === editCat));
  const groupColors: Record<GroupKey, string> = {
    needs: theme.dark ? GROUP_COLORS.needs.dark : GROUP_COLORS.needs.light,
    wants: theme.dark ? GROUP_COLORS.wants.dark : GROUP_COLORS.wants.light,
    savings: theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.light,
  };
  const selectedGroupColor = groupColors[selectedGroup] ?? theme.accent.dot;

  return (
    <View style={[S.editSection, { borderTopColor: theme.hairline }]}>
      <View style={[S.fieldCard, { backgroundColor: theme.chipBg }]}>
        <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Amount</Text>
          <View style={S.amountEditor}>
            <TextInput
              value={editAmt}
              onChangeText={setEditAmt}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={[S.fieldInput, S.amountInput, { color: theme.text }]}
            />
          </View>
        </View>
        <Pressable
          onPress={onToggleDatePicker}
          style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}
        >
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Date & time</Text>
          <View style={S.dateTimeEditor}>
            <Text style={[S.fieldInput, { color: theme.text }]}>{formatOccurredAt(editOccurredAt)}</Text>
          </View>
        </Pressable>
        {datePickerInlineOpen ? (
          <View
            style={[
              S.inlineDatePickerClip,
              {
                height: DATE_PICKER_EXPANDED_HEIGHT,
                borderBottomColor: theme.sep,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={S.inlineDatePickerWrap}>
              <Host matchContents>
                <DatePicker
                  selection={editOccurredAt}
                  onDateChange={onDateChange}
                  displayedComponents={['date', 'hourAndMinute']}
                  modifiers={[
                    datePickerStyle('wheel'),
                    environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                  ]}
                />
              </Host>
            </View>
          </View>
        ) : null}
        <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Merchant</Text>
          <TextInput
            value={editMerchant}
            onChangeText={setEditMerchant}
            placeholder="Merchant name"
            placeholderTextColor={theme.textTer}
            clearButtonMode="while-editing"
            style={[S.fieldInput, { color: theme.text, flex: 1 }]}
          />
        </View>
        <View style={S.fieldRow}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Note</Text>
          <TextInput
            value={editNote}
            onChangeText={setEditNote}
            placeholder="Optional"
            placeholderTextColor={theme.textTer}
            style={[S.fieldInput, { color: theme.text, flex: 1 }]}
          />
        </View>
      </View>

      {/* Category picker */}
      <View
        style={[
          S.categoryPanel,
          {
            backgroundColor: theme.chipBg,
            borderColor: theme.hairline,
            marginTop: 20,
          },
        ]}
      >
        <SegmentedControl
          values={GROUP_KEYS.map(key => GROUP_LABELS[key])}
          selectedIndex={selectedGroupIdx}
          onChange={(e) => {
            const nextGroup = GROUP_KEYS[e.nativeEvent.selectedSegmentIndex];
            if (!nextGroup) return;
            const nextSubcats = categories.filter(cat => cat.group === nextGroup && !cat.archived);
            if (nextSubcats.length === 0) return;
            const nextKeep = nextSubcats.find(cat => cat.id === editCat);
            setEditCat((nextKeep ?? nextSubcats[0]).id);
          }}
          tintColor={theme.accent.dot}
          appearance={theme.dark ? 'dark' : 'light'}
          style={S.groupSegmented}
        />

        <View style={[S.subcategoryRow, { borderTopColor: theme.hairline }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Subcategory</Text>
          {subcats.length > 0 ? (
            <Host matchContents>
              <Picker
                selection={selectedSubIdx}
                onSelectionChange={(val) => {
                  const idx = Number(val);
                  const next = subcats[idx];
                  if (next) setEditCat(next.id);
                }}
                modifiers={[
                  pickerStyle('menu'),
                  tint(theme.text),
                  controlSize('small'),
                  font({ size: 15, weight: 'medium' }),
                  environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
                  fixedSize({ horizontal: true, vertical: false }),
                ]}
              >
                {subcats.map((cat, idx) => (
                  <SwiftText key={cat.id} modifiers={[tag(idx)]}>
                    {cats[cat.id]?.label ?? cat.label}
                  </SwiftText>
                ))}
              </Picker>
            </Host>
          ) : (
            <Text style={[TYPE.bodySm, { color: theme.textTer }]}>No subcategories</Text>
          )}
        </View>
      </View>

      {/* Save */}
      <SheetPrimaryButton
        label="Save changes"
        onPress={onSave}
        theme={theme}
        style={S.saveBtn}
      />
      <Pressable
        onPress={onDelete}
        pointerEvents="box-only"
        style={S.deleteBtn}
      >
        <Text style={[TYPE.bodySmEm, { color: OVER_DOT }]}>Delete transaction</Text>
      </Pressable>
    </View>
  );
}

const S = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: 20,
  },
  heroCompact: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  catCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  catCircleCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  merchant: { ...TYPE.headline, textAlign: 'center' },
  merchantCompact: { ...TYPE.pageTitle, textAlign: 'center' },
  metaLine: { ...TYPE.bodySm, marginTop: 5, textAlign: 'center' },
  metaLineCompact: { ...TYPE.caption, marginTop: 3, textAlign: 'center' },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  noteLabel: { ...TYPE.bodySm },
  noteValue: { ...TYPE.bodySmEm, flex: 1, textAlign: 'right', marginLeft: 12 },
  budgetBlock: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 9,
  },
  usageLabel: { ...TYPE.bodySm },
  usageAmount: { ...TYPE.bodySm },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 14,
  },
  expandHintText: { ...TYPE.captionEm },
  editSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  editTitle: {
    ...TYPE.labelLg,
    fontWeight: '600',
    marginBottom: 10,
  },
  fieldCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldLabel: { ...TYPE.body, flexShrink: 0 },
  fieldInput: { ...TYPE.subsectionTitle, fontWeight: '500', textAlign: 'right', padding: 0 },
  amountEditor: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  amountInput: {
    minWidth: 84,
    textAlign: 'right',
  },
  dateTimeEditor: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  inlineDatePickerClip: {
    overflow: 'hidden',
  },
  inlineDatePickerWrap: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryPanel: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupSegmented: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  subcategoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    marginTop: 28,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  deleteBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
});
