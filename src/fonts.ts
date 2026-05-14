// ─────────────────────────────────────────────────────────────
// Global font configuration.
//
// To swap the app's font family:
//   1. Replace the imports below with a different @expo-google-fonts package
//      (e.g. @expo-google-fonts/geist, /manrope, /dm-sans).
//   2. Update FONT_MAP keys to the new variable names.
//   3. Update WEIGHT_TO_FAMILY values to match those keys.
//   4. Update DEFAULT_FONT_FAMILY.
// Everything else (Text patch, providers, screens) stays the same.
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export const FONT_MAP = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': 'Inter_400Regular',
  '200': 'Inter_400Regular',
  '300': 'Inter_400Regular',
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  '800': 'Inter_700Bold',
  '900': 'Inter_700Bold',
  normal: 'Inter_400Regular',
  bold: 'Inter_700Bold',
};

export const DEFAULT_FONT_FAMILY = 'Inter_400Regular';

export function useAppFonts() {
  return useFonts(FONT_MAP);
}

// Patches RN <Text> so existing `fontWeight: '600'` etc. resolves to the
// correct Inter file. Call once at module load. Idempotent.
let patched = false;
export function patchTextWithInter() {
  if (patched) return;
  patched = true;
  const TextAny = Text as any;
  const oldRender = TextAny.render;
  if (typeof oldRender !== 'function') return;
  TextAny.render = function (...args: any[]) {
    const origin = oldRender.apply(this, args);
    const flat = StyleSheet.flatten(origin.props.style) ?? {};
    const weight = String((flat as any).fontWeight ?? '400');
    const family = WEIGHT_TO_FAMILY[weight] ?? DEFAULT_FONT_FAMILY;
    return React.cloneElement(origin, {
      style: [{ fontFamily: family }, origin.props.style],
    });
  };
}
