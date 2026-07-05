import React, { useMemo } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

export type RevenueCatPaywallPlan = {
  id: string;
  title: string;
  price: string;
  cadence: string;
  badge?: string | null;
  detail: string;
};

type NativeRevenueCatPaywallNativeProps = ViewProps & {
  appName?: string;
  title?: string;
  subtitle?: string;
  plansJSON?: string;
  isBusy?: boolean;
  onClose?: () => void;
  onSubscribe?: (event: { nativeEvent: { packageID: string } }) => void;
  onRestore?: () => void;
};

const NativeRevenueCatPaywallView = Platform.OS === 'ios'
  ? requireNativeView<NativeRevenueCatPaywallNativeProps>('GlassCard', 'NativeRevenueCatPaywallView')
  : null;

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

export function NativeRevenueCatPaywall({
  style,
  appName = 'App Name',
  title = 'Membership',
  subtitle = 'Lorem Ipsum is simply dummy text\nof the printing and typesetting industry.',
  plans = FALLBACK_PLANS,
  isBusy = false,
  onClose,
  onSubscribe,
  onRestore,
}: {
  style?: StyleProp<ViewStyle>;
  appName?: string;
  title?: string;
  subtitle?: string;
  plans?: RevenueCatPaywallPlan[];
  isBusy?: boolean;
  onClose?: () => void;
  onSubscribe?: (packageID: string) => void;
  onRestore?: () => void;
}) {
  const plansJSON = useMemo(() => JSON.stringify(plans), [plans]);

  if (!NativeRevenueCatPaywallView) {
    return <View style={[style, styles.fallback]} />;
  }

  return (
    <View collapsable={false} style={[style, styles.root]}>
      <Host colorScheme="dark" ignoreSafeArea="all" style={styles.host}>
        <NativeRevenueCatPaywallView
          style={styles.nativeFill}
          appName={appName}
          title={title}
          subtitle={subtitle}
          plansJSON={plansJSON}
          isBusy={isBusy}
          onClose={onClose}
          onSubscribe={(event) => onSubscribe?.(event.nativeEvent.packageID)}
          onRestore={onRestore}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#05070D',
  },
  host: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  nativeFill: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  root: {
    backgroundColor: 'transparent',
  },
});
