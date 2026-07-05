import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
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

import { cautionBg, cautionText, Theme } from '../theme';
import { useTheme } from '../ThemeProvider';
import { useRepositories, useRepositoryList } from '../repositories/RepositoryProvider';
import type { Transaction } from '../repositories/types';
import { getNotificationPrefs, notificationSummary } from '../notifications/preferences';
import { CURRENCY_OPTIONS } from '../currency';
import { EMPTY_STATE_PREVIEW_META_KEY } from '../emptyStatePreview';
import { formatMoney } from '../selectors/format';
import { ScreenExitButton } from '../components/GlassButton';
import { suppressNextAppLockPrompt } from '../components/AppLockGate';
import { Icon } from '../components/Icon';
import { SheetPrimaryButton } from '../components/shared';
import type { CloudSyncUiState } from '../sync/cloudSyncStatus';
import { TYPE } from '../typography';
import { SPACE, LAYOUT } from '../spacing';
import { RADIUS } from '../radius';

type TransactionAutomationMode = 'off' | 'confirm' | 'autosave';
type TransactionAutomationLastStatus = 'saved' | 'duplicate' | 'review' | 'disabled' | 'failed' | 'ignored' | 'queued';
type ApplePayAutomationMode = TransactionAutomationMode;
type ApplePayAutomationLastStatus = TransactionAutomationLastStatus;

interface TransactionAutomationStatus {
  status?: TransactionAutomationLastStatus;
  runAt?: string;
  merchant?: string;
  amount?: number;
  error?: string;
  background: boolean;
  replayText?: string;
  replayAmount?: number;
  replayMerchant?: string;
  replayOccurredAt?: string;
  replayCategory?: string;
  replayCardLast4?: string;
}

type ApplePayAutomationStatus = TransactionAutomationStatus;

const applePayShortcutTriggerName = iosMajorVersion() >= 26 ? 'Wallet' : 'Transaction';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  onOpenAppearance: () => void;
  onOpenNotifications: () => void;
  onOpenWidgets: () => void;
  onOpenIncome: () => void;
  onOpenSharing: (intent?: 'overview' | 'members' | 'invite') => void;
  onOpenOnboarding?: () => void;
  onOpenIOSStyleOnboarding?: () => void;
  onOpenPaywallPreview?: () => void;
  cloudSyncState: CloudSyncUiState;
}

export function SettingsScreen({
  theme,
  visible,
  onClose,
  onOpenAppearance,
  onOpenNotifications,
  onOpenWidgets,
  onOpenIncome,
  onOpenSharing,
  onOpenOnboarding,
  onOpenIOSStyleOnboarding,
  onOpenPaywallPreview,
  cloudSyncState,
}: Props) {
  const insets = useSafeAreaInsets();
  const { dark, metaFlag, setMetaFlag, currencyCode, setCurrencyCode } = useTheme();
  const { settingsRepo, sessionRepo, transactionsRepo } = useRepositories();
  const settings = useRepositoryList(settingsRepo)[0];
  const transactions = useRepositoryList(transactionsRepo);
  const session = sessionRepo.getSession();
  const notifications = getNotificationPrefs(settings);
  const applePayAutomationMode: ApplePayAutomationMode =
    settings?.meta?.applePayAutomationMode === 'autosave'
      ? 'autosave'
      : settings?.meta?.applePayAutomationMode === 'confirm'
        ? 'confirm'
        : 'off';
  const textAutomationMode: TransactionAutomationMode =
    settings?.meta?.textAutomationMode === 'autosave'
      ? 'autosave'
      : settings?.meta?.textAutomationMode === 'confirm'
        ? 'confirm'
        : 'off';

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
  const dataAndSharingValue = dataAndSharingSummary(cloudSyncState);
  const [appLockUpdating, setAppLockUpdating] = React.useState(false);
  const [applePayGuideOpen, setApplePayGuideOpen] = React.useState(false);
  const [textGuideOpen, setTextGuideOpen] = React.useState(false);
  const recentApplePayImports = React.useMemo(
    () => transactions
      .filter(isApplePayImport)
      .sort((a, b) => transactionTime(b) - transactionTime(a))
      .slice(0, 3),
    [transactions],
  );
  const recentTextImports = React.useMemo(
    () => transactions
      .filter(isTextImport)
      .sort((a, b) => transactionTime(b) - transactionTime(a))
      .slice(0, 3),
    [transactions],
  );
  const applePayLastRun = React.useMemo(
    () => applePayAutomationStatus(settings?.meta),
    [settings?.meta],
  );
  const textLastRun = React.useMemo(
    () => textAutomationStatus(settings?.meta),
    [settings?.meta],
  );

  // Rows whose native/backend half is not built yet still use the real settings
  // affordance; this is the honest placeholder for the action.
  const comingSoon = (title: string) =>
    Alert.alert(title, 'This will be available in a future update.');

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

  const setApplePayAutomationMode = (mode: ApplePayAutomationMode) => {
    const currentMeta = settings?.meta ?? {};
    const updatedAt = new Date().toISOString();
    const nextMeta = {
      ...currentMeta,
      applePayAutomationMode: mode,
      applePayAutomationUpdatedAt: updatedAt,
      applePayAutomationLedgerId: mode === 'off' ? undefined : session.activeLedgerId,
      applePayAutomationUserId: mode === 'off' ? undefined : session.currentUserId,
    };
    settingsRepo.update('settings', {
      meta: nextMeta,
    }) ?? settingsRepo.create({
      id: 'settings',
      themeDark: dark,
      accentKey: 'ink',
      cardStyle: theme.cardStyle,
      wallpaperId: settings?.wallpaperId,
      meta: nextMeta,
    });
    if (mode !== 'off') showApplePaySetup();
  };

  const setTextAutomationMode = (mode: TransactionAutomationMode) => {
    const currentMeta = settings?.meta ?? {};
    const updatedAt = new Date().toISOString();
    const nextMeta = {
      ...currentMeta,
      textAutomationMode: mode,
      textAutomationUpdatedAt: updatedAt,
      textAutomationLedgerId: mode === 'off' ? undefined : session.activeLedgerId,
      textAutomationUserId: mode === 'off' ? undefined : session.currentUserId,
    };
    settingsRepo.update('settings', {
      meta: nextMeta,
    }) ?? settingsRepo.create({
      id: 'settings',
      themeDark: dark,
      accentKey: 'ink',
      cardStyle: theme.cardStyle,
      wallpaperId: settings?.wallpaperId,
      meta: nextMeta,
    });
    if (mode !== 'off') showTextSetup();
  };

  const openShortcuts = () => {
    Linking.openURL('shortcuts://create-automation').catch(() => {
      Alert.alert('Open Shortcuts', 'Open the Shortcuts app, then create a personal automation.');
    });
  };

  const showApplePaySetup = () => {
    setApplePayGuideOpen(true);
  };

  const showTextSetup = () => {
    setTextGuideOpen(true);
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
              <SwiftSection>
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
                <SettingsActionRow
                  label="Widgets"
                  systemImage="rectangle.stack.badge.plus"
                  value="4 available"
                  onPress={onOpenWidgets}
                />
              </SwiftSection>

              <SwiftSection>
                <SwiftToggle
                  label="Require Face ID"
                  systemImage="faceid"
                  isOn={metaFlag('appLock')}
                  onIsOnChange={handleAppLockChange}
                  modifiers={appLockUpdating ? [disabled(true)] : undefined}
                />
                <SwiftToggle
                  label="Empty State Preview"
                  systemImage="tray"
                  isOn={metaFlag(EMPTY_STATE_PREVIEW_META_KEY)}
                  onIsOnChange={(enabled) => setMetaFlag(EMPTY_STATE_PREVIEW_META_KEY, enabled)}
                />
                {__DEV__ && onOpenOnboarding ? (
                  <SettingsActionRow
                    label="Preview Onboarding"
                    systemImage="sparkles"
                    value="Open"
                    onPress={onOpenOnboarding}
                  />
                ) : null}
                {__DEV__ && onOpenIOSStyleOnboarding ? (
                  <SettingsActionRow
                    label="Preview iOS Style Onboarding"
                    systemImage="iphone.gen3.radiowaves.left.and.right"
                    value="Open"
                    onPress={onOpenIOSStyleOnboarding}
                  />
                ) : null}
                {__DEV__ && onOpenPaywallPreview ? (
                  <SettingsActionRow
                    label="Preview Paywall"
                    systemImage="crown"
                    value="Open"
                    onPress={onOpenPaywallPreview}
                  />
                ) : null}
              </SwiftSection>

              <SwiftSection>
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
                <SettingsActionRow
                  label="Data & Sharing"
                  systemImage="externaldrive"
                  value={dataAndSharingValue}
                  onPress={() => onOpenSharing('overview')}
                />
              </SwiftSection>

              <SwiftSection>
                <Picker
                  label="Apple Pay Import"
                  systemImage="wallet.pass"
                  selection={applePayAutomationMode}
                  onSelectionChange={(value) => {
                    if (value === 'autosave' || value === 'confirm') setApplePayAutomationMode(value);
                    else setApplePayAutomationMode('off');
                  }}
                  modifiers={[pickerStyle('menu')]}
                >
                  <SwiftText modifiers={[tag('autosave')]}>Auto-save</SwiftText>
                  <SwiftText modifiers={[tag('confirm')]}>Review first</SwiftText>
                  <SwiftText modifiers={[tag('off')]}>Off</SwiftText>
                </Picker>
                <SettingsActionRow
                  label="Apple Pay Setup Guide"
                  systemImage="wand.and.stars"
                  value="Open"
                  onPress={showApplePaySetup}
                />
                <Picker
                  label="Text Message Import"
                  systemImage="message"
                  selection={textAutomationMode}
                  onSelectionChange={(value) => {
                    if (value === 'autosave' || value === 'confirm') setTextAutomationMode(value);
                    else setTextAutomationMode('off');
                  }}
                  modifiers={[pickerStyle('menu')]}
                >
                  <SwiftText modifiers={[tag('autosave')]}>Auto-save</SwiftText>
                  <SwiftText modifiers={[tag('confirm')]}>Review first</SwiftText>
                  <SwiftText modifiers={[tag('off')]}>Off</SwiftText>
                </Picker>
                <SettingsActionRow
                  label="Text Message Setup Guide"
                  systemImage="wand.and.stars"
                  value="Open"
                  onPress={showTextSetup}
                />
              </SwiftSection>

              <SwiftSection>
                <SettingsActionRow label="Export Data" systemImage="square.and.arrow.up" onPress={() => comingSoon('Export data')} />
              </SwiftSection>

              <SwiftSection>
                <SettingsActionRow label="Help & Support" systemImage="questionmark.circle" onPress={() => comingSoon('Help & support')} />
                <SettingsActionRow label="Privacy Policy" systemImage="hand.raised" onPress={() => comingSoon('Privacy policy')} />
                <SettingsActionRow label="Terms of Service" systemImage="doc.text" onPress={() => comingSoon('Terms of service')} />
                <LabeledContent label="Version">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {version}
                  </SwiftText>
                </LabeledContent>
              </SwiftSection>
            </SwiftForm>
          </Host>
        </View>
        {applePayGuideOpen ? (
          <ApplePayAutomationGuide
            theme={theme}
            mode={applePayAutomationMode}
            insetsTop={insets.top}
            insetsBottom={insets.bottom}
            onClose={() => setApplePayGuideOpen(false)}
            onCreateAutomation={openShortcuts}
            onSetMode={setApplePayAutomationMode}
            recentImports={recentApplePayImports}
            currencyCode={currencyCode}
            lastRun={applePayLastRun}
          />
        ) : null}
        {textGuideOpen ? (
          <TextMessageAutomationGuide
            theme={theme}
            mode={textAutomationMode}
            insetsTop={insets.top}
            insetsBottom={insets.bottom}
            onClose={() => setTextGuideOpen(false)}
            onCreateAutomation={openShortcuts}
            onSetMode={setTextAutomationMode}
            recentImports={recentTextImports}
            currencyCode={currencyCode}
            lastRun={textLastRun}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

function ApplePayAutomationGuide({
  theme,
  mode,
  insetsTop,
  insetsBottom,
  onClose,
  onCreateAutomation,
  onSetMode,
  recentImports,
  currencyCode,
  lastRun,
}: {
  theme: Theme;
  mode: ApplePayAutomationMode;
  insetsTop: number;
  insetsBottom: number;
  onClose: () => void;
  onCreateAutomation: () => void;
  onSetMode: (mode: ApplePayAutomationMode) => void;
  recentImports: Transaction[];
  currencyCode: string;
  lastRun: ApplePayAutomationStatus;
}) {
  const autoSave = mode === 'autosave';
  const latestImport = recentImports[0];
  const replayLastImport = () => {
    const url = applePayReplayUrl(lastRun);
    if (!url) {
      Alert.alert('Replay unavailable', 'Run one real Wallet import in this debug build first.');
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not replay import', 'The financeapp URL scheme is not available in this build yet.');
    });
  };
  return (
    <View style={[styles.guideRoot, { backgroundColor: theme.bg }]}>
      <View style={[styles.guideHeader, { paddingTop: insetsTop + SPACE.sm, backgroundColor: theme.bg }]}>
        <ScreenExitButton
          variant="back"
          onPress={onClose}
          tint={theme.text}
          fallbackBg={theme.chipBg}
          accessibilityLabel="Back"
        />
        <Text style={[styles.headerTitle, { color: theme.text }]}>Apple Pay Import</Text>
        <View style={styles.headerSpacer} />
        <View style={[styles.headerDivider, { backgroundColor: theme.hairline }]} />
      </View>

      <ScrollView
        style={styles.guideScroll}
        contentContainerStyle={[
          styles.guideContent,
          { paddingTop: insetsTop + 84, paddingBottom: Math.max(insetsBottom, SPACE.lg) + 112 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.guideHero, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.guideHeroTop}>
            <View style={[styles.guideIconDisc, { backgroundColor: theme.accent.fill }]}>
              <Icon name="wallet" size={20} color={theme.accent.ink} stroke={1.7} />
            </View>
            <View style={[styles.statusPill, { backgroundColor: theme.chipBg }]}>
              <Text style={[TYPE.captionEm, { color: theme.textSec }]}>
                {autoSave ? 'Auto-save ready' : mode === 'confirm' ? 'Review mode' : 'Setup needed'}
              </Text>
            </View>
          </View>
          <Text style={[TYPE.sectionTitle, styles.guideHeroTitle, { color: theme.text }]}>
            Log every Wallet tap with one automation.
          </Text>
          <Text style={[TYPE.bodyRegular, styles.guideHeroCopy, { color: theme.textSec }]}>
            Select all cards once in Shortcuts. Auto-save captures quietly and finance-app finishes the import the next time it opens.
          </Text>

          <View style={styles.flowPreview}>
            <FlowNode theme={theme} icon="cards" label="Wallet" />
            <Icon name="chevR" size={16} color={theme.textTer} stroke={1.8} />
            <FlowNode theme={theme} icon="sparkle" label="Shortcut" />
            <Icon name="chevR" size={16} color={theme.textTer} stroke={1.8} />
            <FlowNode theme={theme} icon="check" label={autoSave ? 'Queued' : 'Saved'} />
          </View>
        </View>

        <AutomationStatusPanel
          theme={theme}
          mode={mode}
          latestImport={latestImport}
          currencyCode={currencyCode}
          lastRun={lastRun}
          sourceName="Wallet"
          fallbackMerchant="Apple Pay"
        />

        {__DEV__ ? (
          <DeveloperReplayPanel
            theme={theme}
            sourceName="Wallet"
            replayReady={!!applePayReplayUrl(lastRun)}
            onReplay={replayLastImport}
          />
        ) : null}

        <View style={styles.guideSection}>
          <Text style={[TYPE.labelLg, { color: theme.textTer }]}>Import behavior</Text>
          <ModeChoice
            theme={theme}
            active={mode === 'autosave'}
            title="Auto-save"
            detail="Recommended. Captures quietly in the background, then saves on the next app open."
            onPress={() => onSetMode('autosave')}
          />
          <ModeChoice
            theme={theme}
            active={mode === 'confirm'}
            title="Review first"
            detail="Opens the filled expense screen before saving."
            onPress={() => onSetMode('confirm')}
          />
        </View>

        <ShortcutSetupPreview theme={theme} mode={mode} />

        <View style={styles.guideSection}>
          <Text style={[TYPE.labelLg, { color: theme.textTer }]}>Shortest setup</Text>
          <StepRow theme={theme} n={1} title="Create a new automation" detail="Shortcuts shows three sections: Automation, When, and Do." />
          <StepRow theme={theme} n={2} title={`Set When to ${applePayShortcutTriggerName}`} detail={applePayShortcutTriggerName === 'Wallet' ? 'This is the iOS 26 Wallet trigger.' : 'Newer iOS versions may label this Wallet.'} />
          <StepRow theme={theme} n={3} title="Select all cards and categories" detail="This is the key step. Choosing all avoids a separate automation for each card." />
          <StepRow theme={theme} n={4} title="Add the app action" detail="In Do, tap Add Action, open finance-app, then choose Import Apple Pay Transaction." />
          <StepRow theme={theme} n={5} title="Pass the transaction" detail="Tap the blank transaction field, then choose Shortcut Input." />
          <StepRow theme={theme} n={6} title="Run immediately" detail="Open Automation, choose Run Immediately, and turn Notify When Run off." />
        </View>

        <View style={[styles.notePanel, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
          <Icon name="bell" size={16} color={theme.textSec} stroke={1.7} />
          <Text style={[TYPE.bodySm, styles.noteText, { color: theme.textSec }]}>
            If Shortcuts adds a fieldless row, back out and add Import Apple Pay Transaction from the automation Add Action screen.
          </Text>
        </View>

        <RecentApplePayImports
          theme={theme}
          imports={recentImports}
          currencyCode={currencyCode}
        />
      </ScrollView>

      <View style={[styles.guideFooter, { paddingBottom: Math.max(insetsBottom, SPACE.md), backgroundColor: theme.bg, borderTopColor: theme.hairline }]}>
        <SheetPrimaryButton
          label="Create Automation"
          onPress={onCreateAutomation}
          theme={theme}
        />
      </View>
    </View>
  );
}

function TextMessageAutomationGuide({
  theme,
  mode,
  insetsTop,
  insetsBottom,
  onClose,
  onCreateAutomation,
  onSetMode,
  recentImports,
  currencyCode,
  lastRun,
}: {
  theme: Theme;
  mode: TransactionAutomationMode;
  insetsTop: number;
  insetsBottom: number;
  onClose: () => void;
  onCreateAutomation: () => void;
  onSetMode: (mode: TransactionAutomationMode) => void;
  recentImports: Transaction[];
  currencyCode: string;
  lastRun: TransactionAutomationStatus;
}) {
  const autoSave = mode === 'autosave';
  const latestImport = recentImports[0];
  const replayLastImport = () => {
    const url = textReplayUrl(lastRun);
    if (!url) {
      Alert.alert('Replay unavailable', 'Run one real text import in this debug build first.');
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not replay import', 'The financeapp URL scheme is not available in this build yet.');
    });
  };

  return (
    <View style={[styles.guideRoot, { backgroundColor: theme.bg }]}>
      <View style={[styles.guideHeader, { paddingTop: insetsTop + SPACE.sm, backgroundColor: theme.bg }]}>
        <ScreenExitButton
          variant="back"
          onPress={onClose}
          tint={theme.text}
          fallbackBg={theme.chipBg}
          accessibilityLabel="Back"
        />
        <Text style={[styles.headerTitle, { color: theme.text }]}>Text Message Import</Text>
        <View style={styles.headerSpacer} />
        <View style={[styles.headerDivider, { backgroundColor: theme.hairline }]} />
      </View>

      <ScrollView
        style={styles.guideScroll}
        contentContainerStyle={[
          styles.guideContent,
          { paddingTop: insetsTop + 84, paddingBottom: Math.max(insetsBottom, SPACE.lg) + 112 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.guideHero, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={styles.guideHeroTop}>
            <View style={[styles.guideIconDisc, { backgroundColor: theme.accent.fill }]}>
              <Icon name="bell" size={20} color={theme.accent.ink} stroke={1.7} />
            </View>
            <View style={[styles.statusPill, { backgroundColor: theme.chipBg }]}>
              <Text style={[TYPE.captionEm, { color: theme.textSec }]}>
                {autoSave ? 'Auto-save ready' : mode === 'confirm' ? 'Review mode' : 'Setup needed'}
              </Text>
            </View>
          </View>
          <Text style={[TYPE.sectionTitle, styles.guideHeroTitle, { color: theme.text }]}>
            Turn card texts into transactions.
          </Text>
          <Text style={[TYPE.bodyRegular, styles.guideHeroCopy, { color: theme.textSec }]}>
            Choose your card alert senders once in Shortcuts. finance-app reads the amount, merchant, card, and category when it processes the queued alert.
          </Text>

          <View style={styles.flowPreview}>
            <FlowNode theme={theme} icon="bell" label="Text" />
            <Icon name="chevR" size={16} color={theme.textTer} stroke={1.8} />
            <FlowNode theme={theme} icon="sparkle" label="Shortcut" />
            <Icon name="chevR" size={16} color={theme.textTer} stroke={1.8} />
            <FlowNode theme={theme} icon="check" label={autoSave ? 'Queued' : 'Saved'} />
          </View>
        </View>

        <AutomationStatusPanel
          theme={theme}
          mode={mode}
          latestImport={latestImport}
          currencyCode={currencyCode}
          lastRun={lastRun}
          sourceName="Text"
          fallbackMerchant="Text alert"
        />

        {__DEV__ ? (
          <DeveloperReplayPanel
            theme={theme}
            sourceName="Text"
            replayReady={!!textReplayUrl(lastRun)}
            onReplay={replayLastImport}
          />
        ) : null}

        <View style={styles.guideSection}>
          <Text style={[TYPE.labelLg, { color: theme.textTer }]}>Import behavior</Text>
          <ModeChoice
            theme={theme}
            active={mode === 'autosave'}
            title="Auto-save"
            detail="Recommended after the first real import works. Captures matched alerts in the background, then saves on the next app open."
            onPress={() => onSetMode('autosave')}
          />
          <ModeChoice
            theme={theme}
            active={mode === 'confirm'}
            title="Review first"
            detail="Best for first setup. Opens the filled expense screen before saving."
            onPress={() => onSetMode('confirm')}
          />
        </View>

        <TextShortcutSetupPreview theme={theme} mode={mode} />

        <View style={styles.guideSection}>
          <Text style={[TYPE.labelLg, { color: theme.textTer }]}>Shortest setup</Text>
          <StepRow theme={theme} n={1} title="Create a new automation" detail="Shortcuts shows three sections: Automation, When, and Do." />
          <StepRow theme={theme} n={2} title="Set When" detail="Choose Message, then select your card alert sender." />
          <StepRow theme={theme} n={3} title="Filter alert texts" detail="Use purchase, spent, charge, or transaction. Avoid $ for the final setup." />
          <StepRow theme={theme} n={4} title="Add the app action" detail="In Do, tap Add Action, open finance-app, then choose Process Receipt." />
          <StepRow theme={theme} n={5} title="Pass the text" detail="Tap the blank text field in Process Receipt, then choose Shortcut Input." />
          <StepRow theme={theme} n={6} title="Run immediately" detail="Open Automation, choose Run Immediately, and turn Notify When Run off." />
        </View>

        <View style={[styles.notePanel, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
          <Icon name="bell" size={16} color={theme.textSec} stroke={1.7} />
          <Text style={[TYPE.bodySm, styles.noteText, { color: theme.textSec }]}>
            finance-app cannot read your inbox. Only messages matched by this Shortcuts automation are handed to the app.
          </Text>
        </View>

        <View style={[styles.notePanel, { backgroundColor: cautionBg(theme.dark), borderColor: theme.hairline }]}>
          <Icon name="bell" size={16} color={cautionText(theme.dark)} stroke={1.7} />
          <Text style={[TYPE.bodySm, styles.noteText, { color: cautionText(theme.dark) }]}>
            If Shortcuts shows Add Shortcut or adds a fieldless Process Receipt row, back out and add the finance-app action from Add Action instead.
          </Text>
        </View>

        <RecentAutomationImports
          theme={theme}
          imports={recentImports}
          currencyCode={currencyCode}
          sourceName="Text"
          emptyIcon="bell"
          emptyTitle="No text imports yet"
          emptyCopy="After the first matched alert, it appears here with the merchant and amount."
        />
      </ScrollView>

      <View style={[styles.guideFooter, { paddingBottom: Math.max(insetsBottom, SPACE.md), backgroundColor: theme.bg, borderTopColor: theme.hairline }]}>
        <SheetPrimaryButton
          label="Create Automation"
          onPress={onCreateAutomation}
          theme={theme}
        />
      </View>
    </View>
  );
}

function AutomationStatusPanel({
  theme,
  mode,
  latestImport,
  currencyCode,
  lastRun,
  sourceName,
  fallbackMerchant,
}: {
  theme: Theme;
  mode: TransactionAutomationMode;
  latestImport?: Transaction;
  currencyCode: string;
  lastRun: TransactionAutomationStatus;
  sourceName: string;
  fallbackMerchant: string;
}) {
  const autoSave = mode === 'autosave';
  const confirm = mode === 'confirm';
  const needsAttention = lastRun.status === 'failed' || lastRun.status === 'ignored';
  const statusTitle = autoSave
    ? `${sourceName} logging is armed`
    : confirm
      ? `${sourceName} review is armed`
      : 'Choose an import behavior';
  const statusDetail = lastRun.status
    ? automationStatusDetail(lastRun, currencyCode, fallbackMerchant)
    : latestImport
    ? `Latest: ${latestImport.merchant} · ${formatMoney(latestImport.amount, true, currencyCode)}`
    : autoSave
      ? sourceName === 'Wallet'
        ? 'The next Wallet transaction can be captured without launching the app.'
        : 'The next matched text alert can be captured without launching the app.'
      : confirm
        ? sourceName === 'Wallet'
          ? 'The next Wallet transaction opens with the fields already filled.'
          : 'The next matched text alert opens with the fields already filled.'
        : 'Pick Auto-save for the quietest setup.';
  const iconName = needsAttention
    ? 'bell'
    : lastRun.status === 'duplicate'
      ? 'receipt'
      : autoSave
        ? 'check'
        : confirm
          ? 'receipt'
          : sourceName === 'Wallet' ? 'wallet' : 'bell';
  const iconBg = needsAttention ? cautionBg(theme.dark) : autoSave ? theme.accent.fill : theme.surface;
  const iconColor = needsAttention ? cautionText(theme.dark) : autoSave ? theme.accent.ink : theme.text;

  return (
    <View style={[styles.statusPanel, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
      <View style={[styles.statusIcon, { backgroundColor: iconBg }]}>
        <Icon
          name={iconName}
          size={16}
          color={iconColor}
          stroke={1.9}
        />
      </View>
      <View style={styles.statusCopy}>
        <Text style={[TYPE.body, { color: theme.text }]}>{statusTitle}</Text>
        <Text style={[TYPE.caption, { color: theme.textSec }]}>{statusDetail}</Text>
      </View>
    </View>
  );
}

function DeveloperReplayPanel({
  theme,
  sourceName,
  replayReady,
  onReplay,
}: {
  theme: Theme;
  sourceName: string;
  replayReady: boolean;
  onReplay: () => void;
}) {
  return (
    <View style={[styles.devReplayPanel, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
      <View style={styles.devReplayHeader}>
        <View style={[styles.devReplayIcon, { backgroundColor: theme.chipBg }]}>
          <Icon name="play" size={15} color={theme.text} stroke={1.8} />
        </View>
        <View style={styles.devReplayCopy}>
          <Text style={[TYPE.body, { color: theme.text }]}>Developer replay</Text>
          <Text style={[TYPE.caption, { color: theme.textSec }]}>
            Debug builds keep the last {sourceName} payload so parser changes can be checked repeatedly.
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onReplay}
        disabled={!replayReady}
        style={[
          styles.devReplayButton,
          {
            backgroundColor: replayReady ? theme.accent.fill : theme.chipBg,
            opacity: replayReady ? 1 : 0.58,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !replayReady }}
        accessibilityLabel={`Replay last ${sourceName} import`}
      >
        <Icon name="play" size={15} color={replayReady ? theme.accent.ink : theme.textSec} stroke={1.8} />
        <Text style={[TYPE.body, { color: replayReady ? theme.accent.ink : theme.textSec }]}>
          Replay Last Import
        </Text>
      </Pressable>
    </View>
  );
}

function ShortcutSetupPreview({ theme, mode }: { theme: Theme; mode: ApplePayAutomationMode }) {
  const autoSave = mode === 'autosave';
  return (
    <View style={styles.guideSection}>
      <Text style={[TYPE.labelLg, { color: theme.textTer }]}>Shortcut should look like</Text>
      <View style={[styles.shortcutPreview, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
        <View style={styles.shortcutTopBar}>
          <View style={[styles.shortcutDot, { backgroundColor: theme.textTer }]} />
          <View style={[styles.shortcutDot, { backgroundColor: theme.textTer }]} />
          <View style={[styles.shortcutDot, { backgroundColor: theme.textTer }]} />
        </View>

        <ShortcutPreviewRow
          theme={theme}
          icon="cards"
          title={applePayShortcutTriggerName === 'Wallet' ? 'When Wallet transaction happens' : 'When transaction happens'}
          detail="Cards: all · Categories: all"
        />
        <ShortcutPreviewRow
          theme={theme}
          icon="wallet"
          title="Import Apple Pay Transaction"
          detail={autoSave ? 'Transaction: Shortcut Input · Queues in background' : 'Transaction: Shortcut Input · Opens review'}
        />
        <ShortcutPreviewRow
          theme={theme}
          icon="sparkle"
          title="Run immediately"
          detail="Notify when run: off"
          last
        />
      </View>
    </View>
  );
}

function TextShortcutSetupPreview({ theme, mode }: { theme: Theme; mode: TransactionAutomationMode }) {
  const autoSave = mode === 'autosave';
  return (
    <View style={styles.guideSection}>
      <Text style={[TYPE.labelLg, { color: theme.textTer }]}>Shortcut should look like</Text>
      <View style={[styles.shortcutPreview, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
        <View style={styles.shortcutTopBar}>
          <View style={[styles.shortcutDot, { backgroundColor: theme.textTer }]} />
          <View style={[styles.shortcutDot, { backgroundColor: theme.textTer }]} />
          <View style={[styles.shortcutDot, { backgroundColor: theme.textTer }]} />
        </View>

        <ShortcutPreviewRow
          theme={theme}
          icon="bell"
          title="When message arrives"
          detail="Sender: card alert · Contains: purchase, spent, charge, or transaction"
        />
        <ShortcutPreviewRow
          theme={theme}
          icon="receipt"
          title="Process Receipt"
          detail={autoSave ? 'Text field: Shortcut Input · Queues in background' : 'Text field: Shortcut Input · Opens review'}
        />
        <ShortcutPreviewRow
          theme={theme}
          icon="sparkle"
          title="Run immediately"
          detail="Notify when run: off"
          last
        />
      </View>
    </View>
  );
}

function ShortcutPreviewRow({
  theme,
  icon,
  title,
  detail,
  last,
}: {
  theme: Theme;
  icon: string;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <View style={styles.shortcutRow}>
      <View style={styles.shortcutRail}>
        <View style={[styles.shortcutNode, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
          <Icon name={icon} size={14} color={theme.text} stroke={1.7} />
        </View>
        {!last ? <View style={[styles.shortcutLine, { backgroundColor: theme.hairline }]} /> : null}
      </View>
      <View style={[styles.shortcutCard, { backgroundColor: theme.chipBg }]}>
        <Text style={[TYPE.body, { color: theme.text }]}>{title}</Text>
        <Text style={[TYPE.caption, { color: theme.textSec }]}>{detail}</Text>
      </View>
    </View>
  );
}

function RecentApplePayImports({
  theme,
  imports,
  currencyCode,
}: {
  theme: Theme;
  imports: Transaction[];
  currencyCode: string;
}) {
  return (
    <RecentAutomationImports
      theme={theme}
      imports={imports}
      currencyCode={currencyCode}
      sourceName="Wallet"
      emptyIcon="wallet"
      emptyTitle="No Wallet imports yet"
      emptyCopy="After the first background save, it appears here with the merchant and amount."
    />
  );
}

function RecentAutomationImports({
  theme,
  imports,
  currencyCode,
  sourceName,
  emptyIcon,
  emptyTitle,
  emptyCopy,
}: {
  theme: Theme;
  imports: Transaction[];
  currencyCode: string;
  sourceName: string;
  emptyIcon: string;
  emptyTitle: string;
  emptyCopy: string;
}) {
  return (
    <View style={styles.guideSection}>
      <View style={styles.sectionTitleRow}>
        <Text style={[TYPE.labelLg, { color: theme.textTer }]}>Recent imports</Text>
        <Text style={[TYPE.captionEm, { color: theme.textTer }]}>{imports.length > 0 ? `${imports.length} shown` : 'Waiting'}</Text>
      </View>
      <View style={[styles.recentPanel, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
        {imports.length === 0 ? (
          <View style={styles.emptyRecent}>
            <View style={[styles.emptyRecentIcon, { backgroundColor: theme.chipBg }]}>
              <Icon name={emptyIcon} size={18} color={theme.textSec} stroke={1.7} />
            </View>
            <Text style={[TYPE.body, { color: theme.text }]}>{emptyTitle}</Text>
            <Text style={[TYPE.caption, styles.emptyRecentCopy, { color: theme.textSec }]}>
              {emptyCopy}
            </Text>
          </View>
        ) : (
          imports.map((tx, index) => (
            <RecentAutomationImportRow
              key={tx.id}
              theme={theme}
              tx={tx}
              currencyCode={currencyCode}
              sourceName={sourceName}
              showDivider={index < imports.length - 1}
            />
          ))
        )}
      </View>
    </View>
  );
}

function RecentAutomationImportRow({
  theme,
  tx,
  currencyCode,
  sourceName,
  showDivider,
}: {
  theme: Theme;
  tx: Transaction;
  currencyCode: string;
  sourceName: string;
  showDivider: boolean;
}) {
  const background = tx.meta?.backgroundImported === true;
  return (
    <View>
      <View style={styles.recentRow}>
        <View style={[styles.recentIcon, { backgroundColor: theme.chipBg }]}>
          <Icon name={background ? 'check' : 'receipt'} size={15} color={theme.text} stroke={1.8} />
        </View>
        <View style={styles.recentCopy}>
          <Text style={[TYPE.body, { color: theme.text }]} numberOfLines={1}>{tx.merchant}</Text>
          <Text style={[TYPE.caption, { color: theme.textSec }]} numberOfLines={1}>
            {background ? 'Background' : 'Reviewed'} · {sourceName} · {relativeImportTime(tx)}
          </Text>
        </View>
        <Text style={[TYPE.body, styles.recentAmount, { color: theme.text }]}>
          {formatMoney(tx.amount, true, currencyCode)}
        </Text>
      </View>
      {showDivider ? <View style={[styles.recentDivider, { backgroundColor: theme.hairline }]} /> : null}
    </View>
  );
}

function FlowNode({ theme, icon, label }: { theme: Theme; icon: string; label: string }) {
  return (
    <View style={styles.flowNode}>
      <View style={[styles.flowIcon, { backgroundColor: theme.chipBg }]}>
        <Icon name={icon} size={16} color={theme.text} stroke={1.7} />
      </View>
      <Text style={[TYPE.captionEm, { color: theme.textSec }]}>{label}</Text>
    </View>
  );
}

function ModeChoice({
  theme,
  active,
  title,
  detail,
  onPress,
}: {
  theme: Theme;
  active: boolean;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeChoice,
        {
          backgroundColor: active ? theme.accent.fill : theme.surface,
          borderColor: active ? theme.accent.fill : theme.hairline,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.choiceCheck, { borderColor: active ? theme.accent.ink : theme.hairline }]}>
        {active ? <Icon name="check" size={12} color={theme.accent.ink} stroke={2.2} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.body, { color: active ? theme.accent.ink : theme.text }]}>{title}</Text>
        <Text style={[TYPE.caption, { color: active ? theme.accent.ink : theme.textSec }]}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function StepRow({
  theme,
  n,
  title,
  detail,
}: {
  theme: Theme;
  n: number;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepNumber, { backgroundColor: theme.chipBg, borderColor: theme.hairline }]}>
        <Text style={[TYPE.captionEm, { color: theme.text }]}>{n}</Text>
      </View>
      <View style={styles.stepText}>
        <Text style={[TYPE.body, { color: theme.text }]}>{title}</Text>
        <Text style={[TYPE.caption, { color: theme.textSec }]}>{detail}</Text>
      </View>
    </View>
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

function dataAndSharingSummary(state: CloudSyncUiState) {
  if (state.conflictedRecords > 0) return 'Review needed';
  if (state.pendingRecords > 0) return 'Pending';
  if (state.label === 'Off') return 'Local only';
  return state.label;
}

function iosMajorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  const raw = Platform.Version;
  const major = typeof raw === 'number'
    ? Math.floor(raw)
    : parseInt(raw.split('.')[0] ?? '0', 10);
  return Number.isFinite(major) ? major : 0;
}

function applePayAutomationStatus(meta?: Record<string, unknown>): ApplePayAutomationStatus {
  return transactionAutomationStatus(meta, 'applePayAutomation');
}

function textAutomationStatus(meta?: Record<string, unknown>): TransactionAutomationStatus {
  return transactionAutomationStatus(meta, 'textAutomation');
}

function transactionAutomationStatus(
  meta: Record<string, unknown> | undefined,
  prefix: 'applePayAutomation' | 'textAutomation',
): TransactionAutomationStatus {
  const status = metaString(meta?.[`${prefix}LastStatus`]);
  const amount = metaNumber(meta?.[`${prefix}LastAmount`]);
  return {
    status: isAutomationLastStatus(status) ? status : undefined,
    runAt: metaString(meta?.[`${prefix}LastRunAt`]),
    merchant: metaString(meta?.[`${prefix}LastMerchant`]),
    amount,
    error: metaString(meta?.[`${prefix}LastError`]),
    background: meta?.[`${prefix}LastBackground`] === true,
    replayText: metaString(meta?.[`${prefix}LastReplayText`]),
    replayAmount: metaNumber(meta?.[`${prefix}LastReplayAmount`]),
    replayMerchant: metaString(meta?.[`${prefix}LastReplayMerchant`]),
    replayOccurredAt: metaString(meta?.[`${prefix}LastReplayOccurredAt`]),
    replayCategory: metaString(meta?.[`${prefix}LastReplayCategory`]),
    replayCardLast4: metaString(meta?.[`${prefix}LastReplayCardLast4`]),
  };
}

function isApplePayLastStatus(value?: string): value is ApplePayAutomationLastStatus {
  return isAutomationLastStatus(value);
}

function isAutomationLastStatus(value?: string): value is TransactionAutomationLastStatus {
  return value === 'saved'
    || value === 'duplicate'
    || value === 'review'
    || value === 'disabled'
    || value === 'failed'
    || value === 'ignored'
    || value === 'queued';
}

function metaString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function metaNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function applePayStatusDetail(status: ApplePayAutomationStatus, currencyCode: string): string {
  return automationStatusDetail(status, currencyCode, 'Apple Pay');
}

function automationStatusDetail(status: TransactionAutomationStatus, currencyCode: string, fallbackMerchant: string): string {
  const merchant = status.merchant ?? fallbackMerchant;
  const amount = status.amount !== undefined ? ` · ${formatMoney(status.amount, true, currencyCode)}` : '';
  const when = status.runAt ? ` · ${relativeTimeFromIso(status.runAt)}` : '';

  if (status.status === 'saved') {
    return `Last run: saved ${merchant}${amount}${when}`;
  }
  if (status.status === 'duplicate') {
    return `Last run: skipped duplicate ${merchant}${amount}${when}`;
  }
  if (status.status === 'review') {
    return `Last run: opened review for ${merchant}${amount}${when}`;
  }
  if (status.status === 'disabled') {
    return `Last run: ignored while off${when}`;
  }
  if (status.status === 'ignored') {
    return `Last run: ignored ${status.error ?? 'because it was not a transaction alert'}${when}`;
  }
  if (status.status === 'queued') {
    return `Last run: queued ${merchant}${amount}${when}`;
  }
  if (status.status === 'failed') {
    return `Last run: opened review after ${status.error ?? 'a background error'}${when}`;
  }
  return `No ${fallbackMerchant === 'Apple Pay' ? 'Wallet transactions' : 'text alerts'} have run yet.`;
}

function applePayReplayUrl(status: ApplePayAutomationStatus): string | null {
  return automationReplayUrl(status, 'wallet');
}

function textReplayUrl(status: TransactionAutomationStatus): string | null {
  return automationReplayUrl(status, 'sms');
}

function automationReplayUrl(status: TransactionAutomationStatus, source: 'wallet' | 'sms'): string | null {
  if (!status.replayText && status.replayAmount === undefined) return null;
  if (source === 'sms' && !status.replayText) return null;

  const query: [string, string][] = [
    ['source', source],
    ['preview', '1'],
    ['replay', '1'],
  ];

  if (status.replayText) {
    query.push(['text', status.replayText]);
    if (status.replayOccurredAt) query.push(['date', status.replayOccurredAt]);
  } else {
    if (status.replayAmount !== undefined) query.push(['amount', status.replayAmount.toFixed(2)]);
    if (status.replayMerchant) query.push(['merchant', status.replayMerchant]);
    if (status.replayCategory) query.push(['category', status.replayCategory]);
    if (status.replayOccurredAt) query.push(['date', status.replayOccurredAt]);
    if (status.replayCardLast4) query.push(['cardLast4', status.replayCardLast4]);
  }

  return `financeapp:///expense?${query
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')}`;
}

function isApplePayImport(tx: Transaction): boolean {
  return tx.meta?.automationSource === 'wallet';
}

function isTextImport(tx: Transaction): boolean {
  return tx.meta?.automationSource === 'sms';
}

function transactionTime(tx: Transaction): number {
  const value = tx.occurredAt ?? tx.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function relativeImportTime(tx: Transaction): string {
  const time = transactionTime(tx);
  if (!time) return 'recently';
  return relativeTimeFromMs(time);
}

function relativeTimeFromIso(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'recently';
  return relativeTimeFromMs(time);
}

function relativeTimeFromMs(time: number): string {
  const diff = Date.now() - time;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))}h ago`;
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  guideRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
  },
  guideHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: LAYOUT.screenGutter,
    paddingBottom: SPACE.sm,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  guideScroll: {
    flex: 1,
  },
  guideContent: {
    paddingHorizontal: LAYOUT.screenGutter,
    gap: SPACE.xxl,
  },
  guideHero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.card,
    padding: SPACE.xl,
    gap: SPACE.md,
  },
  guideHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  guideIconDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  guideHeroTitle: {
    marginTop: SPACE.xs,
  },
  guideHeroCopy: {
    maxWidth: 320,
  },
  flowPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
    paddingTop: SPACE.sm,
  },
  flowNode: {
    alignItems: 'center',
    gap: SPACE.xs,
    minWidth: 76,
  },
  flowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.field,
    padding: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: {
    flex: 1,
    gap: SPACE.xs,
  },
  devReplayPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.field,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  devReplayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  devReplayIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devReplayCopy: {
    flex: 1,
    gap: SPACE.xs,
  },
  devReplayButton: {
    minHeight: 44,
    borderRadius: RADIUS.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  guideSection: {
    gap: SPACE.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  modeChoice: {
    minHeight: 68,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  choiceCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    gap: SPACE.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepText: {
    flex: 1,
    gap: SPACE.xs,
    paddingBottom: SPACE.sm,
  },
  shortcutPreview: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.card,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  shortcutTopBar: {
    flexDirection: 'row',
    gap: SPACE.xs,
    paddingBottom: SPACE.xs,
  },
  shortcutDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.45,
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: SPACE.md,
  },
  shortcutRail: {
    width: 28,
    alignItems: 'center',
  },
  shortcutNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  shortcutLine: {
    width: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: SPACE.lg,
  },
  shortcutCard: {
    flex: 1,
    minHeight: 54,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  notePanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.field,
    padding: SPACE.lg,
    flexDirection: 'row',
    gap: SPACE.md,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
  },
  recentPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  emptyRecent: {
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.xl,
    gap: SPACE.sm,
  },
  emptyRecentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.xs,
  },
  emptyRecentCopy: {
    textAlign: 'center',
    maxWidth: 260,
  },
  recentRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  recentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCopy: {
    flex: 1,
    minWidth: 0,
    gap: SPACE.xs,
  },
  recentAmount: {
    textAlign: 'right',
    minWidth: 72,
  },
  recentDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACE.lg + 34 + SPACE.md,
  },
  guideFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACE.md,
    paddingHorizontal: LAYOUT.screenGutter,
    gap: SPACE.sm,
  },
});
