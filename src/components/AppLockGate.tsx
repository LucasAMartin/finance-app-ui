import React from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Host, Image } from '@expo/ui/swift-ui';

import { useTheme } from '../ThemeProvider';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';
import { SPACE, LAYOUT } from '../spacing';

export function AppLockGate() {
  const { theme, metaFlag, setMetaFlag } = useTheme();
  const appLockEnabled = metaFlag('appLock');
  const [locked, setLocked] = React.useState(appLockEnabled);
  const [authenticating, setAuthenticating] = React.useState(false);
  const [message, setMessage] = React.useState('Authenticate to unlock your finance app.');
  const appState = React.useRef(AppState.currentState);
  const authRequestId = React.useRef(0);
  const authenticatingRef = React.useRef(false);

  const authenticate = React.useCallback(async () => {
    if (!appLockEnabled || authenticatingRef.current) return;
    const requestId = authRequestId.current + 1;
    authRequestId.current = requestId;
    authenticatingRef.current = true;
    setLocked(true);
    setAuthenticating(true);
    setMessage('Authenticate to unlock your finance app.');

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
        disableDeviceFallback: true,
        fallbackLabel: '',
        biometricsSecurityLevel: 'strong',
      });
      if (authRequestId.current !== requestId) return;
      if (result.success) {
        setLocked(false);
        return;
      }
      setMessage(result.error === 'user_cancel'
        ? 'Face ID was cancelled. Try again when you are ready.'
        : 'Face ID did not unlock the app. Try again.');
    } catch {
      setMessage('Face ID is unavailable right now. Try again.');
    } finally {
      if (authRequestId.current === requestId) {
        authenticatingRef.current = false;
        setAuthenticating(false);
      }
    }
  }, [appLockEnabled, setMetaFlag]);

  React.useEffect(() => {
    if (!appLockEnabled) {
      authRequestId.current += 1;
      authenticatingRef.current = false;
      setLocked(false);
      setAuthenticating(false);
      return;
    }
    setLocked(true);
    const timer = setTimeout(() => { authenticate(); }, 250);
    return () => clearTimeout(timer);
  }, [appLockEnabled, authenticate]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const previous = appState.current;
      appState.current = nextState;
      if (!appLockEnabled) return;
      if (nextState === 'background' || nextState === 'inactive') {
        setLocked(true);
      }
      if (previous.match(/inactive|background/) && nextState === 'active') {
        authenticate();
      }
    });
    return () => sub.remove();
  }, [appLockEnabled, authenticate]);

  if (!appLockEnabled || !locked) return null;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
        <View style={[styles.iconDisc, { backgroundColor: theme.chipBg }]}>
          <Host style={styles.iconHost} ignoreSafeArea="all">
            <Image systemName="faceid" size={34} color={theme.text} />
          </Host>
        </View>
        <Text style={[TYPE.sectionTitle, styles.title, { color: theme.text }]}>Face ID required</Text>
        <Text style={[TYPE.bodySm, styles.copy, { color: theme.textSec }]}>{message}</Text>
        <Pressable
          onPress={authenticate}
          disabled={authenticating}
          accessibilityRole="button"
          accessibilityLabel="Unlock with Face ID"
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.accent.fill,
              opacity: authenticating ? 0.7 : pressed ? 0.88 : 1,
            },
          ]}
        >
          <Text style={[TYPE.body, styles.buttonText, { color: theme.accent.ink }]}>
            {authenticating ? 'Checking...' : 'Unlock'}
          </Text>
        </Pressable>
      </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenGutter,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACE.xxl,
    alignItems: 'center',
  },
  iconDisc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.lg,
  },
  iconHost: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  copy: {
    textAlign: 'center',
    marginTop: SPACE.sm,
    marginBottom: SPACE.xl,
  },
  button: {
    minHeight: 48,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACE.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '700',
  },
});
