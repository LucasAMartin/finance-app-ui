import React from 'react';
import { Animated, Platform, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { NativeSkeleton } from '../../modules/glass-card/src/NativeSkeleton';

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  onMedia?: boolean;
}

// Single shared pulse driver — every Skeleton interpolates from this one
// Animated.Value, so 25+ skeletons on a loading home screen share one timer
// instead of starting 25 independent loops.
const sharedPulse = new Animated.Value(0);
Animated.loop(
  Animated.sequence([
    Animated.timing(sharedPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
    Animated.timing(sharedPulse, { toValue: 0, duration: 850, useNativeDriver: true }),
  ]),
).start();

// shadcn-style skeleton: a muted, softly-pulsing block. Compose these to mirror the
// size and position of whatever content is loading.
export function Skeleton({ width = '100%', height = 14, radius = 8, style, onMedia }: Props) {
  const { theme } = useTheme();

  const opacity = sharedPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] });

  const bg = onMedia
    ? theme.dark ? '#34333d' : '#d8d7de'
    : theme.dark
      ? '#2f3540'
      : '#e8e9ec';

  if (Platform.OS === 'ios') {
    return (
      <NativeSkeleton
        width={width}
        height={height}
        radius={radius}
        color={bg}
        style={style}
      />
    );
  }

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: bg,
          opacity,
        },
        style,
      ]}
    />
  );
}
