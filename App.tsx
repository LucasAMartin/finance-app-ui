import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  View,
  Alert,
  Animated,
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

import { ThemeProvider, useTheme } from './src/ThemeProvider';
import { useAppFonts, patchTextWithInter } from './src/fonts';
import { RepositoryProvider, useRepositories, useRepositoryList } from './src/repositories/RepositoryProvider';
import { AppFeedbackProvider, useAppFeedback } from './src/AppFeedbackProvider';
import { FirstRunPrompt } from './src/components/FirstRunPrompt';
import { AppLockGate } from './src/components/AppLockGate';
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
  hasPendingActiveLedgerChanges,
  resetActiveLedgerSyncState,
  syncActiveLedger,
  zoneNameForLedger,
} from './src/sync/syncActiveLedger';
import CloudKitSyncModule from './modules/cloudkit-sync/src/CloudKitSyncModule';
import type { AppSession, Bill, Ledger, LedgerMember, Transaction } from './src/repositories/types';

type Screen = 'home' | 'insights' | 'activity' | 'budget';

patchTextWithInter();

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_W * 0.82);

const ALL_SCREENS: Screen[] = ['home', 'insights', 'budget', 'activity'];

const FADE_DURATION = 180;

// Purely presentational — opacity is owned by the parent, no internal effects.
const MemoHomeScreen = React.memo(HomeScreen);
const MemoInsightsScreen = React.memo(InsightsScreen);
const MemoActivityScreen = React.memo(ActivityScreen);
const MemoBudgetScreen = React.memo(BudgetScreen);

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
  const { theme, dark, metaFlag, setMetaFlag } = useTheme();
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
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [sharingSettingsOpen, setSharingSettingsOpen] = useState(false);
  const [sharingInviteNoticeToken, setSharingInviteNoticeToken] = useState(0);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalContributeToken, setGoalContributeToken] = useState(0);
  const [pendingBudgetEditCategoryId, setPendingBudgetEditCategoryId] = useState<string | undefined>(undefined);
  const [activityFilter, setActivityFilter] = useState<ActivityInitialFilter | null>(null);
  const [activityFilterToken, setActivityFilterToken] = useState(0);
  const activityFilterTokenRef = useRef(0);
  const [pendingFilteredActivityNavToken, setPendingFilteredActivityNavToken] = useState<number | null>(null);
  const [readyFilteredActivityNavToken, setReadyFilteredActivityNavToken] = useState<number | null>(null);
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

  useEffect(() => sessionRepo.subscribe(refreshSessionState), [refreshSessionState, sessionRepo]);

  const runCloudKitSync = useCallback(async (announce = false) => {
    if (cloudSyncInFlightRef.current) return cloudSyncInFlightRef.current;

    const task = syncActiveLedger({ nativeModule: CloudKitSyncModule })
      .then(result => {
        if (result.status === 'paused') {
          if (announce) showToast(`iCloud sync paused: ${result.reason ?? 'unavailable'}`);
          return result;
        }
        refreshAfterSync();
        if (announce) {
          const changes = result.pulledRecords + result.pushedRecords;
          showToast(changes > 0 ? `iCloud synced ${changes} changes` : 'iCloud is up to date');
        }
        return result;
      })
      .finally(() => {
        cloudSyncInFlightRef.current = null;
      });

    cloudSyncInFlightRef.current = task;
    return task;
  }, [refreshAfterSync, showToast]);

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
      runCloudKitSync(false).catch(() => {
        showToast('iCloud sync could not run');
      });
    }, 900);
  }, [iCloudSyncEnabled, runCloudKitSync, showToast]);

  useEffect(() => {
    if (!iCloudSyncEnabled) return;
    runCloudKitSync(false).catch(() => {
      showToast('iCloud sync could not run');
    });
  }, [iCloudSyncEnabled, runCloudKitSync, showToast]);

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

  const sampleDataEnabled = useSyncExternalStore(
    useCallback((listener) => devDataRepo.subscribe(listener), [devDataRepo]),
    useCallback(() => devDataRepo.isSeedDataEnabled(), [devDataRepo]),
    useCallback(() => devDataRepo.isSeedDataEnabled(), [devDataRepo]),
  );

  const handleSampleDataEnabledChange = useCallback((enabled: boolean) => {
    devDataRepo.setSeedDataEnabled(enabled);
    refreshSessionState();
    showToast(enabled ? 'Sample data reloaded' : 'Sample data cleared');
  }, [devDataRepo, refreshSessionState, showToast]);

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
      refreshSessionState();
      const result = await runCloudKitSync(true);
      if (result.status === 'paused') return;
      showToast('Fresh sample data synced');
    } catch {
      showToast('Sample data reset failed');
    }
  }, [devDataRepo, refreshSessionState, runCloudKitSync, session.activeLedgerId, showToast]);

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

  const handleCurrentUserChange = useCallback((userId: string) => {
    sessionRepo.setCurrentUserId(userId);
    const member = ledgerMembers.find(item => item.userId === userId);
    showToast(`Viewing as ${member?.displayName ?? userId}`);
  }, [ledgerMembers, sessionRepo, showToast]);

  const handleCurrentMemberEditLockChange = useCallback((allowOthersToEditMyItems: boolean) => {
    const member = ledgerMembers.find(item => item.userId === session.currentUserId);
    if (!member) return;
    sessionRepo.updateMember(member.id, { allowOthersToEditMyItems });
    showToast(allowOthersToEditMyItems ? 'Others can edit your items' : 'Only you can edit your items');
  }, [ledgerMembers, session.currentUserId, sessionRepo, showToast]);
  const handleICloudSyncChange = useCallback((enabled: boolean) => {
    setMetaFlag('icloudSync', enabled);
    if (!enabled) {
      showToast('iCloud sync off');
      return;
    }
    runCloudKitSync(true).then(result => {
      if (result.status === 'paused') {
        setMetaFlag('icloudSync', false);
      }
    }).catch(() => {
      setMetaFlag('icloudSync', false);
      showToast('iCloud sync could not be enabled');
    });
  }, [runCloudKitSync, setMetaFlag, showToast]);

  const handleManualCloudRefresh = useCallback(async () => {
    if (!iCloudSyncEnabled) {
      showToast('iCloud sync is off');
      return;
    }
    try {
      const result = await runCloudKitSync(true);
      if (result.status === 'paused') return;
    } catch {
      showToast('iCloud refresh failed');
    }
  }, [iCloudSyncEnabled, runCloudKitSync, showToast]);

  // Synchronous read of current screen so navigate() never reads stale state.
  const activeRef = useRef<Screen>('home');

  // Each screen's opacity. Home starts visible, rest start hidden.
  // Driven imperatively — no useEffect cycle.
  const OP = useRef<Record<Screen, Animated.Value>>({
    home:     new Animated.Value(1),
    insights: new Animated.Value(0),
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
        setReadyFilteredActivityNavToken(null);
        setPendingFilteredActivityNavToken(nextToken);
        return;
      }
    }
    navigate('activity');
  }, [OP, navigate]);

  const handleActivityNavSkeletonReady = useCallback((token: number) => {
    setReadyFilteredActivityNavToken(token);
  }, []);

  // Filtered Activity entries wait for the destination screen to confirm that a
  // skeleton frame has committed. Only then does the native opacity animation
  // reveal Activity, so stale all-transaction rows never become visible.
  useLayoutEffect(() => {
    if (pendingFilteredActivityNavToken === null) return;
    if (readyFilteredActivityNavToken !== pendingFilteredActivityNavToken) return;
    setPendingFilteredActivityNavToken(null);
    setReadyFilteredActivityNavToken(null);
    navigate('activity');
  }, [navigate, pendingFilteredActivityNavToken, readyFilteredActivityNavToken]);

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
  const openGoalContribution = useCallback(() => {
    setGoalsOpen(true);
    setGoalContributeToken(token => token + 1);
  }, []);
  const openBudgetIncome = useCallback((_node: View) => router.push('/income'), []);
  const handleInsightTarget = useCallback((target: InsightDetailTarget | null) => setInsightTarget(target), []);
  const closeTheme = useCallback(() => setThemeOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
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
  const closeInsight = useCallback(() => setInsightTarget(null), []);
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
      onNavSkeletonReady={handleActivityNavSkeletonReady}
      pendingDeleteId={pendingDeleteId}
      onRefreshSync={handleManualCloudRefresh}
    />
  ), [activityFilter, activityFilterToken, handleActivityNavSkeletonReady, handleManualCloudRefresh, handleOverlayOpenChange, openDrawer, openTx, pendingDeleteId, prepareTx, theme]);

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

        <AnimatedScreen opacity={OP.home} active={screen === 'home'}>
          {homeScreen}
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.insights} active={screen === 'insights'}>
          {insightsScreen}
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.activity} active={screen === 'activity'}>
          {activityScreen}
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.budget} active={screen === 'budget'}>
          {budgetScreen}
        </AnimatedScreen>

        <Animated.View
          pointerEvents="box-none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: tabBarAnim,
              transform: [{ translateY: tabBarAnim.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }],
            },
          ]}
        >
          <TabBar
            theme={theme}
            active={screen === 'insights' ? 'spending' : screen}
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
            onNavigate={handleDrawerNav}
            onClose={closeDrawer}
            sampleDataEnabled={sampleDataEnabled}
            onSampleDataEnabledChange={handleSampleDataEnabledChange}
            activeLedgerName={ledgers.find(ledger => ledger.id === session.activeLedgerId)?.name}
            currentUserId={session.currentUserId}
            ledgerMembers={ledgerMembers}
            onCurrentUserChange={handleCurrentUserChange}
            onCurrentMemberEditLockChange={handleCurrentMemberEditLockChange}
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
          onICloudSyncChange={handleICloudSyncChange}
          onResetSyncedSampleData={confirmResetSyncedSampleData}
          activeLedgerName={ledgers.find(ledger => ledger.id === session.activeLedgerId)?.name}
          memberCount={ledgerMembers.length}
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
          activeLedgerName={ledgers.find(ledger => ledger.id === session.activeLedgerId)?.name}
          currentUserId={session.currentUserId}
          ledgerMembers={ledgerMembers}
          inviteNoticeToken={sharingInviteNoticeToken}
          onCurrentMemberEditLockChange={handleCurrentMemberEditLockChange}
        />

        <ThemeScreen
          theme={theme}
          visible={themeOpen}
          onClose={closeTheme}
        />

        <InsightDetailScreen
          theme={theme}
          target={insightTarget}
          onOpenTx={openTx}
          onClose={closeInsight}
          onSeeAll={navigateToActivity}
        />

        <AppLockGate />
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

const styles = StyleSheet.create({
  root: { flex: 1 },
});
