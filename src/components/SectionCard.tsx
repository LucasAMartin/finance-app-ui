import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { RADIUS } from '../radius';
import { LAYOUT } from '../spacing';
import { MEDIA } from '../wallpaperPalette';

interface SectionCardProps {
  children: React.ReactNode;
  dark: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Remove all inner padding — use for flush/edge-to-edge content (e.g. embedded calendar). */
  noPad?: boolean;
}

export function SectionCard({ children, dark, style, contentStyle, noPad }: SectionCardProps) {
  const borderColor = dark ? MEDIA.hairline : 'rgba(14,12,24,0.08)';
  return (
    <BlurView
      intensity={dark ? 70 : 100}
      tint={dark ? 'systemMaterialDark' : 'systemMaterialLight'}
      style={[cardStyle, style]}
    >
      <View style={[borderStyle, noPad && flushStyle, contentStyle, { borderColor }]}>
        {children}
      </View>
    </BlurView>
  );
}

const cardStyle: ViewStyle = {
  borderRadius: RADIUS.card,
  overflow: 'hidden',
};

const borderStyle: ViewStyle = {
  borderRadius: RADIUS.card,
  borderWidth: 1,
  paddingHorizontal: LAYOUT.cardPadX,
  paddingTop: LAYOUT.cardPadTop,
  paddingBottom: LAYOUT.cardPadBottom,
};

const flushStyle: ViewStyle = {
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
};
