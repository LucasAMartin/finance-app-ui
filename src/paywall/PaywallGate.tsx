import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePaywall } from './PaywallProvider';
import { NativePayWallStoreKitDemo } from '../../modules/glass-card/src/NativePayWallStoreKitDemo';

interface PaywallGateProps {
  onOpenChange?: (open: boolean) => void;
}

export function PaywallGate({ onOpenChange }: PaywallGateProps = {}) {
  const {
    mode,
    status,
    isPremium,
    refreshEntitlementStatus,
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

  const handlePurchaseComplete = useCallback(() => {
    setPaywallOpen(false);
    void refreshEntitlementStatus();
  }, [refreshEntitlementStatus]);

  return paywallOpen ? (
    <View style={styles.root}>
      <NativePayWallStoreKitDemo
        style={StyleSheet.absoluteFill}
        onPurchaseComplete={handlePurchaseComplete}
      />
    </View>
  ) : null;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#000',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 130,
  },
});
