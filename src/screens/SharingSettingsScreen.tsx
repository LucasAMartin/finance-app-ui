import React from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button as SwiftButton,
  Form as SwiftForm,
  Host,
  LabeledContent,
  Section as SwiftSection,
  Text as SwiftText,
  Toggle as SwiftToggle,
} from '@expo/ui/swift-ui';
import {
  background,
  disabled,
  foregroundStyle,
  listStyle,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';

import { Theme } from '../theme';
import { ScreenExitButton } from '../components/GlassButton';
import type { LedgerMember } from '../repositories/types';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  activeLedgerName?: string;
  cloudShared: boolean;
  canInvite: boolean;
  participantPermission?: string;
  currentUserId: string;
  ledgerMembers: LedgerMember[];
  inviteNoticeToken: number;
  inviteBusy: boolean;
  onInviteSomeone: () => void;
  onCurrentMemberEditLockChange: (allow: boolean) => void;
}

export function SharingSettingsScreen({
  theme,
  visible,
  onClose,
  activeLedgerName,
  cloudShared,
  canInvite,
  participantPermission,
  currentUserId,
  ledgerMembers,
  inviteNoticeToken,
  inviteBusy,
  onInviteSomeone,
  onCurrentMemberEditLockChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const currentMember = ledgerMembers.find(member => member.userId === currentUserId);
  const memberCountLabel = ledgerMembers.length === 1 ? '1 member' : `${ledgerMembers.length} members`;
  const accessLabel = cloudShared
    ? `Shared with you${participantPermission ? ` · ${permissionLabel(participantPermission)}` : ''}`
      : canInvite
        ? 'You own this ledger'
        : 'Member access';
  const inviteLabel = inviteBusy ? 'Preparing iCloud share...' : canInvite ? 'Invite someone' : 'Invites are owner-only';
  const sharingFooter = cloudShared
    ? 'Accepted iCloud shares sync through the owner\'s shared database. Your new changes are saved as your own participant.'
    : 'Invite people through iCloud to keep this ledger synced across everyone\'s devices.';

  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const lastInviteTokenRef = React.useRef(0);
  React.useEffect(() => {
    if (!visible || inviteNoticeToken === 0 || inviteNoticeToken === lastInviteTokenRef.current) return;
    lastInviteTokenRef.current = inviteNoticeToken;
    onInviteSomeone();
  }, [inviteNoticeToken, onInviteSomeone, visible]);

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

        <View style={[styles.formWrap, { paddingTop: insets.top + 68 }]}>
          <Host
            style={styles.formHost}
            colorScheme={theme.dark ? 'dark' : 'light'}
            ignoreSafeArea="keyboard"
          >
            <SwiftForm
              modifiers={[
                listStyle('insetGrouped'),
                scrollContentBackground('hidden'),
                background(theme.bg),
                tint(theme.accent.dot),
              ]}
            >
              <SwiftSection footer={<SwiftText>{sharingFooter}</SwiftText>}>
                <LabeledContent label="Ledger">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {activeLedgerName ?? 'Shared ledger'}
                  </SwiftText>
                </LabeledContent>
                <LabeledContent label="Members">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {memberCountLabel}
                  </SwiftText>
                </LabeledContent>
                <LabeledContent label="Access">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {accessLabel}
                  </SwiftText>
                </LabeledContent>
              </SwiftSection>

              <SwiftSection>
                <SwiftButton
                  label={inviteLabel}
                  systemImage={canInvite ? 'person.badge.plus' : 'person.crop.circle.badge.checkmark'}
                  onPress={() => {
                    if (!inviteBusy && canInvite) onInviteSomeone();
                  }}
                  modifiers={[disabled(inviteBusy || !canInvite)]}
                />
              </SwiftSection>

              <SwiftSection title="Members">
                {ledgerMembers.length > 0 ? (
                  ledgerMembers.map(member => (
                    <MemberFormRow
                      key={member.id}
                      member={member}
                      currentUserId={currentUserId}
                      onCurrentMemberEditLockChange={onCurrentMemberEditLockChange}
                    />
                  ))
                ) : (
                  <LabeledContent label="No members">
                    <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                      Connect iCloud sharing
                    </SwiftText>
                  </LabeledContent>
                )}
              </SwiftSection>

              {currentMember && (
                <SwiftSection
                  footer={<SwiftText>Turning this off protects items you create from changes by other members. You can still edit your own items.</SwiftText>}
                >
                  <LabeledContent label="Viewing As">
                    <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                      {currentMember.displayName}
                    </SwiftText>
                  </LabeledContent>
                  <SwiftToggle
                    label="Others Can Edit My Items"
                    systemImage="lock.open"
                    isOn={currentMember.allowOthersToEditMyItems}
                    onIsOnChange={onCurrentMemberEditLockChange}
                  />
                </SwiftSection>
              )}
            </SwiftForm>
          </Host>
        </View>
      </View>
    </Animated.View>
  );
}

function permissionLabel(permission: string): string {
  switch (permission) {
  case 'readWrite':
    return 'Can edit';
  case 'readOnly':
    return 'Read only';
  case 'none':
    return 'No access';
  default:
    return 'Shared access';
  }
}

function MemberFormRow({
  member,
  currentUserId,
  onCurrentMemberEditLockChange,
}: {
  member: LedgerMember;
  currentUserId: string;
  onCurrentMemberEditLockChange: (allow: boolean) => void;
}) {
  const isCurrentUser = member.userId === currentUserId;
  const role = member.role === 'owner' ? 'Owner' : 'Member';
  const permission = member.allowOthersToEditMyItems ? 'Can edit their items' : 'Only they can edit';
  const label = isCurrentUser ? `${member.displayName} (You)` : member.displayName;

  if (isCurrentUser) {
    return (
      <SwiftToggle
        label={label}
        systemImage="person.crop.circle"
        isOn={member.allowOthersToEditMyItems}
        onIsOnChange={onCurrentMemberEditLockChange}
      />
    );
  }

  return (
    <LabeledContent label={label}>
      <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
        {role} · {permission}
      </SwiftText>
    </LabeledContent>
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
  formWrap: {
    flex: 1,
  },
  formHost: {
    flex: 1,
  },
});
