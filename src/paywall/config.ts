import { Platform } from 'react-native';

export type PaywallMode = 'off' | 'live';

const rawMode = process.env.EXPO_PUBLIC_PAYWALL_MODE;

function normalizeMode(value: string | undefined): PaywallMode {
  if (value === 'off' || value === 'live') return value;
  return __DEV__ ? 'off' : 'live';
}

export const PAYWALL_MODE = normalizeMode(rawMode);

const DEFAULT_STOREKIT_PRODUCT_IDS = ['pro_weekly', 'pro_monthly', 'pro_yearly'];

function productIDsFromEnv(value: string | undefined): string[] {
  const ids = value
    ?.split(',')
    .map(id => id.trim())
    .filter(Boolean);

  return ids?.length ? ids : DEFAULT_STOREKIT_PRODUCT_IDS;
}

export const STOREKIT_PRODUCT_IDS = productIDsFromEnv(process.env.EXPO_PUBLIC_STOREKIT_PRODUCT_IDS);

export const PAYWALL_APP_NAME =
  process.env.EXPO_PUBLIC_PAYWALL_APP_NAME?.trim() || 'App Name';
export const PAYWALL_TITLE =
  process.env.EXPO_PUBLIC_PAYWALL_TITLE?.trim() || 'Membership';
export const PAYWALL_SUBTITLE =
  process.env.EXPO_PUBLIC_PAYWALL_SUBTITLE?.trim()
  || 'Lorem Ipsum is simply dummy text\nof the printing and typesetting industry.';
export const PAYWALL_CTA_LABEL =
  process.env.EXPO_PUBLIC_PAYWALL_CTA_LABEL?.trim() || 'Start 30 Day Free Trial';

export function supportsStoreKitPurchases(): boolean {
  return Platform.OS === 'ios';
}
