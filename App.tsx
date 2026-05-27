import React, { useRef, useState } from 'react';
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

import { HomeScreen } from './src/screens/HomeScreen';
import { SpendingScreen } from './src/screens/SpendingScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { ThemeScreen } from './src/screens/ThemeScreen';
import { TabBar } from './src/components/TabBar';
import { VoiceSheet } from './src/components/VoiceSheet';
import { Drawer } from './src/components/Drawer';

type Screen = 'home' | 'spending' | 'activity' | 'budget';

patchTextWithInter();

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_W * 0.82);

const ALL_SCREENS: Screen[] = ['home', 'spending', 'budget', 'activity'];

const FADE_DURATION = 180;

// Purely presentational — opacity is owned by the parent, no internal effects.
function AnimatedScreen({
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
}

function AppInner() {
  const { theme, dark } = useTheme();

  // `screen` is only used for TabBar active state and pointerEvents.
  // The actual visual positions are driven imperatively via TX refs.
  const [screen, setScreen] = useState<Screen>('home');
  const [adding, setAdding] = useState(false);
  const [addingMode, setAddingMode] = useState<'voice' | 'manual'>('voice');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const openAdd = (mode: 'voice' | 'manual' = 'voice') => {
    setAddingMode(mode);
    setAdding(true);
  };

  // Synchronous read of current screen so navigate() never reads stale state.
  const activeRef = useRef<Screen>('home');

  // Each screen's opacity. Home starts visible, rest start hidden.
  // Driven imperatively — no useEffect cycle.
  const OP = useRef<Record<Screen, Animated.Value>>({
    home:     new Animated.Value(1),
    spending: new Animated.Value(0),
    budget:   new Animated.Value(0),
    activity: new Animated.Value(0),
  }).current;

  const drawerAnim = useRef(new Animated.Value(0)).current;

  // Start both drawer animations immediately on press — before setState.
  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.timing(drawerAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
      easing: Easing.out(Easing.exp),
    }).start();
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
      easing: Easing.in(Easing.cubic),
    }).start();
  };

  // Cross-fade between screens. Starts before setState — zero perceived delay.
  const navigate = (s: Screen) => {
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
  };

  const handleDrawerNav = (id: string) => {
    closeDrawer();
    if      (id === 'home')     navigate('home');
    else if (id === 'budget')   navigate('budget');
    else if (id === 'spending') navigate('spending');
    else if (id === 'activity') navigate('activity');
  };

  const backdropOpacity = drawerAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={[styles.root, { backgroundColor: theme.bg }]}>

        <AnimatedScreen opacity={OP.home} active={screen === 'home'}>
          <HomeScreen
            theme={theme}
            onViewSpending={() => navigate('spending')}
            onViewActivity={() => navigate('activity')}
            onOpenDrawer={openDrawer}
            onAddVoice={() => openAdd('voice')}
            onAddManual={() => openAdd('manual')}
            onOpenTheme={() => setThemeOpen(true)}
          />
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.spending} active={screen === 'spending'}>
          <SpendingScreen theme={theme} onOpenDrawer={openDrawer} />
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.activity} active={screen === 'activity'}>
          <ActivityScreen theme={theme} onOpenDrawer={openDrawer} />
        </AnimatedScreen>

        <AnimatedScreen opacity={OP.budget} active={screen === 'budget'}>
          <BudgetScreen theme={theme} onOpenDrawer={openDrawer} />
        </AnimatedScreen>

        <TabBar
          theme={theme}
          active={screen === 'activity' ? 'profile' : screen}
          onAdd={() => openAdd('voice')}
          onTabPress={(id) => {
            if      (id === 'home')     navigate('home');
            else if (id === 'spending') navigate('spending');
            else if (id === 'budget')   navigate('budget');
            else if (id === 'profile')  navigate('activity');
          }}
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

        <VoiceSheet
          theme={theme}
          visible={adding}
          initialMode={addingMode}
          onClose={() => setAdding(false)}
        />

        <ThemeScreen
          theme={theme}
          visible={themeOpen}
          onClose={() => setThemeOpen(false)}
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
      <ThemeProvider defaultDark={true} defaultAccent="plum" defaultCardStyle="flat">
        <SafeAreaProvider>
          <AppInner />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
