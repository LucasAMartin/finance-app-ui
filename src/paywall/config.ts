import { Platform } from 'react-native';

export type PaywallMode = 'off' | 'live';

const rawMode = process.env.EXPO_PUBLIC_PAYWALL_MODE;

function normalizeMode(value: string | undefined): PaywallMode {
  if (value === 'off' || value === 'live') return value;
  return __DEV__ ? 'off' : 'live';
}

export const PAYWALL_MODE = normalizeMode(rawMode);
export const PAYWALL_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || 'pro';
export const REVENUECAT_OFFERING_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID?.trim() || 'default';

export const REVENUECAT_IOS_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || '';
export const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || '';

export function revenueCatApiKeyForPlatform(): string {
  if (Platform.OS === 'ios') return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return REVENUECAT_ANDROID_API_KEY;
  return '';
}

export function supportsNativePurchases(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
