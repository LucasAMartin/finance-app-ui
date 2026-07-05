import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeIOSStyleOnboardingProps = ViewProps & {
  tint?: string;
  hideBezels?: boolean;
  onComplete?: () => void;
};

const NativeIOSStyleOnboardingView = Platform.OS === 'ios'
  ? requireNativeView<NativeIOSStyleOnboardingProps>('GlassCard', 'NativeIOSStyleOnboardingView')
  : null;

export function NativeIOSStyleOnboarding({
  style,
  tint = '#007AFF',
  hideBezels = false,
  onComplete,
}: {
  style?: StyleProp<ViewStyle>;
  tint?: string;
  hideBezels?: boolean;
  onComplete?: () => void;
}) {
  if (!NativeIOSStyleOnboardingView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View style={[style, styles.transparentLayer]}>
      <Host colorScheme="dark" style={styles.host}>
        <NativeIOSStyleOnboardingView
          style={styles.nativeFill}
          tint={tint}
          hideBezels={hideBezels}
          onComplete={onComplete}
        />
      </Host>
    </View>
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
  fallback: {
    backgroundColor: '#000',
  },
});
