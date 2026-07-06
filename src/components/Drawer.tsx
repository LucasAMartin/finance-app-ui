import React, { useMemo } from 'react';
import {
  Animated,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';
import { NativeXStyleSideBar, type NativeXStyleSideBarItem } from '../../modules/glass-card/src/NativeXStyleSideBar';
import { Theme } from '../theme';
import type { LedgerMember } from '../repositories/types';

export interface DrawerItem {
  id: string;
  label: string;
  systemIcon: SFSymbol;
  activeSystemIcon?: SFSymbol;
  badge?: string | number;
  highlight?: boolean;
}

export interface DrawerSection {
  title?: string;
  items: DrawerItem[];
}

interface Props {
  theme: Theme;
  width: number;
  progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  activeId?: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
  currentUserId: string;
  ledgerMembers: LedgerMember[];
  onOpenProfile: () => void;
}

const X_STYLE_SIDE_BAR_WIDTH = 280;

const MAIN_ITEMS: DrawerItem[] = [
  { id: 'home',       label: 'Dashboard', systemIcon: 'house', activeSystemIcon: 'house.fill' },
  { id: 'budget',     label: 'Budgets',   systemIcon: 'chart.pie', activeSystemIcon: 'chart.pie.fill' },
  { id: 'insights',   label: 'Insights',  systemIcon: 'lightbulb', activeSystemIcon: 'lightbulb.fill' },
  { id: 'activity',   label: 'Activity',  systemIcon: 'list.bullet.rectangle', activeSystemIcon: 'list.bullet.rectangle.fill', badge: 3 },
  { id: 'goals',      label: 'Goals',     systemIcon: 'target' },
];

const BOTTOM_ITEMS: DrawerItem[] = [
  { id: 'settings', label: 'Settings', systemIcon: 'gearshape' },
  { id: 'help',     label: 'Support',  systemIcon: 'questionmark.circle' },
];

function toNativeItems(items: DrawerItem[]): NativeXStyleSideBarItem[] {
  return items.map(item => ({
    id: item.id,
    title: item.label,
    icon: item.systemIcon,
  }));
}

export function Drawer({
  theme,
  width,
  progress,
  currentUserId,
  ledgerMembers,
  onNavigate,
  onOpenProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  const sideBarWidth = Math.min(width, X_STYLE_SIDE_BAR_WIDTH);
  const currentMember = ledgerMembers.find(member => member.userId === currentUserId);
  const profileName = currentMember?.displayName ?? currentUserId;
  const profileImageDataUri = memberProfileImageDataUri(currentMember);
  const mainItems = useMemo(() => toNativeItems(MAIN_ITEMS), []);
  const bottomItems = useMemo(() => toNativeItems(BOTTOM_ITEMS), []);

  const scale = (progress as Animated.Value).interpolate
    ? (progress as Animated.Value).interpolate({
        inputRange: [0, 1],
        outputRange: [0.95, 1],
      })
    : 1;

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          width: sideBarWidth,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: theme.bg,
          opacity: progress,
          transform: [{ scale }],
        },
      ]}
    >
      <NativeXStyleSideBar
        items={mainItems}
        bottomItems={bottomItems}
        profileName={profileName}
        profileImageUri={profileImageDataUri}
        isDark={theme.dark}
        onNavigate={onNavigate}
        onProfilePress={onOpenProfile}
        style={styles.nativeSideBar}
      />
    </Animated.View>
  );
}

function memberProfileImageDataUri(member?: LedgerMember): string | undefined {
  const value = member?.meta?.profileImageDataUri;
  return typeof value === 'string' && value.startsWith('data:image/') ? value : undefined;
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  nativeSideBar: {
    flex: 1,
  },
});
