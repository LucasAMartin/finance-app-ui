import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Theme } from '../theme';

interface TabBarProps {
  theme: Theme;
  active: string;
  onAdd: () => void;
  onTabPress?: (id: string) => void;
}

const TABS = [
  { id: 'home',    icon: 'home'    },
  { id: 'budgets', icon: 'chart'   },
  { id: 'cards',   icon: 'cards'   },
  { id: 'profile', icon: 'profile' },
];

export function TabBar({ theme, active, onAdd, onTabPress }: TabBarProps) {
  const insets = useSafeAreaInsets();

  const pill = (
    <View style={styles.pillRow}>
      {TABS.map(t => {
        const isActive = t.id === active;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => onTabPress?.(t.id)}
            style={[
              styles.tabBtn,
              { backgroundColor: isActive ? theme.text : 'transparent' },
            ]}
          >
            <Icon
              name={t.icon}
              size={20}
              color={isActive ? theme.bg : theme.textSec}
              stroke={isActive ? 1.7 : 1.5}
            />
          </TouchableOpacity>
        );
      })}

      <View style={[styles.divider, { backgroundColor: theme.hairline }]} />

      {/* Voice/Add button */}
      <TouchableOpacity
        onPress={onAdd}
        style={[styles.tabBtn, { backgroundColor: theme.accent.fill }]}
      >
        <Icon name="mic" size={20} color={theme.accent.ink} stroke={1.6} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={80}
          tint={theme.dark ? 'dark' : 'light'}
          style={[
            styles.blurPill,
            {
              borderColor: theme.hairline,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: theme.dark ? 0.5 : 0.08,
              shadowRadius: 20,
            },
          ]}
        >
          {pill}
        </BlurView>
      ) : (
        <View
          style={[
            styles.blurPill,
            {
              backgroundColor: theme.dark ? 'rgba(20,20,24,0.95)' : 'rgba(255,255,255,0.95)',
              borderColor: theme.hairline,
              elevation: 12,
            },
          ]}
        >
          {pill}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  blurPill: {
    borderRadius: 100,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    gap: 4,
  },
  tabBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 2,
  },
});
