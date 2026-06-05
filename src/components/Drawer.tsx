import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Image } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Theme } from '../theme';
import { ScreenExitButton } from './GlassButton';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';

export interface DrawerItem {
  id: string;
  label: string;
  systemIcon: SFSymbol;
  badge?: string | number;
  highlight?: boolean;
}

export interface DrawerSection {
  title?: string;
  items: DrawerItem[];
}

interface Props {
  theme: Theme;
  width: number;
  progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  onNavigate: (id: string) => void;
  onClose: () => void;
  sampleDataEnabled: boolean;
  onSampleDataEnabledChange: (enabled: boolean) => void;
}

const SECTIONS: DrawerSection[] = [
  {
    items: [
      { id: 'home',       label: 'Dashboard',      systemIcon: 'house' },
      { id: 'budget',     label: 'Budgets',        systemIcon: 'chart.pie' },
      { id: 'insights',   label: 'Insights',       systemIcon: 'lightbulb' },
      { id: 'activity',   label: 'Activity',       systemIcon: 'list.bullet', badge: 3 },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { id: 'settings',   label: 'Settings',       systemIcon: 'gearshape' },
    ],
  },
  {
    title: 'Support',
    items: [
      { id: 'help',       label: 'Help & support', systemIcon: 'questionmark.circle' },
      { id: 'signout',    label: 'Sign out',       systemIcon: 'rectangle.portrait.and.arrow.right' },
    ],
  },
];

export function Drawer({
  theme,
  width,
  progress,
  onNavigate,
  onClose,
  sampleDataEnabled,
  onSampleDataEnabledChange,
}: Props) {
  const insets = useSafeAreaInsets();

  const translateX = (progress as Animated.Value).interpolate
    ? (progress as Animated.Value).interpolate({
        inputRange: [0, 1],
        outputRange: [-width, 0],
      })
    : 0;

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          width,
          backgroundColor: theme.surface,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 24,
          borderRightColor: theme.hairline,
          transform: [{ translateX }],
          shadowColor: '#000',
          shadowOffset: { width: 8, height: 0 },
          shadowOpacity: theme.dark ? 0.5 : 0.15,
          shadowRadius: 24,
          elevation: 14,
        },
      ]}
    >
      {/* Close button — top-left, matches the hamburger position on home */}
      <View style={styles.topRow}>
        <ScreenExitButton
          variant="close"
          onPress={onClose}
          tint={theme.textSec}
          fallbackBg={theme.chipBg}
        />
      </View>

      {/* Profile */}
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: theme.accent.fill }]}>
          <Text style={[TYPE.headline, { color: theme.accent.ink }]}>A</Text>
        </View>
        <Text style={[TYPE.headline, { color: theme.text, marginTop: 12 }]}>
          Alex Martin
        </Text>
        <Text style={[TYPE.bodySmEm, { color: theme.textSec, marginTop: 2 }]}>
          View profile
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.sep }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {SECTIONS.map((section, si) => (
          <View key={si} style={{ marginBottom: 20 }}>
            {section.title && (
              <Text style={[TYPE.labelLg, styles.sectionTitle, { color: theme.textTer }]}>
                {section.title}
              </Text>
            )}
            {section.items.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => onNavigate(item.id)}
                activeOpacity={0.55}
                accessibilityRole="button"
                style={styles.item}
              >
                <Host style={styles.iconHost} ignoreSafeArea="all">
                  <Image
                    systemName={item.systemIcon}
                    size={20}
                    color={item.highlight ? theme.accent.dot : theme.textSec}
                  />
                </Host>
                <Text style={[TYPE.subsectionTitle, { flex: 1, color: theme.text }]}>
                  {item.label}
                </Text>
                {item.badge != null && (
                  <View style={[styles.badge, { backgroundColor: theme.accent.fill }]}>
                    <Text style={[TYPE.labelLg, { color: theme.accent.ink }]}>
                      {item.badge}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
        {__DEV__ && (
          <View style={{ marginBottom: 20 }}>
            <Text style={[TYPE.labelLg, styles.sectionTitle, { color: theme.textTer }]}>
              Developer
            </Text>
            <View style={styles.devRow}>
              <Host style={styles.iconHost} ignoreSafeArea="all">
                <Image
                  systemName="externaldrive"
                  size={20}
                  color={theme.textSec}
                />
              </Host>
              <View style={styles.devCopy}>
                <Text style={[TYPE.subsectionTitle, { color: theme.text }]}>
                  Sample data
                </Text>
                <Text style={[TYPE.caption, { color: theme.textSec, marginTop: 2 }]}>
                  Off clears the app state; on reloads the seed DB.
                </Text>
              </View>
              <Switch
                value={sampleDataEnabled}
                onValueChange={onSampleDataEnabledChange}
                trackColor={{ false: theme.chipBg, true: theme.accent.fill }}
                thumbColor={sampleDataEnabled ? theme.accent.ink : theme.surface}
                ios_backgroundColor={theme.chipBg}
                accessibilityLabel="Toggle sample data"
              />
            </View>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    borderTopRightRadius: RADIUS.card,
    borderBottomRightRadius: RADIUS.card,
    borderRightWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    marginBottom: 12,
    marginLeft: -4,
  },
  profile: {
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginTop: 20,
    marginBottom: 20,
    marginHorizontal: -20,
  },
  sectionTitle: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  iconHost: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 24,
    height: 22,
    borderRadius: RADIUS.chip,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  devCopy: {
    flex: 1,
    minWidth: 0,
  },
});
