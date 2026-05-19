import React, { useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
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
  { id: 'profile',  icon: 'profile' },
];

const TAB_W = 46;
const TAB_GAP = 4;
const PILL_PAD = 6;
const TAB_STEP = TAB_W + TAB_GAP;

// Snappy spring — tight tension + high friction keeps the slide quick and prevents bounce.
const SPRING_CONFIG = { tension: 220, friction: 22, useNativeDriver: true } as const;

export function TabBar({ theme, active, onAdd, onTabPress }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const activeIndex = Math.max(0, TABS.findIndex(t => t.id === active));
  const idx = useRef(new Animated.Value(activeIndex)).current;

  // Sync with external active changes (e.g., from drawer navigation).
  useEffect(() => {
    Animated.spring(idx, { ...SPRING_CONFIG, toValue: activeIndex }).start();
  }, [activeIndex]);

  const slideTX = idx.interpolate({
    inputRange: TABS.map((_, i) => i),
    outputRange: TABS.map((_, i) => i * TAB_STEP),
  });

  // Start the slide on press, before the parent state has round-tripped — kills the perceived delay.
  const handlePress = (id: string, i: number) => {
    Animated.spring(idx, { ...SPRING_CONFIG, toValue: i }).start();
    onTabPress?.(id);
  };

  const pill = (
    <View style={styles.pillRow}>
      {/* Sliding dark pill — single background that follows the active tab */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activePill,
          {
            backgroundColor: theme.text,
            transform: [{ translateX: slideTX }],
          },
        ]}
      />

      {TABS.map((t, i) => {
        const isActive = t.id === active;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => handlePress(t.id, i)}
            style={styles.tabBtn}
            activeOpacity={0.7}
            delayPressIn={0}
            hitSlop={{ top: 12, bottom: 40, left: 8, right: 8 }}
          >
            <Icon
              name={t.icon}
              size={20}
              color={isActive ? theme.bg : theme.textSec}
              stroke={isActive ? 1.7 : 1.5}
            />
          </TouchableOpacity>
        );
      })}

      <View style={[styles.divider, { backgroundColor: theme.hairline }]} />

      <TouchableOpacity
        onPress={onAdd}
        style={[styles.tabBtn, { backgroundColor: theme.accent.fill }]}
        activeOpacity={0.7}
        delayPressIn={0}
        hitSlop={{ top: 12, bottom: 40, left: 8, right: 8 }}
      >
        <Icon name="mic" size={20} color={theme.accent.ink} stroke={1.6} />
      </TouchableOpacity>
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
              borderColor: theme.hairline,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: theme.dark ? 0.5 : 0.08,
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
              borderColor: theme.hairline,
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
  activePill: {
    position: 'absolute',
    top: PILL_PAD,
    left: PILL_PAD,
    width: TAB_W,
    height: TAB_W,
    borderRadius: TAB_W / 2,
  },
});
