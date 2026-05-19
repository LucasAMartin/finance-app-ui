import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme';
import { Icon } from './Icon';

export interface DrawerItem {
  id: string;
  label: string;
  icon: string;
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
}

const SECTIONS: DrawerSection[] = [
  {
    items: [
      { id: 'home',       label: 'Dashboard',      icon: 'home' },
      { id: 'budget',     label: 'Budgets',        icon: 'chart' },
      { id: 'spending',   label: 'Spending',       icon: 'tag' },
      { id: 'activity',   label: 'Activity',       icon: 'note', badge: 3 },
    ],
  },
  {
    title: 'Account',
    items: [
      { id: 'cards',      label: 'Cards',          icon: 'cards' },
      { id: 'statements', label: 'Statements',     icon: 'doc' },
      { id: 'settings',   label: 'Settings',       icon: 'settings' },
    ],
  },
  {
    title: 'Support',
    items: [
      { id: 'help',       label: 'Help & support', icon: 'note' },
      { id: 'signout',    label: 'Sign out',       icon: 'repeat' },
    ],
  },
];

export function Drawer({ theme, width, progress, onNavigate, onClose }: Props) {
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
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.5}
          delayPressIn={0}
          hitSlop={{ top: 60, bottom: 16, left: 16, right: 16 }}
          style={styles.closeBtn}
        >
          <Icon name="close" size={22} color={theme.text} stroke={1.9} />
        </TouchableOpacity>
      </View>

      {/* Profile */}
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: theme.accent.fill }]}>
          <Text style={{ color: theme.accent.ink, fontSize: 24, fontWeight: '700' }}>A</Text>
        </View>
        <Text
          style={{
            fontSize: 19,
            fontWeight: '700',
            color: theme.text,
            marginTop: 12,
            letterSpacing: -0.4,
          }}
        >
          Alex Martin
        </Text>
        <TouchableOpacity>
          <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textSec, marginTop: 2 }}>
            View profile
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.sep }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {SECTIONS.map((section, si) => (
          <View key={si} style={{ marginBottom: 18 }}>
            {section.title && (
              <Text style={[styles.sectionTitle, { color: theme.textTer }]}>
                {section.title}
              </Text>
            )}
            {section.items.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => onNavigate(item.id)}
                activeOpacity={0.55}
                style={styles.item}
              >
                <View
                  style={[
                    styles.itemIcon,
                    {
                      backgroundColor: item.highlight ? theme.accent.fill : theme.chipBg,
                    },
                  ]}
                >
                  <Icon
                    name={item.icon}
                    size={17}
                    color={item.highlight ? theme.accent.ink : theme.text}
                    stroke={1.5}
                  />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: '500',
                    color: theme.text,
                    letterSpacing: -0.2,
                  }}
                >
                  {item.label}
                </Text>
                {item.badge != null && (
                  <View style={[styles.badge, { backgroundColor: theme.accent.fill }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent.ink }}>
                      {item.badge}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
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
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    borderRightWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    marginBottom: 12,
    marginLeft: -4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 18,
    marginHorizontal: -20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
