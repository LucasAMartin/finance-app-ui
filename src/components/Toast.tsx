import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme';
import { TYPE } from '../typography';

// Tab-bar pill height (52 button + 2×8 padding) so the toast clears it.
const TAB_BAR_HEIGHT = 68;

interface ToastProps {
  theme: Theme;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  duration?: number;
}

/**
 * Small transient confirmation that sits just above the floating tab bar.
 * Holds the last message through its exit animation so the text doesn't blank
 * out as it slides away.
 */
export function Toast({
  theme,
  message,
  actionLabel = 'Undo',
  onAction,
  onDismiss,
  duration = 4000,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shown, setShown] = useState<string | null>(message);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (message) {
      setShown(message);
      Animated.timing(anim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(onDismiss, duration);
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setShown(null); });
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [message]);

  if (!shown) return null;

  const bottom = Math.max(insets.bottom, 16) + 8 + TAB_BAR_HEIGHT + 12;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  const handleAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onAction?.();
  };

  return (
    <Animated.View pointerEvents="box-none" style={[S.wrap, { bottom }]}>
      <Animated.View
        style={[
          S.pill,
          {
            backgroundColor: theme.surface,
            borderColor: theme.hairline,
            opacity: anim,
            transform: [{ translateY }],
            shadowOpacity: theme.dark ? 0.5 : 0.18,
          },
        ]}
      >
        <Text style={[TYPE.bodySmEm, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
          {shown}
        </Text>
        {onAction && (
          <Pressable
            onPress={handleAction}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>{actionLabel}</Text>
          </Pressable>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const S = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 40,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 440,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
  },
});
