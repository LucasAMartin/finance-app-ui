import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Theme, getCardStyle, OVER_DOT, GROUP_COLORS } from '../theme';
import { SpendGroup } from '../data';
import { Icon } from './Icon';
import { Collapsible } from './Collapsible';

interface Props {
  theme: Theme;
  groups: SpendGroup[];
  income: number;
  naked?: boolean;
}

export function CategoryGroups({ theme, groups, income, naked }: Props) {
  const card = getCardStyle(theme);
  const containerStyle = naked
    ? { paddingVertical: 4 }
    : [card, { paddingVertical: 4, marginBottom: 14 }];
  return (
    <View style={containerStyle}>
      {groups.map((g, i) => (
        <GroupRow
          key={g.key}
          theme={theme}
          group={g}
          income={income}
          last={i === groups.length - 1}
          naked={naked}
        />
      ))}
    </View>
  );
}

function GroupRow({
  theme,
  group,
  income,
  last,
  naked,
}: {
  theme: Theme;
  group: SpendGroup;
  income: number;
  last: boolean;
  naked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(rot, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 14,
    }).start();
  }, [open]);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '-90deg'] });

  const groupTotal = group.subs.reduce((s, x) => s + x.spent, 0);
  const actualPct = income > 0 ? groupTotal / income : 0;
  const color = theme.dark ? GROUP_COLORS[group.key].dark : GROUP_COLORS[group.key].light;

  // Savings is healthy when AT or ABOVE target; needs/wants are healthy when AT or BELOW.
  const goodWhenOver = group.key === 'savings';
  const onTrack = goodWhenOver
    ? actualPct >= group.targetPct * 0.9
    : actualPct <= group.targetPct * 1.05;
  const barColor = onTrack ? color : OVER_DOT;

  // The target maps to a full bar; actual is shown relative to it.
  const fill = Math.min(actualPct / group.targetPct, 1);

  return (
    <View style={[styles.group, { borderBottomColor: theme.sep, borderBottomWidth: last ? 0 : 1, paddingHorizontal: naked ? 0 : 18 }]}>
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.6}
        delayPressIn={0}
        style={styles.groupHead}
      >
        <Animated.View style={{ transform: [{ rotate }], marginRight: 10 }}>
          <Icon name="chevR" size={13} color={theme.textSec} stroke={1.8} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <View style={styles.groupTopRow}>
            <Text style={[styles.groupName, { color: theme.text }]}>{group.label}</Text>
            <Text style={[styles.groupPct, { color: theme.text }]}>
              {Math.round(actualPct * 100)}%
              <Text style={{ color: theme.textSec, fontWeight: '500' }}>
                {'  /  '}
                {Math.round(group.targetPct * 100)}% target
              </Text>
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.hairline }]}>
            <View
              style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: barColor }]}
            />
          </View>
        </View>
      </TouchableOpacity>

      <Collapsible open={open}>
        <View style={styles.subList}>
          {group.subs.map(sub => {
            const subFill = sub.budget > 0 ? Math.min(sub.spent / sub.budget, 1) : 0;
            const subOver = sub.spent > sub.budget;
            return (
              <View key={sub.label} style={styles.subRow}>
                <View style={[styles.subIcon, { backgroundColor: theme.chipBg }]}>
                  <Icon name={sub.icon} size={15} color={theme.text} stroke={1.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.subTopRow}>
                    <Text style={[styles.subName, { color: theme.text }]}>{sub.label}</Text>
                    <Text style={[styles.subAmt, { color: theme.text }]}>
                      ${sub.spent.toLocaleString()}
                      <Text style={{ color: theme.textSec, fontWeight: '500' }}>
                        {' / $'}
                        {sub.budget.toLocaleString()}
                      </Text>
                    </Text>
                  </View>
                  <View style={[styles.subTrack, { backgroundColor: theme.hairline }]}>
                    <View
                      style={[
                        styles.subFill,
                        {
                          width: `${subFill * 100}%`,
                          backgroundColor: subOver ? OVER_DOT : color,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {},
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  groupTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 9,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  groupPct: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  track: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },

  subList: {
    paddingLeft: 23,
    paddingBottom: 14,
    gap: 14,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  subIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  subName: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subAmt: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  subTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  subFill: {
    height: '100%',
    borderRadius: 3,
  },
});
