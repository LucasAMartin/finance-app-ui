import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeCustomGlassTabBarNativeProps = ViewProps & {
  activeTab?: string;
  isDark?: boolean;
  usesExternalVoiceTrigger?: boolean;
  onTabSelect?: (event: { nativeEvent: { tabId: string } }) => void;
  onVoiceAction?: () => void;
};

const NativeCustomGlassTabBarView = Platform.OS === 'ios'
  ? requireNativeView<NativeCustomGlassTabBarNativeProps>('GlassCard', 'NativeCustomGlassTabBarView')
  : null;

export function NativeCustomGlassTabBar({
  activeTab,
  isDark,
  usesExternalVoiceTrigger = false,
  onTabSelect,
  onVoiceAction,
}: {
  activeTab: string;
  isDark: boolean;
  usesExternalVoiceTrigger?: boolean;
  onTabSelect: (tabId: string) => void;
  onVoiceAction: () => void;
}) {
  const { width } = useWindowDimensions();
  const barWidth = Math.max(280, Math.min(width - 40, 430));

  if (!NativeCustomGlassTabBarView) {
    return <View style={{ width: barWidth, height: 55 }} />;
  }

  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} ignoreSafeArea="all" style={{ width: barWidth, height: 55 }}>
      <NativeCustomGlassTabBarView
        activeTab={activeTab}
        isDark={isDark}
        usesExternalVoiceTrigger={usesExternalVoiceTrigger}
        onTabSelect={(event) => onTabSelect(event.nativeEvent.tabId)}
        onVoiceAction={onVoiceAction}
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}
