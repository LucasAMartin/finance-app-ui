import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { MEDIA } from '../wallpaperPalette';

interface Props {
  dark: boolean;
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// A frosted-glass bento tile: the app's signature SectionCard surface, sized by
// the caller (full / half / wide) through `style`, with a subtle press-scale
// when interactive. One blur layer per tile — never nest a BentoTile inside a
// BentoTile (the Frosted Glass Rule in DESIGN.md).
export function BentoTile({
  dark,
  children,
  onPress,
  style,
  accessibilityLabel,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const borderColor = dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';

  const animateTo = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();

  const body = (
    <BlurView
      intensity={dark ? 70 : 100}
      tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
      style={styles.blur}
    >
      <View style={[styles.inner, { borderColor }]}>{children}</View>
    </BlurView>
  );

  if (!onPress) {
    return <View style={[styles.tile, style]}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animateTo(0.97)}
      onPressOut={() => animateTo(1)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.tile, style]}
    >
      <Animated.View style={[styles.fill, { transform: [{ scale }] }]}>
        {body}
      </Animated.View>
    </Pressable>
  );
}

const RADIUS = 24;
const styles = StyleSheet.create({
  // borderCurve 'continuous' = iOS squircle corners, so tiles read as native
  // system surfaces rather than web rounded rectangles.
  tile: { borderRadius: RADIUS, borderCurve: 'continuous' },
  fill: { flex: 1 },
  blur: {
    flex: 1,
    borderRadius: RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    borderRadius: RADIUS,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 16,
  },
});
