import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  NativeStoreKitPaywall,
  type StoreKitPaywallPlan,
} from '../../modules/glass-card/src/NativeStoreKitPaywall';
import type { StoreKitProduct } from '../../modules/glass-card/src/GlassCardModule';
import {
  PAYWALL_APP_NAME,
  PAYWALL_CTA_LABEL,
  PAYWALL_SUBTITLE,
  PAYWALL_TITLE,
} from './config';

interface Props {
  visible: boolean;
  onClose: () => void;
  products?: StoreKitProduct[];
  isBusy?: boolean;
  onPurchase?: (productID: string) => Promise<void> | void;
  onRestore?: () => Promise<void> | void;
  embedded?: boolean;
  layoutHeight?: number;
}

const PAYWALL_PRESENT_MS = 320;

const FALLBACK_PLANS: StoreKitPaywallPlan[] = [
  {
    id: 'pro_weekly',
    title: 'Weekly',
    price: '$0.99',
    cadence: '/week',
    detail: 'Subscribe for a Week',
  },
  {
    id: 'pro_monthly',
    title: 'Change Plan to Monthly',
    price: '$2.99',
    cadence: '/month',
    detail: 'Subscribe for a Month',
  },
  {
    id: 'pro_yearly',
    title: 'Yearly',
    price: '$12.99',
    cadence: '/year',
    detail: 'Subscribe for a Year',
  },
];

function cadenceForProduct(product: StoreKitProduct): string {
  const value = product.subscriptionPeriodValue ?? 1;
  switch (product.subscriptionPeriodUnit) {
    case 'day':
      return value === 1 ? '/day' : `/${value} days`;
    case 'week':
      return value === 1 ? '/week' : `/${value} weeks`;
    case 'month':
      return value === 1 ? '/month' : `/${value} months`;
    case 'year':
      return value === 1 ? '/year' : `/${value} years`;
    default:
      return '';
  }
}

function fallbackDetail(product: StoreKitProduct): string {
  switch (product.subscriptionPeriodUnit) {
    case 'week':
      return 'Subscribe for a Week';
    case 'month':
      return 'Subscribe for a Month';
    case 'year':
      return 'Subscribe for a Year';
    default:
      return 'Subscribe';
  }
}

function planFromProduct(product: StoreKitProduct): StoreKitPaywallPlan {
  return {
    id: product.id,
    title: product.displayName || product.id,
    price: product.displayPrice,
    cadence: cadenceForProduct(product),
    badge: null,
    detail: product.description || fallbackDetail(product),
  };
}

export function MembershipPaywallPreview({
  visible,
  onClose,
  products,
  isBusy = false,
  onPurchase,
  onRestore,
  embedded = false,
  layoutHeight,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const height = layoutHeight ?? windowHeight;
  const translateY = useSharedValue(embedded ? 0 : height);

  useEffect(() => {
    translateY.value = embedded
      ? 0
      : withTiming(0, {
        duration: PAYWALL_PRESENT_MS,
        easing: Easing.out(Easing.cubic),
      });
  }, [embedded, height, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  const plans = products?.length
    ? products.map(planFromProduct)
    : FALLBACK_PLANS;

  const handleSubscribe = (productID: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (__DEV__) {
      console.log('[Paywall] Subscribe pressed', { productID });
    }
    void onPurchase?.(productID);
  };

  const handleRestore = () => {
    Haptics.selectionAsync().catch(() => {});
    void onRestore?.();
  };

  return (
    <Animated.View
      collapsable={false}
      style={embedded
        ? [styles.sheetRoot, { height }]
        : [styles.root, { height }, animatedStyle]}
    >
      <NativeStoreKitPaywall
        style={styles.paywall}
        appName={PAYWALL_APP_NAME}
        title={PAYWALL_TITLE}
        subtitle={PAYWALL_SUBTITLE}
        ctaLabel={PAYWALL_CTA_LABEL}
        plans={plans}
        isBusy={isBusy}
        onClose={onClose}
        onSubscribe={handleSubscribe}
        onRestore={handleRestore}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  paywall: {
    flex: 1,
  },
  root: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 130,
  },
  sheetRoot: {
    backgroundColor: '#05070D',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
});
