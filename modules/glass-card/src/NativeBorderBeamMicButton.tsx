import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';
import type { SFSymbol } from 'sf-symbols-typescript';

type NativeBorderBeamMicButtonNativeProps = ViewProps & {
  isDark?: boolean;
  systemName?: SFSymbol | string;
  size?: number;
  iconSize?: number;
  accessibilityLabelText?: string;
  onMicPress?: () => void;
};

const NativeBorderBeamMicButtonView = Platform.OS === 'ios'
  ? requireNativeView<NativeBorderBeamMicButtonNativeProps>('GlassCard', 'NativeBorderBeamMicButtonView')
  : null;

export function NativeBorderBeamMicButton({
  isDark,
  systemName = 'mic.fill',
  size = 88,
  iconSize = 32,
  accessibilityLabel,
  onPress,
}: {
  isDark: boolean;
  systemName?: SFSymbol | string;
  size?: number;
  iconSize?: number;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  if (!NativeBorderBeamMicButtonView) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} ignoreSafeArea="all" style={{ width: size, height: size }}>
      <NativeBorderBeamMicButtonView
        isDark={isDark}
        systemName={systemName}
        size={size}
        iconSize={iconSize}
        accessibilityLabelText={accessibilityLabel}
        onMicPress={onPress}
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}
