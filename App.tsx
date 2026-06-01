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

import { ThemeProvider, useTheme } from './src/ThemeProvider';
import { useAppFonts, patchTextWithInter } from './src/fonts';
import { RepositoryProvider, useRepositories } from './src/repositories/RepositoryProvider';
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
import { type SavedExpenseInfo } from './src/components/ExpenseFlow';
import { Toast } from './src/components/Toast';
import { Drawer } from './src/components/Drawer';
import type { SourceRect } from './src/components/ContainerTransform';
import type { SavedIncomeInfo } from './src/components/IncomeFlow';
import { IncomeMorphMount, type IncomeMorphHandle } from './src/components/IncomeMorphMount';
import { ExpenseMorphMount, type ExpenseMorphHandle } from './src/components/ExpenseMorphMount';
import {
  TxSheetMount, type TxSheetHandle,
  BillSheetMount, type BillSheetHandle,
  RecurringSheetMount, type RecurringSheetHandle,
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
      style={[StyleSheet.absoluteFillObject, { opacity }]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
});

function AppInner() {
  const { theme, dark } = useTheme();
  const { transactionsRepo, incomeRepo } = useRepositories();

  // `screen` is only used for TabBar active state and pointerEvents.
  // The actual visual positions are driven imperatively via TX refs.
  const [screen, setScreen] = useState<Screen>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityInitialFilter | null>(null);
  const [activityFilterToken, setActivityFilterToken] = useState(0);
  const [insightTarget, setInsightTarget] = useState<InsightDetailTarget | null>(null);
  const [toast, setToast] = useState<{ message: string; onUndo: () => void } | null>(null);

  // Every sheet/morph owns its own open state inside a leaf mount, poked via these
  // refs. Opening one re-renders only that mount — not App and its four mounted
  // screens — so there's no whole-tree re-render between press and present.
  // (The mounts stay hoisted to App level so their SwiftUI BottomSheet hosts
  // aren't siblings of HomeScreen's menu hosts, which caused those to drift.)
  const incomeMorphRef = useRef<IncomeMorphHandle>(null);
  const expenseMorphRef = useRef<ExpenseMorphHandle>(null);
  const txSheetRef = useRef<TxSheetHandle>(null);
  const billSheetRef = useRef<BillSheetHandle>(null);
  const recurringRef = useRef<RecurringSheetHandle>(null);

  const openTx = useCallback((tx: Transaction) => txSheetRef.current?.open(tx), []);
  const openBill = useCallback((bill: Bill) => billSheetRef.current?.open(bill), []);
  const openRecurring = useCallback(() => recurringRef.current?.open(), []);
  const openIncomeMorph = useCallback((source: SourceRect) => {
    incomeMorphRef.current?.open(source);
  }, []);

  const handleSaved = useCallback((info: SavedExpenseInfo) => {
    setToast({
      message: `Added $${info.amount.toFixed(2)} to ${info.catLabel}`,
      onUndo: () => transactionsRepo.delete(info.id),
    });
  }, [transactionsRepo]);

  const handleIncomeSaved = useCallback((info: SavedIncomeInfo) => {
    setToast({
      message: `Added $${info.amount.toFixed(2)} from ${info.source}`,
      onUndo: () => incomeRepo.delete(info.id),
    });
  }, [incomeRepo]);

  const handleDeleteTx = useCallback((tx: Transaction) => {
    transactionsRepo.delete(tx.id);
    setToast({
      message: 'Transaction deleted',
      onUndo: () => transactionsRepo.create(txToCreateInput(tx)),
    });
  }, [transactionsRepo]);

  const runToastUndo = useCallback(() => {
    toast?.onUndo();
    setToast(null);
  }, [toast]);

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

  const openInsights = useCallback(() => navigate('insights'), [navigate]);
  const openVoiceExpense = useCallback((source: SourceRect) => expenseMorphRef.current?.open('voice', source, 'mic'), []);
  const openManualExpense = useCallback((source: SourceRect) => expenseMorphRef.current?.open('manual', source, 'keypad'), []);
  const openTheme = useCallback(() => setThemeOpen(true), []);
  const openBudgetIncome = useCallback((node: View) => {
    node.measureInWindow((x, y, w, h) => incomeMorphRef.current?.open({ x, y, width: w, height: h, radius: 8 }));
  }, []);
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
      onViewInsights={openInsights}
      onViewActivity={navigateToActivity}
      onOpenDrawer={openDrawer}
      onAddVoice={openVoiceExpense}
      onAddManual={openManualExpense}
      onAddRecurring={openRecurring}
      onLogIncome={openIncomeMorph}
      onOpenTheme={openTheme}
      onOpenTx={openTx}
      onDeleteTx={handleDeleteTx}
      onOpenBill={openBill}
    />
  ), [
    handleDeleteTx,
    navigateToActivity,
    openBill,
    openDrawer,
    openIncomeMorph,
    openInsights,
    openManualExpense,
    openRecurring,
    openTheme,
    openTx,
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
      initialFilter={activityFilter}
      filterToken={activityFilterToken}
    />
  ), [activityFilter, activityFilterToken, openDrawer, openTx, theme]);

  const budgetScreen = useMemo(() => (
    <MemoBudgetScreen
      theme={theme}
      onOpenDrawer={openDrawer}
      onOpenIncome={openBudgetIncome}
    />
  ), [openBudgetIncome, openDrawer, theme]);

  const backdropOpacity = drawerAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
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

        <TabBar
          theme={theme}
          active={screen === 'activity' ? 'profile' : screen === 'insights' ? 'spending' : screen}
          onAdd={openVoiceExpense}
          onTabPress={handleTabPress}
        />

        {/* ─── Drawer backdrop ──────────────────────────────── */}
        <Animated.View
          pointerEvents={drawerOpen ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: '#000', opacity: backdropOpacity, zIndex: 50 },
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
        </Animated.View>

        {/* ─── Drawer ───────────────────────────────────────── */}
        <View
          style={[StyleSheet.absoluteFillObject, { zIndex: 60 }]}
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

        <IncomeMorphMount ref={incomeMorphRef} onSaved={handleIncomeSaved} />
        <ExpenseMorphMount ref={expenseMorphRef} onSaved={handleSaved} />
        <RecurringSheetMount ref={recurringRef} />
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

        <Toast
          theme={theme}
          message={toast?.message ?? null}
          onAction={runToastUndo}
          onDismiss={() => setToast(null)}
        />
      </View>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useAppFonts();
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RepositoryProvider>
        <ThemeProvider defaultDark={true} defaultAccent="plum" defaultCardStyle="flat">
          <SafeAreaProvider>
            <AppInner />
          </SafeAreaProvider>
        </ThemeProvider>
      </RepositoryProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
