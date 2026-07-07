import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type PayEvent = { nativeEvent: { amount?: number } };
type DueDateEvent = { nativeEvent: { dueDateISO?: string } };

type NativeUpcomingPaymentSheetViewProps = ViewProps & {
  presentationToken?: number;
  payloadJson?: string;
  isDark?: boolean;
  onPay?: (event: PayEvent) => void;
  onDelete?: () => void;
  onDueDateChange?: (event: DueDateEvent) => void;
  onDismiss?: () => void;
};

const NativeUpcomingPaymentSheetView = Platform.OS === 'ios'
  ? requireNativeView<NativeUpcomingPaymentSheetViewProps>('GlassCard', 'NativeUpcomingPaymentSheetView')
  : null;

export interface NativeUpcomingPaymentSheetPayload {
  id: string;
  merchant: string;
  categoryLabel?: string;
  cadenceLabel: string;
  totalAmountText?: string;
  amount: number;
  editAmount: string;
  amountText: string;
  dueDateText: string;
  dueDateISO: string;
  canEdit: boolean;
  lockedOwnerName?: string;
  currencySymbol: string;
  fallbackSystemName: string;
  iconColor: string;
  iconBgColor: string;
  logoUrl?: string;
  logoBgColor?: string | null;
  surface: string;
  sheetBg: string;
  chipBg: string;
  text: string;
  textSec: string;
  textTer: string;
  sep: string;
  accent: string;
}

export function NativeUpcomingPaymentSheet({
  presentationToken,
  payload,
  isDark,
  onPay,
  onDelete,
  onDueDateChange,
  onDismiss,
}: {
  presentationToken: number;
  payload: NativeUpcomingPaymentSheetPayload | null;
  isDark: boolean;
  onPay: (amount: number) => void;
  onDelete: () => void;
  onDueDateChange: (dueDateISO: string) => void;
  onDismiss: () => void;
}) {
  if (!NativeUpcomingPaymentSheetView) {
    return <View pointerEvents="none" style={styles.host} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      pointerEvents="none"
      style={styles.host}
    >
      <NativeUpcomingPaymentSheetView
        presentationToken={presentationToken}
        payloadJson={payload ? JSON.stringify(payload) : ''}
        isDark={isDark}
        onPay={(event) => {
          const amount = event.nativeEvent.amount;
          if (typeof amount === 'number') onPay(amount);
        }}
        onDelete={onDelete}
        onDueDateChange={(event) => {
          const dueDateISO = event.nativeEvent.dueDateISO;
          if (typeof dueDateISO === 'string') onDueDateChange(dueDateISO);
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
