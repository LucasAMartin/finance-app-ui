import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  Animated,
  AppState,
  ImageBackground,
  StyleSheet,
  StatusBar,
  Dimensions,
  Pressable,
  Easing,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { router, useFocusEffect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { ThemeProvider, useTheme } from './src/ThemeProvider';
import { useAppFonts, patchTextWithInter } from './src/fonts';
import { RepositoryProvider, useRepositories, useRepositoryList } from './src/repositories/RepositoryProvider';
import { AppFeedbackProvider, useAppFeedback } from './src/AppFeedbackProvider';
import { FirstRunPrompt } from './src/components/FirstRunPrompt';
import { AppLockGate } from './src/components/AppLockGate';
import { formatMoney } from './src/selectors/format';
import { txToCreateInput } from './src/selectors/finance';
import type { ActivityInitialFilter } from './src/selectors/spending';

import { HomeScreen } from './src/screens/HomeScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import {
  InsightDetailScreen,
  type InsightDetailTarget,
} from './src/screens/InsightDetailScreen';
import { ActivityScreen, type ActivityHandle } from './src/screens/ActivityScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { ThemeScreen } from './src/screens/ThemeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { NotificationSettingsScreen } from './src/screens/NotificationSettingsScreen';
import { SharingSettingsScreen } from './src/screens/SharingSettingsScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import { TabBar } from './src/components/TabBar';
import { Drawer } from './src/components/Drawer';
import type { SourceRect } from './src/components/ContainerTransform';
import {
  TxSheetMount, type TxSheetHandle,
  BillSheetMount, type BillSheetHandle,
} from './src/components/sheetMounts';
import { useLocalNotificationScheduler } from './src/notifications/scheduler';
import {
  activeLedgerSyncDiagnostics,
  cloudKitRouteForActiveLedger,
  hasPendingActiveLedgerChanges,
  listActiveLedgerSyncConflicts,
  resetActiveLedgerSyncState,
  resolveActiveLedgerSyncConflict,
  syncActiveLedger,
  zoneNameForLedger,
} from './src/sync/syncActiveLedger';
import {
  CLOUD_SYNC_OFF,
  type CloudSyncConflictItem,
  type CloudSyncConflictResolution,
  type CloudSyncUiState,
} from './src/sync/cloudSyncStatus';
import CloudKitSyncModule from './modules/cloudkit-sync/src/CloudKitSyncModule';
import type { NativeCloudKitAcceptedShare } from './src/sync/nativeCloudKitAdapter';
import type { StoredSyncConflict } from './src/sync/sqliteSyncStore';
import type { AppSession, Bill, Ledger, LedgerMember, Transaction } from './src/repositories/types';

type Screen = 'home' | 'insights' | 'insightDetail' | 'activity' | 'budget';

patchTextWithInter();

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_W * 0.82);

const ALL_SCREENS: Screen[] = ['home', 'insights', 'insightDetail', 'budget', 'activity'];

const FADE_DURATION = 180;

// Purely presentational — opacity is owned by the parent, no internal effects.
const MemoHomeScreen = React.memo(HomeScreen);
const MemoInsightsScreen = React.memo(InsightsScreen);
const MemoActivityScreen = React.memo(ActivityScreen);
const MemoBudgetScreen = React.memo(BudgetScreen);

function isAcceptedCloudKitShare(
  share: NativeCloudKitAcceptedShare,
): share is NativeCloudKitAcceptedShare & {
  status: 'accepted';
  ownerName: string;
  zoneName: string;
} {
  return (
    share.status === 'accepted' &&
    typeof share.ownerName === 'string' &&
    share.ownerName.length > 0 &&
    typeof share.zoneName === 'string' &&
    share.zoneName.length > 0
  );
}

function cloudKitErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unknown CloudKit error';
}

function cloudKitToast(prefix: string, error: unknown): string {
  const message = cloudKitErrorMessage(error).replace(/\s+/g, ' ').trim();
  return `${prefix}: ${message.slice(0, 110)}`;
}

const AnimatedScreen = React.memo(function AnimatedScreen({
  opacity,
  active,
  children,
}: {
  opacity: Animated.Value;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity }]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
});

export function DashboardApp() {
  const { theme, dark, wallpaper, metaFlag, setMetaFlag } = useTheme();
  const {
    transactionsRepo,
    devDataRepo,
    incomeRepo,
    billsRepo,
    budgetsRepo,
    categoriesRepo,
    recurringRulesRepo,
    attachmentsRepo,
    settingsRepo,
    sessionRepo,
  } = useRepositories();
  const transactions = useRepositoryList(transactionsRepo);
  const incomes = useRepositoryList(incomeRepo);
  const budgets = useRepositoryList(budgetsRepo);
  const categories = useRepositoryList(categoriesRepo);
  const recurringRules = useRepositoryList(recurringRulesRepo);
  const settings = useRepositoryList(settingsRepo)[0];
  const { showToast } = useAppFeedback();
  const iCloudSyncEnabled = metaFlag('icloudSync');

  // Show the income prompt once: on first open when no income has been set and
  // the prompt hasn't been dismissed before. We wait for repos to settle (at
  // least one render with an empty list) rather than on the very first render
  // before the DB has loaded, so the flag check is stable.
  const incomePromptShown = metaFlag('incomePromptShown');
  const showIncomePrompt = !incomePromptShown && incomes.length === 0;

  // `screen` is only used for TabBar active state and pointerEvents.
  // The actual visual positions are driven imperatively via TX refs.
  const [screen, setScreen] = useState<Screen>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [sharingSettingsOpen, setSharingSettingsOpen] = useState(false);
  const [sharingInviteNoticeToken, setSharingInviteNoticeToken] = useState(0);
  const [sharingInviteBusy, setSharingInviteBusy] = useState(false);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncUiState>(CLOUD_SYNC_OFF);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalContributeToken, setGoalContributeToken] = useState(0);
  const [pendingBudgetEditCategoryId, setPendingBudgetEditCategoryId] = useState<string | undefined>(undefined);
  const [activityFilter, setActivityFilter] = useState<ActivityInitialFilter | null>(null);
  const [activityFilterToken, setActivityFilterToken] = useState(0);
  const activityFilterTokenRef = useRef(0);
  const [insightTarget, setInsightTarget] = useState<InsightDetailTarget | null>(null);
  const [morphResetToken, setMorphResetToken] = useState(0);
  // Optimistic delete: store the ID of a transaction that should be hidden from
  // the activity list immediately, before the repo delete + requery lands.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [session, setSession] = useState<AppSession>(() => sessionRepo.getSession());
  const [ledgerMembers, setLedgerMembers] = useState<LedgerMember[]>(() => sessionRepo.listMembers());
  const [ledgers, setLedgers] = useState<Ledger[]>(() => sessionRepo.listLedgers());
  const cloudSyncInFlightRef = useRef<ReturnType<typeof syncActiveLedger> | null>(null);
  const cloudSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insightOpenTokenRef = useRef(0);
  const insightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insightOpenFrameRef = useRef<number | null>(null);
  const [rootWallpaperReady, setRootWallpaperReady] = useState(false);
  const activeLedger = ledgers.find(ledger => ledger.id === session.activeLedgerId);
  const activeLedgerMeta = activeLedger?.meta ?? {};
  const currentMember = ledgerMembers.find(member => member.userId === session.currentUserId);
  const activeLedgerIsSharedParticipant = activeLedgerMeta.cloudDatabaseScope === 'shared';
  const canInviteToActiveLedger = !activeLedgerIsSharedParticipant && currentMember?.role === 'owner';
  const cloudConflictItems = useMemo(
    () => listActiveLedgerSyncConflicts().map(syncConflictToUiItem),
    [cloudSyncState, session.activeLedgerId],
  );

  const refreshSessionState = useCallback(() => {
    const nextSession = sessionRepo.getSession();
    setSession(nextSession);
    setLedgerMembers(sessionRepo.listMembers(nextSession.activeLedgerId));
    setLedgers(sessionRepo.listLedgers());
  }, [sessionRepo]);

  const refreshAfterSync = useCallback(() => {
    transactionsRepo.refresh?.();
    incomeRepo.refresh?.();
    billsRepo.refresh?.();
    budgetsRepo.refresh?.();
    categoriesRepo.refresh?.();
    recurringRulesRepo.refresh?.();
    attachmentsRepo.refresh?.();
    sessionRepo.refresh?.();
    refreshSessionState();
  }, [attachmentsRepo, billsRepo, budgetsRepo, categoriesRepo, incomeRepo, recurringRulesRepo, refreshSessionState, sessionRepo, transactionsRepo]);

  const refreshCloudDiagnostics = useCallback((patch?: Partial<CloudSyncUiState>) => {
    const diagnostics = activeLedgerSyncDiagnostics();
    setCloudSyncState(current => ({
      ...current,
      ...patch,
      pendingRecords: diagnostics.pendingRecords,
      conflictedRecords: diagnostics.conflictedRecords,
    }));
  }, []);

  useEffect(() => sessionRepo.subscribe(refreshSessionState), [refreshSessionState, sessionRepo]);

  useEffect(() => () => {
    if (insightClearTimerRef.current) clearTimeout(insightClearTimerRef.current);
    if (insightOpenFrameRef.current !== null) cancelAnimationFrame(insightOpenFrameRef.current);
  }, []);

  useEffect(() => {
    setRootWallpaperReady(false);
  }, [wallpaper.id]);

  useEffect(() => {
    if (!rootWallpaperReady) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [rootWallpaperReady]);

  const runCloudKitSync = useCallback(async (announce = false) => {
    if (cloudSyncInFlightRef.current) return cloudSyncInFlightRef.current;

    const task = syncActiveLedger({ nativeModule: CloudKitSyncModule })
      .then(result => {
        if (result.status === 'paused') {
          refreshCloudDiagnostics({
            label: 'Paused',
            detail: result.reason ? `iCloud sync paused: ${result.reason}` : 'iCloud sync is paused',
          });
          if (announce) showToast(`iCloud sync paused: ${result.reason ?? 'unavailable'}`);
          return result;
        }
        refreshAfterSync();
        const changes = result.pulledRecords + result.pushedRecords;
        refreshCloudDiagnostics({
          label: result.conflicts > 0 ? 'Review needed' : 'Synced',
          detail: result.conflicts > 0
            ? `${result.conflicts} sync conflict${result.conflicts === 1 ? '' : 's'} need attention`
            : changes > 0
              ? `Synced ${changes} change${changes === 1 ? '' : 's'}`
              : 'iCloud is up to date',
          lastSyncedAt: new Date().toISOString(),
        });
        if (announce) {
          showToast(changes > 0 ? `iCloud synced ${changes} changes` : 'iCloud is up to date');
        }
        return result;
      })
      .finally(() => {
        cloudSyncInFlightRef.current = null;
      });

    cloudSyncInFlightRef.current = task;
    return task;
  }, [refreshAfterSync, refreshCloudDiagnostics, showToast]);

  const scheduleCloudKitPush = useCallback(() => {
    if (!iCloudSyncEnabled) return;
    if (cloudSyncDebounceRef.current) {
      clearTimeout(cloudSyncDebounceRef.current);
    }

    cloudSyncDebounceRef.current = setTimeout(() => {
      cloudSyncDebounceRef.current = null;
      if (cloudSyncInFlightRef.current) {
        scheduleCloudKitPush();
        return;
      }
      if (!hasPendingActiveLedgerChanges()) return;
      runCloudKitSync(false).catch(error => {
        console.warn('CloudKit background sync failed', error);
        refreshCloudDiagnostics({
          label: 'Failed',
          detail: cloudKitToast('iCloud sync failed', error),
        });
        showToast(cloudKitToast('iCloud sync failed', error));
      });
    }, 900);
  }, [iCloudSyncEnabled, refreshCloudDiagnostics, runCloudKitSync, showToast]);

  useEffect(() => {
    if (!iCloudSyncEnabled) return;
    refreshCloudDiagnostics({
      label: 'Checking',
      detail: 'Checking iCloud for changes...',
    });
    runCloudKitSync(false).catch(error => {
      console.warn('CloudKit initial sync failed', error);
      refreshCloudDiagnostics({
        label: 'Failed',
        detail: cloudKitToast('iCloud sync failed', error),
      });
      showToast(cloudKitToast('iCloud sync failed', error));
    });
  }, [iCloudSyncEnabled, refreshCloudDiagnostics, runCloudKitSync, showToast]);

  useEffect(() => {
    if (!iCloudSyncEnabled) return;
    const unsubscribers = [
      transactionsRepo.subscribe(scheduleCloudKitPush),
      incomeRepo.subscribe(scheduleCloudKitPush),
      billsRepo.subscribe(scheduleCloudKitPush),
      budgetsRepo.subscribe(scheduleCloudKitPush),
      categoriesRepo.subscribe(scheduleCloudKitPush),
      recurringRulesRepo.subscribe(scheduleCloudKitPush),
      attachmentsRepo.subscribe(scheduleCloudKitPush),
      sessionRepo.subscribe(scheduleCloudKitPush),
    ];
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      if (cloudSyncDebounceRef.current) {
        clearTimeout(cloudSyncDebounceRef.current);
        cloudSyncDebounceRef.current = null;
      }
    };
  }, [
    attachmentsRepo,
    billsRepo,
    budgetsRepo,
    categoriesRepo,
    iCloudSyncEnabled,
    incomeRepo,
    recurringRulesRepo,
    scheduleCloudKitPush,
    sessionRepo,
    transactionsRepo,
  ]);

  const ensureCloudKitSubscriptions = useCallback(async () => {
    if (!iCloudSyncEnabled || !CloudKitSyncModule.ensureSubscriptions) return;
    const route = cloudKitRouteForActiveLedger(session.activeLedgerId);
    try {
      await CloudKitSyncModule.ensureSubscriptions(
        route.zoneName,
        route.databaseScope,
        route.ownerName,
      );
    } catch (error) {
      console.warn('CloudKit subscription setup failed', error);
      refreshCloudDiagnostics({
        label: 'Limited',
        detail: cloudKitToast('iCloud subscriptions failed', error),
      });
    }
  }, [iCloudSyncEnabled, refreshCloudDiagnostics, session.activeLedgerId]);

  const consumeRemoteCloudKitChanges = useCallback(async () => {
    if (!iCloudSyncEnabled || !CloudKitSyncModule.consumeRemoteNotifications) return;
    try {
      const changes = await CloudKitSyncModule.consumeRemoteNotifications();
      if (changes.length === 0) return;
      refreshCloudDiagnostics({
        label: 'Checking',
        detail: 'iCloud changes received...',
      });
      await runCloudKitSync(false);
    } catch (error) {
      console.warn('CloudKit remote-change sync failed', error);
      refreshCloudDiagnostics({
        label: 'Failed',
        detail: cloudKitToast('iCloud refresh failed', error),
      });
    }
  }, [iCloudSyncEnabled, refreshCloudDiagnostics, runCloudKitSync]);

  const verifyCloudKitAccount = useCallback(async () => {
    if (!iCloudSyncEnabled) return;
    try {
      const identity = await CloudKitSyncModule.getCurrentUser();
      if (!identity.available) {
        refreshCloudDiagnostics({
          label: 'Paused',
          detail: `iCloud sync paused: ${identity.reason}`,
        });
        return;
      }
      const expectedCloudUserId = typeof currentMember?.meta?.cloudKitUserId === 'string'
        ? currentMember.meta.cloudKitUserId
        : undefined;
      if (expectedCloudUserId && expectedCloudUserId !== identity.userId) {
        setMetaFlag('icloudSync', false);
        setCloudSyncState({
          ...CLOUD_SYNC_OFF,
          label: 'Paused',
          detail: 'iCloud account changed. Turn sync on again to reconnect this ledger.',
        });
        showToast('iCloud account changed. Sync paused.');
      }
    } catch (error) {
      refreshCloudDiagnostics({
        label: 'Paused',
        detail: cloudKitToast('iCloud account check failed', error),
      });
    }
  }, [currentMember?.meta, iCloudSyncEnabled, refreshCloudDiagnostics, setMetaFlag, showToast]);

  useEffect(() => {
    if (!iCloudSyncEnabled) return;
    ensureCloudKitSubscriptions();
    consumeRemoteCloudKitChanges();
    verifyCloudKitAccount();
  }, [
    consumeRemoteCloudKitChanges,
    ensureCloudKitSubscriptions,
    iCloudSyncEnabled,
    verifyCloudKitAccount,
  ]);

  useLocalNotificationScheduler({
    settings,
    transactions,
    budgets,
    categories,
    recurringRules,
    incomes,
  });

  // The inline budget keypad asks us to hide the floating tab bar so the pad has
  // the bottom of the screen to itself (the pad mirrors the system keyboard slot).
  const tabBarAnim = useRef(new Animated.Value(1)).current;
  const handleKeypadOpenChange = useCallback((open: boolean) => {
    if (open) {
      Animated.timing(tabBarAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      // Wait for the keypad (190ms hide) to finish sliding down before showing the tab bar.
      Animated.sequence([
        Animated.delay(190),
        Animated.timing(tabBarAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [tabBarAnim]);
  const handleOverlayOpenChange = useCallback((open: boolean) => {
    tabBarAnim.stopAnimation();
    Animated.timing(tabBarAnim, {
      toValue: open ? 0 : 1,
      duration: open ? 180 : 160,
      useNativeDriver: true,
    }).start();
  }, [tabBarAnim]);

  const activityRef  = useRef<ActivityHandle>(null);
  const txSheetRef   = useRef<TxSheetHandle>(null);
  const billSheetRef = useRef<BillSheetHandle>(null);
  const prepareTx = useCallback((tx: Transaction) => txSheetRef.current?.prepare(tx), []);
  const openTx = useCallback((tx: Transaction) => txSheetRef.current?.open(tx), []);
  const openBill = useCallback((bill: Bill) => billSheetRef.current?.open(bill), []);
  const openIncomeRoute = useCallback((_source?: SourceRect) => {
    router.push('/income');
  }, []);
  const openVoiceExpense = useCallback((_source?: SourceRect) => {
    router.push('/expense?mode=voice');
  }, []);
  const openManualExpense = useCallback((_source?: SourceRect) => {
    router.push('/expense?mode=manual');
  }, []);
  const resetHomeMorphReaction = useCallback(() => {
    setMorphResetToken(t => t + 1);
  }, []);

  useFocusEffect(resetHomeMorphReaction);

  const handleDeleteTx = useCallback((tx: Transaction) => {
    if (!transactionsRepo.canEdit(tx)) {
      const ownerName = ledgerMembers.find(member => member.userId === tx.createdByUserId)?.displayName;
      showToast(`${ownerName ?? 'This member'} has locked edits for their items`);
      return;
    }
    // Hide the row immediately in the activity list before the repo delete lands.
    setPendingDeleteId(tx.id);
    // Defer the actual delete one frame so the row-exit renders first.
    requestAnimationFrame(() => {
      transactionsRepo.delete(tx.id);
      setPendingDeleteId(null);
      showToast('Transaction deleted', () => transactionsRepo.create(txToCreateInput(tx)));
    });
  }, [ledgerMembers, showToast, transactionsRepo]);

  const handleResetSyncedSampleData = useCallback(async () => {
    const zoneName = zoneNameForLedger(session.activeLedgerId);
    try {
      if (!CloudKitSyncModule.resetZone) {
        showToast('CloudKit reset is unavailable in this build');
        return;
      }
      if (cloudSyncDebounceRef.current) {
        clearTimeout(cloudSyncDebounceRef.current);
        cloudSyncDebounceRef.current = null;
      }
      if (cloudSyncInFlightRef.current) {
        await cloudSyncInFlightRef.current.catch(() => undefined);
      }
      await CloudKitSyncModule.resetZone(zoneName);
      resetActiveLedgerSyncState();
      devDataRepo.setSeedDataEnabled(true);
      const currentCloudUser = await CloudKitSyncModule.getCurrentUser();
      if (currentCloudUser.available) {
        sessionRepo.bindCloudIdentity({
          ledgerId: session.activeLedgerId,
          userId: currentCloudUser.userId,
          displayName: currentMember?.displayName ?? 'You',
          role: 'owner',
          allowOthersToEditMyItems: currentMember?.allowOthersToEditMyItems ?? true,
          claimAsOwner: true,
          meta: { ...(currentMember?.meta ?? {}), cloudKitUserId: currentCloudUser.userId },
        });
        sessionRepo.setCurrentUserId(currentCloudUser.userId);
      }
      const resetAt = new Date().toISOString();
      const resetId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ledger = sessionRepo.listLedgers().find(item => item.id === session.activeLedgerId);
      sessionRepo.updateLedger(session.activeLedgerId, {
        meta: {
          ...(ledger?.meta ?? {}),
          cloudResetAt: resetAt,
          cloudResetId: resetId,
        },
      });
      refreshSessionState();
      const result = await runCloudKitSync(true);
      if (result.status === 'paused') return;
      showToast('Fresh sample data synced');
    } catch {
      showToast('Sample data reset failed');
    }
  }, [currentMember, devDataRepo, refreshSessionState, runCloudKitSync, session.activeLedgerId, sessionRepo, showToast]);

  const confirmResetSyncedSampleData = useCallback(() => {
    Alert.alert(
      'Reset synced sample data?',
      'This deletes the active iCloud test zone, reloads clean local sample data, and uploads fresh records with the current sync metadata.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            handleResetSyncedSampleData();
          },
        },
      ],
    );
  }, [handleResetSyncedSampleData]);

  const handleCurrentMemberEditLockChange = useCallback((allowOthersToEditMyItems: boolean) => {
    const member = ledgerMembers.find(item => item.userId === session.currentUserId);
    if (!member) return;
    sessionRepo.updateMember(member.id, { allowOthersToEditMyItems });
    showToast(allowOthersToEditMyItems ? 'Others can edit your items' : 'Only you can edit your items');
  }, [ledgerMembers, session.currentUserId, sessionRepo, showToast]);

  const handleCurrentMemberProfileChange = useCallback((patch: { displayName?: string; profileImageDataUri?: string | null }) => {
    const member = ledgerMembers.find(item => item.userId === session.currentUserId);
    if (!member) return;
    const nextMeta = { ...(member.meta ?? {}) };
    if (patch.profileImageDataUri === null) {
      delete nextMeta.profileImageDataUri;
    } else if (patch.profileImageDataUri) {
      nextMeta.profileImageDataUri = patch.profileImageDataUri;
    }
    sessionRepo.updateMember(member.id, {
      ...(patch.displayName ? { displayName: patch.displayName } : {}),
      meta: nextMeta,
    });
    showToast(patch.displayName ? 'Profile name updated' : patch.profileImageDataUri === null ? 'Profile photo removed' : 'Profile photo updated');
  }, [ledgerMembers, session.currentUserId, sessionRepo, showToast]);

  const bindActiveLedgerToICloudUser = useCallback(async (claimAsOwner: boolean) => {
    const currentCloudUser = await CloudKitSyncModule.getCurrentUser();
    if (!currentCloudUser.available) return currentCloudUser;
    const existingCloudMember = ledgerMembers.find(member => member.userId === currentCloudUser.userId);
    const currentLocalMember = ledgerMembers.find(member => member.userId === session.currentUserId);
    const profileSource = existingCloudMember ?? currentLocalMember;
    sessionRepo.bindCloudIdentity({
      ledgerId: session.activeLedgerId,
      userId: currentCloudUser.userId,
      displayName: profileSource?.displayName ?? 'You',
      role: claimAsOwner ? 'owner' : 'member',
      allowOthersToEditMyItems: profileSource?.allowOthersToEditMyItems ?? true,
      claimAsOwner,
      meta: { ...(profileSource?.meta ?? {}), cloudKitUserId: currentCloudUser.userId },
    });
    sessionRepo.setCurrentUserId(currentCloudUser.userId);
    refreshSessionState();
    return currentCloudUser;
  }, [ledgerMembers, refreshSessionState, session.activeLedgerId, session.currentUserId, sessionRepo]);

  const handleICloudSyncChange = useCallback((enabled: boolean) => {
    setMetaFlag('icloudSync', enabled);
    if (!enabled) {
      setCloudSyncState(CLOUD_SYNC_OFF);
      showToast('iCloud sync off');
      return;
    }
    refreshCloudDiagnostics({
      label: 'Checking',
      detail: 'Checking iCloud account...',
    });
    bindActiveLedgerToICloudUser(!activeLedgerIsSharedParticipant && currentMember?.role === 'owner')
      .then(identity => {
        if (!identity.available) {
          setMetaFlag('icloudSync', false);
          refreshCloudDiagnostics({
            label: 'Paused',
            detail: `iCloud sync paused: ${identity.reason}`,
          });
          showToast(`iCloud sync paused: ${identity.reason}`);
          return undefined;
        }
        return runCloudKitSync(true);
      })
      .then(result => {
        if (result?.status === 'paused') {
          setMetaFlag('icloudSync', false);
        }
      })
      .catch(error => {
        setMetaFlag('icloudSync', false);
        console.warn('CloudKit enable sync failed', error);
        refreshCloudDiagnostics({
          label: 'Failed',
          detail: cloudKitToast('iCloud sync failed', error),
        });
        showToast(cloudKitToast('iCloud sync failed', error));
      });
  }, [
    activeLedgerIsSharedParticipant,
    bindActiveLedgerToICloudUser,
    currentMember?.role,
    refreshCloudDiagnostics,
    runCloudKitSync,
    setMetaFlag,
    showToast,
  ]);

  const handleManualCloudRefresh = useCallback(async () => {
    if (!iCloudSyncEnabled) {
      showToast('iCloud sync is off');
      return;
    }
    try {
      const result = await runCloudKitSync(true);
      if (result.status === 'paused') return;
    } catch (error) {
      console.warn('CloudKit manual refresh failed', error);
      refreshCloudDiagnostics({
        label: 'Failed',
        detail: cloudKitToast('iCloud refresh failed', error),
      });
      showToast(cloudKitToast('iCloud refresh failed', error));
    }
  }, [iCloudSyncEnabled, refreshCloudDiagnostics, runCloudKitSync, showToast]);

  const handleResolveCloudConflict = useCallback((recordName: string, resolution: CloudSyncConflictResolution) => {
    const conflict = listActiveLedgerSyncConflicts().find(item => item.local.recordName === recordName);
    if (!conflict) {
      refreshCloudDiagnostics();
      showToast('That change was already resolved');
      return;
    }
    if (resolution === 'discardLocal' && conflict.reason !== 'permission-denied') {
      refreshCloudDiagnostics();
      showToast('That change needs a version choice');
      return;
    }
    if (resolution === 'remote' && !conflict.remote) {
      refreshCloudDiagnostics();
      showToast('No iCloud version is available for this change');
      return;
    }
    if (resolution === 'local' && conflict.reason === 'permission-denied') {
      refreshCloudDiagnostics();
      showToast('This item is locked by another member');
      return;
    }
    const resolved = resolveActiveLedgerSyncConflict(recordName, resolution);
    if (!resolved) {
      refreshCloudDiagnostics();
      showToast('Could not resolve that conflict');
      return;
    }
    refreshAfterSync();
    refreshCloudDiagnostics({
      label: resolution === 'local' || resolution === 'discardLocal' ? 'Checking' : 'Resolved',
      detail: resolution === 'local'
        ? 'Retrying your version...'
        : resolution === 'discardLocal'
          ? 'Refreshing the shared version...'
          : 'Kept the iCloud version',
    });
    if ((resolution === 'local' || resolution === 'discardLocal') && iCloudSyncEnabled) {
      if (resolution === 'discardLocal') resetActiveLedgerSyncState();
      runCloudKitSync(true).catch(error => {
        console.warn('CloudKit conflict retry failed', error);
        refreshCloudDiagnostics({
          label: 'Failed',
          detail: cloudKitToast('iCloud sync failed', error),
        });
        showToast(cloudKitToast('iCloud sync failed', error));
      });
    } else {
      showToast(resolution === 'local' ? 'Kept this device' : resolution === 'discardLocal' ? 'Refreshing from iCloud' : 'Kept iCloud');
    }
  }, [iCloudSyncEnabled, refreshAfterSync, refreshCloudDiagnostics, runCloudKitSync, showToast]);

  const acceptedShareConsumeInFlightRef = useRef(false);
  const consumeAcceptedCloudKitShares = useCallback(async () => {
    if (acceptedShareConsumeInFlightRef.current) return;
    if (!CloudKitSyncModule.consumeAcceptedShares) return;
    acceptedShareConsumeInFlightRef.current = true;
    try {
      const shares = await CloudKitSyncModule.consumeAcceptedShares();
      const accepted = shares.filter(isAcceptedCloudKitShare);
      if (accepted.length === 0) return;
      const currentCloudUser = await CloudKitSyncModule.getCurrentUser().catch(() => undefined);
      const cloudUserId = currentCloudUser?.available ? currentCloudUser.userId : undefined;

      accepted.forEach(share => {
        const ledgerId = share.ledgerId ?? session.activeLedgerId;
        const ledger = sessionRepo.listLedgers().find(item => item.id === ledgerId);
        if (!ledger) return;
        const acceptedAt = share.acceptedAt ?? new Date().toISOString();
        sessionRepo.updateLedgerLocalMeta(ledgerId, {
          ...(ledger.meta ?? {}),
          cloudDatabaseScope: 'shared',
          cloudOwnerName: share.ownerName,
          cloudZoneName: share.zoneName,
          cloudShareRecordName: share.shareRecordName,
          cloudShareUrl: share.shareUrl,
          cloudShareAcceptedAt: acceptedAt,
          cloudParticipantPermission: share.participantPermission,
        });
        if (cloudUserId) {
          sessionRepo.bindCloudIdentity({
            ledgerId,
            userId: cloudUserId,
            displayName: 'You',
            role: 'member',
            allowOthersToEditMyItems: true,
            claimAsOwner: false,
            meta: {
              cloudKitUserId: cloudUserId,
              cloudShareAcceptedAt: acceptedAt,
              cloudParticipantPermission: share.participantPermission,
            },
          });
        }
      });

      if (cloudUserId) {
        sessionRepo.setCurrentUserId(cloudUserId);
      }
      setMetaFlag('icloudSync', true);
      refreshSessionState();
      const result = await runCloudKitSync(true);
      if (result.status === 'paused') return;
      showToast('Shared ledger connected');
    } catch {
      showToast('Could not finish accepting iCloud share');
    } finally {
      acceptedShareConsumeInFlightRef.current = false;
    }
  }, [
    refreshSessionState,
    runCloudKitSync,
    session.activeLedgerId,
    sessionRepo,
    setMetaFlag,
    showToast,
  ]);

  useEffect(() => {
    consumeAcceptedCloudKitShares();
    consumeRemoteCloudKitChanges();
    verifyCloudKitAccount();
    const retryTimers = [
      setTimeout(consumeAcceptedCloudKitShares, 1200),
      setTimeout(consumeAcceptedCloudKitShares, 3500),
    ];
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshAfterSync();
        consumeAcceptedCloudKitShares();
        ensureCloudKitSubscriptions();
        consumeRemoteCloudKitChanges();
        verifyCloudKitAccount();
      }
    });
    return () => {
      retryTimers.forEach(clearTimeout);
      subscription.remove();
    };
  }, [
    consumeAcceptedCloudKitShares,
    consumeRemoteCloudKitChanges,
    ensureCloudKitSubscriptions,
    refreshAfterSync,
    verifyCloudKitAccount,
  ]);

  const handlePresentLedgerShare = useCallback(async () => {
    if (sharingInviteBusy) return;
    if (!canInviteToActiveLedger) {
      showToast(activeLedgerIsSharedParticipant ? 'This ledger is shared with you' : 'Only the ledger owner can invite');
      return;
    }
    if (!CloudKitSyncModule.presentLedgerShare) {
      showToast('iCloud sharing is unavailable in this build');
      return;
    }

    const enabledBeforeInvite = iCloudSyncEnabled;
    setSharingInviteBusy(true);
    if (!enabledBeforeInvite) {
      setMetaFlag('icloudSync', true);
    }

    try {
      const identity = await bindActiveLedgerToICloudUser(true);
      if (!identity.available) {
        if (!enabledBeforeInvite) setMetaFlag('icloudSync', false);
        showToast(`iCloud sync paused: ${identity.reason}`);
        return;
      }
      const share = await CloudKitSyncModule.presentLedgerShare(session.activeLedgerId, activeLedger?.name);
      if (share.shareUrl) {
        const ledger = sessionRepo.listLedgers().find(item => item.id === session.activeLedgerId);
        sessionRepo.updateLedgerLocalMeta(session.activeLedgerId, {
          ...(ledger?.meta ?? {}),
          cloudShareUrl: share.shareUrl,
        });
      }
      runCloudKitSync(false).catch(error => {
        console.warn('CloudKit post-share sync failed', error);
        showToast(cloudKitToast('iCloud share opened, sync failed', error));
      });
    } catch (error) {
      if (!enabledBeforeInvite) setMetaFlag('icloudSync', false);
      console.warn('CloudKit sharing failed', error);
      showToast(cloudKitToast('Could not open iCloud sharing', error));
    } finally {
      setSharingInviteBusy(false);
    }
  }, [
    iCloudSyncEnabled,
    activeLedger?.name,
    activeLedgerIsSharedParticipant,
    bindActiveLedgerToICloudUser,
    canInviteToActiveLedger,
    runCloudKitSync,
    session.activeLedgerId,
    sessionRepo,
    setMetaFlag,
    sharingInviteBusy,
    showToast,
  ]);

  const handleLeaveSharedLedger = useCallback(() => {
    if (!activeLedgerIsSharedParticipant) {
      if (!canInviteToActiveLedger) {
        showToast('Only the ledger owner can stop sharing');
        return;
      }
      if (!CloudKitSyncModule.stopSharingLedger) {
        showToast('Stopping iCloud sharing is unavailable in this build');
        return;
      }
      Alert.alert(
        'Stop sharing this ledger?',
        'This removes iCloud sharing access for other people. Your own iCloud sync can continue privately.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Stop Sharing',
            style: 'destructive',
            onPress: () => {
              setSharingInviteBusy(true);
              CloudKitSyncModule.stopSharingLedger?.(session.activeLedgerId)
                .then(result => {
                  const ledger = sessionRepo.listLedgers().find(item => item.id === session.activeLedgerId);
                  const nextMeta = { ...(ledger?.meta ?? {}) };
                  delete nextMeta.cloudShareRecordName;
                  delete nextMeta.cloudShareUrl;
                  ledgerMembers
                    .filter(member => member.userId !== session.currentUserId)
                    .forEach(member => {
                      sessionRepo.updateMember(member.id, { status: 'removed' });
                    });
                  sessionRepo.updateLedgerLocalMeta(session.activeLedgerId, nextMeta);
                  refreshSessionState();
                  showToast(result.stopped ? 'iCloud sharing stopped' : 'No active iCloud share found');
                  if (iCloudSyncEnabled) {
                    runCloudKitSync(false).catch(error => {
                      console.warn('CloudKit post-stop-sharing sync failed', error);
                    });
                  }
                })
                .catch(error => {
                  console.warn('CloudKit stop sharing failed', error);
                  showToast(cloudKitToast('Could not stop iCloud sharing', error));
                })
                .finally(() => setSharingInviteBusy(false));
            },
          },
        ],
      );
      return;
    }
    Alert.alert(
      'Leave shared ledger?',
      'This disconnects this device from the shared iCloud ledger and turns iCloud sync off here. Your local copy stays on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            resetActiveLedgerSyncState();
            const ledger = sessionRepo.listLedgers().find(item => item.id === session.activeLedgerId);
            const nextMeta = { ...(ledger?.meta ?? {}) };
            delete nextMeta.cloudDatabaseScope;
            delete nextMeta.cloudOwnerName;
            delete nextMeta.cloudZoneName;
            delete nextMeta.cloudShareRecordName;
            delete nextMeta.cloudShareUrl;
            delete nextMeta.cloudShareAcceptedAt;
            delete nextMeta.cloudParticipantPermission;
            sessionRepo.updateLedgerLocalMeta(session.activeLedgerId, nextMeta);
            setMetaFlag('icloudSync', false);
            setCloudSyncState(CLOUD_SYNC_OFF);
            refreshSessionState();
            showToast('Shared ledger disconnected');
          },
        },
      ],
    );
  }, [
    activeLedgerIsSharedParticipant,
    canInviteToActiveLedger,
    iCloudSyncEnabled,
    ledgerMembers,
    refreshSessionState,
    runCloudKitSync,
    session.activeLedgerId,
    session.currentUserId,
    sessionRepo,
    setMetaFlag,
    showToast,
  ]);

  // Synchronous read of current screen so navigate() never reads stale state.
  const activeRef = useRef<Screen>('home');

  // Each screen's opacity. Home starts visible, rest start hidden.
  // Driven imperatively — no useEffect cycle.
  const OP = useRef<Record<Screen, Animated.Value>>({
    home:     new Animated.Value(1),
    insights: new Animated.Value(0),
    insightDetail: new Animated.Value(0),
    budget:   new Animated.Value(0),
    activity: new Animated.Value(0),
  }).current;

  const drawerAnim = useRef(new Animated.Value(0)).current;

  // Start both drawer animations immediately on press — before setState.
  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    Animated.timing(drawerAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
      easing: Easing.out(Easing.exp),
    }).start();
  }, [drawerAnim]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
      easing: Easing.in(Easing.cubic),
    }).start();
  }, [drawerAnim]);

  // Cross-fade between screens. Starts before setState — zero perceived delay.
  const navigate = useCallback((s: Screen) => {
    const from = activeRef.current;
    if (s === from) return;

    // Snap all uninvolved screens to fully transparent.
    ALL_SCREENS.forEach(k => {
      if (k !== from && k !== s) OP[k].setValue(0);
    });

    Animated.timing(OP[from], {
      toValue: 0,
      duration: FADE_DURATION,
      useNativeDriver: true,
      easing: Easing.in(Easing.quad),
    }).start();

    Animated.timing(OP[s], {
      toValue: 1,
      duration: FADE_DURATION,
      useNativeDriver: true,
      easing: Easing.out(Easing.quad),
    }).start();

    activeRef.current = s;
    setScreen(s);
  }, [OP]);

  const navigateToActivity = useCallback((filter?: ActivityInitialFilter) => {
    if (filter) {
      const nextToken = activityFilterTokenRef.current + 1;
      activityFilterTokenRef.current = nextToken;
      activityRef.current?.beginNavFilter(filter, nextToken);
      setActivityFilter(filter);
      setActivityFilterToken(nextToken);
      if (activeRef.current !== 'activity') {
        OP.activity.setValue(0);
      }
    }
    navigate('activity');
  }, [OP, navigate]);

  const handleDrawerNav = useCallback((id: string) => {
    closeDrawer();
    if      (id === 'home')     navigate('home');
    else if (id === 'budget')   navigate('budget');
    else if (id === 'insights') navigate('insights');
    else if (id === 'activity') navigate('activity');
    else if (id === 'goals')    setGoalsOpen(true);
    else if (id === 'settings') setSettingsOpen(true);
  }, [closeDrawer, navigate]);

  const openTheme = useCallback(() => setThemeOpen(true), []);
  const openProfile = useCallback(() => {
    closeDrawer();
    setProfileOpen(true);
  }, [closeDrawer]);
  const openGoalContribution = useCallback(() => {
    setGoalsOpen(true);
    setGoalContributeToken(token => token + 1);
  }, []);
  const openBudgetIncome = useCallback((_node: View) => router.push('/income'), []);
  const handleInsightTarget = useCallback((target: InsightDetailTarget) => {
    const token = insightOpenTokenRef.current + 1;
    insightOpenTokenRef.current = token;
    if (insightClearTimerRef.current) {
      clearTimeout(insightClearTimerRef.current);
      insightClearTimerRef.current = null;
    }
    if (insightOpenFrameRef.current !== null) {
      cancelAnimationFrame(insightOpenFrameRef.current);
      insightOpenFrameRef.current = null;
    }
    OP.insightDetail.setValue(0);
    setInsightTarget(target);
    handleOverlayOpenChange(true);
    insightOpenFrameRef.current = requestAnimationFrame(() => {
      insightOpenFrameRef.current = null;
      if (insightOpenTokenRef.current !== token) return;
      navigate('insightDetail');
    });
  }, [OP, handleOverlayOpenChange, navigate]);
  const closeTheme = useCallback(() => setThemeOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const openNotificationSettings = useCallback(() => setNotificationSettingsOpen(true), []);
  const closeNotificationSettings = useCallback(() => setNotificationSettingsOpen(false), []);
  const openSharingSettings = useCallback((intent?: 'overview' | 'members' | 'invite') => {
    setSharingSettingsOpen(true);
    if (intent === 'invite') {
      setSharingInviteNoticeToken(token => token + 1);
    }
  }, []);
  const closeSharingSettings = useCallback(() => setSharingSettingsOpen(false), []);
  const closeGoals = useCallback(() => setGoalsOpen(false), []);
  const openIncomeFromSettings = useCallback(() => router.push('/income'), []);
  const closeInsight = useCallback(() => {
    insightOpenTokenRef.current += 1;
    if (insightOpenFrameRef.current !== null) {
      cancelAnimationFrame(insightOpenFrameRef.current);
      insightOpenFrameRef.current = null;
    }
    navigate('insights');
    handleOverlayOpenChange(false);
    if (insightClearTimerRef.current) clearTimeout(insightClearTimerRef.current);
    insightClearTimerRef.current = setTimeout(() => {
      insightClearTimerRef.current = null;
      setInsightTarget(null);
    }, FADE_DURATION + 40);
  }, [handleOverlayOpenChange, navigate]);
  const handleInsightSeeAll = useCallback((filter: ActivityInitialFilter) => {
    insightOpenTokenRef.current += 1;
    if (insightOpenFrameRef.current !== null) {
      cancelAnimationFrame(insightOpenFrameRef.current);
      insightOpenFrameRef.current = null;
    }
    navigateToActivity(filter);
    handleOverlayOpenChange(false);
    if (insightClearTimerRef.current) clearTimeout(insightClearTimerRef.current);
    insightClearTimerRef.current = setTimeout(() => {
      insightClearTimerRef.current = null;
      setInsightTarget(null);
    }, FADE_DURATION + 40);
  }, [handleOverlayOpenChange, navigateToActivity]);
  const handleTabPress = useCallback((id: string) => {
    if      (id === 'home')     navigate('home');
    else if (id === 'spending') navigate('insights');
    else if (id === 'budget')   navigate('budget');
    else if (id === 'activity') navigate('activity');
  }, [navigate]);

  const homeScreen = useMemo(() => (
    <MemoHomeScreen
      theme={theme}
      onViewActivity={navigateToActivity}
      onOpenDrawer={openDrawer}
      onAddVoice={openVoiceExpense}
      onAddManual={openManualExpense}
      onLogIncome={openIncomeRoute}
      onOpenTheme={openTheme}
      onContributeGoal={openGoalContribution}
      onOpenTx={openTx}
      onPrepareTx={prepareTx}
      onDeleteTx={handleDeleteTx}
      onOpenBill={openBill}
      onRefreshSync={handleManualCloudRefresh}
      morphResetToken={morphResetToken}
    />
  ), [
    handleManualCloudRefresh,
    handleDeleteTx,
    morphResetToken,
    navigateToActivity,
    openBill,
    openDrawer,
    openIncomeRoute,
    openManualExpense,
    openGoalContribution,
    openTheme,
    openTx,
    prepareTx,
    openVoiceExpense,
    theme,
  ]);

  const insightsScreen = useMemo(() => (
    <MemoInsightsScreen
      theme={theme}
      active={screen === 'insights'}
      onOpenDrawer={openDrawer}
      onViewActivity={navigateToActivity}
      onOpenInsight={handleInsightTarget}
    />
  ), [handleInsightTarget, navigateToActivity, openDrawer, screen, theme]);

  const insightDetailScreen = useMemo(() => (
    <InsightDetailScreen
      theme={theme}
      target={insightTarget}
      onClose={closeInsight}
      onSeeAll={handleInsightSeeAll}
    />
  ), [closeInsight, handleInsightSeeAll, insightTarget, theme]);

  const activityScreen = useMemo(() => (
    <MemoActivityScreen
      ref={activityRef}
      theme={theme}
      onOpenDrawer={openDrawer}
      onOpenTx={openTx}
      onPrepareTx={prepareTx}
      onOverlayOpenChange={handleOverlayOpenChange}
      initialFilter={activityFilter}
      filterToken={activityFilterToken}
      pendingDeleteId={pendingDeleteId}
      onRefreshSync={handleManualCloudRefresh}
    />
  ), [activityFilter, activityFilterToken, handleManualCloudRefresh, handleOverlayOpenChange, openDrawer, openTx, pendingDeleteId, prepareTx, theme]);

  const budgetScreen = useMemo(() => (
    <MemoBudgetScreen
      theme={theme}
      onOpenDrawer={openDrawer}
      onOpenIncome={openBudgetIncome}
      onKeypadOpenChange={handleKeypadOpenChange}
      pendingEditCategoryId={pendingBudgetEditCategoryId}
      onPendingEditHandled={() => setPendingBudgetEditCategoryId(undefined)}
    />
  ), [handleKeypadOpenChange, openBudgetIncome, openDrawer, pendingBudgetEditCategoryId, theme]);

  const backdropOpacity = drawerAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      {/* Provider lives INSIDE this screen (not in the root _layout above the
          native Stack), so its portal host renders within the same native
          screen and the sheet paints on top of the app content rather than
          behind a react-native-screens native view. */}
      <BottomSheetModalProvider>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <ImageBackground
          key={wallpaper.id}
          source={wallpaper.source}
          defaultSource={typeof wallpaper.source === 'number' ? wallpaper.source : undefined}
          fadeDuration={0}
          onLoadEnd={() => setRootWallpaperReady(true)}
          onError={() => setRootWallpaperReady(true)}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />

        <View
          pointerEvents={rootWallpaperReady ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, { opacity: rootWallpaperReady ? 1 : 0 }]}
        >
        <AnimatedScreen opacity={OP.home} active={screen === 'home'}>
          {homeScreen}
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.insights} active={screen === 'insights'}>
          {insightsScreen}
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.insightDetail} active={screen === 'insightDetail'}>
          {insightDetailScreen}
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.activity} active={screen === 'activity'}>
          {activityScreen}
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.budget} active={screen === 'budget'}>
          {budgetScreen}
        </AnimatedScreen>

        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: tabBarAnim,
              transform: [{ translateY: tabBarAnim.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }],
            },
          ]}
          pointerEvents={screen === 'insightDetail' ? 'none' : 'box-none'}
        >
          <TabBar
            theme={theme}
            active={screen === 'insights' || screen === 'insightDetail' ? 'spending' : screen}
            onAdd={openVoiceExpense}
            onTabPress={handleTabPress}
          />
        </Animated.View>

        {/* ─── Drawer backdrop ──────────────────────────────── */}
        <Animated.View
          pointerEvents={drawerOpen ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#000', opacity: backdropOpacity, zIndex: 50 },
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
        </Animated.View>

        {/* ─── Drawer ───────────────────────────────────────── */}
        <View
          style={[StyleSheet.absoluteFill, { zIndex: 60 }]}
          pointerEvents={drawerOpen ? 'box-none' : 'none'}
        >
          <Drawer
            theme={theme}
            width={DRAWER_WIDTH}
            progress={drawerAnim}
            activeId={goalsOpen ? 'goals' : screen}
            onNavigate={handleDrawerNav}
            onClose={closeDrawer}
            currentUserId={session.currentUserId}
            ledgerMembers={ledgerMembers}
            onOpenProfile={openProfile}
          />
        </View>

        <TxSheetMount ref={txSheetRef} onDeleted={handleDeleteTx} />
        <BillSheetMount ref={billSheetRef} />

        {/* First-run income prompt — rendered once when no income is set */}
        {showIncomePrompt && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 95 }]} pointerEvents="box-none">
            <FirstRunPrompt
              theme={theme}
              onSetIncome={() => {
                setMetaFlag('incomePromptShown');
                router.push('/income');
              }}
              onSkip={() => setMetaFlag('incomePromptShown')}
            />
          </View>
        )}

        <GoalsScreen
          theme={theme}
          visible={goalsOpen}
          contributeRequestToken={goalContributeToken}
          onClose={closeGoals}
          onEditGoalCategory={(catId) => {
            closeGoals();
            setPendingBudgetEditCategoryId(catId);
            navigate('budget');
          }}
        />

        <SettingsScreen
          theme={theme}
          visible={settingsOpen}
          onClose={closeSettings}
          onOpenAppearance={openTheme}
          onOpenNotifications={openNotificationSettings}
          onOpenIncome={openIncomeFromSettings}
          onOpenSharing={openSharingSettings}
          cloudSyncState={cloudSyncState}
        />

        <ProfileScreen
          theme={theme}
          visible={profileOpen}
          onClose={closeProfile}
          member={currentMember}
          onProfileChange={handleCurrentMemberProfileChange}
          onOpenSharing={() => openSharingSettings('overview')}
        />

        <NotificationSettingsScreen
          theme={theme}
          visible={notificationSettingsOpen}
          onClose={closeNotificationSettings}
        />

        <SharingSettingsScreen
          theme={theme}
          visible={sharingSettingsOpen}
          onClose={closeSharingSettings}
          activeLedgerName={activeLedger?.name}
          cloudShared={activeLedgerIsSharedParticipant}
          canInvite={canInviteToActiveLedger}
          participantPermission={typeof activeLedgerMeta.cloudParticipantPermission === 'string' ? activeLedgerMeta.cloudParticipantPermission : undefined}
          currentUserId={session.currentUserId}
          ledgerMembers={ledgerMembers}
          inviteNoticeToken={sharingInviteNoticeToken}
          inviteBusy={sharingInviteBusy}
          iCloudSyncEnabled={iCloudSyncEnabled}
          cloudSyncState={cloudSyncState}
          cloudConflicts={cloudConflictItems}
          onICloudSyncChange={handleICloudSyncChange}
          onManualCloudRefresh={handleManualCloudRefresh}
          onInviteSomeone={handlePresentLedgerShare}
          onLeaveOrManageSharing={handleLeaveSharedLedger}
          onResolveCloudConflict={handleResolveCloudConflict}
          onCurrentMemberEditLockChange={handleCurrentMemberEditLockChange}
          onResetSyncedSampleData={confirmResetSyncedSampleData}
        />

        <ThemeScreen
          theme={theme}
          visible={themeOpen}
          onClose={closeTheme}
        />

        <AppLockGate />
        </View>
      </View>
      </BottomSheetModalProvider>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useAppFonts();
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RepositoryProvider>
        <ThemeProvider defaultDark={true} defaultAccent="ink" defaultCardStyle="flat">
          <SafeAreaProvider>
            <AppFeedbackProvider>
              <DashboardApp />
            </AppFeedbackProvider>
          </SafeAreaProvider>
        </ThemeProvider>
      </RepositoryProvider>
    </GestureHandlerRootView>
  );
}

function syncConflictToUiItem(conflict: StoredSyncConflict): CloudSyncConflictItem {
  return {
    recordName: conflict.local.recordName,
    title: syncRecordTitle(conflict.local),
    detail: syncConflictReasonLabel(conflict.reason),
    reason: conflict.reason,
    localLabel: syncRecordValueLabel(conflict.local),
    remoteLabel: conflict.remote ? syncRecordValueLabel(conflict.remote) : undefined,
    hasRemote: Boolean(conflict.remote),
    canKeepLocal: conflict.reason !== 'permission-denied',
    requiresDiscardLocal: conflict.reason === 'permission-denied',
  };
}

function syncRecordTitle(record: StoredSyncConflict['local']): string {
  const fields = record.fields;
  if (record.recordType === 'transaction') return stringField(fields.merchant) ?? 'Transaction';
  if (record.recordType === 'income') return stringField(fields.source) ?? 'Income';
  if (record.recordType === 'budget') return stringField(fields.label) ?? stringField(fields.category) ?? 'Budget';
  if (record.recordType === 'bill') return stringField(fields.name) ?? stringField(fields.merchant) ?? 'Bill';
  if (record.recordType === 'category') return stringField(fields.label) ?? 'Category';
  if (record.recordType === 'recurringRule') return stringField(fields.merchant) ?? 'Recurring item';
  if (record.recordType === 'ledgerMember') return stringField(fields.displayName) ?? 'Member';
  if (record.recordType === 'ledger') return stringField(fields.name) ?? 'Ledger';
  return 'Attachment';
}

function syncRecordValueLabel(record: StoredSyncConflict['local']): string {
  const amount = typeof record.fields.amount === 'number' ? formatMoney(record.fields.amount) : undefined;
  const updated = shortDateTime(record.updatedAt);
  if (amount) return `${amount} · ${updated}`;
  if (record.deletedAt) return `Deleted · ${shortDateTime(record.deletedAt)}`;
  return updated;
}

function syncConflictReasonLabel(reason: StoredSyncConflict['reason']): string {
  switch (reason) {
  case 'remote-newer':
    return 'Changed in two places';
  case 'deleted-remotely':
    return 'Deleted in iCloud';
  case 'permission-denied':
    return 'Locked by another member';
  default:
    return 'Review this item';
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function shortDateTime(value?: string): string {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
