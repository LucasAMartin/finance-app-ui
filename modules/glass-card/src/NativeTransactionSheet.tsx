import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type SaveEvent = {
  nativeEvent: {
    id?: string;
    amount?: number;
    categoryId?: string;
    merchant?: string;
    note?: string;
    occurredAtISO?: string;
  };
};

type DeleteEvent = { nativeEvent: { id?: string } };

type NativeTransactionSheetViewProps = ViewProps & {
  presentationToken?: number;
  payloadJson?: string;
  isDark?: boolean;
  onSave?: (event: SaveEvent) => void;
  onDelete?: (event: DeleteEvent) => void;
  onDismiss?: () => void;
};

const NativeTransactionSheetView = Platform.OS === 'ios'
  ? requireNativeView<NativeTransactionSheetViewProps>('GlassCard', 'NativeTransactionSheetView')
  : null;

export interface NativeTransactionSheetCategory {
  id: string;
  label: string;
  group: 'needs' | 'wants' | 'savings';
}

export interface NativeTransactionSheetPayload {
  id: string;
  title: string;
  merchant: string;
  note: string;
  amount: number;
  amountDraft: string;
  occurredAtISO: string;
  metaLine: string;
  canEdit: boolean;
  lockedOwnerName?: string;
  currencySymbol: string;
  categoryId: string;
  categoryLabel: string;
  categorySpendText: string;
  categoryBudgetText: string;
  categoryProgress: number;
  categoryColor: string;
  fallbackSystemName: string;
  iconColor: string;
  iconBgColor: string;
  logoUrl?: string;
  logoBgColor?: string | null;
  categories: NativeTransactionSheetCategory[];
  surface: string;
  sheetBg: string;
  chipBg: string;
  text: string;
  textSec: string;
  textTer: string;
  sep: string;
  hairline: string;
  accent: string;
}

export function NativeTransactionSheet({
  presentationToken,
  payload,
  isDark,
  onSave,
  onDelete,
  onDismiss,
}: {
  presentationToken: number;
  payload: NativeTransactionSheetPayload | null;
  isDark: boolean;
  onSave: (patch: {
    id: string;
    amount: number;
    categoryId: string;
    merchant: string;
    note: string;
    occurredAtISO: string;
  }) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
}) {
  if (!NativeTransactionSheetView) {
    return <View pointerEvents="none" style={styles.host} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      pointerEvents="none"
      style={styles.host}
    >
      <NativeTransactionSheetView
        presentationToken={presentationToken}
        payloadJson={payload ? JSON.stringify(payload) : ''}
        isDark={isDark}
        onSave={(event) => {
          const { id, amount, categoryId, merchant, note, occurredAtISO } = event.nativeEvent;
          if (
            typeof id === 'string'
            && typeof amount === 'number'
            && typeof categoryId === 'string'
            && typeof merchant === 'string'
            && typeof note === 'string'
            && typeof occurredAtISO === 'string'
          ) {
            onSave({ id, amount, categoryId, merchant, note, occurredAtISO });
          }
        }}
        onDelete={(event) => {
          const id = event.nativeEvent.id;
          if (typeof id === 'string') onDelete(id);
        }}
        onDismiss={onDismiss}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 1,
    height: 1,
    left: 0,
    top: 0,
  },
});
