import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator, environment, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';

const DETENT_DEFAULT: PresentationDetent = { fraction: 0.48 };
const DETENT_LARGE: PresentationDetent = 'large';
const DETENTS: PresentationDetent[] = [DETENT_DEFAULT, DETENT_LARGE];

import { CATS, TRANSACTIONS, Transaction } from '../data';
import { Icon } from './Icon';
import { Money } from './shared';
import { Theme, catGroupColor, catPastel, CAT_TO_GROUP, GROUP_COLORS } from '../theme';
import { TYPE } from '../typography';

const EXPENSE_GROUPS = [
  { key: 'needs',   label: 'Needs',   icon: 'home',    cats: ['groceries', 'transport', 'bills'],     defaultCat: 'groceries' },
  { key: 'wants',   label: 'Wants',   icon: 'sparkle', cats: ['dining', 'shopping', 'entertainment'], defaultCat: 'dining'    },
  { key: 'savings', label: 'Savings', icon: 'wallet',  cats: [],                                      defaultCat: 'savings'   },
];

export function TxSheet({
  tx,
  theme,
  onClose,
}: {
  tx: Transaction | null;
  theme: Theme;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const lastTx = useRef<Transaction | null>(null);
  if (tx) lastTx.current = tx;
  const t = lastTx.current;

  const [detent, setDetent] = useState<PresentationDetent>(DETENT_DEFAULT);
  const [editCat, setEditCat] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editAmt, setEditAmt] = useState('');
  const editAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tx !== null) {
      setDetent(DETENT_DEFAULT);
      setEditCat(tx.cat);
      setEditMerchant(tx.merchant);
      setEditNote(tx.note ?? '');
      setEditAmt(tx.amount.toFixed(2));
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
                      <SheetBody tx={t} theme={theme} isExpanded={isExpanded} />
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
                            onClose={onClose}
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

function SheetBody({ tx, theme, isExpanded }: { tx: Transaction; theme: Theme; isExpanded: boolean }) {
  const cat = CATS[tx.cat];
  const color = catPastel(tx.cat, theme.dark);
  const groupColor = catGroupColor(tx.cat, theme.dark);
  const catTotal = TRANSACTIONS.filter(x => x.cat === tx.cat).reduce((s, x) => s + x.amount, 0);
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
  editNote, setEditNote, editAmt, setEditAmt, onClose,
}: {
  theme: Theme;
  editCat: string; setEditCat: (v: string) => void;
  editMerchant: string; setEditMerchant: (v: string) => void;
  editNote: string; setEditNote: (v: string) => void;
  editAmt: string; setEditAmt: (v: string) => void;
  onClose: () => void;
}) {
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
        {EXPENSE_GROUPS.map(g => {
          const activeGroup = CAT_TO_GROUP[editCat] ?? (editCat === 'savings' ? 'savings' : undefined);
          const isActive = activeGroup === g.key;
          const color = theme.dark ? GROUP_COLORS[g.key].dark : GROUP_COLORS[g.key].light;
          return (
            <View key={g.key} style={{ flex: 1 }}>
              <Pressable
                onPress={() => setEditCat(g.defaultCat)}
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
                {g.cats.map(catId => {
                  const c = CATS[catId];
                  const isActiveCat = editCat === catId;
                  return (
                    <Pressable
                      key={catId}
                      onPress={() => setEditCat(catId)}
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
        onPress={onClose}
        pointerEvents="box-only"
        style={[S.saveBtn, { backgroundColor: theme.text }]}
      >
        <Text style={[TYPE.subsectionTitle, { color: theme.bg }]}>Save changes</Text>
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
});
