import React, { useRef, useLayoutEffect } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Icon } from './Icon';

interface Props {
  size?: number;
  iconSize?: number;
}

export function ThemeToggle({ size = 40, iconSize = 22 }: Props) {
  const { theme, dark, toggleDark } = useTheme();
  const t = useRef(new Animated.Value(dark ? 1 : 0)).current;

  useLayoutEffect(() => {
    Animated.spring(t, {
      toValue: dark ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 70,
    }).start();
  }, [dark]);

  const rotate = t.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const scale = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.82, 1],
  });

  return (
    <Pressable
      onPress={toggleDark}
      pointerEvents="box-only"
      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      style={[
        styles.btn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate }, { scale }],
        }}
      >
        <Icon
          name={dark ? 'moon' : 'sun'}
          size={iconSize}
          color={theme.text}
          stroke={1.7}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
});
