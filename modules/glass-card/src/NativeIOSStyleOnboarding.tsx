import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeIOSStyleOnboardingProps = ViewProps & {
  tint?: string;
  hideBezels?: boolean;
  initialName?: string;
  profileImageDataUri?: string;
  onComplete?: () => void;
  onNameChange?: (event: { nativeEvent: { name?: string } }) => void;
  onProfileImagePress?: () => void;
};

const NativeIOSStyleOnboardingView = Platform.OS === 'ios'
  ? requireNativeView<NativeIOSStyleOnboardingProps>('GlassCard', 'NativeIOSStyleOnboardingView')
  : null;

export function NativeIOSStyleOnboarding({
  style,
  tint = '#007AFF',
  hideBezels = false,
  initialName = '',
  profileImageDataUri = '',
  onComplete,
  onNameChange,
  onProfileImagePress,
}: {
  style?: StyleProp<ViewStyle>;
  tint?: string;
  hideBezels?: boolean;
  initialName?: string;
  profileImageDataUri?: string;
  onComplete?: () => void;
  onNameChange?: (name: string) => void;
  onProfileImagePress?: () => void;
}) {
  if (!NativeIOSStyleOnboardingView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View style={[style, styles.transparentLayer]}>
      <Host colorScheme="light" ignoreSafeArea="keyboard" style={styles.host}>
        <NativeIOSStyleOnboardingView
          style={styles.nativeFill}
          tint={tint}
          hideBezels={hideBezels}
          initialName={initialName}
          profileImageDataUri={profileImageDataUri}
          onComplete={onComplete}
          onNameChange={(event) => onNameChange?.(event.nativeEvent.name ?? '')}
          onProfileImagePress={onProfileImagePress}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    backgroundColor: '#fff',
    flex: 1,
  },
  nativeFill: {
    backgroundColor: '#fff',
    flex: 1,
  },
  transparentLayer: {
    backgroundColor: '#fff',
  },
  fallback: {
    backgroundColor: '#fff',
  },
});
