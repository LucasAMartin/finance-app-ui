import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { Host } from '@expo/ui';
import { requireNativeView } from 'expo';

type NativeAnimatedKeyPadViewProps = ViewProps;

const NativeAnimatedKeyPadView = Platform.OS === 'ios'
  ? requireNativeView<NativeAnimatedKeyPadViewProps>('AnimatedKeyPad', 'NativeAnimatedKeyPadView')
  : null;

export function NativeAnimatedKeyPad({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  if (!NativeAnimatedKeyPadView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View style={[style, styles.root]}>
      <Host colorScheme="dark" ignoreSafeArea="all" style={styles.host}>
        <NativeAnimatedKeyPadView style={styles.nativeFill} />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#000',
  },
  host: {
    backgroundColor: '#000',
    flex: 1,
  },
  nativeFill: {
    backgroundColor: '#000',
    flex: 1,
  },
  root: {
    backgroundColor: '#000',
  },
});
