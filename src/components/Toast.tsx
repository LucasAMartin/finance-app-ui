import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { Button, GlassEffectContainer, Host, RNHostView } from '@expo/ui/swift-ui';
import { buttonStyle, glassEffect } from '@expo/ui/swift-ui/modifiers';
import { SUPPORTS_GLASS, glassTintForTheme } from './GlassButton';
import { Theme } from '../theme';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';
import { SPACE } from '../spacing';

const SWIPE_DISMISS_DISTANCE = -44;
const SWIPE_DISMISS_VELOCITY = -400;

interface ToastProps {
  theme: Theme;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({
  theme,
  message,
  actionLabel = 'Undo',
  onAction,
  onDismiss,
  duration = 4000,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold the last message through the exit animation so text doesn't blank mid-slide.
  const [shown, setShown] = useState<string | null>(message);

  const enterProgress = useSharedValue(0);
  const dragY = useSharedValue(0);

  const clearTimer = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const animateOut = useCallback((onDone?: () => void) => {
    enterProgress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) {
        runOnJS(setShown)(null);
        if (onDone) runOnJS(onDone)();
      }
    });
  }, [enterProgress]);

  useEffect(() => {
    clearTimer();
    if (message) {
      setShown(message);
      dragY.value = 0;
      enterProgress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
      timer.current = setTimeout(onDismiss, duration);
    } else {
      animateOut();
    }
    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  // Called from the swipe gesture (UI thread) — commits and clears.
  const commitDismiss = useCallback(() => {
    clearTimer();
    onDismiss();
  }, [clearTimer, onDismiss]);

  const handleAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    clearTimer();
    onAction?.();
  }, [clearTimer, onAction]);

  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      'worklet';
      // Only track upward movement.
      dragY.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY < SWIPE_DISMISS_DISTANCE || e.velocityY < SWIPE_DISMISS_VELOCITY) {
        // Swipe far enough or fast enough — fly off and commit.
        dragY.value = withTiming(-160, { duration: 200 });
        enterProgress.value = withTiming(0, { duration: 200 }, (done) => {
          if (done) runOnJS(commitDismiss)();
        });
      } else {
        // Not far enough — spring back.
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const enterOffset = interpolate(enterProgress.value, [0, 1], [-20, 0], Extrapolation.CLAMP);
    const opacity = interpolate(enterProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    // Fade out progressively as the user drags up.
    const dragOpacity = interpolate(Math.abs(dragY.value), [0, 60], [1, 0.25], Extrapolation.CLAMP);
    return {
      opacity: opacity * dragOpacity,
      transform: [{ translateY: enterOffset + dragY.value }],
    };
  });

  if (!shown) return null;

  const top = insets.top + 8;
  const colorScheme = theme.dark ? 'dark' : 'light';

  const content = (
    <View style={S.inner}>
      <Text style={[TYPE.bodySmEm, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
        {shown}
      </Text>
      {onAction && (
        <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>{actionLabel}</Text>
      )}
    </View>
  );

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View
        style={[S.wrap, { top }, animatedStyle]}
        pointerEvents="box-none"
      >
        {SUPPORTS_GLASS ? (
          <Host matchContents ignoreSafeArea="all" colorScheme={colorScheme}>
            <GlassEffectContainer>
              <Button
                onPress={onAction ? handleAction : commitDismiss}
                modifiers={[
                  buttonStyle('plain'),
                  glassEffect({
                    glass: {
                      variant: 'regular',
                      interactive: true,
                      tint: glassTintForTheme(theme.dark),
                    },
                    shape: 'capsule',
                  }),
                ]}
              >
                <RNHostView matchContents>
                  {content}
                </RNHostView>
              </Button>
            </GlassEffectContainer>
          </Host>
        ) : (
          <View
            style={[
              S.pill,
              {
                backgroundColor: theme.surface,
                borderColor: theme.hairline,
                shadowOpacity: theme.dark ? 0.5 : 0.18,
              },
            ]}
          >
            {content}
          </View>
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

const S = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xl,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xl,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    maxWidth: 440,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
});
