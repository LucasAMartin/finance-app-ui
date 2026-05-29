import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

const tokenize = (s: string) => s.split(/(\s+)/).filter(t => t.length > 0);
const isSpace = (t: string) => /^\s+$/.test(t);

interface Props {
  text: string;
  /** Resting color of the text. */
  baseColor: string;
  /** Color of the bright band that sweeps across. */
  highlightColor: string;
  textStyle?: TextStyle;
  containerStyle?: ViewStyle;
  /** Per-word fade/rise/blur duration. */
  wordDuration?: number;
  /** Stagger between words that arrive in the same batch. */
  wordStagger?: number;
  /** Shimmer sweep duration. */
  shimmerDuration?: number;
  /** Whether the highlight band sweeps across. Off = word fade only. */
  shimmer?: boolean;
}

/**
 * Live dictation text:
 *   • each new word fades + rises + de-blurs into place
 *   • a soft highlight band shimmers across the full sentence on a loop
 * The base layer and the shimmer mask render identical word-by-word layouts
 * so they stay aligned frame-for-frame as words animate in.
 */
export function DictationText({
  text,
  baseColor,
  highlightColor,
  textStyle,
  containerStyle,
  wordDuration = 420,
  wordStagger = 35,
  shimmerDuration = 1800,
  shimmer: shimmerEnabled = true,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (size.w === 0 || !shimmerEnabled) return;
    shimmer.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: shimmerDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [size.w, shimmerDuration, shimmerEnabled]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  if (!text) return null;

  const sweepWidth = Math.max(size.w * 0.55, 120);
  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-sweepWidth, size.w + sweepWidth],
  });

  return (
    <View onLayout={onLayout} style={containerStyle}>
      {/* Base layer — words rendered at baseColor */}
      <AnimatedWords
        text={text}
        color={baseColor}
        textStyle={textStyle}
        wordDuration={wordDuration}
        wordStagger={wordStagger}
      />

      {/* Shimmer overlay — same word layout used as a mask, gradient as content */}
      {shimmerEnabled && size.w > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <View style={{ backgroundColor: 'transparent' }}>
                <AnimatedWords
                  text={text}
                  color="#000"
                  textStyle={textStyle}
                  wordDuration={wordDuration}
                  wordStagger={wordStagger}
                />
              </View>
            }
          >
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: sweepWidth,
                transform: [{ translateX }],
              }}
            >
              <LinearGradient
                colors={['transparent', highlightColor, 'transparent']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </MaskedView>
        </View>
      )}
    </View>
  );
}

function AnimatedWords({
  text,
  color,
  textStyle,
  wordDuration,
  wordStagger,
}: {
  text: string;
  color: string;
  textStyle?: TextStyle;
  wordDuration: number;
  wordStagger: number;
}) {
  const tokens = tokenize(text);
  // Anim values keyed by `${index}|${token}` so a stable position keeps its
  // value across renders; tokens past the common prefix get fresh animations.
  const animsRef = useRef<Map<string, Animated.Value>>(new Map());
  const prevTokensRef = useRef<string[]>([]);

  const keys = tokens.map((tok, i) => `${i}|${tok}`);
  keys.forEach((k, i) => {
    if (!animsRef.current.has(k)) {
      animsRef.current.set(k, new Animated.Value(isSpace(tokens[i]) ? 1 : 0));
    }
  });

  useEffect(() => {
    const prev = prevTokensRef.current;
    let common = 0;
    while (common < prev.length && common < tokens.length && prev[common] === tokens[common]) {
      common++;
    }

    const anims: Animated.CompositeAnimation[] = [];
    for (let i = common; i < tokens.length; i++) {
      const tok = tokens[i];
      if (isSpace(tok)) continue;
      const val = animsRef.current.get(`${i}|${tok}`);
      if (!val) continue;
      val.setValue(0);
      anims.push(
        Animated.timing(val, {
          toValue: 1,
          duration: wordDuration,
          delay: (i - common) * wordStagger,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // textShadowRadius isn't native-driver compatible
        })
      );
    }
    if (anims.length) Animated.parallel(anims).start();

    const valid = new Set(keys);
    for (const k of animsRef.current.keys()) {
      if (!valid.has(k)) animsRef.current.delete(k);
    }

    prevTokensRef.current = tokens.slice();
  }, [text]);

  return (
    <View style={S.row}>
      {tokens.map((tok, i) => {
        if (isSpace(tok)) {
          return (
            <Text key={`s-${i}`} style={[textStyle, { color }]}>
              {tok}
            </Text>
          );
        }
        const anim = animsRef.current.get(`${i}|${tok}`)!;
        const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
        const shadowRadius = anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
        return (
          <Animated.Text
            key={`w-${i}-${tok}`}
            style={[
              textStyle,
              {
                color,
                opacity: anim,
                textShadowColor: color,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: shadowRadius,
                transform: [{ translateY }],
              },
            ]}
          >
            {tok}
          </Animated.Text>
        );
      })}
    </View>
  );
}

const S = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
