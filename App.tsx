import React, { useRef, useEffect, useState } from 'react';
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

import { Transaction } from './src/data';
import { ThemeProvider, useTheme } from './src/ThemeProvider';
import { useAppFonts, patchTextWithInter } from './src/fonts';

import { HomeScreen } from './src/screens/HomeScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { SpendingScreen } from './src/screens/SpendingScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { TabBar } from './src/components/TabBar';
import { VoiceSheet } from './src/components/VoiceSheet';
import { Drawer } from './src/components/Drawer';

type Screen = 'home' | 'detail' | 'spending' | 'activity' | 'budget';

patchTextWithInter();

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_W * 0.82);

// Left-to-right ordering. A screen with a lower order sits to the LEFT of one with a
// higher order. Nav-bar tabs come first (home → spending → budget), then the deeper
// push screens (activity, detail) which always live further right.
const SCREEN_ORDER: Record<Screen, number> = {
  home: 0,
  spending: 1,
  budget: 2,
  activity: 3,
  detail: 4,
};

// Directional slide: a screen always rests at 0 when active, off to the LEFT when the
// active screen is to its right, off to the RIGHT when the active screen is to its left.
// Only the two screens involved in the transition animate; the rest snap silently.
function AnimatedScreen({
  screenKey,
  activeScreen,
  prevScreen,
  children,
}: {
  screenKey: Screen;
  activeScreen: Screen;
  prevScreen: Screen;
  children: React.ReactNode;
}) {
  const visible = screenKey === activeScreen;
  const target = visible
    ? 0
    : SCREEN_ORDER[screenKey] < SCREEN_ORDER[activeScreen]
      ? -SCREEN_W
      : SCREEN_W;
  const translateX = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    const involved = screenKey === activeScreen || screenKey === prevScreen;
    if (involved) {
      Animated.timing(translateX, {
        toValue: target,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    } else {
      translateX.setValue(target);
    }
  }, [activeScreen]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}


function AppInner() {
  const { theme, dark } = useTheme();
  const [screen, setScreen] = useState<Screen>('home');
  const [prevScreen, setPrevScreen] = useState<Screen>('home');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [adding, setAdding] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drawerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      useNativeDriver: false,
      friction: 11,
      tension: 70,
    }).start();
  }, [drawerOpen]);

  // navigate records the screen we're leaving so AnimatedScreen knows which two
  // screens to animate (everything else snaps).
  const navigate = (s: Screen) => {
    if (s === screen) return;
    setPrevScreen(screen);
    setScreen(s);
  };
  const openTx = (tx: Transaction) => {
    setSelectedTx(tx);
    navigate('detail');
  };

  const handleDrawerNav = (id: string) => {
    setDrawerOpen(false);
    // Map drawer item ids to screens
    if (id === 'home') navigate('home');
    else if (id === 'budget') navigate('budget');
    else if (id === 'spending') navigate('spending');
    else if (id === 'activity') navigate('activity');
    // Items without a matching screen (cards, statements, settings, etc.) just close the drawer.
  };

  const backdropOpacity = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <AnimatedScreen screenKey="home" activeScreen={screen} prevScreen={prevScreen}>
          <HomeScreen
            theme={theme}
            onOpenTx={openTx}
            onViewSpending={() => navigate('spending')}
            onViewActivity={() => navigate('activity')}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        </AnimatedScreen>

        <AnimatedScreen screenKey="detail" activeScreen={screen} prevScreen={prevScreen}>
          <DetailScreen tx={selectedTx} theme={theme} onBack={() => navigate('home')} />
        </AnimatedScreen>

        <AnimatedScreen screenKey="spending" activeScreen={screen} prevScreen={prevScreen}>
          <SpendingScreen
            theme={theme}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        </AnimatedScreen>

        <AnimatedScreen screenKey="activity" activeScreen={screen} prevScreen={prevScreen}>
          <ActivityScreen theme={theme} onBack={() => navigate('home')} onOpenTx={openTx} />
        </AnimatedScreen>

        <AnimatedScreen screenKey="budget" activeScreen={screen} prevScreen={prevScreen}>
          <BudgetScreen
            theme={theme}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        </AnimatedScreen>

        {(screen === 'home' || screen === 'budget' || screen === 'spending') && (
          <TabBar
            theme={theme}
            active={screen}
            onAdd={() => setAdding(true)}
            onTabPress={(id) => {
              if (id === 'home') navigate('home');
              else if (id === 'spending') navigate('spending');
              else if (id === 'budget') navigate('budget');
            }}
          />
        )}

        {/* ─── Drawer backdrop ──────────────────────────────── */}
        <Animated.View
          pointerEvents={drawerOpen ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: '#000', opacity: backdropOpacity, zIndex: 50 },
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setDrawerOpen(false)} />
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
            onClose={() => setDrawerOpen(false)}
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
