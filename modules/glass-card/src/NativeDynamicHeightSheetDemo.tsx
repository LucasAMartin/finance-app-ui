import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeDynamicHeightSheetViewProps = ViewProps & {
  presentationToken?: number;
  isDark?: boolean;
};

const NativeDynamicHeightSheetView = Platform.OS === 'ios'
  ? requireNativeView<NativeDynamicHeightSheetViewProps>('GlassCard', 'NativeDynamicHeightSheetView')
  : null;

export function NativeDynamicHeightSheetDemo({
  presentationToken,
  isDark,
}: {
  presentationToken: number;
  isDark: boolean;
}) {
  if (!NativeDynamicHeightSheetView) {
    return <View pointerEvents="none" style={styles.host} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      pointerEvents="none"
      style={styles.host}
    >
      <NativeDynamicHeightSheetView
        presentationToken={presentationToken}
        isDark={isDark}
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
