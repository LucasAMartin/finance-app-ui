import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { useTheme } from '../ThemeProvider';
import { VoiceSheet, type SavedExpenseInfo } from './VoiceSheet';
import { TxSheet } from './TxSheet';
import { BillSheet } from './BillSheet';
import { NativeDynamicHeightSheetDemo } from '../../modules/glass-card/src/NativeDynamicHeightSheetDemo';
import type { Bill, Transaction } from '../repositories/types';

// Each sheet owns its own visibility/data state inside a leaf mount, exposed via
// an imperative handle. Opening a sheet re-renders ONLY that mount — not App and
// its four always-mounted screens — which is what was causing the press-to-open
// latency (App state change → whole-tree re-render before the sheet could show).

export interface VoiceSheetHandle {
  open: (mode: 'voice' | 'manual') => void;
}

export const VoiceSheetMount = forwardRef<VoiceSheetHandle, {
  onSaved?: (info: SavedExpenseInfo) => void;
}>(function VoiceSheetMount({ onSaved }, ref) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');

  useImperativeHandle(ref, () => ({
    open: (m) => { setMode(m); setVisible(true); },
  }), []);

  return (
    <VoiceSheet
      theme={theme}
      visible={visible}
      initialMode={mode}
      onSaved={onSaved}
      onClose={() => setVisible(false)}
    />
  );
});

export interface TxSheetHandle {
  prepare: (tx: Transaction) => void;
  open: (tx: Transaction) => void;
}

export const TxSheetMount = forwardRef<TxSheetHandle, {
  onDeleted?: (tx: Transaction) => void;
}>(function TxSheetMount({ onDeleted }, ref) {
  const { theme } = useTheme();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [visible, setVisible] = useState(false);
  const [openRequestId, setOpenRequestId] = useState(0);

  useImperativeHandle(ref, () => ({
    prepare: (next) => setTx(next),
    open: (next) => {
      setTx(next);
      setVisible(true);
      setOpenRequestId(id => id + 1);
    },
  }), []);

  return (
    <TxSheet
      tx={tx}
      visible={visible}
      openRequestId={openRequestId}
      theme={theme}
      onClose={() => setVisible(false)}
      onDeleted={onDeleted}
    />
  );
});

export interface BillSheetHandle {
  open: (bill: Bill) => void;
}

export const BillSheetMount = forwardRef<BillSheetHandle, {}>(function BillSheetMount(_props, ref) {
  const { theme } = useTheme();
  const [bill, setBill] = useState<Bill | null>(null);

  useImperativeHandle(ref, () => ({
    open: (next) => setBill(next),
  }), []);

  return <BillSheet bill={bill} theme={theme} onClose={() => setBill(null)} />;
});

export interface DynamicHeightSheetDemoHandle {
  open: () => void;
}

export const DynamicHeightSheetDemoMount = forwardRef<DynamicHeightSheetDemoHandle, {}>(function DynamicHeightSheetDemoMount(_props, ref) {
  const { theme } = useTheme();
  const [presentationToken, setPresentationToken] = useState(0);

  useImperativeHandle(ref, () => ({
    open: () => setPresentationToken(token => token + 1),
  }), []);

  return (
    <NativeDynamicHeightSheetDemo
      presentationToken={presentationToken}
      isDark={theme.dark}
    />
  );
});
