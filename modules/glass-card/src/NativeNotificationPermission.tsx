import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeNotificationPermissionNativeProps = ViewProps & {
  onPermissionChange?: (event: { nativeEvent: { isApproved?: boolean } }) => void;
  onPrimaryButtonTap?: () => void;
  onSecondaryButtonTap?: () => void;
};

const NativeNotificationPermissionView = Platform.OS === 'ios'
  ? requireNativeView<NativeNotificationPermissionNativeProps>('GlassCard', 'NativeNotificationPermissionView')
  : null;

export function NativeNotificationPermission({
  style,
  onPermissionChange,
  onPrimaryButtonTap,
  onSecondaryButtonTap,
}: {
  style?: StyleProp<ViewStyle>;
  onPermissionChange?: (isApproved: boolean) => void;
  onPrimaryButtonTap?: () => void;
  onSecondaryButtonTap?: () => void;
}) {
  if (!NativeNotificationPermissionView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View collapsable={false} style={[style, styles.root]}>
      <Host colorScheme="light" ignoreSafeArea="all" style={styles.host}>
        <NativeNotificationPermissionView
          style={styles.nativeFill}
          onPermissionChange={(event) => {
            onPermissionChange?.(event.nativeEvent.isApproved === true);
          }}
          onPrimaryButtonTap={onPrimaryButtonTap}
          onSecondaryButtonTap={onSecondaryButtonTap}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#fff',
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
