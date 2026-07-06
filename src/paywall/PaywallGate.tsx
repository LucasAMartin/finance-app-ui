import React, { useEffect, useState } from 'react';

import { usePaywall } from './PaywallProvider';
import { MembershipPaywallPreview } from './MembershipPaywallPreview';

interface PaywallGateProps {
  onOpenChange?: (open: boolean) => void;
}

export function PaywallGate({ onOpenChange }: PaywallGateProps = {}) {
  const {
    mode,
    status,
    isPremium,
    isBusy,
    products,
    purchaseProduct,
    restorePurchases,
  } = usePaywall();
  const [paywallAttempted, setPaywallAttempted] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (mode !== 'live' || isPremium || status !== 'ready') return;
    if (paywallAttempted) return;
    setPaywallOpen(true);
    setPaywallAttempted(true);
  }, [isPremium, mode, paywallAttempted, status]);

  useEffect(() => {
    if (mode !== 'live' || isPremium) setPaywallOpen(false);
  }, [isPremium, mode]);

  useEffect(() => {
    onOpenChange?.(paywallOpen);
  }, [onOpenChange, paywallOpen]);

  useEffect(() => () => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  return paywallOpen ? (
    <MembershipPaywallPreview
      visible={paywallOpen}
      onClose={() => setPaywallOpen(false)}
      products={products}
      isBusy={isBusy}
      onPurchase={async (productID) => {
        const didPurchase = await purchaseProduct(productID);
        if (didPurchase) setPaywallOpen(false);
      }}
      onRestore={async () => {
        const didRestore = await restorePurchases();
        if (didRestore) setPaywallOpen(false);
      }}
    />
  ) : null;
}
