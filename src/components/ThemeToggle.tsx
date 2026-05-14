import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Icon } from './Icon';

interface Props {
  size?: number;
}

export function ThemeToggle({ size = 38 }: Props) {
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

  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.85, 1] });

  return (
    <TouchableOpacity
      onPress={toggleDark}
      activeOpacity={0.7}
      accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={[
        styles.btn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
        },
      ]}
    >
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        <Icon name={dark ? 'moon' : 'sun'} size={17} color={theme.text} stroke={1.6} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
