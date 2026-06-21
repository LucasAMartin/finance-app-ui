import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { SUPPORTS_GLASS } from './GlassButton';
import { SectionCard } from './SectionCard';
import NativeGlassCard from '../../modules/glass-card/src/GlassCardView';
import { RADIUS } from '../radius';
import { LAYOUT } from '../spacing';

// Mirrors SectionCard's interior padding so content sits the same distance
// from the glass edge as it did on the BlurView card.
const CARD_PAD: ViewStyle = {
  paddingHorizontal: LAYOUT.cardPadX,
  paddingTop: LAYOUT.cardPadTop,
  paddingBottom: LAYOUT.cardPadBottom,
};

interface GlassCardProps {
  dark: boolean;
  onPress?: () => void;
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  accessibilityRole?: string;
  accessibilityLabel?: string;
}

/**
 * On iOS 26+ renders a native Liquid Glass card with the interactive spring
 * press animation and finger-tracking refraction. Falls back to the BlurView
 * SectionCard on older OS versions.
 *
 * Pass `onPress` to enable the interactive glass effect; omit it for a static
 * glass surface (e.g. summary or empty-state cards).
 */
export function GlassCard({
  dark,
  onPress,
  cornerRadius = RADIUS.card,
  style,
  contentStyle,
  children,
  accessibilityRole,
  accessibilityLabel,
}: GlassCardProps) {
  if (SUPPORTS_GLASS) {
    return (
      <NativeGlassCard
        cornerRadius={cornerRadius}
        pressable={!!onPress}
        onCardPress={onPress}
        style={style}
        accessibilityRole={accessibilityRole as any}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[CARD_PAD, contentStyle]}>{children}</View>
      </NativeGlassCard>
    );
  }

  // iOS < 26 fallback: BlurView card + optional Pressable wrapper.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole={accessibilityRole as any}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [style, pressed && { opacity: 0.72 }]}
      >
        <SectionCard dark={dark} contentStyle={contentStyle}>{children}</SectionCard>
      </Pressable>
    );
  }

  return <SectionCard dark={dark} style={style} contentStyle={contentStyle}>{children}</SectionCard>;
}
