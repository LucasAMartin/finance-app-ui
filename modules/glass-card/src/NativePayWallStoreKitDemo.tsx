import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativePayWallStoreKitDemoNativeProps = ViewProps;

const NativePayWallStoreKitDemoView = Platform.OS === 'ios'
  ? requireNativeView<NativePayWallStoreKitDemoNativeProps>('GlassCard', 'NativePayWallStoreKitDemoView')
  : null;

export function NativePayWallStoreKitDemo({ style }: { style?: StyleProp<ViewStyle> }) {
  if (!NativePayWallStoreKitDemoView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View collapsable={false} style={[style, styles.root]}>
      <Host colorScheme="dark" ignoreSafeArea="all" style={styles.host}>
        <NativePayWallStoreKitDemoView style={styles.nativeFill} />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#000',
  },
  host: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  nativeFill: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  root: {
    backgroundColor: 'transparent',
  },
});
