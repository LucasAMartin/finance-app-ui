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
  iconColor = '#FBF8FF',
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

  return (
    <View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: showLogo ? 'rgba(255,255,255,0.96)' : color,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {showLogo ? (
        <Image
          source={{ uri: logo!.logoUrl! }}
          resizeMode="cover"
          onError={() => {
            setImageFailed(true);
            invalidateMerchantLogo(merchant);
          }}
          style={{ width: size * 1.16, height: size * 1.16 }}
        />
      ) : (
        <Icon name={catIcon} size={iconSize ?? size * 0.47} color={iconColor} stroke={1.6} />
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
