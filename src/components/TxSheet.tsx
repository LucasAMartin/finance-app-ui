import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator, environment, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';

const DETENT_DEFAULT: PresentationDetent = { fraction: 0.48 };
const DETENT_LARGE: PresentationDetent = 'large';
const DETENTS: PresentationDetent[] = [DETENT_DEFAULT, DETENT_LARGE];

import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryGroupFor, categoryMap } from '../repositories/categoryUtils';
import type { Category, GroupKey, Transaction } from '../repositories/types';
import { Icon } from './Icon';
import { Money } from './shared';
import { Theme, catPastel, GROUP_COLORS, OVER_DOT } from '../theme';
import { TYPE } from '../typography';

const GROUP_META: Record<GroupKey, { label: string; icon: string }> = {
  needs: { label: 'Needs', icon: 'home' },
  wants: { label: 'Wants', icon: 'sparkle' },
  savings: { label: 'Savings', icon: 'wallet' },
};

const dateDraftFromIso = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const timeDraftFromIso = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const parseOccurredAtDraft = (dateDraft: string, timeDraft: string, fallback?: string) => {
  const mDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateDraft.trim());
  const mTime = /^(\d{1,2}):(\d{2})$/.exec(timeDraft.trim());
  if (!mDate || !mTime) return fallback;
  const year = Number(mDate[1]);
  const month = Number(mDate[2]) - 1;
  const day = Number(mDate[3]);
  const hour = Number(mTime[1]);
  const minute = Number(mTime[2]);
  if (hour > 23 || minute > 59) return fallback;
  const d = new Date(year, month, day, hour, minute, 0, 0);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
};

export function TxSheet({
  tx,
  theme,
  onClose,
}: {
  tx: Transaction | null;
  theme: Theme;
  onClose: () => void;
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
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const editAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tx !== null) {
      setDetent(DETENT_DEFAULT);
      setEditCat(tx.cat);
      setEditMerchant(tx.merchant);
      setEditNote(tx.note ?? '');
      setEditAmt(tx.amount.toFixed(2));
      setEditDate(dateDraftFromIso(tx.occurredAt));
      setEditTime(timeDraftFromIso(tx.occurredAt));
    }
  }, [tx]);

  const isExpanded = detent === DETENT_LARGE;

  useEffect(() => {
    if (isExpanded) {
      Animated.timing(editAnim, {
        toValue: 1,
        duration: 250,
        delay: 0,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      editAnim.setValue(0);
    }
  }, [isExpanded]);

  const saveEdit = () => {
    if (!t) return;
    const amount = parseFloat(editAmt.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    transactionsRepo.update(t.id, {
      amount,
      cat: editCat,
      merchant: editMerchant.trim() || t.merchant,
      note: editNote,
      occurredAt: parseOccurredAtDraft(editDate, editTime, t.occurredAt),
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
    onClose();
  };

  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
        <BottomSheet
          isPresented={tx !== null}
          onIsPresentedChange={(v) => { if (!v) onClose(); }}
        >
          <Group modifiers={[
            presentationDetents(DETENTS, { selection: detent, onSelectionChange: setDetent }),
            presentationDragIndicator('visible'),
            environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
          ]}>
            <RNHostView>
              <View style={[S.content, {
                backgroundColor: theme.dark ? 'rgba(14,12,26,0.89)' : 'rgba(255,255,255,0.40)',
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
                        justifyContent: isExpanded ? 'center' : 'flex-start',
                        paddingBottom: Math.max(insets.bottom, 16) + 12,
                      }}
                    >
                      <SheetBody tx={t} transactions={transactions} theme={theme} isExpanded={isExpanded} cats={cats} categories={categories} />
                      {!isExpanded && (
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
                      )}
                      {isExpanded && (
                        <Animated.View style={{
                          opacity: editAnim,
                          transform: [{ translateY: editAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
                        }}>
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
                            editDate={editDate}
                            setEditDate={setEditDate}
                            editTime={editTime}
                            setEditTime={setEditTime}
                            cats={cats}
                            categories={categories}
                            onSave={saveEdit}
                            onDelete={deleteTx}
                          />
                        </Animated.View>
                      )}
                    </ScrollView>
                  </>
                )}
              </View>
            </RNHostView>
          </Group>
        </BottomSheet>
    </Host>
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
  const catTotal = transactions.filter(x => x.cat === tx.cat).reduce((s, x) => s + x.amount, 0);
  const catBudget = cat?.budget ?? 0;
  const catPct = catBudget > 0 ? Math.min(100, Math.round((catTotal / catBudget) * 100)) : 0;

  return (
    <>
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

      {!isExpanded && (
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
      )}
    </>
  );
}

function EditSection({
  theme, editCat, setEditCat, editMerchant, setEditMerchant,
  editNote, setEditNote, editAmt, setEditAmt, editDate, setEditDate,
  editTime, setEditTime, cats, categories, onSave, onDelete,
}: {
  theme: Theme;
  editCat: string; setEditCat: (v: string) => void;
  editMerchant: string; setEditMerchant: (v: string) => void;
  editNote: string; setEditNote: (v: string) => void;
  editAmt: string; setEditAmt: (v: string) => void;
  editDate: string; setEditDate: (v: string) => void;
  editTime: string; setEditTime: (v: string) => void;
  cats: Record<string, { label: string; icon: string; budget: number }>;
  categories: Category[];
  onSave: () => void;
  onDelete: () => void;
}) {
  const grouped = (['needs', 'wants', 'savings'] as GroupKey[]).map(key => ({
    key,
    ...GROUP_META[key],
    cats: categories.filter(cat => cat.group === key && !cat.archived),
  }));

  return (
    <View style={[S.editSection, { borderTopColor: theme.hairline }]}>
      <View style={[S.fieldCard, { backgroundColor: theme.chipBg }]}>
        <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Amount</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[TYPE.subsectionTitle, { fontWeight: '500', color: theme.textSec, marginRight: 1 }]}>$</Text>
            <TextInput
              value={editAmt}
              onChangeText={setEditAmt}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={[S.fieldInput, { color: theme.text }]}
            />
          </View>
        </View>
        <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Date</Text>
          <TextInput
            value={editDate}
            onChangeText={setEditDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textTer}
            keyboardType="numbers-and-punctuation"
            style={[S.fieldInput, { color: theme.text, flex: 1 }]}
          />
        </View>
        <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Time</Text>
          <TextInput
            value={editTime}
            onChangeText={setEditTime}
            placeholder="HH:MM"
            placeholderTextColor={theme.textTer}
            keyboardType="numbers-and-punctuation"
            style={[S.fieldInput, { color: theme.text, flex: 1 }]}
          />
        </View>
        <View style={[S.fieldRow, { borderBottomColor: theme.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[S.fieldLabel, { color: theme.textSec }]}>Merchant</Text>
          <TextInput
            value={editMerchant}
            onChangeText={setEditMerchant}
            placeholder="Merchant name"
            placeholderTextColor={theme.textTer}
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
      <Text style={[S.editTitle, { color: theme.textTer, marginTop: 20 }]}>Category</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {grouped.map(g => {
          const activeGroup = categoryGroupFor(editCat, categories);
          const isActive = activeGroup === g.key;
          const color = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
          const defaultCat = g.cats[0]?.id ?? editCat;
          return (
            <View key={g.key} style={{ flex: 1 }}>
              <Pressable
                onPress={() => setEditCat(defaultCat)}
                pointerEvents="box-only"
                style={[S.groupHeader, {
                  backgroundColor: isActive ? color + '20' : theme.surface,
                  borderColor: isActive ? color + '80' : theme.hairline,
                }]}
              >
                <View style={[S.groupHeaderIcon, {
                  backgroundColor: isActive ? color + '30' : theme.chipBg,
                }]}>
                  <Icon name={g.icon} size={13} color={isActive ? color : theme.textTer} stroke={1.6} />
                </View>
                <Text style={[
                  isActive ? TYPE.captionEm : TYPE.caption,
                  { color: isActive ? theme.text : theme.textSec },
                ]}>
                  {g.label}
                </Text>
              </Pressable>
              <View style={S.subcatList}>
                {g.cats.map(cat => {
                  const c = cats[cat.id] ?? cat;
                  const isActiveCat = editCat === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setEditCat(cat.id)}
                      pointerEvents="box-only"
                      style={[S.subcatRow, { backgroundColor: isActiveCat ? theme.text : 'transparent' }]}
                    >
                      <Icon name={c.icon} size={12} color={isActiveCat ? theme.bg : theme.textTer} stroke={1.5} />
                      <Text style={[
                        isActiveCat ? TYPE.captionEm : TYPE.caption,
                        { color: isActiveCat ? theme.bg : theme.textSec, marginLeft: 5 },
                      ]}>
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* Save */}
      <Pressable
        onPress={onSave}
        pointerEvents="box-only"
        style={[S.saveBtn, { backgroundColor: theme.text }]}
      >
        <Text style={[TYPE.subsectionTitle, { color: theme.bg }]}>Save changes</Text>
      </Pressable>
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
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldLabel: { ...TYPE.body, flexShrink: 0 },
  fieldInput: { ...TYPE.subsectionTitle, fontWeight: '500', textAlign: 'right', padding: 0 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    marginBottom: 5,
  },
  groupHeaderIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subcatList: { height: 90 },
  subcatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRadius: 8,
    marginBottom: 2,
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
