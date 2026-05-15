import React, { useRef, useEffect } from 'react';
import { Animated, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { useTheme } from '../ThemeProvider';

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// shadcn-style skeleton: a muted, softly-pulsing block. Compose these to mirror the
// size and position of whatever content is loading.
export function Skeleton({ width = '100%', height = 14, radius = 8, style }: Props) {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.dark ? 'rgba(173,189,222,0.14)' : 'rgba(14,14,16,0.07)',
          opacity,
        },
        style,
      ]}
    />
  );
}
