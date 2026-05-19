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
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from './src/ThemeProvider';
import { useAppFonts, patchTextWithInter } from './src/fonts';

import { HomeScreen } from './src/screens/HomeScreen';
import { SpendingScreen } from './src/screens/SpendingScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { TabBar } from './src/components/TabBar';
import { VoiceSheet } from './src/components/VoiceSheet';
import { Drawer } from './src/components/Drawer';

type Screen = 'home' | 'spending' | 'activity' | 'budget';

patchTextWithInter();

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_W * 0.82);

// Left-to-right ordering. Lower order = further left.
const SCREEN_ORDER: Record<Screen, number> = {
  home: 0,
  spending: 1,
  budget: 2,
  activity: 3,
};

const ALL_SCREENS = Object.keys(SCREEN_ORDER) as Screen[];

// Purely presentational — translateX is owned by the parent, no internal effects.
function AnimatedScreen({
  translateX,
  active,
  children,
}: {
  translateX: Animated.Value;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}

const SLIDE_DURATION = 220;
const SLIDE_EASING   = Easing.out(Easing.cubic);

function AppInner() {
  const { theme, dark } = useTheme();

  // `screen` is only used for TabBar active state and pointerEvents.
  // The actual visual positions are driven imperatively via TX refs.
  const [screen, setScreen] = useState<Screen>('home');
  const [adding, setAdding] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Synchronous read of current screen so navigate() never reads stale state.
  const activeRef = useRef<Screen>('home');

  // Each screen's horizontal position. Initialized to rest positions for
  // the default screen ('home'). Driven imperatively — no useEffect cycle.
  const TX = useRef<Record<Screen, Animated.Value>>({
    home:     new Animated.Value(0),
    spending: new Animated.Value(SCREEN_W),
    budget:   new Animated.Value(SCREEN_W),
    activity: new Animated.Value(SCREEN_W),
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

  // Kick off both slide animations immediately, then update state.
  // This eliminates the useEffect render-cycle gap that caused the visual delay.
  const navigate = (s: Screen) => {
    const from = activeRef.current;
    if (s === from) return;

    const fromOrd = SCREEN_ORDER[from];
    const toOrd   = SCREEN_ORDER[s];

    // Silently snap every non-involved screen to its correct off-screen position.
    ALL_SCREENS.forEach(k => {
      if (k !== from && k !== s) {
        TX[k].setValue(SCREEN_ORDER[k] < toOrd ? -SCREEN_W : SCREEN_W);
      }
    });

    // Both slides start before setState — zero perceived delay.
    Animated.timing(TX[from], {
      toValue: fromOrd < toOrd ? -SCREEN_W : SCREEN_W,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
      easing: SLIDE_EASING,
    }).start();

    Animated.timing(TX[s], {
      toValue: 0,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
      easing: SLIDE_EASING,
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

        <AnimatedScreen translateX={TX.home} active={screen === 'home'}>
          <HomeScreen
            theme={theme}
            onViewSpending={() => navigate('spending')}
            onViewActivity={() => navigate('activity')}
            onOpenDrawer={openDrawer}
          />
        </AnimatedScreen>

        <AnimatedScreen translateX={TX.spending} active={screen === 'spending'}>
          <SpendingScreen theme={theme} onOpenDrawer={openDrawer} />
        </AnimatedScreen>

        <AnimatedScreen translateX={TX.activity} active={screen === 'activity'}>
          <ActivityScreen theme={theme} onOpenDrawer={openDrawer} />
        </AnimatedScreen>

        <AnimatedScreen translateX={TX.budget} active={screen === 'budget'}>
          <BudgetScreen theme={theme} onOpenDrawer={openDrawer} />
        </AnimatedScreen>

        <TabBar
          theme={theme}
          active={screen === 'activity' ? 'profile' : screen}
          onAdd={() => setAdding(true)}
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

        <VoiceSheet theme={theme} visible={adding} onClose={() => setAdding(false)} />
      </View>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useAppFonts();
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider defaultDark={false} defaultAccent="sage" defaultCardStyle="flat">
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
