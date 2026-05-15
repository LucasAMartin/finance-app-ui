import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Icon } from './Icon';

interface Props {
  size?: number;
  iconSize?: number;
}

// Naked toggle — no background, no border. Sun rotates / scales into a moon and back.
export function ThemeToggle({ size = 40, iconSize = 22 }: Props) {
  const { theme, dark, toggleDark } = useTheme();
  const t = useRef(new Animated.Value(dark ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(t, {
      toValue: dark ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 70,
    }).start();
  }, [dark]);

  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.82, 1] });

  return (
    <TouchableOpacity
      onPress={toggleDark}
      activeOpacity={0.6}
      delayPressIn={0}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={[styles.btn, { width: size, height: size }]}
    >
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        <Icon name={dark ? 'moon' : 'sun'} size={iconSize} color={theme.text} stroke={1.7} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
