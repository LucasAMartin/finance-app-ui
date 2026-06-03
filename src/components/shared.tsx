import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Host, Button as SwiftButton, Text as SwiftText, GlassEffectContainer } from '@expo/ui/swift-ui';
import { frame, glassEffect, foregroundStyle, font, contentShape, shapes, disabled as disabledModifier } from '@expo/ui/swift-ui/modifiers';
import { Theme } from '../theme';
import { TYPE } from '../typography';
import { LAYOUT } from '../spacing';
import { OVER_DOT } from '../theme';
import { SUPPORTS_GLASS } from './GlassButton';

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
/** @deprecated Use ScreenExitButton from GlassButton.tsx instead. */
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
          accessibilityRole="button"
          pointerEvents="box-only"
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Text style={[TYPE.bodySm, { color: theme.textSec }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface SheetTextButtonProps {
  label: string;
  onPress: () => void;
  theme: Theme;
  tone?: 'accent' | 'danger';
  style?: any;
}

export function SheetTextButton({
  label,
  onPress,
  theme,
  tone = 'accent',
  style,
}: SheetTextButtonProps) {
  const color = tone === 'danger' ? OVER_DOT : theme.accent.dot;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      pointerEvents="box-only"
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      style={({ pressed }) => [
        styles.sheetTextBtn,
        { opacity: pressed ? 0.56 : 1 },
        style,
      ]}
    >
      <Text style={[TYPE.subsectionTitle, { color }]}>{label}</Text>
    </Pressable>
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
  const [glassW, setGlassW] = useState(0);

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  // iOS 26+: native Liquid Glass button matching the RN fallback's shape (16pt
  // rounded rect) and size (full-width × 52). `glassProminent` can't do either —
  // it's a content-sized capsule — so we use the glassEffect modifier with an
  // explicit rounded-rect shape, neutral `theme.text` tint, and a measured width
  // (the Host needs an explicit width; matchContents over-measures). The label is
  // forced to `theme.bg` for contrast. Call-site margins pass through to the
  // measuring wrapper; its paddingVertical/borderRadius (which shaped the RN
  // fallback) are neutralized. Falls back to the RN button below iOS 26.
  if (SUPPORTS_GLASS) {
    return (
      <View
        style={[style, styles.sheetGlassHost, disabled && styles.glassDisabled]}
        onLayout={e => setGlassW(e.nativeEvent.layout.width)}
      >
        {glassW > 0 && (
          <Host ignoreSafeArea="all" style={{ width: glassW, height: 52 }}>
            <GlassEffectContainer>
              <SwiftButton
                onPress={handlePress}
                modifiers={[
                  glassEffect({
                    glass: { variant: 'regular', interactive: true, tint: theme.text },
                    shape: 'roundedRectangle',
                    cornerRadius: 16,
                  }),
                  disabledModifier(disabled),
                ]}
              >
                {/* A SwiftUI Button's tap area is its label's bounds. The label
                    must fill the pill (frame) and claim the whole rectangle for
                    hit-testing (contentShape) — otherwise only the text is tappable. */}
                <SwiftText modifiers={[
                  frame({ width: glassW, height: 52 }),
                  contentShape(shapes.rectangle()),
                  foregroundStyle(theme.bg),
                  font({ size: 17, weight: 'semibold' }),
                ]}>
                  {label}
                </SwiftText>
              </SwiftButton>
            </GlassEffectContainer>
          </Host>
        )}
      </View>
    );
  }

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
  sheetTextBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: LAYOUT.rowPadY + 4,
  },
  sheetPrimaryBtn: {
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  // Glass-button branch: full-width, fixed height; cancel any paddingVertical/
  // paddingHorizontal a call-site style may carry (those shaped the RN fallback).
  sheetGlassHost: {
    alignSelf: 'stretch',
    height: 52,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  // Dim the whole hosted glass button when disabled — RN-layer alpha composites
  // the native content (glass included), which the SwiftUI .opacity modifier
  // can't reliably do to the Liquid Glass material.
  glassDisabled: {
    opacity: 0.4,
  },
});
