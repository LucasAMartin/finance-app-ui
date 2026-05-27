import React, { useRef, useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Theme } from '../theme';

interface TabBarProps {
  theme: Theme;
  active: string;
  onAdd: () => void;
  onTabPress?: (id: string) => void;
}

const TABS = [
  { id: 'home',     icon: 'home'    },
  { id: 'spending', icon: 'chart'   },
  { id: 'budget',   icon: 'wallet'  },
  { id: 'profile',  icon: 'receipt' },
];

const TAB_W    = 52;
const TAB_GAP  = 4;
const PILL_PAD = 8;
const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

export function TabBar({ theme, active, onAdd, onTabPress }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const scales = useRef(TABS.map(() => new Animated.Value(1))).current;
  const [localActive, setLocalActive] = useState(active);
  const activeRef = useRef(active);
  const pressCommitted = useRef(false);

  useEffect(() => {
    activeRef.current = active;
    setLocalActive(active);
  }, [active]);

  const handlePressIn = (id: string, i: number) => {
    pressCommitted.current = false;
    setLocalActive(id);
    Animated.timing(scales[i], {
      toValue: 0.88,
      duration: 80,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  };

  const handlePressOut = (i: number) => {
    Animated.timing(scales[i], {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
      easing: EASE_OUT_EXPO,
    }).start();
    setTimeout(() => {
      if (!pressCommitted.current) setLocalActive(activeRef.current);
    }, 50);
  };

  const handlePress = (id: string) => {
    pressCommitted.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabPress?.(id);
  };

  const pill = (
    <View style={styles.pillRow}>
      {TABS.map((t, i) => {
        const isActive = t.id === localActive;
        return (
          <Pressable
            key={t.id}
            onPressIn={() => handlePressIn(t.id, i)}
            onPressOut={() => handlePressOut(i)}
            onPress={() => handlePress(t.id)}
            pointerEvents="box-only"
            style={styles.tabBtn}
          >
            <Animated.View style={{ transform: [{ scale: scales[i] }] }}>
              <Icon
                name={t.icon}
                size={22}
                color={isActive ? theme.text : theme.textSec}
                solid={isActive}
              />
            </Animated.View>
          </Pressable>
        );
      })}

      <View style={[styles.divider, { backgroundColor: theme.hairline }]} />

      <Pressable
        onPress={onAdd}
        pointerEvents="box-only"
        style={[styles.tabBtn, { backgroundColor: theme.accent.fill }]}
      >
        <Icon name="mic" size={22} color={theme.accent.ink} stroke={1.8} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={80}
          tint={theme.dark ? 'dark' : 'light'}
          style={[
            styles.blurPill,
            {
              borderColor: theme.dark
                ? 'rgba(235,225,255,0.32)'
                : 'rgba(14,12,24,0.22)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: theme.dark ? 0.5 : 0.22,
              shadowRadius: 20,
            },
          ]}
        >
          {pill}
        </BlurView>
      ) : (
        <View
          style={[
            styles.blurPill,
            {
              backgroundColor: theme.dark ? 'rgba(20,20,24,0.95)' : 'rgba(255,255,255,0.95)',
              borderColor: theme.dark
                ? 'rgba(235,225,255,0.32)'
                : 'rgba(14,12,24,0.22)',
              elevation: 12,
            },
          ]}
        >
          {pill}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  blurPill: {
    borderRadius: 100,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: PILL_PAD,
    gap: TAB_GAP,
  },
  tabBtn: {
    width: TAB_W,
    height: TAB_W,
    borderRadius: TAB_W / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 2,
  },
});
