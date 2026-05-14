import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme, getCardStyle, OVER_DOT } from '../theme';
import { Money } from './shared';

interface Props {
  theme: Theme;
  spent: number;
  budget: number;
  remainingLabel: string;
  expectedPct?: number;
}

const TICK_COUNT = 30;

// Three-stop gradient: sage green → butter → terracotta.
// Tuned to the app's existing accent palette rather than the vivid
// green/red in the visual reference, so it sits in the same design language.
const STOPS_LIGHT = ['#7A9D85', '#C5A946', '#C25A2E'];
const STOPS_DARK  = ['#6FAF8A', '#D5B958', '#E36A3A'];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function rgbToHex(r: number, g: number, b: number) {
  return (
    '#' +
    [r, g, b]
      .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}
function gradientAt(t: number, dark: boolean): string {
  const stops = dark ? STOPS_DARK : STOPS_LIGHT;
  const c1 = hexToRgb(stops[0]);
  const c2 = hexToRgb(stops[1]);
  const c3 = hexToRgb(stops[2]);
  if (t < 0.5) {
    const u = t / 0.5;
    return rgbToHex(lerp(c1[0], c2[0], u), lerp(c1[1], c2[1], u), lerp(c1[2], c2[2], u));
  }
  const u = (t - 0.5) / 0.5;
  return rgbToHex(lerp(c2[0], c3[0], u), lerp(c2[1], c3[1], u), lerp(c2[2], c3[2], u));
}

export function MonthlySpendingTracker({
  theme,
  spent,
  budget,
  remainingLabel,
  expectedPct,
}: Props) {
  const card = getCardStyle(theme);
  const pct = Math.min(Math.max(spent / budget, 0), 1);
  const available = Math.max(budget - spent, 0);
  const over = spent > budget;

  const availableColor = over ? OVER_DOT : theme.accent.dot;
  const markerColor = theme.dark ? '#F4F2EC' : '#0E0E10';

  return (
    <View style={[card, styles.card]}>
      <Text style={[styles.title, { color: theme.text }]}>Monthly spending tracker</Text>
      <Text style={[styles.subtitle, { color: theme.textSec }]}>
        Monitor your spending and stay within your planned monthly limit.
      </Text>

      <View style={styles.barWrap}>
        <View style={styles.bar}>
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const t = i / (TICK_COUNT - 1);
            const passed = t <= pct + 0.5 / TICK_COUNT;
            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  {
                    backgroundColor: gradientAt(t, theme.dark),
                    opacity: passed ? 1 : theme.dark ? 0.28 : 0.22,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Expected-pace marker (faint) */}
        {expectedPct != null && (
          <View
            style={[
              styles.pace,
              {
                left: `${expectedPct * 100}%`,
                backgroundColor: theme.textSec,
              },
            ]}
          />
        )}

        {/* Current-position marker */}
        <View
          style={[
            styles.marker,
            {
              left: `${pct * 100}%`,
              backgroundColor: markerColor,
              borderColor: theme.surface,
            },
          ]}
        />
      </View>

      <View style={styles.statsRow}>
        <View>
          <Text style={[styles.statLabel, { color: theme.textSec }]}>Available this month</Text>
          <Money
            value={available}
            size={24}
            weight="600"
            prefix="$"
            theme={theme}
            color={availableColor}
          />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.statLabel, { color: theme.textSec }]}>Spending limit</Text>
          <Money value={budget} size={24} weight="600" prefix="$" theme={theme} />
        </View>
      </View>

      <View style={[styles.metaDivider, { backgroundColor: theme.sep }]} />

      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: theme.textTer }]}>
          {Math.round(pct * 100)}% used
        </Text>
        <Text style={[styles.meta, { color: theme.textTer }]}>{remainingLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 22,
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 6,
    lineHeight: 17,
  },
  barWrap: {
    marginTop: 22,
    marginBottom: 22,
    position: 'relative',
    height: 26,
    justifyContent: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    gap: 3,
  },
  tick: {
    flex: 1,
    height: 22,
    borderRadius: 2,
  },
  marker: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 4,
    borderRadius: 2,
    borderWidth: 1.5,
    marginLeft: -2,
  },
  pace: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: 1.5,
    opacity: 0.4,
    marginLeft: -0.75,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    marginBottom: 4,
  },
  metaDivider: {
    height: 1,
    marginTop: 16,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    fontSize: 11,
    fontWeight: '500',
  },
});
