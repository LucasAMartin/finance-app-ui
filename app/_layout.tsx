import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AppFeedbackProvider } from '../src/AppFeedbackProvider';
import { useAppFonts, patchTextWithInter } from '../src/fonts';
import { RepositoryProvider } from '../src/repositories/RepositoryProvider';
import { ThemeProvider } from '../src/ThemeProvider';

patchTextWithInter();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useAppFonts();
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RepositoryProvider>
        <ThemeProvider defaultDark={true} defaultAccent="ink" defaultCardStyle="flat">
          <SafeAreaProvider>
            <AppFeedbackProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="income" />
                <Stack.Screen name="expense" />
              </Stack>
            </AppFeedbackProvider>
          </SafeAreaProvider>
        </ThemeProvider>
      </RepositoryProvider>
    </GestureHandlerRootView>
  );
}
