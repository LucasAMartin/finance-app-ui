import React, { useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';

const { height: SCREEN_H } = Dimensions.get('window');

// How far the wallpaper backdrop drifts up before it settles. The photo layer
// extends this far below the screen so the upward shift never reveals a gap;
// keep it modest so the cover-scale needed to fill that taller container only
// lightly zooms the image. Shared by every wallpaper screen so they move in sync.
export const BG_PARALLAX_MAX = SCREEN_H * 0.15;

// Wallpaper parallax: the backdrop drifts up at half the scroll speed for a
// short distance, then settles. Drive an Animated.View's translateY with this.
export function makeBgTranslateY(scrollY: Animated.Value) {
  return scrollY.interpolate({
    inputRange: [0, BG_PARALLAX_MAX * 2], // half pace: travels BG_PARALLAX_MAX over 2× the scroll
    outputRange: [0, -BG_PARALLAX_MAX],
    extrapolate: 'clamp',
  });
}

// Progressive header backdrop pattern used by wallpaper-style screens.
// The header stays transparent at the top so the hero/wallpaper reads
// cleanly, then a BlurView + hairline divider fades in as content
// scrolls underneath. Returns the scrollY animated value (drive the
// ScrollView with it) and the interpolations needed at the header and
// for the wallpaper parallax.
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
  const bgTranslateY = makeBgTranslateY(scrollY);
  return { scrollY, headerBgOpacity, iconScrolledOpacity, bgTranslateY };
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
