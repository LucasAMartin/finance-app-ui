import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
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
import { RepositoryProvider, useRepositories } from './src/repositories/RepositoryProvider';
import { AppFeedbackProvider, useAppFeedback } from './src/AppFeedbackProvider';
import { txToCreateInput } from './src/selectors/finance';
import type { ActivityInitialFilter } from './src/selectors/spending';

import { HomeScreen } from './src/screens/HomeScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import {
  InsightDetailScreen,
  type InsightDetailTarget,
} from './src/screens/InsightDetailScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { ThemeScreen } from './src/screens/ThemeScreen';
import { TabBar } from './src/components/TabBar';
import { Drawer } from './src/components/Drawer';
import type { SourceRect } from './src/components/ContainerTransform';
import {
  TxSheetMount, type TxSheetHandle,
  BillSheetMount, type BillSheetHandle,
} from './src/components/sheetMounts';
import type { Bill, Transaction } from './src/repositories/types';

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
  const { theme, dark } = useTheme();
  const { transactionsRepo } = useRepositories();
  const { showToast } = useAppFeedback();

  // `screen` is only used for TabBar active state and pointerEvents.
  // The actual visual positions are driven imperatively via TX refs.
  const [screen, setScreen] = useState<Screen>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityInitialFilter | null>(null);
  const [activityFilterToken, setActivityFilterToken] = useState(0);
  const [insightTarget, setInsightTarget] = useState<InsightDetailTarget | null>(null);
  const [morphResetToken, setMorphResetToken] = useState(0);

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

  const txSheetRef = useRef<TxSheetHandle>(null);
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
    transactionsRepo.delete(tx.id);
    showToast('Transaction deleted', () => transactionsRepo.create(txToCreateInput(tx)));
  }, [showToast, transactionsRepo]);

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
      setActivityFilter(filter);
      setActivityFilterToken(t => t + 1);
    }
    navigate('activity');
  }, [navigate]);

  const handleDrawerNav = useCallback((id: string) => {
    closeDrawer();
    if      (id === 'home')     navigate('home');
    else if (id === 'budget')   navigate('budget');
    else if (id === 'insights') navigate('insights');
    else if (id === 'activity') navigate('activity');
    else if (id === 'settings') setThemeOpen(true);
  }, [closeDrawer, navigate]);

  const openTheme = useCallback(() => setThemeOpen(true), []);
  const openBudgetIncome = useCallback((_node: View) => router.push('/income'), []);
  const handleInsightTarget = useCallback((target: InsightDetailTarget | null) => setInsightTarget(target), []);
  const closeTheme = useCallback(() => setThemeOpen(false), []);
  const closeInsight = useCallback(() => setInsightTarget(null), []);
  const handleTabPress = useCallback((id: string) => {
    if      (id === 'home')     navigate('home');
    else if (id === 'spending') navigate('insights');
    else if (id === 'budget')   navigate('budget');
    else if (id === 'profile')  navigate('activity');
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
      onOpenTx={openTx}
      onPrepareTx={prepareTx}
      onDeleteTx={handleDeleteTx}
      onOpenBill={openBill}
      morphResetToken={morphResetToken}
    />
  ), [
    handleDeleteTx,
    morphResetToken,
    navigateToActivity,
    openBill,
    openDrawer,
    openIncomeRoute,
    openManualExpense,
    openTheme,
    openTx,
    prepareTx,
    openVoiceExpense,
    theme,
  ]);

  const insightsScreen = useMemo(() => (
    <MemoInsightsScreen
      theme={theme}
      onOpenDrawer={openDrawer}
      onViewActivity={navigateToActivity}
      onOpenInsight={handleInsightTarget}
    />
  ), [handleInsightTarget, navigateToActivity, openDrawer, theme]);

  const activityScreen = useMemo(() => (
    <MemoActivityScreen
      theme={theme}
      onOpenDrawer={openDrawer}
      onOpenTx={openTx}
      onPrepareTx={prepareTx}
      onOverlayOpenChange={handleOverlayOpenChange}
      initialFilter={activityFilter}
      filterToken={activityFilterToken}
    />
  ), [activityFilter, activityFilterToken, handleOverlayOpenChange, openDrawer, openTx, prepareTx, theme]);

  const budgetScreen = useMemo(() => (
    <MemoBudgetScreen
      theme={theme}
      onOpenDrawer={openDrawer}
      onOpenIncome={openBudgetIncome}
      onKeypadOpenChange={handleKeypadOpenChange}
    />
  ), [handleKeypadOpenChange, openBudgetIncome, openDrawer, theme]);

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
            active={screen === 'activity' ? 'profile' : screen === 'insights' ? 'spending' : screen}
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
          />
        </View>

        <TxSheetMount ref={txSheetRef} onDeleted={handleDeleteTx} />
        <BillSheetMount ref={billSheetRef} />

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
        />

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
