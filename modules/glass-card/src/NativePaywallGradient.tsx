import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Host } from '@expo/ui';

type NativePaywallGradientProps = ViewProps;

const NativePaywallGradientView = Platform.OS === 'ios'
  ? requireNativeView<NativePaywallGradientProps>('GlassCard', 'NativePaywallGradientView')
  : null;

export function NativePaywallGradient({ style }: { style?: StyleProp<ViewStyle> }) {
  if (NativePaywallGradientView) {
    return (
      <View pointerEvents="none" style={[style, styles.transparentLayer]}>
        <Host ignoreSafeArea="all" colorScheme="dark" style={styles.host}>
          <NativePaywallGradientView style={styles.nativeFill} />
        </Host>
      </View>
    );
  }

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[
        '#052C62',
        '#16B7CB',
        '#7B40C8',
        '#A52E78',
        '#041019',
      ]}
      locations={[0, 0.26, 0.48, 0.66, 1]}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  host: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  nativeFill: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  transparentLayer: {
    backgroundColor: 'transparent',
  },
});
