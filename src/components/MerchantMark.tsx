import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { useInvalidateMerchantLogo, useMerchantLogo } from '../merchantLogos';

interface MerchantMarkProps {
  merchant: string;
  catIcon?: string;
  color: string;
  size?: number;
  iconColor?: string;
  iconSize?: number;
  logoEnabled?: boolean;
}

export function MerchantMark({
  merchant,
  catIcon = 'tag',
  color,
  size = 32,
  iconColor,
  iconSize,
  logoEnabled = true,
}: MerchantMarkProps) {
  const logo = useMerchantLogo(merchant, logoEnabled);
  const invalidateMerchantLogo = useInvalidateMerchantLogo();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [logo?.logoUrl, merchant]);

  const showLogo = Boolean(logo?.logoUrl && !imageFailed);
  // Inner padding so the contained logo breathes inside the circle.
  const logoPad = Math.round(size * 0.16);
  // Tinted disc: 15% alpha background, group color glyph. Logo mode fills with the
  // server-sampled logo background (so a brand's solid colored tile melts into the
  // disc); null/undefined → a white backing so the image reads cleanly.
  const bgColor = showLogo ? (logo!.bgColor ?? 'rgba(255,255,255,0.96)') : `${color}26`;
  const glyphColor = iconColor ?? color;

  return (
    <View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {showLogo ? (
        // Render the resolver's logoUrl verbatim. `contain` + inner padding keeps
        // the full logo visible inside the circular disc without cropping edges
        // and preserves aspect ratio. On load failure (e.g. fallback=404) we fall
        // back to the neutral category glyph.
        <Image
          source={{ uri: logo!.logoUrl! }}
          resizeMode="contain"
          onError={() => {
            setImageFailed(true);
            invalidateMerchantLogo(merchant);
          }}
          style={{ width: size - logoPad * 2, height: size - logoPad * 2 }}
        />
      ) : (
        <Icon name={catIcon} size={iconSize ?? size * 0.47} color={glyphColor} stroke={1.6} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
});
