import React, { useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

export type NativeXStyleSideBarItem = {
  id: string;
  title: string;
  icon: string;
};

type NativeXStyleSideBarNativeProps = ViewProps & {
  itemsJson?: string;
  bottomItemsJson?: string;
  profileName?: string;
  profileImageUri?: string;
  isDark?: boolean;
  onNavigate?: (event: { nativeEvent: { id: string } }) => void;
  onProfilePress?: () => void;
};

const NativeXStyleSideBarView = Platform.OS === 'ios'
  ? requireNativeView<NativeXStyleSideBarNativeProps>('GlassCard', 'NativeXStyleSideBarView')
  : null;

export function NativeXStyleSideBar({
  items,
  bottomItems,
  profileName,
  profileImageUri,
  isDark,
  onNavigate,
  onProfilePress,
  style,
}: {
  items: NativeXStyleSideBarItem[];
  bottomItems: NativeXStyleSideBarItem[];
  profileName: string;
  profileImageUri?: string;
  isDark: boolean;
  onNavigate: (id: string) => void;
  onProfilePress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const itemsJson = useMemo(() => JSON.stringify(items), [items]);
  const bottomItemsJson = useMemo(() => JSON.stringify(bottomItems), [bottomItems]);

  if (!NativeXStyleSideBarView) {
    return <View style={style} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      style={[styles.host, style]}
    >
      <NativeXStyleSideBarView
        itemsJson={itemsJson}
        bottomItemsJson={bottomItemsJson}
        profileName={profileName}
        profileImageUri={profileImageUri}
        isDark={isDark}
        onNavigate={(event) => onNavigate(event.nativeEvent.id)}
        onProfilePress={onProfilePress}
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
