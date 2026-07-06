import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { Host } from '@expo/ui';
import { requireNativeView } from 'expo';

type NativeIntroLoginNamePageViewProps = ViewProps & {
  initialName?: string;
  profileImageDataUri?: string;
  onNameChange?: (event: { nativeEvent: { name?: string } }) => void;
};

const NativeIntroLoginNamePageView = Platform.OS === 'ios'
  ? requireNativeView<NativeIntroLoginNamePageViewProps>('IntroLogin', 'NativeIntroLoginNamePageView')
  : null;

export function NativeIntroLoginNamePage({
  style,
  initialName = '',
  profileImageDataUri = '',
  onNameChange,
}: {
  style?: StyleProp<ViewStyle>;
  initialName?: string;
  profileImageDataUri?: string;
  onNameChange?: (name: string) => void;
}) {
  if (!NativeIntroLoginNamePageView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View style={[style, styles.root]}>
      <Host colorScheme="light" ignoreSafeArea="keyboard" style={styles.host}>
        <NativeIntroLoginNamePageView
          style={styles.nativeFill}
          initialName={initialName}
          profileImageDataUri={profileImageDataUri}
          onNameChange={(event) => onNameChange?.(event.nativeEvent.name ?? '')}
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
    backgroundColor: '#fff',
    flex: 1,
  },
  nativeFill: {
    backgroundColor: '#fff',
    flex: 1,
  },
  root: {
    backgroundColor: '#fff',
  },
});
