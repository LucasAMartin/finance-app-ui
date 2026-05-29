import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Theme } from '../theme';
import { TYPE } from '../typography';

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
  const tracking = size >= 28 ? -1.2 : size >= 18 ? -0.5 : -0.2;
  return (
    <Text style={{
      fontSize: size,
      fontWeight: weight,
      color: col,
      letterSpacing: tracking,
      lineHeight: Math.round(size * 1.1),
    }}>
      {prefix}{whole}.{frac}
    </Text>
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
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
    </Pressable>
  );
}

// ── Back button ────────────────────────────────────────────────
interface BackBtnProps {
  theme: Theme;
  onBack: () => void;
}

export function BackBtn({ theme, onBack }: BackBtnProps) {
  return (
    <Pressable
      onPress={onBack}
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
    </Pressable>
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
      <Text style={[TYPE.pageTitle, { color: theme.text }]}>{title}</Text>
      {actionLabel && (
        <Pressable
          onPress={onAction}
          pointerEvents="box-only"
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Text style={[TYPE.bodySm, { color: theme.textSec }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface SheetPrimaryButtonProps {
  label: string;
  onPress: () => void;
  theme: Theme;
  disabled?: boolean;
  style?: any;
}

export function SheetPrimaryButton({
  label,
  onPress,
  theme,
  disabled = false,
  style,
}: SheetPrimaryButtonProps) {
  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      pointerEvents="box-only"
      style={({ pressed }) => [
        styles.sheetPrimaryBtn,
        {
          backgroundColor: pressed ? theme.textSec : theme.text,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <Text style={[TYPE.subsectionTitle, { color: theme.bg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  sheetPrimaryBtn: {
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});
