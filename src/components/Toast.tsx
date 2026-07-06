import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeLGToast } from '../../modules/glass-card/src/NativeLGToast';
import { Theme } from '../theme';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';

const TAB_BAR_BOTTOM_GAP = 8;
const TAB_BAR_HEIGHT = 55;
const TOAST_TAB_BAR_GAP = 12;

interface ToastProps {
  theme: Theme;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  duration?: number;
  symbol?: string;
}

export function Toast({
  theme,
  message,
  actionLabel = 'Undo',
  onAction,
  onDismiss,
  duration = 4000,
  symbol,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const [toastKey, setToastKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message) {
      setToastKey((key) => key + 1);
    }
  }, [message]);

  useEffect(() => {
    if (Platform.OS === 'ios') return;
    if (timer.current) clearTimeout(timer.current);
    if (message) {
      timer.current = setTimeout(onDismiss, duration);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [duration, message, onDismiss]);

  if (!message) return null;

  if (Platform.OS === 'ios') {
    const placementOffset = -(Math.max(insets.bottom, 16) + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + TOAST_TAB_BAR_GAP);

    return (
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <NativeLGToast
          toastKey={toastKey}
          title={message}
          symbol={symbol}
          actionTitle={onAction ? actionLabel : undefined}
          duration={duration / 1000}
          placementOffset={placementOffset}
          isDark={theme.dark}
          onAction={onAction}
          onDismiss={onDismiss}
        />
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        S.fallbackWrap,
        { bottom: Math.max(insets.bottom, 16) + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + TOAST_TAB_BAR_GAP },
      ]}
    >
      <View
        style={[
          S.fallbackPill,
          {
            backgroundColor: theme.surface,
            borderColor: theme.hairline,
            shadowOpacity: theme.dark ? 0.5 : 0.18,
          },
        ]}
      >
        <Text style={[TYPE.bodySmEm, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
          {message}
        </Text>
        {onAction && (
          <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
            <Text style={[TYPE.bodySmEm, { color: theme.accent.dot }]}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  fallbackWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 15,
    zIndex: 100,
  },
  fallbackPill: {
    minHeight: 50,
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
});
