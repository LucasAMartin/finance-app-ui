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
  const accessLabel = canInvite ? 'Owner' : cloudShared ? 'Shared with you' : 'Member';
  const syncFooter = iCloudSyncEnabled
    ? cloudSyncState.detail
    : 'Turn on iCloud Sync to keep this ledger available on devices signed in to your iCloud account.';
  const inviteLabel = inviteBusy ? 'Preparing...' : 'Manage Sharing';
  const sharingFooter = cloudShared
    ? 'This ledger syncs through the owner\'s shared iCloud database.'
    : canInvite
      ? 'Invite people, remove access, or update permissions with the native iCloud sharing sheet.'
      : 'Only the ledger owner can change sharing access.';
  const showStopSharingAction = cloudShared || canInvite;
  const showAdvancedSection = showStopSharingAction || (__DEV__ && onResetSyncedSampleData);

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
              <SwiftSection title="Ledger">
                <LabeledContent label="Name">
                  <SecondaryValue>{activeLedgerName ?? 'Shared ledger'}</SecondaryValue>
                </LabeledContent>
                <LabeledContent label="Access">
                  <SecondaryValue>{accessLabel}</SecondaryValue>
                </LabeledContent>
                {participantPermission && (
                  <LabeledContent label="Permission">
                    <SecondaryValue>{permissionLabel(participantPermission)}</SecondaryValue>
                  </LabeledContent>
                )}
              </SwiftSection>

              <SwiftSection
                title="iCloud Sync"
                footer={<SwiftText>{syncFooter}</SwiftText>}
              >
                <SwiftToggle
                  label="iCloud Sync"
                  systemImage="icloud"
                  isOn={iCloudSyncEnabled}
                  onIsOnChange={onICloudSyncChange}
                />
                <LabeledContent label="Status">
                  <SecondaryValue emphasis={cloudSyncState.conflictedRecords > 0}>
                    {cloudSyncState.label}
                  </SecondaryValue>
                </LabeledContent>
                {iCloudSyncEnabled && (
                  <LabeledContent label="Last Synced">
                    <SecondaryValue>{cloudSyncLastUpdateLabel(cloudSyncState)}</SecondaryValue>
                  </LabeledContent>
                )}
                {cloudSyncState.pendingRecords > 0 && (
                  <LabeledContent label="Waiting">
                    <SecondaryValue>
                      {cloudSyncState.pendingRecords} change{cloudSyncState.pendingRecords === 1 ? '' : 's'}
                    </SecondaryValue>
                  </LabeledContent>
                )}
                {iCloudSyncEnabled && (
                  <SwiftButton
                    label="Sync Now"
                    systemImage="arrow.clockwise.icloud"
                    onPress={onManualCloudRefresh}
                  />
                )}
              </SwiftSection>

              {cloudSyncState.conflictedRecords > 0 && cloudConflicts.length === 0 && (
                <SwiftSection title="Review Needed" footer={<SwiftText>{cloudSyncState.detail}</SwiftText>}>
                  <LabeledContent label="Conflicts">
                    <SecondaryValue emphasis>
                      {cloudSyncState.conflictedRecords} item{cloudSyncState.conflictedRecords === 1 ? '' : 's'}
                    </SecondaryValue>
                  </LabeledContent>
                </SwiftSection>
              )}

              {cloudConflicts.length > 0 && (
                <SwiftSection
                  title="Review Needed"
                  footer={<SwiftText>For locked items, discard the blocked device change and refresh from iCloud. For edit conflicts, pick the version to keep.</SwiftText>}
                >
                  {cloudConflicts.map(conflict => (
                    <React.Fragment key={conflict.recordName}>
                      <LabeledContent label={conflict.title}>
                        <SecondaryValue>{conflict.detail}</SecondaryValue>
                      </LabeledContent>
                      {conflict.requiresDiscardLocal && (
                        <LabeledContent label="This Device">
                          <SecondaryValue>{conflict.localLabel}</SecondaryValue>
                        </LabeledContent>
                      )}
                      {conflict.requiresDiscardLocal && (
                        <LabeledContent label="Resolve">
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
                    </React.Fragment>
                  ))}
                </SwiftSection>
              )}

              <SwiftSection title="Sharing" footer={<SwiftText>{sharingFooter}</SwiftText>}>
                {canInvite ? (
                  <SwiftButton
                    label={inviteLabel}
                    systemImage="person.2.badge.gearshape"
                    onPress={() => {
                      if (!inviteBusy) onInviteSomeone();
                    }}
                    modifiers={inviteBusy ? [disabled(true)] : undefined}
                  />
                ) : (
                  <LabeledContent label="Management">
                    <SecondaryValue>Owner only</SecondaryValue>
                  </LabeledContent>
                )}
              </SwiftSection>

              <SwiftSection title="Members">
                <LabeledContent label="Total">
                  <SecondaryValue>{memberCountLabel}</SecondaryValue>
                </LabeledContent>
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
                  title="Your Items"
                  footer={<SwiftText>Turning this off protects items you create from changes by other members. You can still edit your own items.</SwiftText>}
                >
                  <SwiftToggle
                    label="Others Can Edit My Items"
                    systemImage={currentMember.allowOthersToEditMyItems ? 'lock.open' : 'lock'}
                    isOn={currentMember.allowOthersToEditMyItems}
                    onIsOnChange={onCurrentMemberEditLockChange}
                  />
                </SwiftSection>
              )}

              {showAdvancedSection && (
                <SwiftSection title="Advanced">
                  {showStopSharingAction && (
                    <SwiftButton
                      label={cloudShared ? 'Leave Shared Ledger' : 'Stop iCloud Sharing'}
                      systemImage={cloudShared ? 'rectangle.portrait.and.arrow.right' : 'person.2.slash'}
                      role="destructive"
                      onPress={onLeaveOrManageSharing}
                      modifiers={inviteBusy ? [disabled(true)] : undefined}
                    />
                  )}
                  {__DEV__ && onResetSyncedSampleData && (
                    <SwiftButton
                      label="Reset Synced Sample Data"
                      systemImage="arrow.counterclockwise.icloud"
                      role="destructive"
                      onPress={onResetSyncedSampleData}
                    />
                  )}
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

function cloudSyncLastUpdateLabel(state: CloudSyncUiState) {
  if (state.lastSyncedAt) {
    return new Date(state.lastSyncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return 'Not synced yet';
}

function SecondaryValue({
  children,
  emphasis = false,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: emphasis ? 'primary' : 'secondary' })]}>
      {children}
    </SwiftText>
  );
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
      <SecondaryValue>{role} · {permission}</SecondaryValue>
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
