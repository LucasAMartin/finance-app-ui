import React from 'react';
import { Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeSkeletonNativeProps = {
  cornerRadius?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const NativeSkeletonView = Platform.OS === 'ios'
  ? requireNativeView<NativeSkeletonNativeProps>('GlassCard', 'NativeSkeletonView')
  : null;

export function NativeSkeleton({
  width,
  height,
  radius,
  color,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (!NativeSkeletonView) {
    return <View style={[{ width, height, borderRadius: radius, backgroundColor: color }, style]} />;
  }

  return (
    <Host
      colorScheme="light"
      ignoreSafeArea="all"
      style={[{ width, height }, style]}
    >
      <NativeSkeletonView
        cornerRadius={radius}
        color={color}
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}
