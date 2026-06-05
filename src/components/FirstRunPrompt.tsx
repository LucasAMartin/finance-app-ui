import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, GROUP_COLORS } from '../theme';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';
import { MEDIA } from '../wallpaperPalette';

interface Props {
  theme: Theme;
  onSetIncome: () => void; // navigates to /income
  onSkip: () => void;
}

// One-time bottom sheet shown on first app launch. Goal: get the user to set
// their monthly income so the 50/30/20 math works on every screen.
export function FirstRunPrompt({ theme, onSetIncome, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const dismiss = (action: () => void) => {
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 300, duration: 220, useNativeDriver: true }),
    ]).start(action);
  };

  const p = {
    text: MEDIA.text,
    textSec: MEDIA.textSec,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents="auto"
      >
        <Pressable style={{ flex: 1 }} onPress={() => dismiss(onSkip)} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY: slideAnim }] },
        ]}
        pointerEvents="box-none"
      >
        <BlurView
          intensity={theme.dark ? 70 : 90}
          tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.lg) + SPACE.xl }]}
        >
          {/* Group color dots — the 50/30/20 visual signature */}
          <View style={styles.dotRow}>
            <View style={[styles.dot, { backgroundColor: GROUP_COLORS.needs.light }]} />
            <View style={[styles.dot, { backgroundColor: GROUP_COLORS.wants.light }]} />
            <View style={[styles.dot, { backgroundColor: GROUP_COLORS.savings.light }]} />
          </View>

          <Text style={[TYPE.sectionTitle, styles.title, { color: p.text }]}>
            Set your monthly income
          </Text>
          <Text style={[TYPE.body, styles.body, { color: p.textSec }]}>
            This app splits your spending into needs, wants, and savings using the 50/30/20 rule. Income is the starting point.
          </Text>

          <TouchableOpacity
            onPress={() => dismiss(onSetIncome)}
            activeOpacity={0.82}
            style={[
              styles.primaryBtn,
              { backgroundColor: theme.dark ? '#E7EAED' : '#0E1116' },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Set monthly income"
          >
            <Text
              style={[
                TYPE.body,
                styles.primaryBtnText,
                { color: theme.dark ? '#080A0D' : '#F2F4F5' },
              ]}
            >
              Set income
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => dismiss(onSkip)}
            activeOpacity={0.6}
            style={styles.skipBtn}
            accessibilityRole="button"
            accessibilityLabel="Skip income setup for now"
          >
            <Text style={[TYPE.bodySm, { color: p.textSec }]}>Skip for now</Text>
          </TouchableOpacity>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.46)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    overflow: 'hidden',
    paddingHorizontal: LAYOUT.cardPadX,
    paddingTop: SPACE.xxl,
  },
  dotRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginBottom: SPACE.xl,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5, // width/2 — circle
  },
  title: {
    marginBottom: SPACE.sm,
  },
  body: {
    marginBottom: SPACE.xxl,
    lineHeight: 22,
  },
  primaryBtn: {
    borderRadius: RADIUS.button,
    paddingVertical: SPACE.lg,
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  primaryBtnText: {
    fontWeight: '600',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: SPACE.sm,
  },
});
