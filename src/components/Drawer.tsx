import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image as RNImage,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Theme } from '../theme';
import { ScreenExitButton } from './GlassButton';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';
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
  { id: 'signout',  label: 'Sign out', systemIcon: 'rectangle.portrait.and.arrow.right' },
];

function memberProfileImageDataUri(member?: LedgerMember): string | undefined {
  const value = member?.meta?.profileImageDataUri;
  return typeof value === 'string' && value.startsWith('data:image/') ? value : undefined;
}

export function Drawer({
  theme,
  width,
  progress,
  activeId,
  onNavigate,
  onClose,
  currentUserId,
  ledgerMembers,
  onOpenProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  const currentMember = ledgerMembers.find(member => member.userId === currentUserId);
  const profileName = currentMember?.displayName ?? currentUserId;
  const initial = profileName.trim().slice(0, 1).toUpperCase() || 'U';
  const profileImageDataUri = memberProfileImageDataUri(currentMember);

  const translateX = (progress as Animated.Value).interpolate
    ? (progress as Animated.Value).interpolate({
        inputRange: [0, 1],
        outputRange: [-width, 0],
      })
    : 0;

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          width,
          backgroundColor: theme.surface,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 24,
          borderRightColor: theme.hairline,
          transform: [{ translateX }],
          shadowColor: '#000',
          shadowOffset: { width: 8, height: 0 },
          shadowOpacity: theme.dark ? 0.5 : 0.15,
          shadowRadius: 24,
          elevation: 14,
        },
      ]}
    >
      {/* Close button — top-left, matches the hamburger position on home */}
      <View style={styles.topRow}>
        <ScreenExitButton
          variant="close"
          onPress={onClose}
          tint={theme.textSec}
          fallbackBg={theme.chipBg}
        />
      </View>

      <View style={styles.content}>
        {/* Profile */}
        <TouchableOpacity
          onPress={onOpenProfile}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          style={styles.profile}
        >
          <View style={[styles.avatar, { backgroundColor: theme.accent.fill }]}>
            {profileImageDataUri ? (
              <RNImage source={{ uri: profileImageDataUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[TYPE.headline, { color: theme.accent.ink }]}>{initial}</Text>
            )}
          </View>
          <View style={styles.profileCopy}>
            <Text style={[TYPE.headline, { color: theme.text }]} numberOfLines={1}>
              {profileName}
            </Text>
            <Text style={[TYPE.bodySmEm, { color: theme.textSec, marginTop: 2 }]}>
              Account settings
            </Text>
          </View>
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: theme.sep }]} />

        <View style={styles.section}>
          {MAIN_ITEMS.map((item) => (
            <DrawerNavItem
              key={item.id}
              item={item}
              theme={theme}
              selected={item.id === activeId}
              onPress={() => onNavigate(item.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.bottomActions}>
        {BOTTOM_ITEMS.map((item) => (
          <DrawerNavItem
            key={item.id}
            item={item}
            theme={theme}
            selected={false}
            onPress={() => onNavigate(item.id)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function DrawerNavItem({
  item,
  theme,
  selected,
  onPress,
}: {
  item: DrawerItem;
  theme: Theme;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.55}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={styles.item}
    >
      <Host style={styles.iconHost} ignoreSafeArea="all">
        <SwiftUIImage
          systemName={selected ? item.activeSystemIcon ?? item.systemIcon : item.systemIcon}
          size={20}
          color={selected ? theme.text : item.highlight ? theme.accent.dot : theme.textSec}
        />
      </Host>
      <Text style={[TYPE.subsectionTitle, { flex: 1, color: theme.text, fontWeight: selected ? '700' : TYPE.subsectionTitle.fontWeight }]}>
        {item.label}
      </Text>
      {item.badge != null && (
        <View style={[styles.badge, { backgroundColor: theme.accent.fill }]}>
          <Text style={[TYPE.labelLg, { color: theme.accent.ink }]}>
            {item.badge}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    borderTopRightRadius: RADIUS.card,
    borderBottomRightRadius: RADIUS.card,
    borderRightWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    marginBottom: 12,
    marginLeft: -4,
  },
  content: {
    flex: 1,
  },
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingTop: 4,
    paddingBottom: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    height: 1,
    marginTop: 20,
    marginBottom: 20,
    marginHorizontal: -20,
  },
  section: {
    marginBottom: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: -6,
    borderRadius: RADIUS.field,
  },
  bottomActions: {
    paddingTop: 8,
  },
  iconHost: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 24,
    height: 22,
    borderRadius: RADIUS.chip,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
