import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
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
  /** Destination screen color. */
  cardColor: string;
  /** Starting button/circle color, so the source itself grows into the screen. */
  sourceColor?: string;
  /**
   * Optional glyph (e.g. the "+"). It stays centered in the morphing source and
   * fades before the destination content appears.
   */
  sourceGlyph?: React.ReactNode;
  /** Destination content, rendered full-screen and revealed by the growing card. */
  children: React.ReactNode;
}

// Revolut-style container transform: one continuous object, with the card
// growing slowly at first while the source icon has room to bloom.
const OPEN_DURATION = 280;
const CLOSE_DURATION = 280;
const OPEN_EASE = Easing.linear;
const CLOSE_EASE = Easing.in(Easing.cubic);
const CONTENT_REVEAL_START = 0.44;
// Corner radius held large through the grow, squared off only at the very end.
const GROW_RADIUS = 36;

function clamp01(t: number) {
  'worklet';
  return Math.max(0, Math.min(1, t));
}

function easeOutQuad(t: number) {
  'worklet';
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

export function ContainerTransform({
  visible,
  source,
  onClosed,
  cardColor,
  sourceColor,
  sourceGlyph,
  children,
}: ContainerTransformProps) {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const progress = useSharedValue(0);
  // Kept mounted through the reverse morph; only unmounts once progress hits 0.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible && source) {
      progress.value = 0; // always originate at the button
      setMounted(true);
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

  // The growing/clipping card. A quick fade at the collapsed extreme keeps the
  // button-sized card from reading as a hard box at the start/end — it melts
  // into / out of the button.
  const cardStyle = useAnimatedStyle(() => {
    if (!source) return {};
    const p = progress.value;
    const fromColor = sourceColor ?? cardColor;
    const cx = source.x + source.width / 2;
    const cy = source.y + source.height / 2;
    const sizeT = Math.pow(p, 1.75);
    const centerT = Math.pow(p, 1.35);
    const cardWidth = source.width + (SCREEN_W - source.width) * sizeT;
    const cardHeight = source.height + (SCREEN_H - source.height) * sizeT;
    const cardCenterX = cx + (SCREEN_W / 2 - cx) * centerT;
    const cardCenterY = cy + (SCREEN_H / 2 - cy) * centerT;

    return {
      left: cardCenterX - cardWidth / 2,
      top: cardCenterY - cardHeight / 2,
      width: cardWidth,
      height: cardHeight,
      borderRadius: interpolate(sizeT, [0, 0.74, 0.96, 1], [source.radius, GROW_RADIUS, GROW_RADIUS, 0]),
      backgroundColor: interpolateColor(p, [0, 0.52, 1], [fromColor, cardColor, cardColor]),
      opacity: interpolate(p, [0, 0.04], [0, 1], Extrapolation.CLAMP),
    };
  });

  // The destination lays out once at full-screen size, then scales with the
  // growing card. That avoids reflow while making text and controls grow as part
  // of the same object, instead of appearing full-size inside a tiny mask.
  const contentStyle = useAnimatedStyle(() => {
    if (!source) return {};
    const p = progress.value;
    const cx = source.x + source.width / 2;
    const cy = source.y + source.height / 2;
    const sizeT = Math.pow(p, 1.75);
    const centerT = Math.pow(p, 1.35);
    const cardWidth = source.width + (SCREEN_W - source.width) * sizeT;
    const cardHeight = source.height + (SCREEN_H - source.height) * sizeT;
    const cardCenterX = cx + (SCREEN_W / 2 - cx) * centerT;
    const cardCenterY = cy + (SCREEN_H / 2 - cy) * centerT;
    const cardLeft = cardCenterX - cardWidth / 2;
    const cardTop = cardCenterY - cardHeight / 2;
    const scale = Math.max(cardWidth / SCREEN_W, cardHeight / SCREEN_H);
    const anchorX = cardLeft + cardWidth / 2;
    const anchorY = cardTop + cardHeight / 2;
    const visualLeft = cardWidth / 2 - anchorX * scale;
    const visualTop = cardHeight / 2 - anchorY * scale;
    const revealY = interpolate(p, [CONTENT_REVEAL_START, 0.92], [14, 0], Extrapolation.CLAMP);

    return {
      left: visualLeft - (SCREEN_W * (1 - scale)) / 2,
      top: visualTop - (SCREEN_H * (1 - scale)) / 2 + revealY,
      opacity: interpolate(p, [CONTENT_REVEAL_START, 0.78], [0, 1], Extrapolation.CLAMP),
      transform: [{ scale }],
    };
  });

  // The glyph rides the same continuous center motion as the card, but never
  // becomes a giant separate ring. It quietly disappears into the morphing shape.
  const glyphStyle = useAnimatedStyle(() => {
    if (!source) return {};
    const p = progress.value;
    const cx = source.x + source.width / 2;
    const cy = source.y + source.height / 2;
    const centerT = Math.pow(p, 1.35);
    const cardCenterX = cx + (SCREEN_W / 2 - cx) * centerT;
    const cardCenterY = cy + (SCREEN_H / 2 - cy) * centerT;
    return {
      opacity: interpolate(p, [0.12, 0.34], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: cardCenterX - cx },
        { translateY: cardCenterY - cy },
        { scale: 1 + 0.22 * easeOutQuad(p / 0.30) },
      ],
    };
  });

  // A scrim that dims (and visually pushes back) the screen behind the morph.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [0, 0.28], Extrapolation.CLAMP),
  }));

  if (!mounted || !source) return null;

  const collapsedScale = Math.max(source.width / SCREEN_W, source.height / SCREEN_H);
  const collapsedAnchorX = source.x + source.width / 2;
  const collapsedAnchorY = source.y + source.height / 2;
  const collapsedContentStyle = {
    left: source.width / 2 - collapsedAnchorX * collapsedScale - (SCREEN_W * (1 - collapsedScale)) / 2,
    top: source.height / 2 - collapsedAnchorY * collapsedScale - (SCREEN_H * (1 - collapsedScale)) / 2 + 14,
    opacity: 0,
    transform: [{ scale: collapsedScale }],
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, { opacity: 0 }, scrimStyle]}
      />
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: sourceColor ?? cardColor,
            left: source.x,
            top: source.y,
            width: source.width,
            height: source.height,
            borderRadius: source.radius,
            opacity: 0,
          },
          cardStyle,
        ]}
      >
        <Animated.View style={[{ width: SCREEN_W, height: SCREEN_H }, collapsedContentStyle, contentStyle]}>
          {children}
        </Animated.View>
      </Animated.View>
      {sourceGlyph ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glyph,
            { left: source.x, top: source.y, width: source.width, height: source.height },
            styles.glyphCenter,
            glyphStyle,
          ]}
        >
          {sourceGlyph}
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
  glyph: {
    position: 'absolute',
  },
  glyphCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
