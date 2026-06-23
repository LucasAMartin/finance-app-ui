import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button as SwiftButton,
  Form as SwiftForm,
  HStack,
  Host,
  Label,
  LabeledContent,
  Picker,
  Section as SwiftSection,
  Spacer,
  Text as SwiftText,
  Toggle as SwiftToggle,
} from '@expo/ui/swift-ui';
import {
  background,
  buttonStyle,
  disabled,
  foregroundStyle,
  frame,
  listStyle,
  pickerStyle,
  scrollContentBackground,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';

import { Theme } from '../theme';
import { useTheme } from '../ThemeProvider';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import { getNotificationPrefs, notificationSummary } from '../notifications/preferences';
import { CURRENCY_OPTIONS } from '../currency';
import { ScreenExitButton } from '../components/GlassButton';
import { suppressNextAppLockPrompt } from '../components/AppLockGate';
import type { CloudSyncUiState } from '../sync/cloudSyncStatus';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  onOpenAppearance: () => void;
  onOpenNotifications: () => void;
  onOpenIncome: () => void;
  onOpenSharing: (intent?: 'overview' | 'members' | 'invite') => void;
  onICloudSyncChange: (enabled: boolean) => void;
  onResetSyncedSampleData?: () => void;
  cloudSyncState: CloudSyncUiState;
  onManualCloudRefresh: () => void;
  activeLedgerName?: string;
  memberCount: number;
}

export function SettingsScreen({
  theme,
  visible,
  onClose,
  onOpenAppearance,
  onOpenNotifications,
  onOpenIncome,
  onOpenSharing,
  onICloudSyncChange,
  onResetSyncedSampleData,
  cloudSyncState,
  onManualCloudRefresh,
  activeLedgerName,
  memberCount,
}: Props) {
  const insets = useSafeAreaInsets();
  const { dark, metaFlag, setMetaFlag, currencyCode, setCurrencyCode } = useTheme();
  const { settingsRepo } = useRepositories();
  const settings = useRepositoryList(settingsRepo)[0];
  const notifications = getNotificationPrefs(settings);

  // Slide-up + fade, mirroring ThemeScreen so pushed screens feel consistent.
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const profileName = activeLedgerName ?? 'Shared ledger';
  const [appLockUpdating, setAppLockUpdating] = React.useState(false);

  // Several rows below describe features whose native/backend half isn't built
  // yet (CloudKit sync, export, invites). They ship as real, persisted UI; this
  // is the honest placeholder for the action.
  const comingSoon = (title: string) =>
    Alert.alert(title, 'This will be available in a future update.');

  const handleSignOut = () =>
    Alert.alert('Sign out', "You'll need to sign in again to reach your data.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => comingSoon('Sign out') },
    ]);

  const handleAppLockChange = async (enabled: boolean) => {
    if (!enabled) {
      setMetaFlag('appLock', false);
      return;
    }
    if (appLockUpdating) return;
    setAppLockUpdating(true);
    try {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !enrolled) {
        Alert.alert(
          'Face ID is not ready',
          'Set up Face ID in iOS Settings first, then return here to require it for the app.',
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable Face ID',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use Passcode',
      });
      if (result.success) {
        suppressNextAppLockPrompt();
        setMetaFlag('appLock', true);
        return;
      }
      Alert.alert(
        'Face ID was not enabled',
        result.error === 'user_cancel'
          ? 'Authentication was cancelled.'
          : 'Face ID or passcode did not complete. Try again when you are ready.',
      );
    } catch {
      Alert.alert('Face ID unavailable', 'The authentication prompt could not be opened.');
    } finally {
      setAppLockUpdating(false);
    }
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 78, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        {/* Header — solid, hairline base. This is a flat form surface, not glass. */}
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.bg }]}>
          <ScreenExitButton
            variant="back"
            onPress={onClose}
            tint={theme.text}
            fallbackBg={theme.chipBg}
            accessibilityLabel="Back"
          />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
          {/* Spacer balances the back button so the title stays centered. */}
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
              <SwiftSection title="General">
                <SettingsActionRow
                  label="Appearance"
                  systemImage="paintpalette"
                  value={dark ? 'Dark' : 'Light'}
                  onPress={onOpenAppearance}
                />
                <SettingsActionRow
                  label="Notifications"
                  systemImage="bell.badge"
                  value={notificationSummary(notifications)}
                  onPress={onOpenNotifications}
                />
              </SwiftSection>

              <SwiftSection title="Security">
                <SwiftToggle
                  label="Require Face ID"
                  systemImage="faceid"
                  isOn={metaFlag('appLock')}
                  onIsOnChange={handleAppLockChange}
                  modifiers={appLockUpdating ? [disabled(true)] : undefined}
                />
              </SwiftSection>

              <SwiftSection title="Money">
                <Picker
                  label="Currency"
                  systemImage="dollarsign.circle"
                  selection={currencyCode}
                  onSelectionChange={setCurrencyCode}
                  modifiers={[pickerStyle('menu')]}
                >
                  {CURRENCY_OPTIONS.map(option => (
                    <SwiftText key={option.code} modifiers={[tag(option.code)]}>
                      {option.symbol} {option.code} · {option.name}
                    </SwiftText>
                  ))}
                </Picker>
                <SettingsActionRow label="Monthly Income" systemImage="banknote" onPress={onOpenIncome} />
              </SwiftSection>

              <SwiftSection
                title="iCloud Sync"
                footer={<SwiftText>Sync keeps this ledger updated across your devices. Sharing access is managed separately below.</SwiftText>}
              >
                <SwiftToggle
                  label="iCloud Sync"
                  systemImage="icloud"
                  isOn={metaFlag('icloudSync')}
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
                {cloudSyncState.conflictedRecords > 0 && (
                  <SettingsActionRow
                    label={`Review ${cloudSyncState.conflictedRecords} change${cloudSyncState.conflictedRecords === 1 ? '' : 's'}`}
                    systemImage="exclamationmark.icloud"
                    onPress={() => onOpenSharing('overview')}
                  />
                )}
                <SettingsActionRow label="Sync Now" systemImage="arrow.clockwise.icloud" onPress={onManualCloudRefresh} />
              </SwiftSection>

              <SwiftSection
                title="Ledger & Sharing"
                footer={<SwiftText>Manage who can access this ledger and how shared changes are handled.</SwiftText>}
              >
                <SettingsActionRow label="Shared Ledger" systemImage="folder" value={profileName} onPress={() => onOpenSharing('overview')} />
                <SettingsActionRow label="Members" systemImage="person.2" value={String(memberCount)} onPress={() => onOpenSharing('members')} />
                <SettingsActionRow label="Invite Someone" systemImage="person.badge.plus" onPress={() => onOpenSharing('invite')} />
              </SwiftSection>

              <SwiftSection title="Data">
                <SettingsActionRow label="Export Data" systemImage="square.and.arrow.up" onPress={() => comingSoon('Export data')} />
                {__DEV__ && onResetSyncedSampleData && (
                  <SettingsActionRow
                    label="Reset Synced Sample Data"
                    systemImage="arrow.counterclockwise.icloud"
                    role="destructive"
                    onPress={onResetSyncedSampleData}
                  />
                )}
              </SwiftSection>

              <SwiftSection title="Support">
                <SettingsActionRow label="Help & Support" systemImage="questionmark.circle" onPress={() => comingSoon('Help & support')} />
                <SettingsActionRow label="Privacy Policy" systemImage="hand.raised" onPress={() => comingSoon('Privacy policy')} />
                <SettingsActionRow label="Terms of Service" systemImage="doc.text" onPress={() => comingSoon('Terms of service')} />
                <LabeledContent label="Version">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {version}
                  </SwiftText>
                </LabeledContent>
              </SwiftSection>

              <SwiftSection>
                <SettingsActionRow
                  label="Sign Out"
                  systemImage="rectangle.portrait.and.arrow.right"
                  role="destructive"
                  onPress={handleSignOut}
                />
              </SwiftSection>
            </SwiftForm>
          </Host>
        </View>
      </View>
    </Animated.View>
  );
}

function SettingsActionRow({
  label,
  value,
  systemImage,
  role,
  onPress,
}: {
  label: string;
  value?: string;
  systemImage?: React.ComponentProps<typeof SwiftButton>['systemImage'];
  role?: React.ComponentProps<typeof SwiftButton>['role'];
  onPress: () => void;
}) {
  return (
    <SwiftButton
      role={role}
      onPress={onPress}
      modifiers={[buttonStyle('automatic')]}
    >
      <HStack spacing={10} alignment="center" modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
        {systemImage ? (
          <Label title={label} systemImage={systemImage} />
        ) : (
          <SwiftText>{label}</SwiftText>
        )}
        <Spacer minLength={12} />
        {value ? (
          <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
            {value}
          </SwiftText>
        ) : null}
      </HStack>
    </SwiftButton>
  );
}

function cloudSyncLastUpdateLabel(state: CloudSyncUiState) {
  if (state.lastSyncedAt) {
    return new Date(state.lastSyncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return state.detail;
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
