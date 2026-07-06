import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeUserTutorialScreenProps = ViewProps & {
  onComplete?: () => void;
};

const NativeUserTutorialScreenView = Platform.OS === 'ios'
  ? requireNativeView<NativeUserTutorialScreenProps>('GlassCard', 'NativeUserTutorialScreenView')
  : null;

export function NativeUserTutorialScreen({
  style,
  onComplete,
}: {
  style?: StyleProp<ViewStyle>;
  onComplete?: () => void;
}) {
  if (!NativeUserTutorialScreenView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View style={[style, styles.root]}>
      <Host colorScheme="light" ignoreSafeArea="all" style={styles.host}>
        <NativeUserTutorialScreenView
          style={styles.nativeFill}
          onComplete={onComplete}
        />
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
