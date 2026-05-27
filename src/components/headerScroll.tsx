import React, { useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';

// Progressive header backdrop pattern used by wallpaper-style screens.
// The header stays transparent at the top so the hero/wallpaper reads
// cleanly, then a BlurView + hairline divider fades in as content
// scrolls underneath. Returns the scrollY animated value (drive the
// ScrollView with it) and the two interpolations needed at the header.
export function useHeaderScroll(threshold = 80) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, threshold],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Symmetric with headerBgOpacity — used to crossfade icon/title color
  // from the wallpaper palette to the on-card palette.
  const iconScrolledOpacity = headerBgOpacity;
  return { scrollY, headerBgOpacity, iconScrolledOpacity };
}

// Two-layer icon that crossfades between two colors as the header
// backdrop fades in. Press handling stays on the wrapper (parent
// Pressable). In dark mode both colors typically match — slight overdraw,
// no flicker.
export function HeaderIcon({
  name, size = 22, stroke = 1.7,
  wallpaperColor, scrolledColor, scrolledOpacity,
}: {
  name: string;
  size?: number;
  stroke?: number;
  wallpaperColor: string;
  scrolledColor: string;
  scrolledOpacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={StyleSheet.absoluteFillObject}>
        <Icon name={name} size={size} color={wallpaperColor} stroke={stroke} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: scrolledOpacity }]}>
        <Icon name={name} size={size} color={scrolledColor} stroke={stroke} />
      </Animated.View>
    </View>
  );
}
