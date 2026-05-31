import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme';
import { Icon } from './Icon';
import { SheetPrimaryButton } from './shared';
import { TYPE } from '../typography';
import { useRepositories } from '../repositories/RepositoryProvider';
import { Button, Host, Image as SwiftImage } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, environment } from '@expo/ui/swift-ui/modifiers';

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

const toYMD = (d: Date) => {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

// A full-screen income-entry surface. Rendered as the destination of the
// container transform from the Home "Income" button — it never animates itself,
// it's simply revealed by the growing card, so it can be a plain screen.
export function IncomeFlow({ theme, onClose, onSaved }: IncomeFlowProps) {
  const { incomeRepo } = useRepositories();
  const insets = useSafeAreaInsets();

  const [amt, setAmt] = useState('0.00');
  const [source, setSource] = useState('');

  // Cents-first entry: every key shifts digits in from the right, matching the
  // expense keypad in VoiceSheet so the two flows feel like one product.
  const press = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (k === 'clear') { setAmt('0.00'); return; }
    setAmt((a) => {
      const cents = Math.round(parseFloat(a || '0') * 100) || 0;
      let next: number;
      if (k === 'del') next = Math.floor(cents / 10);
      else next = cents * 10 + parseInt(k, 10);
      next = Math.min(next, 99_999_999);
      return (next / 100).toFixed(2);
    });
  };

  const amount = parseFloat(amt);
  const canSave = Number.isFinite(amount) && amount > 0;

  const save = () => {
    if (!canSave) return;
    const now = new Date();
    const label = source.trim() || 'Income';
    const inc = incomeRepo.create({
      kind: 'irregular',
      amount,
      source: label,
      cadence: 'oneTime',
      startDate: toYMD(now),
      receivedAt: now.toISOString(),
      createdByUserId: 'local',
      updatedByUserId: 'local',
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onSaved?.({ id: inc.id, amount, source: label });
    onClose();
  };

  return (
    <View style={[S.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={S.header}>
        <Host
          colorScheme={theme.dark ? 'dark' : 'light'}
          matchContents
          style={S.backBtnHost}
        >
          <Button
            onPress={onClose}
            modifiers={[
              buttonStyle('glass'),
              controlSize('regular'),
              environment({ key: 'colorScheme', value: theme.dark ? 'dark' : 'light' }),
            ]}
          >
            <SwiftImage systemName="chevron.left" />
          </Button>
        </Host>
        <Text style={[TYPE.pageTitle, { color: theme.text }]}>Add income</Text>
        <View style={S.headerSpacer} />
      </View>

      {/* Amount */}
      <View style={S.amountWrap}>
        <View style={S.amountRow}>
          <Text style={[S.sign, { color: theme.textSec }]}>$</Text>
          <Text style={[S.amount, { color: canSave ? theme.text : theme.textTer }]}>{amt}</Text>
        </View>
      </View>

      {/* Source */}
      <View style={[S.fieldCard, { backgroundColor: theme.chipBg }]}>
        <View style={S.fieldRow}>
          <Text style={[TYPE.body, { color: theme.textSec }]}>From</Text>
          <TextInput
            value={source}
            onChangeText={setSource}
            placeholder="Paycheck, gift…"
            placeholderTextColor={theme.textTer}
            style={[S.fieldInput, { color: theme.text }]}
            returnKeyType="done"
          />
        </View>
      </View>

      <View style={S.spacer} />

      {/* Keypad */}
      <View style={S.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'].map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            style={({ pressed }) => [
              S.key,
              { backgroundColor: pressed ? theme.sep : theme.chipBg },
            ]}
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? 'Delete' : k === 'clear' ? 'Clear' : k}
          >
            {k === 'del' ? (
              <Icon name="backspace" size={20} color={theme.text} stroke={1.5} />
            ) : k === 'clear' ? (
              <Text style={[TYPE.body, { fontWeight: '600', color: theme.textSec }]}>Clear</Text>
            ) : (
              <Text style={[TYPE.headline, { fontWeight: '500', color: theme.text }]}>{k}</Text>
            )}
          </Pressable>
        ))}
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) }}>
        <SheetPrimaryButton label="Add income" onPress={save} theme={theme} disabled={!canSave} />
      </View>
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
  backBtnHost: { width: 44, height: 44 },
  headerSpacer: { width: 44 },
  amountWrap: { alignItems: 'center', paddingVertical: 24 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sign: { fontSize: 28, fontWeight: '500', lineHeight: 40, marginRight: 4 },
  amount: {
    fontSize: 60,
    fontWeight: '600',
    letterSpacing: -1.6,
    lineHeight: 66,
    fontVariant: ['tabular-nums'],
  },
  fieldCard: { marginHorizontal: 20, borderRadius: 14, overflow: 'hidden' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldInput: { ...TYPE.subsectionTitle, fontWeight: '500', textAlign: 'right', flex: 1, padding: 0 },
  spacer: { flex: 1, minHeight: 12 },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  key: {
    width: '30%',
    flexGrow: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
