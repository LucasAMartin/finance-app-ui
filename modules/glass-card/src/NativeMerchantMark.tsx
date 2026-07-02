import React from 'react';
import { requireNativeView } from 'expo';
import type { CommonViewModifierProps } from '@expo/ui/swift-ui';
import { createViewModifierEventListener } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';

export interface NativeMerchantMarkProps extends CommonViewModifierProps {
  logoUrl?: string;
  logoBgColor?: string | null;
  fallbackSystemName?: SFSymbol | string;
  fallbackColor: string;
  fallbackBackgroundColor?: string;
  size?: number;
  glyphSize?: number;
  logoEnabled?: boolean;
}

const NativeMerchantMarkView = requireNativeView<NativeMerchantMarkProps>('GlassCard', 'NativeMerchantMarkView');

export function NativeMerchantMark({
  modifiers,
  logoUrl,
  size = 32,
  glyphSize,
  logoEnabled = true,
  ...restProps
}: NativeMerchantMarkProps) {
  const renderableLogoUrl = logoUrl?.startsWith('file://') || logoUrl?.startsWith('https://')
    ? logoUrl
    : undefined;

  return (
    <NativeMerchantMarkView
      modifiers={modifiers}
      logoUrl={renderableLogoUrl}
      size={size}
      glyphSize={glyphSize ?? size * 0.47}
      logoEnabled={logoEnabled && !!renderableLogoUrl}
      {...(modifiers ? createViewModifierEventListener(modifiers) : undefined)}
      {...restProps}
    />
  );
}
