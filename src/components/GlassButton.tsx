import React from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Button, Host, Image } from '@expo/ui/swift-ui';
import { frame, glassEffect } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Icon } from './Icon';

// Interactive Liquid Glass (the grow/finger-track/refraction press behavior) is
// iOS 26+. Callers render their existing button as a fallback below that.
export const SUPPORTS_GLASS =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

export interface GlassCircleButtonProps {
  onPress: () => void;
  /** SF Symbol shown inside the button (e.g. 'xmark', 'mic.fill'). */
  systemImage: SFSymbol;
  /** Circle diameter in points. */
  size?: number;
  iconSize?: number;
  iconColor: string;
  accessibilityLabel?: string;
}

/**
 * A circular native SwiftUI button with an interactive Liquid Glass background.
 * Renders its own `Host` island, so it can be dropped into plain React Native
 * trees or nested inside an existing `RNHostView`. Only mount this when
 * `SUPPORTS_GLASS` is true; provide a JS fallback otherwise.
 *
 * The forwarded ref lands on the wrapping RN `View` so callers that measure the
 * button (e.g. morph transitions) keep working.
 */
export const GlassCircleButton = React.forwardRef<View, GlassCircleButtonProps>(
  function GlassCircleButton(
    { onPress, systemImage, size = 36, iconSize = 16, iconColor, accessibilityLabel },
    ref,
  ) {
    return (
      <View
        ref={ref}
        collapsable={false}
        style={{ width: size, height: size }}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Host matchContents>
          <Button
            onPress={onPress}
            modifiers={[
              frame({ width: size, height: size }),
              glassEffect({
                glass: { variant: 'regular', interactive: true },
                shape: 'circle',
              }),
            ]}
          >
            <Image systemName={systemImage} size={iconSize} color={iconColor} />
          </Button>
        </Host>
      </View>
    );
  },
);

export interface GlassCircleIconProps {
  /** SF Symbol shown inside the glass circle. */
  systemImage: SFSymbol;
  size?: number;
  iconSize?: number;
  iconColor: string;
}

/**
 * A glass circle with an SF Symbol but *no* press handling — the wrapping View
 * is `pointerEvents="none"` so touches pass through to a parent that owns the
 * gesture (e.g. a `MenuView` anchor). Use this where a real `Button` would
 * swallow the tap the parent needs.
 */
export function GlassCircleIcon({
  systemImage,
  size = 36,
  iconSize = 16,
  iconColor,
}: GlassCircleIconProps) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Host matchContents>
        <Image
          systemName={systemImage}
          size={iconSize}
          color={iconColor}
          modifiers={[
            frame({ width: size, height: size }),
            glassEffect({
              glass: { variant: 'regular', interactive: true },
              shape: 'circle',
            }),
          ]}
        />
      </Host>
    </View>
  );
}

// ─── Standardized screen/sheet exit button ──────────────────────────────────
// App-wide convention: a dismiss control lives top-left, is a Liquid Glass
// circle, and shows a back chevron on pushed full-screen views or an X on
// bottom sheets. Size/spacing are fixed here; only the tint adapts per surface.

export const EXIT_BTN_SIZE = 36;

const exitStyles = StyleSheet.create({
  // Floating placement for sheets that don't host the button in a header row.
  floatTopLeft: { position: 'absolute', top: 16, left: 20, zIndex: 1 },
  fallback: {
    width: EXIT_BTN_SIZE,
    height: EXIT_BTN_SIZE,
    borderRadius: EXIT_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const EXIT_FLOAT_STYLE = exitStyles.floatTopLeft;

export interface ScreenExitButtonProps {
  /** 'back' → chevron (pushed screens); 'close' → X (sheets/modals). */
  variant: 'back' | 'close';
  onPress: () => void;
  /** Icon tint; pass a value with good contrast for this surface. */
  tint: string;
  /** Background for the pre-iOS-26 fallback circle. */
  fallbackBg: string;
  accessibilityLabel?: string;
  /** Optional wrapper style — e.g. EXIT_FLOAT_STYLE to float it top-left. */
  style?: StyleProp<ViewStyle>;
}

export function ScreenExitButton({
  variant,
  onPress,
  tint,
  fallbackBg,
  accessibilityLabel,
  style,
}: ScreenExitButtonProps) {
  const a11y = accessibilityLabel ?? (variant === 'back' ? 'Back' : 'Close');
  const inner = SUPPORTS_GLASS ? (
    <GlassCircleButton
      onPress={onPress}
      systemImage={variant === 'back' ? 'chevron.left' : 'xmark'}
      size={EXIT_BTN_SIZE}
      iconSize={variant === 'back' ? 18 : 16}
      iconColor={tint}
      accessibilityLabel={a11y}
    />
  ) : (
    <Pressable
      onPress={onPress}
      pointerEvents="box-only"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[exitStyles.fallback, { backgroundColor: fallbackBg }]}
    >
      <Icon name={variant === 'back' ? 'chevL' : 'close'} size={variant === 'back' ? 20 : 16} color={tint} stroke={2} />
    </Pressable>
  );
  return style ? <View style={style} pointerEvents="box-none">{inner}</View> : inner;
}
