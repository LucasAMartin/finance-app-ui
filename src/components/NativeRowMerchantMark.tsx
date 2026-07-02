import React from 'react';
import { RNHostView } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';
import { NativeMerchantMark } from '../../modules/glass-card/src/NativeMerchantMark';
import { ResolvedMerchantMark } from './MerchantMark';

interface NativeRowMerchantMarkProps {
  logoUrl?: string;
  logoBgColor?: string | null;
  fallbackSystemName?: SFSymbol | string;
  fallbackColor: string;
  fallbackBackgroundColor?: string;
  size?: number;
  glyphSize?: number;
}

export function NativeRowMerchantMark({
  logoUrl,
  logoBgColor,
  fallbackSystemName,
  fallbackColor,
  fallbackBackgroundColor,
  size = 32,
  glyphSize,
}: NativeRowMerchantMarkProps) {
  if (logoUrl) {
    return (
      <RNHostView matchContents>
        <ResolvedMerchantMark
          logoUrl={logoUrl}
          logoBgColor={logoBgColor}
          color={fallbackColor}
          size={size}
          iconColor={fallbackColor}
          iconSize={glyphSize}
        />
      </RNHostView>
    );
  }

  return (
    <NativeMerchantMark
      fallbackSystemName={fallbackSystemName}
      fallbackColor={fallbackColor}
      fallbackBackgroundColor={fallbackBackgroundColor}
      size={size}
      glyphSize={glyphSize}
    />
  );
}
