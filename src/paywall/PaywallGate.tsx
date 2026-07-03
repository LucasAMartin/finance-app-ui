import React, { useEffect, useRef, useState } from 'react';

import { usePaywall } from './PaywallProvider';

export function PaywallGate() {
  const {
    mode,
    status,
    isPremium,
    presentPaywall,
  } = usePaywall();
  const [paywallAttempted, setPaywallAttempted] = useState(false);
  const presentingRef = useRef(false);

  useEffect(() => {
    if (mode !== 'live' || isPremium || status !== 'ready') return;
    if (paywallAttempted || presentingRef.current) return;
    presentingRef.current = true;
    presentPaywall()
      .finally(() => {
        presentingRef.current = false;
        setPaywallAttempted(true);
      });
  }, [isPremium, mode, paywallAttempted, presentPaywall, status]);

  return null;
}
