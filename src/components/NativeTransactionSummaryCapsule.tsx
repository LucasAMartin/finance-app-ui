import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  GlassEffectContainer,
  Host,
  HStack,
  Spacer,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { formatActiveCurrencyAmount } from '../currency';
import { SPACE } from '../spacing';
import type { Theme } from '../theme';
import type { WallpaperP } from '../wallpaperPalette';

export const NATIVE_TRANSACTION_SUMMARY_CAPSULE_HEIGHT = 58;

type Props = {
  theme: Theme;
  p: WallpaperP;
  count: number;
  total: number;
  countSingular?: string;
  countPlural?: string;
  countLabel?: string;
  totalLabel?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function NativeTransactionSummaryCapsule({
  theme,
  p,
  count,
  total,
  countSingular = 'expense',
  countPlural = 'expenses',
  countLabel,
  totalLabel,
  accessibilityLabel,
  style,
}: Props) {
  const resolvedCountLabel =
    countLabel ?? `${count} ${count === 1 ? countSingular : countPlural}`;
  const resolvedTotalLabel =
    totalLabel ?? `${formatActiveCurrencyAmount(total, true)} total`;
  const glassTint = theme.dark ? 'rgba(20,22,26,0.42)' : 'rgba(255,255,255,0.66)';

  return (
    <Host
      ignoreSafeArea="all"
      colorScheme={theme.dark ? 'dark' : 'light'}
      style={[styles.host, style]}
    >
      <GlassEffectContainer>
        <HStack
          alignment="center"
          spacing={SPACE.md}
          modifiers={[
            padding({ leading: 18, trailing: 18 }),
            frame({
              height: NATIVE_TRANSACTION_SUMMARY_CAPSULE_HEIGHT,
              maxWidth: 10000,
              alignment: 'center',
            }),
            glassEffect({
              glass: { variant: 'regular', tint: glassTint },
              shape: 'capsule',
            }),
            swiftAccessibilityLabel(
              accessibilityLabel ?? `${resolvedCountLabel}, ${resolvedTotalLabel}`,
            ),
          ]}
        >
          <SwiftText modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(p.text), lineLimit(1)]}>
            {resolvedCountLabel}
          </SwiftText>
          <Spacer />
          <SwiftText modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(p.text), lineLimit(1)]}>
            {resolvedTotalLabel}
          </SwiftText>
        </HStack>
      </GlassEffectContainer>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    height: NATIVE_TRANSACTION_SUMMARY_CAPSULE_HEIGHT,
  },
});
