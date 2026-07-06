import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { Host } from '@expo/ui';
import { requireNativeView } from 'expo';

type NativeLGToastNativeProps = ViewProps & {
  toastKey?: number;
  title?: string;
  symbol?: string;
  actionTitle?: string;
  duration?: number;
  placementOffset?: number;
  isDark?: boolean;
  onAction?: () => void;
  onDismiss?: () => void;
};

const NativeLGToastView = Platform.OS === 'ios'
  ? requireNativeView<NativeLGToastNativeProps>('GlassCard', 'NativeLGToastView')
  : null;

export function NativeLGToast({
  toastKey,
  title,
  symbol,
  actionTitle,
  duration,
  placementOffset,
  isDark,
  onAction,
  onDismiss,
}: {
  toastKey: number;
  title: string;
  symbol?: string;
  actionTitle?: string;
  duration: number;
  placementOffset: number;
  isDark: boolean;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  if (!NativeLGToastView) {
    return <View pointerEvents="none" style={StyleSheet.absoluteFill} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      pointerEvents="box-none"
      style={styles.host}
    >
      <NativeLGToastView
        toastKey={toastKey}
        title={title}
        symbol={symbol}
        actionTitle={actionTitle}
        duration={duration}
        placementOffset={placementOffset}
        isDark={isDark}
        onAction={onAction}
        onDismiss={onDismiss}
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 240,
  },
});
