import React, { useRef, memo } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { Theme } from '../theme';
import { TYPE } from '../typography';

// A custom numeric entry pad that stands in for the system decimal keyboard.
// It's stateless: it only emits the key that was pressed (`onKey`). The owner
// applies it to the live value via `applyKeypadKey`, so the pad never re-renders
// while typing — keeping entry instant.

export type KeypadKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | 'back';

// Mutates a raw amount string (no `$`, no thousands separators). Keeps the value
// inside the same shape parseAmountDraft accepts: digits, one dot, ≤2 decimals.
export function applyKeypadKey(value: string, key: KeypadKey): string {
  if (key === 'back') return value.slice(0, -1);
  if (key === '.') {
    if (value.includes('.')) return value;
    return value === '' ? '0.' : `${value}.`;
  }
  // A lone leading zero is replaced by the next digit ("0" → "5"), never "05".
  if (value === '0') return key;
  const next = `${value}${key}`;
  return /^\d*\.?\d{0,2}$/.test(next) ? next : value;
}

const KEYS: { key: KeypadKey; label?: string; icon?: string }[] = [
  { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' },
  { key: '4', label: '4' }, { key: '5', label: '5' }, { key: '6', label: '6' },
  { key: '7', label: '7' }, { key: '8', label: '8' }, { key: '9', label: '9' },
  { key: '.', label: '.' }, { key: '0', label: '0' }, { key: 'back', icon: 'backspace' },
];

const KeypadButton = memo(function KeypadButton({ item, circleColor, textColor, onKey }: {
  item: { key: KeypadKey; label?: string; icon?: string };
  circleColor: string;
  textColor: string;
  onKey: (key: KeypadKey) => void;
}) {
  // One-shot pop: a quick fade/scale on the circle plus a subtle pop on the
  // glyph itself, then both settle back out.
  const anim = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 50, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
    onKey(item.key);
  };

  const circleOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const circleScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const glyphScale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <Pressable
      // Fire on finger-down (not release) so entry feels instant, like a keyboard.
      onPressIn={handlePress}
      style={styles.key}
      hitSlop={2}
      accessibilityRole="button"
      accessibilityLabel={item.key === 'back' ? 'Delete' : item.key === '.' ? 'Decimal point' : item.label}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.keyCircle,
          { backgroundColor: circleColor, opacity: circleOpacity, transform: [{ scale: circleScale }] },
        ]}
      />
      <Animated.View pointerEvents="none" style={{ transform: [{ scale: glyphScale }] }}>
        {item.icon
          ? <Icon name={item.icon} size={26} color={textColor} stroke={1.7} />
          : <Text allowFontScaling={false} style={[styles.keyLabel, { color: textColor }]}>{item.label}</Text>}
      </Animated.View>
    </Pressable>
  );
});

export const NumericKeypad = memo(function NumericKeypad({ onKey, theme }: {
  onKey: (key: KeypadKey) => void;
  theme: Theme;
}) {
  const circleColor = theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(11,13,16,0.08)';
  return (
    <View style={styles.grid}>
      {KEYS.map(item => (
        <KeypadButton
          key={item.key}
          item={item}
          circleColor={circleColor}
          textColor={theme.text}
          onKey={onKey}
        />
      ))}
    </View>
  );
});

const CIRCLE = 56;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  key: {
    width: '33.333%',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyCircle: {
    position: 'absolute',
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
  },
  keyLabel: {
    ...TYPE.pageTitle,
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 34,
  },
});
