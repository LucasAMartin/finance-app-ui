import React, { useRef, useEffect, useState } from 'react';
import { View, Animated, StyleSheet, StatusBar } from 'react-native';
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

type Screen = 'home' | 'detail' | 'spending' | 'activity' | 'budget';

// Patch RN Text once so existing fontWeight values map to Inter cuts.
patchTextWithInter();

function AnimatedScreen({
  visible,
  children,
  fromRight = true,
}: {
  visible: boolean;
  children: React.ReactNode;
  fromRight?: boolean;
}) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateX = useRef(new Animated.Value(visible ? 0 : fromRight ? 18 : -18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 240, useNativeDriver: true }),
      Animated.timing(translateX, {
        toValue: visible ? 0 : fromRight ? 18 : -18,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { opacity, transform: [{ translateX }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}

function AppInner() {
  const { theme, dark } = useTheme();
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [adding, setAdding] = useState(false);

  const navigate = (s: Screen) => setScreen(s);
  const openTx = (tx: Transaction) => {
    setSelectedTx(tx);
    setScreen('detail');
  };

  return (
    <>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <AnimatedScreen visible={screen === 'home'} fromRight={false}>
          <HomeScreen
            theme={theme}
            onOpenTx={openTx}
            onViewSpending={() => navigate('spending')}
            onViewActivity={() => navigate('activity')}
          />
        </AnimatedScreen>

        <AnimatedScreen visible={screen === 'detail'}>
          <DetailScreen tx={selectedTx} theme={theme} onBack={() => navigate('home')} />
        </AnimatedScreen>

        <AnimatedScreen visible={screen === 'spending'}>
          <SpendingScreen theme={theme} onBack={() => navigate('home')} />
        </AnimatedScreen>

        <AnimatedScreen visible={screen === 'activity'}>
          <ActivityScreen theme={theme} onBack={() => navigate('home')} onOpenTx={openTx} />
        </AnimatedScreen>

        <AnimatedScreen visible={screen === 'budget'}>
          <BudgetScreen theme={theme} onBack={() => navigate('home')} />
        </AnimatedScreen>

        {(screen === 'home' || screen === 'budget') && (
          <TabBar
            theme={theme}
            active={screen === 'budget' ? 'budgets' : 'home'}
            onAdd={() => setAdding(true)}
            onTabPress={(id) => {
              if (id === 'home') navigate('home');
              else if (id === 'budgets') navigate('budget');
            }}
          />
        )}

        <VoiceSheet theme={theme} visible={adding} onClose={() => setAdding(false)} />
      </View>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useAppFonts();

  if (!fontsLoaded) {
    // Keep splash visible until fonts are ready — avoids a flash of system font.
    return null;
  }

  return (
    <ThemeProvider defaultDark={false} defaultAccent="sage" defaultCardStyle="flat">
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
