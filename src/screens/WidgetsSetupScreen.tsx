import React from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { ScreenExitButton } from '../components/GlassButton';
import { RADIUS } from '../radius';
import { LAYOUT, SPACE } from '../spacing';
import type { Theme } from '../theme';
import { TYPE } from '../typography';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}

const WIDGETS = [
  {
    title: 'Available to Spend',
    body: 'Month-to-date spending against income, with a simple remaining balance.',
    icon: 'wallet',
  },
  {
    title: 'Budget Progress',
    body: 'A compact 50/30/20 snapshot for needs, wants, and savings.',
    icon: 'chart',
  },
  {
    title: 'Upcoming Bills',
    body: 'The next recurring bills due, sorted by what needs attention first.',
    icon: 'cal',
  },
  {
    title: 'Quick Add',
    body: 'Jump straight to expense, income, or voice capture from the Home Screen.',
    icon: 'plus',
  },
] as const;

export function WidgetsSetupScreen({ theme, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const openWidgetHelp = () => {
    Alert.alert(
      'Add widgets',
      'On the Home Screen, touch and hold an empty area, tap +, search finance-app, then choose a widget size. On the Lock Screen, touch and hold the Lock Screen, tap Customize, then add a widget.',
    );
  };

  const testQuickAdd = () => {
    Linking.openURL('financeapp:///expense?mode=manual').catch(() => {
      Alert.alert('Quick Add', 'The financeapp URL scheme is not available in this build.');
    });
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.bg, zIndex: 84 }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.sm, backgroundColor: theme.bg }]}>
        <ScreenExitButton
          variant="back"
          onPress={onClose}
          tint={theme.text}
          fallbackBg={theme.chipBg}
          accessibilityLabel="Back"
        />
        <Text style={[styles.headerTitle, { color: theme.text }]}>Widgets</Text>
        <View style={styles.headerSpacer} />
        <View style={[styles.headerDivider, { backgroundColor: theme.hairline }]} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 84, paddingBottom: Math.max(insets.bottom, SPACE.lg) + SPACE.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <View style={[styles.heroIcon, { backgroundColor: theme.chipBg }]}>
            <Icon name="sparkle" size={22} color={theme.text} stroke={1.7} />
          </View>
          <Text style={[TYPE.display, styles.heroTitle, { color: theme.text }]}>
            Four glanceable widgets for your money.
          </Text>
          <Text style={[TYPE.bodyRegular, styles.heroBody, { color: theme.textSec }]}>
            Add the ones you want from the iOS widget picker. The app keeps them refreshed with a small, private snapshot.
          </Text>
        </View>

        <View style={styles.grid}>
          {WIDGETS.map(widget => (
            <View
              key={widget.title}
              style={[styles.widgetCard, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
            >
              <View style={[styles.cardIcon, { backgroundColor: theme.chipBg }]}>
                <Icon name={widget.icon} size={18} color={theme.text} stroke={1.7} />
              </View>
              <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>{widget.title}</Text>
              <Text style={[TYPE.bodySm, styles.cardBody, { color: theme.textSec }]}>{widget.body}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.steps, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
          <Text style={[TYPE.sectionTitle, { color: theme.text }]}>Add one in iOS</Text>
          <Step theme={theme} n={1} text="Touch and hold the Home Screen or Lock Screen." />
          <Step theme={theme} n={2} text="Tap +, search for finance-app, then choose a widget." />
          <Step theme={theme} n={3} text="Pick a size, add it, then place it where it is useful." />
        </View>

        <Pressable
          onPress={openWidgetHelp}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: theme.accent.fill, opacity: pressed ? 0.82 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={[TYPE.body, { color: theme.accent.ink }]}>Show add steps</Text>
        </Pressable>
        <Pressable
          onPress={testQuickAdd}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: theme.chipBg, opacity: pressed ? 0.72 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={[TYPE.body, { color: theme.text }]}>Test Quick Add link</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Step({ theme, n, text }: { theme: Theme; n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: theme.chipBg }]}>
        <Text style={[TYPE.captionEm, { color: theme.text }]}>{n}</Text>
      </View>
      <Text style={[TYPE.bodyRegular, styles.stepText, { color: theme.textSec }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 76,
    left: 0,
    paddingHorizontal: LAYOUT.screenGutter,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  headerDivider: {
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  headerSpacer: {
    height: 40,
    width: 40,
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    gap: SPACE.lg,
    paddingHorizontal: LAYOUT.screenGutter,
  },
  hero: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACE.xl,
  },
  heroBody: {
    marginTop: SPACE.md,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACE.lg,
    width: 44,
  },
  heroTitle: {
    letterSpacing: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.md,
  },
  widgetCard: {
    borderRadius: RADIUS.modal,
    borderWidth: 1,
    minHeight: 148,
    padding: SPACE.lg,
    width: '48%',
  },
  cardBody: {
    marginTop: SPACE.sm,
  },
  cardIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginBottom: SPACE.md,
    width: 36,
  },
  steps: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    gap: SPACE.md,
    padding: SPACE.xl,
  },
  step: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACE.md,
  },
  stepNumber: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepText: {
    flex: 1,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: RADIUS.full,
    minHeight: 54,
    justifyContent: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: RADIUS.full,
    minHeight: 50,
    justifyContent: 'center',
  },
});
