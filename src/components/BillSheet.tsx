import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  background,
  environment,
  presentationDetents,
  presentationDragIndicator,
  type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';
import { Theme } from '../theme';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { categoryGroupColor, categoryMap } from '../repositories/categoryUtils';
import type { Bill } from '../repositories/types';
import { advanceDueDate } from '../selectors/finance';
import { Icon } from './Icon';
import { Money, SheetPrimaryButton } from './shared';
import { TYPE } from '../typography';

const DETENT: PresentationDetent = { fraction: 0.52 };

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Yearly',
  customMonthly: 'Monthly',
};

export function BillSheet({
  bill,
  theme,
  onClose,
}: {
  bill: Bill | null;
  theme: Theme;
  onClose: () => void;
}) {
  const { transactionsRepo, recurringRulesRepo, categoriesRepo } = useRepositories();
  const categories = useRepositoryList(categoriesRepo);
  const cats = categoryMap(categories);
  const insets = useSafeAreaInsets();

  const lastBill = useRef<Bill | null>(null);
  if (bill) lastBill.current = bill;
  const b = lastBill.current;

  const [editAmt, setEditAmt] = useState('');

  useEffect(() => {
    if (bill !== null) {
      setEditAmt(bill.amount.toFixed(2));
    }
  }, [bill]);

  const ruleId = b?.id.startsWith('bill-') ? b.id.slice(5) : (b?.id ?? '');
  const rule = ruleId ? recurringRulesRepo.get(ruleId) : undefined;
  const groupColor = b ? categoryGroupColor(b.cat, categories, theme.dark) : theme.accent.dot;
  const cat = b ? cats[b.cat] : undefined;

  const markPaid = () => {
    if (!b) return;
    const amount = parseFloat(editAmt.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    transactionsRepo.create({
      merchant: b.merchant,
      cat: b.cat,
      amount,
      recurring: true,
      recurringRuleId: ruleId,
      occurredAt: new Date().toISOString(),
      type: 'expense',
      visibility: 'shared',
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    if (rule) {
      recurringRulesRepo.update(ruleId, {
        nextDueDate: advanceDueDate(rule),
        meta: { ...rule.meta, partialPaid: undefined },
      });
    }
    onClose();
  };

  const markPartiallyPaid = () => {
    if (!b || !rule) return;
    const amount = parseFloat(editAmt.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    transactionsRepo.create({
      merchant: b.merchant,
      cat: b.cat,
      amount,
      recurring: true,
      recurringRuleId: ruleId,
      occurredAt: new Date().toISOString(),
      type: 'expense',
      visibility: 'shared',
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    const existing = (rule.meta?.partialPaid as number | undefined) ?? 0;
    recurringRulesRepo.update(ruleId, {
      meta: { ...rule.meta, partialPaid: existing + amount },
    });
    onClose();
  };

  return (
    <Host style={{ width: 0, height: 0, position: 'absolute' }}>
      <BottomSheet
        isPresented={bill !== null}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}
      >
        <Group modifiers={[
          presentationDetents([DETENT]),
          presentationDragIndicator('visible'),
          environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
          background(theme.surface),
        ]}>
          <RNHostView>
            <View style={[S.content, {
              backgroundColor: theme.dark ? theme.surface : 'rgba(255,255,255,0.40)',
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            }]}>
              {b && (
                <>
                  <Pressable
                    onPress={onClose}
                    pointerEvents="box-only"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[S.closeBtn, { backgroundColor: theme.chipBg }]}
                  >
                    <Icon name="close" size={15} color={theme.textSec} />
                  </Pressable>

                  <View style={S.hero}>
                    <View style={[S.catCircle, { backgroundColor: `${groupColor}30` }]}>
                      <Icon name={b.icon} size={24} color={groupColor} stroke={1.5} />
                    </View>
                    <Text style={[S.merchant, { color: theme.text }]}>{b.merchant}</Text>
                    <Text style={[S.metaLine, { color: theme.textSec }]} numberOfLines={1}>
                      {cat?.label}
                      {cat?.label ? <Text style={{ color: theme.textTer }}> · </Text> : null}
                      Due {b.dueDate}
                      {rule ? <Text style={{ color: theme.textTer }}> · {CADENCE_LABEL[rule.cadence] ?? 'Recurring'}</Text> : null}
                    </Text>
                    <View style={{ marginTop: 14 }}>
                      <Money value={b.amount} size={32} weight="600" prefix="$" theme={theme} />
                    </View>
                  </View>

                  <View style={[S.amtCard, { backgroundColor: theme.chipBg }]}>
                    <View style={S.amtRow}>
                      <Text style={[S.amtLabel, { color: theme.textSec }]}>Amount paid</Text>
                      <TextInput
                        value={editAmt}
                        onChangeText={setEditAmt}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        style={[S.amtInput, { color: theme.text }]}
                      />
                    </View>
                  </View>

                  <SheetPrimaryButton
                    label="Mark as paid"
                    onPress={markPaid}
                    theme={theme}
                    style={S.primaryBtn}
                  />
                  <Pressable
                    onPress={markPartiallyPaid}
                    pointerEvents="box-only"
                    style={({ pressed }) => [S.secondaryBtn, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Text style={[S.secondaryBtnText, { color: theme.textSec }]}>Mark partially paid</Text>
                  </Pressable>
                </>
              )}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
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
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  catCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  merchant: {
    ...TYPE.headline,
    textAlign: 'center',
  },
  metaLine: {
    ...TYPE.bodySm,
    marginTop: 5,
    textAlign: 'center',
  },
  amtCard: {
    borderRadius: 14,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  amtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  amtLabel: {
    ...TYPE.body,
    flexShrink: 0,
  },
  amtInput: {
    ...TYPE.subsectionTitle,
    fontWeight: '500',
    textAlign: 'right',
    padding: 0,
    flex: 1,
  },
  primaryBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    ...TYPE.subsectionTitle,
  },
});
