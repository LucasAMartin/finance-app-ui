import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Divider, HStack, Host, Image } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, frame, glassEffect, padding } from '@expo/ui/swift-ui/modifiers';
import { Icon } from './Icon';
import { GlassCircleIcon, SUPPORTS_GLASS } from './GlassButton';
import { Theme } from '../theme';
import type { SourceRect } from './ContainerTransform';

export interface TabBarProps {
  theme: Theme;
  active: string;
  onAdd: (source: SourceRect) => void;
  onTabPress?: (id: string) => void;
}

// Each tab carries both a legacy RN icon name (fallback path) and the SF Symbol
// names for the native Liquid Glass path (inactive outline / active filled).
const TABS = [
  { id: 'home',     icon: 'home',    inactive: 'house',     active: 'house.fill'     },
  { id: 'spending', icon: 'chart',   inactive: 'chart.bar', active: 'chart.bar.fill' },
  { id: 'budget',   icon: 'wallet',  inactive: 'chart.pie', active: 'chart.pie.fill' },
  { id: 'activity', icon: 'list',    inactive: 'list.bullet.rectangle', active: 'list.bullet.rectangle.fill' },
] as const;

const TAB_W    = 52;  // tab button diameter
const ADD_SIZE = 48;  // add button diameter — slightly larger to signal primary action
const PILL_PAD = 8;   // glass capsule internal padding
const TAB_GAP  = 4;   // spacing between buttons in the pill

// ─── Liquid Glass tab bar (iOS 26+) ──────────────────────────────────────────

function GlassTabBar({ theme, active, onTabPress }: TabBarProps) {
  const insets  = useSafeAreaInsets();

  const handleTabPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabPress?.(id);
  };

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <View
      style={[glassStyles.container, { bottom: Math.max(insets.bottom, 16) + 8 }]}
      accessibilityRole="tablist"
    >
      <View collapsable={false} style={glassStyles.pillWrap}>
        <Host matchContents ignoreSafeArea="all">
          {/* One Liquid Glass capsule behind the whole row — the pill. The tab
              icons are plain buttons sitting on it; only the + carries its own
              prominent glass so it reads as the primary action. */}
          <HStack
            spacing={TAB_GAP}
            alignment="center"
            modifiers={[
              padding({ all: PILL_PAD }),
              glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' }),
            ]}
          >
            {TABS.map(tab => {
              const isActive = tab.id === active;
              return (
                <Button
                  key={tab.id}
                  onPress={() => handleTabPress(tab.id)}
                  modifiers={[
                    frame({ width: TAB_W, height: TAB_W }),
                    buttonStyle('plain'),
                    accessibilityLabel(tab.id),
                  ]}
                >
                  <Image
                    systemName={isActive ? tab.active : tab.inactive}
                    size={22}
                    color={isActive ? theme.text : theme.textSec}
                  />
                </Button>
              );
            })}

            {/* Trailing padding biases the divider toward the tab icons, so it
                sits centered in the visible gap between the last icon and the
                larger + circle rather than between the two frame centers. */}
            <Divider modifiers={[frame({ height: 24 }), padding({ trailing: 10 })]} />

            {/* Add button — a circular accent-tinted glass marks it as the
                primary action. Explicit circle shape (not glassProminent, which
                renders a capsule/oval) keeps it perfectly round. */}
            <Image systemName="plus" size={1} color="transparent" modifiers={[frame({ width: ADD_SIZE, height: ADD_SIZE })]} />
          </HStack>
        </Host>
        <Link href="/expense?mode=voice" asChild>
          <Link.Trigger>
            <Pressable
              onPressIn={handleAdd}
              pointerEvents="box-only"
              accessibilityRole="button"
              accessibilityLabel="Add expense"
              style={glassStyles.addOverlay}
            >
              <Link.AppleZoom>
                <View collapsable={false} style={glassStyles.addZoomSource}>
                  <GlassCircleIcon
                    systemImage="plus"
                    size={ADD_SIZE}
                    iconSize={24}
                    iconColor={theme.accent.ink}
                    glassTint={theme.accent.dot}
                  />
                </View>
              </Link.AppleZoom>
            </Pressable>
          </Link.Trigger>
        </Link>
      </View>
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
  pillWrap: {
    position: 'relative',
  },
  addOverlay: {
    position: 'absolute',
    right: PILL_PAD + 2,
    top: PILL_PAD + 2,
    width: ADD_SIZE,
    height: ADD_SIZE,
    borderRadius: ADD_SIZE / 2,
  },
  addZoomSource: {
    width: ADD_SIZE,
    height: ADD_SIZE,
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
            <Icon name="plus" size={24} color={theme.text} stroke={2} />
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
