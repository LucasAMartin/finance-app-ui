import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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

export function Segmented({ value, onChange, options, theme }: SegmentedProps) {
  return (
    <View style={[styles.segOuter, { backgroundColor: theme.chipBg }]}>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = v === value;
        return (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            activeOpacity={0.7}
            style={[
              styles.segBtn,
              active && {
                backgroundColor: theme.text,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: active ? '700' : '500',
                color: active ? theme.bg : theme.textSec,
                letterSpacing: 0.2,
              }}
            >
              {label}
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
    gap: 2,
  },
  segBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
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
