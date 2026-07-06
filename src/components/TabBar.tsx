import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { SUPPORTS_GLASS } from './GlassButton';
import { Theme } from '../theme';
import type { SourceRect } from './ContainerTransform';
import { NativeCustomGlassTabBar } from '../../modules/glass-card/src/NativeCustomGlassTabBar';

export interface TabBarProps {
  theme: Theme;
  active: string;
  onAdd: (source?: SourceRect) => void;
  onTabPress?: (id: string) => void;
}

// Each tab carries both a legacy RN icon name (fallback path) and the SF Symbol
// names for the native Liquid Glass path (inactive outline / active filled).
const TABS = [
  { id: 'home',     icon: 'home'   },
  { id: 'spending', icon: 'chart'  },
  { id: 'budget',   icon: 'wallet' },
  { id: 'activity', icon: 'list'   },
] as const;

const TAB_W    = 52;  // tab button diameter
const PILL_PAD = 8;   // glass capsule internal padding
const TAB_GAP  = 4;   // spacing between buttons in the pill

// ─── Liquid Glass tab bar (iOS 26+) ──────────────────────────────────────────

function GlassTabBar({ theme, active, onTabPress, onAdd }: TabBarProps) {
  const insets  = useSafeAreaInsets();

  const handleTabPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabPress?.(id);
  };

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdd();
  };

  return (
    <View
      style={[glassStyles.container, { bottom: Math.max(insets.bottom, 16) + 8 }]}
      accessibilityRole="tablist"
    >
      <NativeCustomGlassTabBar
        activeTab={active}
        isDark={theme.dark}
        onTabSelect={handleTabPress}
        onVoiceAction={handleAdd}
      />
    </View>
  );
}

const glassStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
});

// ─── Fallback tab bar (iOS < 26, Android) ────────────────────────────────────

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

function FallbackTabBar({ theme, active, onTabPress }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const scales = useRef(TABS.map(() => new Animated.Value(1))).current;
  const [localActive, setLocalActive] = useState(active);

  useEffect(() => { setLocalActive(active); }, [active]);

  const handlePressIn = (id: string, i: number) => {
    setLocalActive(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabPress?.(id);
    Animated.timing(scales[i], {
      toValue: 0.88, duration: 80,
      useNativeDriver: true, easing: Easing.out(Easing.cubic),
    }).start();
  };

  const handlePressOut = (i: number) => {
    Animated.timing(scales[i], {
      toValue: 1, duration: 280,
      useNativeDriver: true, easing: EASE_OUT_EXPO,
    }).start();
  };

  const pill = (
    <View style={fallbackStyles.pillRow}>
      {TABS.map((t, i) => {
        const isActive = t.id === localActive;
        return (
          <Pressable
            key={t.id}
            onPressIn={() => handlePressIn(t.id, i)}
            onPressOut={() => handlePressOut(i)}
            pointerEvents="box-only"
            accessibilityRole="tab"
            accessibilityLabel={t.id}
            accessibilityState={{ selected: isActive }}
            style={fallbackStyles.tabBtn}
          >
            <Animated.View style={{ transform: [{ scale: scales[i] }] }}>
              <Icon name={t.icon} size={22} color={isActive ? theme.text : theme.textSec} solid={isActive} />
            </Animated.View>
          </Pressable>
        );
      })}

      <View style={[fallbackStyles.divider, { backgroundColor: theme.hairline }]} />

      <Link href="/expense?mode=voice" asChild>
        <Link.Trigger withAppleZoom>
          <Pressable
            onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
            pointerEvents="box-only"
            accessibilityRole="button"
            accessibilityLabel="Add expense"
            style={[
              fallbackStyles.tabBtn,
              fallbackStyles.addNudge,
              { backgroundColor: theme.dark ? 'rgba(235,239,242,0.14)' : 'rgba(14,12,24,0.07)' },
            ]}
          >
            <Icon name="mic" size={24} color={theme.text} stroke={1.8} />
          </Pressable>
        </Link.Trigger>
      </Link>
    </View>
  );

  return (
    <View style={[fallbackStyles.container, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={80}
          tint={theme.dark ? 'dark' : 'light'}
          style={[
            fallbackStyles.blurPill,
            {
              borderColor: theme.dark ? 'rgba(235,239,242,0.32)' : 'rgba(14,12,24,0.22)',
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
            fallbackStyles.blurPill,
            {
              backgroundColor: theme.dark ? 'rgba(20,20,24,0.95)' : 'rgba(255,255,255,0.95)',
              borderColor: theme.dark ? 'rgba(235,239,242,0.32)' : 'rgba(14,12,24,0.22)',
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

const fallbackStyles = StyleSheet.create({
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
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNudge: {
    transform: [{ translateX: -2 }, { translateY: 2 }],
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 2,
  },
});

// ─── Public export ────────────────────────────────────────────────────────────

export function TabBar(props: TabBarProps) {
  return SUPPORTS_GLASS
    ? <GlassTabBar {...props} />
    : <FallbackTabBar {...props} />;
}
