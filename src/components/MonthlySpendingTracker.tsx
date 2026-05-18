import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme, getCardStyle, OVER_DOT, OVER_BG, OVER_TEXT } from '../theme';
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

  // Bar represents 0–120% of budget; extra 20% gives visual room for overspending.
  const BAR_MAX = 1.2;
  const rawPct = budget > 0 ? spent / budget : 0;
  // Normalized 0–1 where 1 = full bar = 120% of budget
  const pct = Math.min(Math.max(rawPct, 0), BAR_MAX) / BAR_MAX;
  const available = Math.max(budget - spent, 0);
  const over = spent > budget;

  const availableColor = over ? OVER_DOT : theme.accent.dot;

  const hasExpected = expectedPct != null;
  // On target: not over budget AND spending is within expected pace (±5% tolerance)
  const onTarget = !over && (!hasExpected || rawPct <= (expectedPct as number) * 1.05);
  const statusText = over ? 'Over budget' : onTarget ? 'On target' : 'Off target';
  const statusBg = onTarget ? theme.accent.fill : OVER_BG;
  const statusFg = onTarget ? theme.accent.ink : OVER_TEXT;

  // Position the today-marker tick relative to the extended bar (÷ BAR_MAX).
  const todayBarFraction = hasExpected ? (expectedPct as number) / BAR_MAX : -1;
  const todayTickIndex = hasExpected
    ? Math.round(todayBarFraction * (TICK_COUNT - 1))
    : -1;

  return (
    <View style={[card, styles.card]}>
      <View style={styles.barWrap}>
        <View style={styles.bar}>
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const t = i / (TICK_COUNT - 1);
            const passed = t <= pct + 0.5 / TICK_COUNT;
            const isToday = i === todayTickIndex;
            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  {
                    backgroundColor: isToday ? theme.text : gradientAt(t, theme.dark),
                    opacity: isToday ? 1 : passed ? 1 : theme.dark ? 0.28 : 0.22,
                  },
                  isToday && styles.todayTick,
                ]}
              />
            );
          })}
        </View>

        {/* On/off target chip — centered over the "today" tick */}
        {hasExpected && (
          <View
            style={[
              styles.statusLabel,
              {
                left: `${((expectedPct as number) / BAR_MAX) * 100}%`,
                backgroundColor: statusBg,
                borderColor: theme.hairline,
              },
            ]}
          >
            <Text style={[styles.statusText, { color: statusFg }]}>{statusText}</Text>
          </View>
        )}
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
          {Math.round(rawPct * 100)}% used
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
  barWrap: {
    marginTop: 16,
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
  todayTick: {
    height: 28,
    borderRadius: 3,
  },
  statusLabel: {
    position: 'absolute',
    top: -30,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
    marginLeft: -34,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
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
