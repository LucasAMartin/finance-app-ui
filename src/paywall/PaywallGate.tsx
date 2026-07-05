import React, { useEffect, useState } from 'react';

import { usePaywall } from './PaywallProvider';
import { MembershipPaywallPreview } from './MembershipPaywallPreview';

export function PaywallGate() {
  const {
    mode,
    status,
    isPremium,
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

  return paywallOpen ? (
    <MembershipPaywallPreview
      visible={paywallOpen}
      onClose={() => setPaywallOpen(false)}
    />
  ) : null;
}
