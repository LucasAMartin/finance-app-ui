import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type CategorySubmitEvent = {
  nativeEvent: {
    label?: string;
    icon?: string;
    group?: string;
    budget?: string;
    goalTarget?: string;
    goalSaved?: string;
    goalDeadline?: string;
    notes?: string;
  };
};

type NativeBudgetCategorySheetViewProps = ViewProps & {
  presentationToken?: number;
  isPresented?: boolean;
  payloadJson?: string;
  isDark?: boolean;
  onSubmit?: (event: CategorySubmitEvent) => void;
  onDelete?: () => void;
  onDismiss?: () => void;
};

const NativeBudgetCategorySheetView = Platform.OS === 'ios'
  ? requireNativeView<NativeBudgetCategorySheetViewProps>('GlassCard', 'NativeBudgetCategorySheetView')
  : null;

export interface NativeBudgetCategoryIconOption {
  id: string;
  label: string;
  systemName: string;
}

export interface NativeBudgetCategorySheetPayload {
  mode: 'add' | 'edit';
  title: string;
  label: string;
  icon: string;
  group: string;
  budget: string;
  goalTarget: string;
  goalSaved: string;
  goalDeadline: string;
  notes: string;
  canEdit: boolean;
  lockedCopy?: string;
  nameError: boolean;
  formError: string;
  currencySymbol: string;
  iconOptions: NativeBudgetCategoryIconOption[];
  surface: string;
  sheetBg: string;
  chipBg: string;
  text: string;
  textSec: string;
  textTer: string;
  sep: string;
  hairline: string;
  accent: string;
  accentInk: string;
  over: string;
  needsColor: string;
  wantsColor: string;
  savingsColor: string;
}

export interface NativeBudgetCategorySheetDraft {
  label: string;
  icon: string;
  group: string;
  budget: string;
  goalTarget: string;
  goalSaved: string;
  goalDeadline: string;
  notes: string;
}

export function NativeBudgetCategorySheet({
  presentationToken,
  presented,
  payload,
  isDark,
  onSubmit,
  onDelete,
  onDismiss,
}: {
  presentationToken: number;
  presented: boolean;
  payload: NativeBudgetCategorySheetPayload | null;
  isDark: boolean;
  onSubmit: (draft: NativeBudgetCategorySheetDraft) => void;
  onDelete: () => void;
  onDismiss: () => void;
}) {
  if (!NativeBudgetCategorySheetView) {
    return <View pointerEvents="none" style={styles.host} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      pointerEvents="none"
      style={styles.host}
    >
      <NativeBudgetCategorySheetView
        presentationToken={presentationToken}
        isPresented={presented}
        payloadJson={payload ? JSON.stringify(payload) : ''}
        isDark={isDark}
        onSubmit={(event) => {
          const draft = event.nativeEvent;
          onSubmit({
            label: draft.label ?? '',
            icon: draft.icon ?? 'tag',
            group: draft.group ?? 'needs',
            budget: draft.budget ?? '',
            goalTarget: draft.goalTarget ?? '',
            goalSaved: draft.goalSaved ?? '',
            goalDeadline: draft.goalDeadline ?? '',
            notes: draft.notes ?? '',
          });
        }}
        onDelete={onDelete}
        onDismiss={onDismiss}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 1,
    height: 1,
    left: 0,
    top: 0,
  },
});
