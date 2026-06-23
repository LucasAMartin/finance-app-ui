import React from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as LocalAuthentication from 'expo-local-authentication';

import { useTheme } from '../ThemeProvider';

let suppressAutoPromptUntil = 0;

export function suppressNextAppLockPrompt(durationMs = 1800) {
  suppressAutoPromptUntil = Date.now() + durationMs;
}

export function AppLockGate() {
  const { theme, metaFlag, setMetaFlag } = useTheme();
  const appLockEnabled = metaFlag('appLock');
  const [locked, setLocked] = React.useState(appLockEnabled);
  const [authenticating, setAuthenticating] = React.useState(false);
  const [appIsActive, setAppIsActive] = React.useState(AppState.currentState === 'active');
  const [promptTick, setPromptTick] = React.useState(0);
  const appState = React.useRef(AppState.currentState);
  const authRequestId = React.useRef(0);
  const authenticatingRef = React.useRef(false);
  const didMountRef = React.useRef(false);
  const ignoreAppStateUntilRef = React.useRef(0);
  const lockCycleRef = React.useRef(0);
  const promptedLockCycleRef = React.useRef(-1);

  const lockForPrivacy = React.useCallback(() => {
    lockCycleRef.current += 1;
    setLocked(true);
  }, []);

  const authenticate = React.useCallback(async () => {
    if (!appLockEnabled || authenticatingRef.current) return;
    const requestId = authRequestId.current + 1;
    authRequestId.current = requestId;
    authenticatingRef.current = true;
    ignoreAppStateUntilRef.current = Date.now() + 4000;
    setLocked(true);
    setAuthenticating(true);
    const watchdog = setTimeout(() => {
      if (authRequestId.current !== requestId || !authenticatingRef.current) return;
      authenticatingRef.current = false;
      setAuthenticating(false);
      ignoreAppStateUntilRef.current = Date.now() + 400;
    }, 8000);

    try {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !enrolled) {
        setMetaFlag('appLock', false);
        setLocked(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock finance-app',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use Passcode',
      });
      if (authRequestId.current !== requestId) return;
      if (result.success) {
        setLocked(false);
        return;
      }
    } catch {
      // Keep the blur cover up. The user can tap the cover to retry the native
      // Face ID prompt without exposing app content.
    } finally {
      clearTimeout(watchdog);
      if (authRequestId.current === requestId) {
        authenticatingRef.current = false;
        setAuthenticating(false);
        ignoreAppStateUntilRef.current = Date.now() + 1200;
      }
    }
  }, [appLockEnabled, setMetaFlag]);

  React.useEffect(() => {
    const isInitialCheck = !didMountRef.current;
    didMountRef.current = true;
    if (!appLockEnabled) {
      authRequestId.current += 1;
      authenticatingRef.current = false;
      setLocked(false);
      setAuthenticating(false);
      return;
    }
    if (!isInitialCheck) {
      // Enabling Face ID already requires authentication in Settings. Do not
      // immediately ask for a second unlock while the app is still foregrounded.
      suppressNextAppLockPrompt();
      setLocked(false);
      return;
    }
    lockForPrivacy();
  }, [appLockEnabled, lockForPrivacy]);

  React.useEffect(() => {
    if (!appLockEnabled || !locked || authenticating) return undefined;
    if (!appIsActive) return undefined;
    const suppressWaitMs = suppressAutoPromptUntil - Date.now();
    if (suppressWaitMs > 0) {
      const timer = setTimeout(() => {
        setPromptTick(tick => tick + 1);
      }, suppressWaitMs + 50);
      return () => clearTimeout(timer);
    }

    const lockCycle = lockCycleRef.current;
    if (promptedLockCycleRef.current === lockCycle) return undefined;
    promptedLockCycleRef.current = lockCycle;

    const timer = setTimeout(() => {
      authenticate();
    }, 250);
    return () => clearTimeout(timer);
  }, [appIsActive, appLockEnabled, authenticate, authenticating, locked, promptTick]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      appState.current = nextState;
      setAppIsActive(nextState === 'active');
      if (!appLockEnabled) return;
      if (Date.now() < suppressAutoPromptUntil) return;
      if (Date.now() < ignoreAppStateUntilRef.current) return;
      if (nextState === 'background' || nextState === 'inactive') {
        lockForPrivacy();
      }
    });
    return () => sub.remove();
  }, [appLockEnabled, lockForPrivacy]);

  if (!appLockEnabled || !locked) return null;

  return (
    <View style={styles.root}>
      <BlurView
        intensity={82}
        tint={theme.dark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Unlock with Face ID"
        disabled={authenticating}
        onPress={authenticate}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 140,
  },
});
