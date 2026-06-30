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
import type {
  CloudSyncConflictItem,
  CloudSyncConflictResolution,
  CloudSyncUiState,
} from '../sync/cloudSyncStatus';
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
  iCloudSyncEnabled: boolean;
  cloudSyncState: CloudSyncUiState;
  cloudConflicts: CloudSyncConflictItem[];
  onICloudSyncChange: (enabled: boolean) => void;
  onManualCloudRefresh: () => void;
  onInviteSomeone: () => void;
  onLeaveOrManageSharing: () => void;
  onResolveCloudConflict: (recordName: string, resolution: CloudSyncConflictResolution) => void;
  onCurrentMemberEditLockChange: (allow: boolean) => void;
  onResetSyncedSampleData?: () => void;
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
  iCloudSyncEnabled,
  cloudSyncState,
  cloudConflicts,
  onICloudSyncChange,
  onManualCloudRefresh,
  onInviteSomeone,
  onLeaveOrManageSharing,
  onResolveCloudConflict,
  onCurrentMemberEditLockChange,
  onResetSyncedSampleData,
}: Props) {
  const insets = useSafeAreaInsets();
  const currentMember = ledgerMembers.find(member => member.userId === currentUserId);
  const memberCountLabel = ledgerMembers.length === 1 ? '1 member' : `${ledgerMembers.length} members`;
  const accessLabel = cloudShared
    ? `Shared with you${participantPermission ? ` · ${permissionLabel(participantPermission)}` : ''}`
      : canInvite
        ? 'You own this ledger'
        : 'Member access';
  const inviteLabel = inviteBusy
    ? 'Preparing iCloud sharing...'
    : canInvite
      ? 'Manage iCloud Sharing'
      : 'Sharing managed by owner';
  const sharingFooter = cloudShared
    ? 'This ledger syncs through the owner\'s shared iCloud database.'
    : 'Use Apple\'s iCloud sharing sheet to invite people, remove access, or update permissions.';

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

  const resolveCloudConflict = React.useCallback((recordName: string, resolution: CloudSyncConflictResolution) => {
    onResolveCloudConflict(recordName, resolution);
  }, [onResolveCloudConflict]);

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
          <Text style={[styles.headerTitle, { color: theme.text }]}>Data & Sharing</Text>
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
              <SwiftSection>
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

              <SwiftSection
                footer={<SwiftText>{cloudSyncState.detail}</SwiftText>}
              >
                <SwiftToggle
                  label="iCloud Sync"
                  systemImage="icloud"
                  isOn={iCloudSyncEnabled}
                  onIsOnChange={onICloudSyncChange}
                />
                <LabeledContent label="Status">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: cloudSyncState.conflictedRecords > 0 ? 'primary' : 'secondary' })]}>
                    {cloudSyncState.label}
                  </SwiftText>
                </LabeledContent>
                <LabeledContent label="Last Update">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {cloudSyncLastUpdateLabel(cloudSyncState)}
                  </SwiftText>
                </LabeledContent>
                {cloudSyncState.pendingRecords > 0 && (
                  <LabeledContent label="Pending">
                    <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                      {cloudSyncState.pendingRecords} change{cloudSyncState.pendingRecords === 1 ? '' : 's'}
                    </SwiftText>
                  </LabeledContent>
                )}
                <SwiftButton
                  label="Sync Now"
                  systemImage="arrow.clockwise.icloud"
                  onPress={onManualCloudRefresh}
                />
              </SwiftSection>

              <SwiftSection footer={<SwiftText>{sharingFooter}</SwiftText>}>
                <SwiftButton
                  label={inviteLabel}
                  systemImage={canInvite ? 'person.2.badge.gearshape' : 'person.crop.circle.badge.checkmark'}
                  onPress={() => {
                    if (!inviteBusy && canInvite) onInviteSomeone();
                  }}
                  modifiers={inviteBusy || !canInvite ? [disabled(true)] : undefined}
                />
              </SwiftSection>

              {cloudSyncState.conflictedRecords > 0 && cloudConflicts.length === 0 && (
                <SwiftSection footer={<SwiftText>{cloudSyncState.detail}</SwiftText>}>
                  {cloudSyncState.conflictedRecords > 0 && (
                    <LabeledContent label="Review Needed">
                      <SwiftText>
                        {cloudSyncState.conflictedRecords} item{cloudSyncState.conflictedRecords === 1 ? '' : 's'}
                      </SwiftText>
                    </LabeledContent>
                  )}
                </SwiftSection>
              )}

              {cloudConflicts.map((conflict, index) => (
                <SwiftSection
                  key={conflict.recordName}
                  footer={index === cloudConflicts.length - 1
                    ? <SwiftText>For locked items, discard the blocked device change and refresh from iCloud. For edit conflicts, pick the version to keep.</SwiftText>
                    : undefined}
                >
                  <LabeledContent label={conflict.title}>
                    <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                      {conflict.detail}
                    </SwiftText>
                  </LabeledContent>
                  {conflict.requiresDiscardLocal && (
                    <LabeledContent label="This Device">
                      <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        {conflict.localLabel}
                      </SwiftText>
                    </LabeledContent>
                  )}
                  {conflict.requiresDiscardLocal && (
                    <LabeledContent label="Action">
                      <SwiftButton
                        label="Discard blocked change"
                        onPress={() => resolveCloudConflict(conflict.recordName, 'discardLocal')}
                      />
                    </LabeledContent>
                  )}
                  {!conflict.requiresDiscardLocal && (
                    <LabeledContent label="Keep iCloud">
                      <SwiftButton
                        label={conflict.remoteLabel ?? 'Unavailable'}
                        onPress={() => resolveCloudConflict(conflict.recordName, 'remote')}
                        modifiers={conflict.hasRemote ? undefined : [disabled(true)]}
                      />
                    </LabeledContent>
                  )}
                  {!conflict.requiresDiscardLocal && (
                    <LabeledContent label="Keep This Device">
                      <SwiftButton
                        label={conflict.localLabel}
                        onPress={() => resolveCloudConflict(conflict.recordName, 'local')}
                        modifiers={conflict.canKeepLocal ? undefined : [disabled(true)]}
                      />
                    </LabeledContent>
                  )}
                </SwiftSection>
              ))}

              <SwiftSection>
                {ledgerMembers.length > 0 ? (
                  ledgerMembers.map(member => (
                    <MemberFormRow
                      key={member.id}
                      member={member}
                      currentUserId={currentUserId}
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

              <SwiftSection>
                <SwiftButton
                  label={cloudShared ? 'Leave Shared Ledger' : 'Stop iCloud Sharing'}
                  systemImage={cloudShared ? 'rectangle.portrait.and.arrow.right' : 'person.2.slash'}
                  role="destructive"
                  onPress={onLeaveOrManageSharing}
                  modifiers={inviteBusy || (!cloudShared && !canInvite) ? [disabled(true)] : undefined}
                />
                {__DEV__ && onResetSyncedSampleData && (
                  <SwiftButton
                    label="Reset Synced Sample Data"
                    systemImage="arrow.counterclockwise.icloud"
                    role="destructive"
                    onPress={onResetSyncedSampleData}
                  />
                )}
              </SwiftSection>
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

function cloudSyncLastUpdateLabel(state: CloudSyncUiState) {
  if (state.lastSyncedAt) {
    return new Date(state.lastSyncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return state.detail;
}

function MemberFormRow({
  member,
  currentUserId,
}: {
  member: LedgerMember;
  currentUserId: string;
}) {
  const isCurrentUser = member.userId === currentUserId;
  const role = member.role === 'owner' ? 'Owner' : 'Member';
  const permission = member.allowOthersToEditMyItems ? 'Can edit their items' : 'Only they can edit';
  const label = isCurrentUser ? `${member.displayName} (You)` : member.displayName;

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
