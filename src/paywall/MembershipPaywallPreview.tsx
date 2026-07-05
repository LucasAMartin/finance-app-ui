import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { PurchasesPackage } from 'react-native-purchases';

import {
  NativeRevenueCatPaywall,
  type RevenueCatPaywallPlan,
} from '../../modules/glass-card/src/NativeRevenueCatPaywall';

interface Props {
  visible: boolean;
  onClose: () => void;
  packages?: PurchasesPackage[];
  isBusy?: boolean;
  onPurchase?: (packageID: string) => Promise<void> | void;
  onRestore?: () => Promise<void> | void;
  embedded?: boolean;
  layoutHeight?: number;
}

const PAYWALL_PRESENT_MS = 320;

const FALLBACK_PLANS: RevenueCatPaywallPlan[] = [
  {
    id: 'pro_weekly',
    title: 'Weekly',
    price: '$0.99',
    cadence: '/week',
    badge: 'YOUR PLAN',
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

function packageTitle(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Change Plan to Monthly';
    case 'ANNUAL':
      return 'Yearly';
    case 'LIFETIME':
      return 'Lifetime';
    default:
      return pkg.product.title || pkg.identifier;
  }
}

function cadenceForPeriod(period: string | null): string {
  switch (period) {
    case 'P1W':
      return '/week';
    case 'P1M':
      return '/month';
    case 'P1Y':
      return '/year';
    case 'P6M':
      return '/6 months';
    case 'P3M':
      return '/3 months';
    default:
      return '';
  }
}

function detailForPackage(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'WEEKLY':
      return 'Subscribe for a Week';
    case 'MONTHLY':
      return 'Subscribe for a Month';
    case 'ANNUAL':
      return 'Subscribe for a Year';
    default:
      return pkg.product.description || 'Subscribe';
  }
}

function planFromPackage(pkg: PurchasesPackage, index: number): RevenueCatPaywallPlan {
  return {
    id: pkg.identifier,
    title: packageTitle(pkg),
    price: pkg.product.priceString,
    cadence: cadenceForPeriod(pkg.product.subscriptionPeriod),
    badge: index === 0 ? 'YOUR PLAN' : pkg.packageType === 'ANNUAL' ? 'BEST VALUE' : null,
    detail: detailForPackage(pkg),
  };
}

export function MembershipPaywallPreview({
  visible,
  onClose,
  packages,
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

  const plans = packages?.length
    ? packages.map(planFromPackage)
    : FALLBACK_PLANS;

  const handleSubscribe = (packageID: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (__DEV__) {
      console.log('[Paywall] Subscribe pressed', { packageID });
    }
    void onPurchase?.(packageID);
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
      <NativeRevenueCatPaywall
        style={styles.paywall}
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
