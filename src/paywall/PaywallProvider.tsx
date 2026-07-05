import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Purchases, { LOG_LEVEL, type CustomerInfo, type CustomerInfoUpdateListener } from 'react-native-purchases';
import type { PurchasesOffering } from 'react-native-purchases';

import {
  PAYWALL_ENTITLEMENT_ID,
  PAYWALL_MODE,
  REVENUECAT_OFFERING_ID,
  revenueCatApiKeyForPlatform,
  supportsNativePurchases,
  type PaywallMode,
} from './config';

type PaywallStatus =
  | 'off'
  | 'configuring'
  | 'ready'
  | 'missing-config'
  | 'unsupported'
  | 'error';

interface PaywallContextValue {
  mode: PaywallMode;
  status: PaywallStatus;
  error: string | null;
  isPremium: boolean;
  isBusy: boolean;
  customerInfo: CustomerInfo | null;
  offering: PurchasesOffering | null;
  restorePurchases: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<void>;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

function customerHasEntitlement(info: CustomerInfo | null): boolean {
  return Boolean(info?.entitlements.active[PAYWALL_ENTITLEMENT_ID]);
}

function logPaywallCustomerInfo(info: CustomerInfo | null, label: string) {
  if (!__DEV__ || !info) return;
  const activeEntitlements = Object.keys(info.entitlements.active);
  console.log(
    `[Paywall] ${label}`,
    {
      expectedEntitlement: PAYWALL_ENTITLEMENT_ID,
      activeEntitlements,
      activeSubscriptions: info.activeSubscriptions,
      hasExpectedEntitlement: activeEntitlements.includes(PAYWALL_ENTITLEMENT_ID),
    },
  );
}

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [status, setStatus] = useState<PaywallStatus>(() => {
    if (PAYWALL_MODE === 'off') return 'off';
    return 'configuring';
  });
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const configuredRef = useRef(false);

  const refreshCustomerInfo = useCallback(async () => {
    if (PAYWALL_MODE !== 'live' || !configuredRef.current) return;
    const info = await Purchases.getCustomerInfo();
    logPaywallCustomerInfo(info, 'refreshed customer info');
    setCustomerInfo(info);
  }, []);

  useEffect(() => {
    if (PAYWALL_MODE !== 'live') return undefined;

    let cancelled = false;
    let listener: CustomerInfoUpdateListener | null = null;

    async function configureRevenueCat() {
      if (!supportsNativePurchases()) {
        setStatus('unsupported');
        setError('Native subscriptions are available in iOS and Android builds.');
        return;
      }

      const apiKey = revenueCatApiKeyForPlatform();
      if (!apiKey) {
        setStatus('missing-config');
        setError('Add your RevenueCat API key before enabling live paywall mode.');
        return;
      }

      try {
        setStatus('configuring');
        setError(null);
        await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
        const alreadyConfigured = await Purchases.isConfigured().catch(() => false);
        if (!alreadyConfigured) {
          Purchases.configure({ apiKey });
        }
        configuredRef.current = true;

        const [info, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);
        if (cancelled) return;

        const selectedOffering = offerings.all[REVENUECAT_OFFERING_ID] ?? null;
        if (!selectedOffering) {
          setStatus('error');
          setError(`RevenueCat offering "${REVENUECAT_OFFERING_ID}" was not found.`);
          return;
        }

        setCustomerInfo(info);
        logPaywallCustomerInfo(info, 'initial customer info');
        setOffering(selectedOffering);
        listener = (nextInfo: CustomerInfo) => {
          logPaywallCustomerInfo(nextInfo, 'customer info listener update');
          setCustomerInfo(nextInfo);
        };
        Purchases.addCustomerInfoUpdateListener(listener);
        setStatus('ready');
      } catch (nextError) {
        if (cancelled) return;
        const message = nextError instanceof Error ? nextError.message : 'RevenueCat setup failed.';
        setError(message);
        setStatus('error');
      }
    }

    configureRevenueCat();

    return () => {
      cancelled = true;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const restorePurchases = useCallback(async () => {
    if (PAYWALL_MODE === 'off') return true;
    if (!configuredRef.current) return false;

    setIsBusy(true);
    try {
      const info = await Purchases.restorePurchases();
      logPaywallCustomerInfo(info, 'restored customer info');
      setCustomerInfo(info);
      return customerHasEntitlement(info);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Could not restore purchases.';
      setError(message);
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const value = useMemo<PaywallContextValue>(() => ({
    mode: PAYWALL_MODE,
    status,
    error,
    isBusy,
    customerInfo,
    offering,
    isPremium: PAYWALL_MODE === 'off' || customerHasEntitlement(customerInfo),
    restorePurchases,
    refreshCustomerInfo,
  }), [
    customerInfo,
    error,
    isBusy,
    offering,
    refreshCustomerInfo,
    restorePurchases,
    status,
  ]);

  return (
    <PaywallContext.Provider value={value}>
      {children}
    </PaywallContext.Provider>
  );
}

export function usePaywall() {
  const value = useContext(PaywallContext);
  if (!value) {
    throw new Error('usePaywall must be used inside PaywallProvider');
  }
  return value;
}
