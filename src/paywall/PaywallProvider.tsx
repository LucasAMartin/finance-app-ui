import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import GlassCardModule, {
  type StoreKitEntitlementStatus,
  type StoreKitProduct,
} from '../../modules/glass-card/src/GlassCardModule';
import {
  PAYWALL_MODE,
  STOREKIT_PRODUCT_IDS,
  supportsStoreKitPurchases,
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
  products: StoreKitProduct[];
  entitlementStatus: StoreKitEntitlementStatus | null;
  purchaseProduct: (productID: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshEntitlementStatus: () => Promise<void>;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

function isPremiumStatus(status: StoreKitEntitlementStatus | null): boolean {
  return Boolean(status?.isPremium);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [entitlementStatus, setEntitlementStatus] = useState<StoreKitEntitlementStatus | null>(null);
  const [status, setStatus] = useState<PaywallStatus>(() => {
    if (PAYWALL_MODE === 'off') return 'off';
    return 'configuring';
  });
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [products, setProducts] = useState<StoreKitProduct[]>([]);

  const refreshEntitlementStatus = useCallback(async () => {
    if (PAYWALL_MODE !== 'live' || !supportsStoreKitPurchases()) return;
    const nextStatus = await GlassCardModule.getStoreKitEntitlementStatus(STOREKIT_PRODUCT_IDS);
    setEntitlementStatus(nextStatus);
  }, []);

  useEffect(() => {
    if (PAYWALL_MODE !== 'live') return undefined;

    let cancelled = false;

    async function configureStoreKit() {
      if (!supportsStoreKitPurchases()) {
        setStatus('unsupported');
        setError('StoreKit subscriptions are available in iOS builds.');
        return;
      }

      if (STOREKIT_PRODUCT_IDS.length === 0) {
        setStatus('missing-config');
        setError('Add StoreKit product IDs before enabling live paywall mode.');
        return;
      }

      try {
        setStatus('configuring');
        setError(null);

        const nextEntitlementStatus = await GlassCardModule.getStoreKitEntitlementStatus(STOREKIT_PRODUCT_IDS);
        let nextProducts: StoreKitProduct[] = [];

        try {
          nextProducts = await GlassCardModule.getStoreKitProducts(STOREKIT_PRODUCT_IDS);
        } catch (productError) {
          if (__DEV__) {
            console.warn('[Paywall] StoreKit product prefetch failed. Native paywall will load products directly.', productError);
          }
        }
        if (cancelled) return;

        setProducts(nextProducts);
        setEntitlementStatus(nextEntitlementStatus);
        setStatus('ready');
      } catch (nextError) {
        if (cancelled) return;
        setError(errorMessage(nextError, 'StoreKit setup failed.'));
        setStatus('error');
      }
    }

    configureStoreKit();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (PAYWALL_MODE !== 'live' || !supportsStoreKitPurchases()) return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshEntitlementStatus().catch((nextError) => {
          setError(errorMessage(nextError, 'Could not refresh StoreKit subscription status.'));
        });
      }
    });

    return () => subscription.remove();
  }, [refreshEntitlementStatus]);

  const restorePurchases = useCallback(async () => {
    if (PAYWALL_MODE === 'off') return true;
    if (!supportsStoreKitPurchases()) return false;

    setIsBusy(true);
    try {
      const nextStatus = await GlassCardModule.restoreStoreKitPurchases(STOREKIT_PRODUCT_IDS);
      setEntitlementStatus(nextStatus);
      return isPremiumStatus(nextStatus);
    } catch (nextError) {
      setError(errorMessage(nextError, 'Could not restore purchases.'));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const purchaseProduct = useCallback(async (productID: string) => {
    if (PAYWALL_MODE === 'off') return true;
    if (!supportsStoreKitPurchases()) return false;

    setIsBusy(true);
    try {
      const nextStatus = await GlassCardModule.purchaseStoreKitProduct(productID, STOREKIT_PRODUCT_IDS);
      setEntitlementStatus(nextStatus);
      if (nextStatus.pending) {
        setError('The purchase is pending approval.');
      }
      return isPremiumStatus(nextStatus);
    } catch (nextError) {
      setError(errorMessage(nextError, 'Could not complete purchase.'));
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
    products,
    entitlementStatus,
    isPremium: PAYWALL_MODE === 'off' || isPremiumStatus(entitlementStatus),
    purchaseProduct,
    restorePurchases,
    refreshEntitlementStatus,
  }), [
    entitlementStatus,
    error,
    isBusy,
    products,
    purchaseProduct,
    refreshEntitlementStatus,
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
