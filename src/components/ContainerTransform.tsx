import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// The on-screen frame of the button the morph grows out of. Captured with
// measureInWindow at press time so the card starts exactly where the user tapped.
export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

interface ContainerTransformProps {
  /** Drive open (true) / dismiss (false). The reverse morph plays on false. */
  visible: boolean;
  /** Button frame to grow from / shrink back into. */
  source: SourceRect | null;
  /** Fired after the reverse morph finishes — safe place to clear the source. */
  onClosed?: () => void;
  /** Morphing card color — match the source button so it reads as the same object. */
  cardColor: ColorValue;
  /**
   * The button's own icon, re-rendered inside the card so it visibly dissolves
   * into the destination as the card grows — this is what makes it read as the
   * button itself becoming the screen, not a blank panel opening.
   */
  sourceIcon?: React.ReactNode;
  /**
   * Optional glyph (e.g. the "+") layered on top of sourceIcon. It shares the
   * grow/travel transform but fades out faster, so it dissolves early while the
   * plain shape keeps growing into the screen.
   */
  sourceGlyph?: React.ReactNode;
  /** Destination content, rendered full-screen and revealed by the growing card. */
  children: React.ReactNode;
}

// Fast, like Revolut — the whole morph is well under a fifth of a second. Riding
// one curve on the UI thread is what keeps it smooth at this speed.
const OPEN_DURATION = 480;
const CLOSE_DURATION = 320;
const OPEN_EASE = Easing.out(Easing.cubic);
const CLOSE_EASE = Easing.in(Easing.cubic);
// Corner radius held large through the grow, squared off only at the very end.
const GROW_RADIUS = 36;

export function ContainerTransform({
  visible,
  source,
  onClosed,
  cardColor,
  sourceIcon,
  sourceGlyph,
  children,
}: ContainerTransformProps) {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const progress = useSharedValue(0);
  // Kept mounted through the reverse morph; only unmounts once progress hits 0.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible && source) {
      setMounted(true);
      progress.value = 0; // always originate at the button
      progress.value = withTiming(1, { duration: OPEN_DURATION, easing: OPEN_EASE });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: CLOSE_DURATION, easing: CLOSE_EASE }, (finished) => {
        'worklet';
        if (finished) {
          runOnJS(setMounted)(false);
          if (onClosed) runOnJS(onClosed)();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, source]);

  // The growing/clipping card. Solid color so no text is ever scaled. A quick
  // fade at the collapsed extreme keeps the button-sized card from reading as a
  // hard box at the start/end — it melts into / out of the button.
  const cardStyle = useAnimatedStyle(() => {
    if (!source) return {};
    const p = progress.value;
    // Card barely moves for the first 45% — the icon phase owns that time.
    // Then it expands rapidly to fill the screen in the back half.
    return {
      left:   interpolate(p, [0, 0.45, 1], [source.x, source.x * 0.7, 0]),
      top:    interpolate(p, [0, 0.45, 1], [source.y, source.y * 0.85, 0]),
      width:  interpolate(p, [0, 0.45, 1], [source.width,  source.width  + (SCREEN_W - source.width)  * 0.12, SCREEN_W]),
      height: interpolate(p, [0, 0.45, 1], [source.height, source.height + (SCREEN_H - source.height) * 0.12, SCREEN_H]),
      borderRadius: interpolate(p, [0, 0.85, 1], [source.radius, GROW_RADIUS, 0]),
      opacity: interpolate(p, [0, 0.06], [0, 1], Extrapolation.CLAMP),
    };
  });

  // The destination, held at full screen size the entire time. Its offset counters
  // the card's moving origin so it stays pinned to screen coordinates while the
  // card clips it — that's why nothing reflows. Revealed late (after ~50%) so the
  // growing icon owns the first half of the morph, like Revolut.
  // Content waits until the icon phase is mostly done.
  const contentStyle = useAnimatedStyle(() => {
    if (!source) return {};
    const p = progress.value;
    return {
      left: interpolate(p, [0, 1], [-source.x, 0]),
      top: interpolate(p, [0, 1], [-source.y, 0]),
      opacity: interpolate(p, [0.65, 0.92], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(p, [0.60, 0.95], [16, 0], Extrapolation.CLAMP) }],
    };
  });

  // Icon grows and travels for most of the timeline, dissolving in the back quarter.
  const iconStyle = useAnimatedStyle(() => {
    if (!source) return {};
    const p = progress.value;
    const cx = source.x + source.width / 2;
    const cy = source.y + source.height / 2;
    const dx = SCREEN_W / 2 - cx;
    const dy = SCREEN_H * 0.44 - cy;
    const peakScale = (SCREEN_W / 1.5) / source.width;
    return {
      opacity: interpolate(p, [0.55, 0.88], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(p, [0, 0.88], [0, dx], Extrapolation.CLAMP) },
        { translateY: interpolate(p, [0, 0.88], [0, dy], Extrapolation.CLAMP) },
        { scale:      interpolate(p, [0, 0.88], [1, peakScale], Extrapolation.CLAMP) },
      ],
    };
  });

  // Glyph fades out early so the "+" is gone while the circle is still growing.
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.05, 0.50], [1, 0], Extrapolation.CLAMP),
  }));

  // A scrim that dims (and visually pushes back) the screen behind the morph.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [0, 0.4], Extrapolation.CLAMP),
  }));

  if (!mounted || !source) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
      />
      <Animated.View style={[styles.card, { backgroundColor: cardColor }, cardStyle]}>
        <Animated.View style={[{ width: SCREEN_W, height: SCREEN_H }, contentStyle]}>
          {children}
        </Animated.View>
      </Animated.View>
      {sourceIcon ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.icon,
            { left: source.x, top: source.y, width: source.width, height: source.height },
            iconStyle,
          ]}
        >
          {sourceIcon}
          {sourceGlyph ? (
            <Animated.View style={[StyleSheet.absoluteFill, styles.glyphCenter, glyphStyle]}>
              {sourceGlyph}
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 80, // above TabBar, below the drawer
  },
  scrim: {
    backgroundColor: '#000',
  },
  card: {
    position: 'absolute',
    overflow: 'hidden',
  },
  icon: {
    // The source replica (passed via sourceIcon) fills this box, which is sized
    // and positioned to the button's frame — so the whole button morphs.
    position: 'absolute',
  },
  glyphCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
