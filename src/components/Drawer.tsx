import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Switch,
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
  onNavigate: (id: string) => void;
  onClose: () => void;
  sampleDataEnabled: boolean;
  onSampleDataEnabledChange: (enabled: boolean) => void;
  activeLedgerName?: string;
  currentUserId: string;
  ledgerMembers: LedgerMember[];
  onOpenProfile: () => void;
  onCurrentUserChange: (userId: string) => void;
  onCurrentMemberEditLockChange: (allow: boolean) => void;
}

const SECTIONS: DrawerSection[] = [
  {
    items: [
      { id: 'home',       label: 'Dashboard',      systemIcon: 'house' },
      { id: 'budget',     label: 'Budgets',        systemIcon: 'chart.pie' },
      { id: 'insights',   label: 'Insights',       systemIcon: 'lightbulb' },
      { id: 'activity',   label: 'Activity',       systemIcon: 'list.bullet', badge: 3 },
      { id: 'goals',      label: 'Goals',          systemIcon: 'target' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { id: 'settings',   label: 'Settings',       systemIcon: 'gearshape' },
    ],
  },
  {
    title: 'Support',
    items: [
      { id: 'help',       label: 'Help & support', systemIcon: 'questionmark.circle' },
      { id: 'signout',    label: 'Sign out',       systemIcon: 'rectangle.portrait.and.arrow.right' },
    ],
  },
];

function memberProfileImageDataUri(member?: LedgerMember): string | undefined {
  const value = member?.meta?.profileImageDataUri;
  return typeof value === 'string' && value.startsWith('data:image/') ? value : undefined;
}

export function Drawer({
  theme,
  width,
  progress,
  onNavigate,
  onClose,
  sampleDataEnabled,
  onSampleDataEnabledChange,
  activeLedgerName,
  currentUserId,
  ledgerMembers,
  onOpenProfile,
  onCurrentUserChange,
  onCurrentMemberEditLockChange,
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
        <Text style={[TYPE.headline, { color: theme.text, marginTop: 12 }]}>
          {profileName}
        </Text>
        <Text style={[TYPE.bodySmEm, { color: theme.textSec, marginTop: 2 }]}>
          {activeLedgerName ?? 'Shared ledger'}
        </Text>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: theme.sep }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {SECTIONS.map((section, si) => (
          <View key={si} style={{ marginBottom: 20 }}>
            {section.title && (
              <Text style={[TYPE.labelLg, styles.sectionTitle, { color: theme.textTer }]}>
                {section.title}
              </Text>
            )}
            {section.items.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => onNavigate(item.id)}
                activeOpacity={0.55}
                accessibilityRole="button"
                style={styles.item}
              >
                <Host style={styles.iconHost} ignoreSafeArea="all">
                  <SwiftUIImage
                    systemName={item.systemIcon}
                    size={20}
                    color={item.highlight ? theme.accent.dot : theme.textSec}
                  />
                </Host>
                <Text style={[TYPE.subsectionTitle, { flex: 1, color: theme.text }]}>
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
            ))}
          </View>
        ))}
        {__DEV__ && (
          <View style={{ marginBottom: 20 }}>
            <Text style={[TYPE.labelLg, styles.sectionTitle, { color: theme.textTer }]}>
              Developer
            </Text>
            <View style={styles.devRow}>
              <Host style={styles.iconHost} ignoreSafeArea="all">
                <SwiftUIImage
                  systemName="externaldrive"
                  size={20}
                  color={theme.textSec}
                />
              </Host>
              <View style={styles.devCopy}>
                <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>
                  Sample data
                </Text>
                <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2 }]}>
                  Off clears the app state; on reloads the seed DB.
                </Text>
              </View>
              <Switch
                value={sampleDataEnabled}
                onValueChange={onSampleDataEnabledChange}
                trackColor={{ false: theme.chipBg, true: theme.accent.fill }}
                thumbColor={sampleDataEnabled ? theme.accent.ink : theme.surface}
                ios_backgroundColor={theme.chipBg}
                accessibilityLabel="Toggle sample data"
              />
            </View>
            <View style={styles.devBlock}>
              <View style={styles.devHeaderRow}>
                <Host style={styles.iconHost} ignoreSafeArea="all">
                  <SwiftUIImage
                    systemName="person.2"
                    size={20}
                    color={theme.textSec}
                  />
                </Host>
                <View style={styles.devCopy}>
                  <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>
                    Dev identity
                  </Text>
                  <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2 }]}>
                    Switch local member for shared ledger testing.
                  </Text>
                </View>
              </View>
              {ledgerMembers.length > 0 ? (
                <View style={styles.memberGrid}>
                  {ledgerMembers.map(member => {
                    const selected = member.userId === currentUserId;
                    return (
                      <TouchableOpacity
                        key={member.id}
                        onPress={() => onCurrentUserChange(member.userId)}
                        activeOpacity={0.65}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.memberPill,
                          {
                            backgroundColor: selected ? theme.accent.fill : theme.chipBg,
                            borderColor: selected ? theme.accent.dot : theme.hairline,
                          },
                        ]}
                      >
                        <Text style={[TYPE.labelLg, { color: selected ? theme.accent.ink : theme.text }]}>
                          {member.displayName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={[TYPE.caption, styles.emptyMembers, { color: theme.textSec }]}>
                  Reload sample data to seed local members.
                </Text>
              )}
            </View>
            {currentMember && (
              <View style={styles.devRow}>
                <Host style={styles.iconHost} ignoreSafeArea="all">
                  <SwiftUIImage
                    systemName={currentMember.allowOthersToEditMyItems ? 'lock.open' : 'lock'}
                    size={20}
                    color={theme.textSec}
                  />
                </Host>
                <View style={styles.devCopy}>
                  <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>
                    Others can edit my items
                  </Text>
                  <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2 }]}>
                    Off protects rows created by this member.
                  </Text>
                </View>
                <Switch
                  value={currentMember.allowOthersToEditMyItems}
                  onValueChange={onCurrentMemberEditLockChange}
                  trackColor={{ false: theme.chipBg, true: theme.accent.fill }}
                  thumbColor={currentMember.allowOthersToEditMyItems ? theme.accent.ink : theme.surface}
                  ios_backgroundColor={theme.chipBg}
                  accessibilityLabel="Toggle whether others can edit my items"
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </Animated.View>
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
  profile: {
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 60,
    height: 60,
  },
  divider: {
    height: 1,
    marginTop: 20,
    marginBottom: 20,
    marginHorizontal: -20,
  },
  sectionTitle: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
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
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  devCopy: {
    flex: 1,
    minWidth: 0,
  },
  devBlock: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 10,
  },
  devHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  memberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 38,
  },
  memberPill: {
    minHeight: 34,
    borderRadius: RADIUS.chip,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMembers: {
    paddingLeft: 38,
  },
});
