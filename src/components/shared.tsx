import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { Theme } from '../theme';

// ── Money display ──────────────────────────────────────────────
interface MoneyProps {
  value: number;
  size?: number;
  weight?: '400' | '500' | '600' | '700';
  color?: string;
  prefix?: string;
  theme: Theme;
}

export function Money({ value, size = 16, weight = '600', color, prefix = '−$', theme }: MoneyProps) {
  const abs = Math.abs(value);
  const whole = Math.floor(abs).toLocaleString();
  const frac = Math.round((abs - Math.floor(abs)) * 100).toString().padStart(2, '0');
  const col = color ?? theme.text;
  return (
    <Text style={{ fontSize: size, fontWeight: weight, color: col, letterSpacing: size > 30 ? -1.2 : -0.2 }}>
      {prefix}{whole}<Text style={{ opacity: 0.45 }}>.{frac}</Text>
    </Text>
  );
}

// ── Segmented control ──────────────────────────────────────────
type SegOption = string | { value: string; label: string };

interface SegmentedProps {
  value: string;
  onChange: (v: string) => void;
  options: SegOption[];
  theme: Theme;
}

const SEG_SPRING = { tension: 220, friction: 22, useNativeDriver: true } as const;

export function Segmented({ value, onChange, options, theme }: SegmentedProps) {
  const normalized = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
  const activeIndex = Math.max(0, normalized.findIndex(o => o.value === value));

  // Measure widths of each segment so the sliding pill can land on the exact position
  // regardless of label length. Padded by 0 since the buttons set their own padding.
  const [segWidths, setSegWidths] = useState<number[]>([]);
  const idx = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(idx, { ...SEG_SPRING, toValue: activeIndex }).start();
  }, [activeIndex]);

  const onSegLayout = (i: number) => (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setSegWidths(prev => {
      if (prev[i] === w) return prev;
      const next = prev.slice();
      next[i] = w;
      return next;
    });
  };

  // All widths known? Build the interpolation offsets (cumulative left positions).
  const measured = segWidths.length === normalized.length && segWidths.every(w => w > 0);
  const offsets = measured
    ? normalized.reduce<number[]>((acc, _, i) => {
        const prev = i === 0 ? 0 : acc[i - 1] + segWidths[i - 1];
        return [...acc, prev];
      }, [])
    : null;

  const slideTX = measured && offsets
    ? idx.interpolate({
        inputRange: normalized.map((_, i) => i),
        outputRange: offsets,
      })
    : null;

  const handlePress = (v: string, i: number) => {
    Animated.spring(idx, { ...SEG_SPRING, toValue: i }).start();
    onChange(v);
  };

  const activeW = measured ? segWidths[activeIndex] : 0;

  return (
    <View style={[styles.segOuter, { backgroundColor: theme.chipBg }]}>
      {slideTX != null && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segActive,
            {
              width: activeW,
              backgroundColor: theme.text,
              transform: [{ translateX: slideTX }],
            },
          ]}
        />
      )}
      {normalized.map((o, i) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => handlePress(o.value, i)}
            onLayout={onSegLayout(i)}
            activeOpacity={0.7}
            delayPressIn={0}
            style={styles.segBtn}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: active ? '700' : '500',
                color: active ? theme.bg : theme.textSec,
                letterSpacing: 0.2,
              }}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Circle button ──────────────────────────────────────────────
interface CircleBtnProps {
  children: React.ReactNode;
  theme: Theme;
  dot?: boolean;
  onPress?: () => void;
  size?: number;
}

export function CircleBtn({ children, theme, dot = false, onPress, size = 38 }: CircleBtnProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.circleBtn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
        },
      ]}
    >
      {children}
      {dot && (
        <View style={[styles.circleDot, { backgroundColor: theme.accent.dot }]} />
      )}
    </TouchableOpacity>
  );
}

// ── Back button ────────────────────────────────────────────────
interface BackBtnProps {
  theme: Theme;
  onBack: () => void;
}

export function BackBtn({ theme, onBack }: BackBtnProps) {
  return (
    <TouchableOpacity
      onPress={onBack}
      style={[
        styles.circleBtn,
        {
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
        },
      ]}
    >
      {/* chevron left inline to avoid Icon import cycle */}
      <Text style={{ color: theme.text, fontSize: 18, marginLeft: -2 }}>‹</Text>
    </TouchableOpacity>
  );
}

// ── Category badge (monochrome chip) ──────────────────────────
interface CatBadgeProps {
  catIcon: string;
  theme: Theme;
  size?: number;
  IconComp: React.ComponentType<{ name: string; size?: number; color?: string; stroke?: number }>;
}

export function CatBadge({ catIcon, theme, size = 36, IconComp }: CatBadgeProps) {
  return (
    <View style={[styles.catBadge, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.chipBg }]}>
      <IconComp name={catIcon} size={size * 0.46} color={theme.text} stroke={1.4} />
    </View>
  );
}

// ── Section header row ─────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  theme: Theme;
}

export function SectionHeader({ title, actionLabel, onAction, theme }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: theme.text }}>{title}</Text>
      {actionLabel && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textSec }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segOuter: {
    flexDirection: 'row',
    borderRadius: 100,
    padding: 3,
    position: 'relative',
  },
  segBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    borderRadius: 100,
  },
  circleBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  catBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
});
