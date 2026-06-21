import React from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Image } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Theme } from '../theme';
import { ScreenExitButton } from '../components/GlassButton';
import type { LedgerMember } from '../repositories/types';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';
import { SPACE, LAYOUT } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  activeLedgerName?: string;
  currentUserId: string;
  ledgerMembers: LedgerMember[];
  inviteNoticeToken: number;
  onCurrentMemberEditLockChange: (allow: boolean) => void;
}

export function SharingSettingsScreen({
  theme,
  visible,
  onClose,
  activeLedgerName,
  currentUserId,
  ledgerMembers,
  inviteNoticeToken,
  onCurrentMemberEditLockChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const currentMember = ledgerMembers.find(member => member.userId === currentUserId);
  const owner = ledgerMembers.find(member => member.role === 'owner');
  const memberCountLabel = ledgerMembers.length === 1 ? '1 member' : `${ledgerMembers.length} members`;

  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  React.useEffect(() => {
    if (!visible || inviteNoticeToken === 0) return;
    Alert.alert(
      'Invites need iCloud sync',
      'Local sharing permissions are ready, but real invite links require the CloudKit/iCloud sync layer. Once that is connected, this button should open the native share invitation flow.',
    );
  }, [inviteNoticeToken, visible]);

  const showInviteNotice = React.useCallback(() => {
    Alert.alert(
      'Invites need iCloud sync',
      'This app already tracks ledgers and members locally. To invite another person, the next step is connecting the CloudKit share sheet so the ledger can sync through iCloud.',
    );
  }, []);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 79, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.bg }]}>
          <ScreenExitButton
            variant="back"
            onPress={onClose}
            tint={theme.text}
            fallbackBg={theme.chipBg}
            accessibilityLabel="Back"
          />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Sharing</Text>
          <View style={styles.headerSpacer} />
          <View style={[styles.headerDivider, { backgroundColor: theme.hairline }]} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 52 + SPACE.lg,
            paddingBottom: insets.bottom + SPACE.xxxl,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            <View style={[styles.heroIcon, { backgroundColor: theme.accent.fill }]}>
              <IconHost icon="person.2" color={theme.accent.ink} size={24} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>
                {activeLedgerName ?? 'Shared ledger'}
              </Text>
              <Text style={[TYPE.caption, { color: theme.textSec, marginTop: SPACE.xs }]}>
                {memberCountLabel} · Owner: {owner?.displayName ?? 'You'}
              </Text>
              <Text style={[TYPE.caption, { color: theme.textTer, marginTop: SPACE.sm }]}>
                Member ownership and edit permissions are active locally. iCloud sync is still needed before real cross-device sharing can be turned on.
              </Text>
            </View>
          </View>

          <Pressable
            onPress={showInviteNotice}
            accessibilityRole="button"
            accessibilityLabel="Invite someone"
            style={({ pressed }) => [
              styles.inviteRow,
              {
                backgroundColor: pressed ? theme.chipBg : theme.surface,
                borderColor: theme.hairline,
              },
            ]}
          >
            <IconHost icon="person.badge.plus" color={theme.textSec} />
            <View style={styles.rowCopy}>
              <Text style={[TYPE.body, { color: theme.text }]}>Invite someone</Text>
              <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 2 }]}>
                Requires the iCloud share sheet before it can send real invites.
              </Text>
            </View>
            <IconHost icon="chevron.right" color={theme.textTer} size={13} />
          </Pressable>

          <View style={styles.group}>
            <Text style={[TYPE.labelLg, styles.groupTitle, { color: theme.textTer }]}>
              Members
            </Text>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              {ledgerMembers.length > 0 ? (
                ledgerMembers.map((member, index) => (
                  <MemberRow
                    key={member.id}
                    theme={theme}
                    member={member}
                    currentUserId={currentUserId}
                    showSeparator={index < ledgerMembers.length - 1}
                    onCurrentMemberEditLockChange={onCurrentMemberEditLockChange}
                  />
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[TYPE.body, { color: theme.text }]}>No members yet</Text>
                  <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 2 }]}>
                    Reload sample data or connect iCloud sharing to add members.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {currentMember && (
            <View style={styles.group}>
              <Text style={[TYPE.labelLg, styles.groupTitle, { color: theme.textTer }]}>
                Your Access
              </Text>
              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                <Text style={[TYPE.body, { color: theme.text }]}>
                  You are viewing as {currentMember.displayName}.
                </Text>
                <Text style={[TYPE.caption, { color: theme.textTer, marginTop: SPACE.xs }]}>
                  Turning off edits protects items you create from changes by other members. You can still edit your own items.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

function MemberRow({
  theme,
  member,
  currentUserId,
  showSeparator,
  onCurrentMemberEditLockChange,
}: {
  theme: Theme;
  member: LedgerMember;
  currentUserId: string;
  showSeparator: boolean;
  onCurrentMemberEditLockChange: (allow: boolean) => void;
}) {
  const isCurrentUser = member.userId === currentUserId;
  const initial = member.displayName.trim().slice(0, 1).toUpperCase() || 'M';
  const role = member.role === 'owner' ? 'Owner' : 'Member';
  const permission = member.allowOthersToEditMyItems ? 'Can edit their items' : 'Only they can edit';

  return (
    <View>
      <View style={styles.memberRow}>
        <View style={[styles.avatar, { backgroundColor: isCurrentUser ? theme.accent.fill : theme.chipBg }]}>
          <Text style={[TYPE.captionEm, { color: isCurrentUser ? theme.accent.ink : theme.text }]}>
            {initial}
          </Text>
        </View>
        <View style={styles.rowCopy}>
          <View style={styles.memberTitleRow}>
            <Text style={[TYPE.body, { color: theme.text }]} numberOfLines={1}>
              {member.displayName}
            </Text>
            {isCurrentUser && (
              <View style={[styles.youPill, { backgroundColor: theme.accent.fill }]}>
                <Text style={[TYPE.labelPlain, { color: theme.accent.ink }]}>You</Text>
              </View>
            )}
          </View>
          <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 2 }]} numberOfLines={1}>
            {role} · {permission}
          </Text>
        </View>
        {isCurrentUser ? (
          <Switch
            value={member.allowOthersToEditMyItems}
            onValueChange={onCurrentMemberEditLockChange}
            trackColor={{ false: theme.chipBg, true: theme.accent.fill }}
            thumbColor={member.allowOthersToEditMyItems ? theme.accent.ink : theme.surface}
            ios_backgroundColor={theme.chipBg}
            accessibilityLabel="Allow others to edit my items"
          />
        ) : (
          <IconHost
            icon={member.allowOthersToEditMyItems ? 'lock.open' : 'lock'}
            color={theme.textTer}
          />
        )}
      </View>
      {showSeparator && (
        <View style={[styles.separator, { backgroundColor: theme.sep }]} />
      )}
    </View>
  );
}

function IconHost({
  icon,
  color,
  size = 19,
}: {
  icon: SFSymbol;
  color: string;
  size?: number;
}) {
  return (
    <Host style={styles.iconHost} ignoreSafeArea="all">
      <Image systemName={icon} size={size} color={color} />
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: LAYOUT.screenGutter,
    paddingBottom: SPACE.sm,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  headerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  heroCard: {
    marginHorizontal: LAYOUT.screenGutter,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACE.lg,
    flexDirection: 'row',
    gap: SPACE.md,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  inviteRow: {
    marginTop: SPACE.md,
    marginHorizontal: LAYOUT.screenGutter,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  group: {
    marginTop: SPACE.xxl,
  },
  groupTitle: {
    marginLeft: LAYOUT.screenGutter + SPACE.xs,
    marginBottom: SPACE.sm,
  },
  card: {
    marginHorizontal: LAYOUT.screenGutter,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    overflow: 'hidden',
  },
  infoCard: {
    marginHorizontal: LAYOUT.screenGutter,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    padding: SPACE.lg,
  },
  memberRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: 12,
    paddingHorizontal: SPACE.lg,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  youPill: {
    borderRadius: RADIUS.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  emptyState: {
    padding: SPACE.lg,
  },
  iconHost: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACE.lg + 36 + SPACE.md,
  },
});
