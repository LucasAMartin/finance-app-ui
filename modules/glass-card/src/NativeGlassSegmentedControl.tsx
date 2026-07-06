import React, { useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

export type NativeGlassSegmentedControlTab = {
  id: string;
  title: string;
};

type NativeGlassSegmentedControlViewProps = ViewProps & {
  tabsJson?: string;
  selectedId?: string;
  isDark?: boolean;
  onSelect?: (event: { nativeEvent: { id: string } }) => void;
};

const NativeGlassSegmentedControlView = Platform.OS === 'ios'
  ? requireNativeView<NativeGlassSegmentedControlViewProps>('GlassCard', 'NativeGlassSegmentedControlView')
  : null;

export const SUPPORTS_GS_CONTROL =
  Platform.OS === 'ios' && Number.parseFloat(String(Platform.Version)) >= 18.4;

export function NativeGlassSegmentedControl({
  tabs,
  selectedId,
  isDark,
  onSelect,
  style,
}: {
  tabs: NativeGlassSegmentedControlTab[];
  selectedId: string;
  isDark: boolean;
  onSelect: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tabsJson = useMemo(() => JSON.stringify(tabs), [tabs]);

  if (!SUPPORTS_GS_CONTROL || !NativeGlassSegmentedControlView) {
    return <View style={style} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      style={[styles.host, style]}
    >
      <NativeGlassSegmentedControlView
        tabsJson={tabsJson}
        selectedId={selectedId}
        isDark={isDark}
        onSelect={(event) => onSelect(event.nativeEvent.id)}
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    height: 58,
    overflow: 'hidden',
  },
});
