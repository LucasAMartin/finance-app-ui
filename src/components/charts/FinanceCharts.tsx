import React from 'react';
import { View, Text } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import {
  Theme,
  catPastel,
  OVER_DOT,
  CAT_TO_GROUP,
  GROUP_COLORS,
} from '../../theme';
import type { TrendPoint } from '../../selectors/types';

const fmtMoney = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`;

function buildYLabels(maxValue: number, sections = 4) {
  return Array.from({ length: sections + 1 }, (_, i) =>
    fmtMoney((maxValue * (sections - i)) / sections),
  );
}

// ── 1. Bar — spend per time bin with budget reference ────────────
// `disableScroll` keeps the chart inside the slide so the parent pager
// receives horizontal swipes. The budget label sits as a separate chip
// in the slide's top-right rather than as a reference-line `labelText` —
// the inline label otherwise overflows the chart width and gets clipped.
export function FinanceBarChart({
  data,
  budget,
  theme,
  width,
  height,
}: {
  data: TrendPoint[];
  budget: number;
  theme: Theme;
  width: number;
  height: number;
}) {
  const yAxisLabelWidth = 44;
  // Reserve room for end-spacing + a hair of horizontal breathing so nothing
  // touches the slide edge.
  const chartWidth = width - yAxisLabelWidth - 12;
  const N = data.length;
  const barW = Math.min(34, Math.max(12, (chartWidth * 0.55) / N));
  const spacing = Math.max(6, (chartWidth - barW * N - 16) / Math.max(N, 1));
  const maxV = Math.max(...data.map(d => d.v), budget) * 1.18;
  const yLabels = buildYLabels(maxV);
  const accent = theme.accent.dot;

  const barData = data.map(d => ({
    value: d.v,
    label: d.label,
    frontColor: d.v > budget ? OVER_DOT : accent,
    labelTextStyle: { color: theme.textSec, fontSize: 11 },
  }));

  return (
    <View style={{ width, height, position: 'relative' }}>
      <BarChart
        data={barData}
        width={chartWidth}
        height={height - 36}
        barWidth={barW}
        spacing={spacing}
        initialSpacing={8}
        endSpacing={8}
        barBorderRadius={4}
        maxValue={maxV}
        noOfSections={4}
        yAxisLabelWidth={yAxisLabelWidth}
        yAxisLabelTexts={yLabels}
        yAxisTextStyle={{ color: theme.textSec, fontSize: 10 }}
        yAxisColor="transparent"
        xAxisColor={theme.hairline}
        xAxisLabelTextStyle={{ color: theme.textSec, fontSize: 11 }}
        rulesType="dashed"
        rulesColor={theme.hairline}
        rulesThickness={1}
        showReferenceLine1
        referenceLine1Position={budget}
        referenceLine1Config={{
          color: accent,
          thickness: 1.2,
          dashWidth: 4,
          dashGap: 4,
        }}
        disableScroll
        isAnimated
        animationDuration={500}
      />

      {/* Budget chip — top-right of the slide, mirroring the screenshot. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <View
          style={{
            width: 14,
            height: 1.5,
            borderRadius: 1,
            backgroundColor: accent,
            opacity: 0.9,
          }}
        />
        <Text
          style={{
            color: accent,
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.3,
          }}
        >
          BUDGET {fmtMoney(budget)}
        </Text>
      </View>
    </View>
  );
}

// ── 2. Cumulative line vs ideal pace ─────────────────────────────
export function FinanceLineChart({
  data,
  budget,
  theme,
  width,
  height,
}: {
  data: TrendPoint[];
  budget: number;
  theme: Theme;
  width: number;
  height: number;
}) {
  const N = data.length;
  let acc = 0;
  const actual = data.map(d => {
    acc += d.v;
    return { value: acc, label: d.label };
  });
  const pace = data.map((_, i) => ({
    value: ((i + 1) / N) * budget,
    label: data[i].label,
  }));

  const totalSpent = actual[actual.length - 1].value;
  const maxV = Math.max(totalSpent, budget) * 1.15;
  const yAxisLabelWidth = 44;
  const chartWidth = width - yAxisLabelWidth - 12;
  // initialSpacing + (N-1)*spacing + endSpacing ≤ chartWidth
  const initialSpacing = 10;
  const endSpacing = 12;
  const spacing = (chartWidth - initialSpacing - endSpacing) / Math.max(N - 1, 1);
  const accent = theme.accent.dot;
  const paceColor = theme.dark ? 'rgba(237,233,255,0.45)' : 'rgba(14,12,24,0.40)';

  return (
    <View style={{ width, height }}>
      <LineChart
        data={actual}
        data2={pace}
        width={chartWidth}
        height={height - 36}
        spacing={spacing}
        initialSpacing={initialSpacing}
        endSpacing={endSpacing}
        maxValue={maxV}
        noOfSections={4}
        yAxisLabelTexts={buildYLabels(maxV)}
        yAxisLabelWidth={yAxisLabelWidth}
        yAxisTextStyle={{ color: theme.textSec, fontSize: 10 }}
        yAxisColor="transparent"
        xAxisColor={theme.hairline}
        xAxisLabelTextStyle={{ color: theme.textSec, fontSize: 11 }}
        rulesType="dashed"
        rulesColor={theme.hairline}
        rulesThickness={1}
        curved
        areaChart
        color={accent}
        color2={paceColor}
        startFillColor={accent}
        endFillColor={accent}
        startOpacity={0.28}
        endOpacity={0.02}
        thickness={2.4}
        thickness2={1.4}
        strokeDashArray2={[5, 5]}
        dataPointsColor={accent}
        dataPointsRadius={3}
        hideDataPoints2
        disableScroll
        isAnimated
        animationDuration={500}
      />
    </View>
  );
}

// ── 3. Needs/Wants/Savings donut (50/30/20 framework) ────────────
// The previous version split spend across 6 tiny category slices that
// were visually unreadable. This view rolls categories up into the three
// budgeting groups the rest of the app organizes around (Needs / Wants /
// Savings) and compares the user's actual % to the 50/30/20 target.
export function FinanceDonut({
  data,
  theme,
  size,
}: {
  data: { cat: string; value: number }[];
  theme: Theme;
  size: number;
}) {
  const GROUPS: Array<{
    key: 'needs' | 'wants' | 'savings';
    label: string;
    targetPct: number;
  }> = [
    { key: 'needs', label: 'Needs', targetPct: 0.5 },
    { key: 'wants', label: 'Wants', targetPct: 0.3 },
    { key: 'savings', label: 'Savings', targetPct: 0.2 },
  ];

  const groupTotals: Record<'needs' | 'wants' | 'savings', number> = {
    needs: 0,
    wants: 0,
    savings: 0,
  };
  data.forEach(d => {
    const g = CAT_TO_GROUP[d.cat] ?? 'wants';
    groupTotals[g] += d.value;
  });

  const total = groupTotals.needs + groupTotals.wants + groupTotals.savings;
  const radius = size / 2;
  const innerRadius = radius * 0.66;

  // Build pie data in the canonical 50/30/20 order so the visual reads
  // consistently across periods. Slice colors come from GROUP_COLORS so
  // they match every other group reference in the app.
  const pieData = GROUPS.map(g => ({
    value: Math.max(groupTotals[g.key], 0.001),
    color: GROUP_COLORS[g.key][theme.dark ? 'dark' : 'light'],
  }));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <PieChart
        data={pieData}
        radius={radius}
        innerRadius={innerRadius}
        donut
        focusOnPress
        sectionAutoFocus
        innerCircleColor={'transparent'}
        centerLabelComponent={() => (
          <View style={{ alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: theme.text,
                letterSpacing: -0.8,
              }}
            >
              {fmtMoney(total)}
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: theme.textSec,
                marginTop: 2,
                fontWeight: '600',
                letterSpacing: 0.4,
              }}
            >
              TOTAL
            </Text>
          </View>
        )}
      />

      {/* Legend — actual vs 50/30/20 target */}
      <View style={{ gap: 10, flexShrink: 1, maxWidth: 150 }}>
        {GROUPS.map(g => {
          const value = groupTotals[g.key];
          const actualPct = total > 0 ? value / total : 0;
          const delta = actualPct - g.targetPct;
          const over = delta > 0.02;
          const under = delta < -0.02;
          const color = GROUP_COLORS[g.key][theme.dark ? 'dark' : 'light'];
          const deltaColor = over ? OVER_DOT : under ? color : theme.textSec;
          const deltaSign = over ? '+' : under ? '−' : '·';
          const deltaPct = Math.abs(Math.round(delta * 100));

          return (
            <View key={g.key} style={{ flexDirection: 'column', gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: color,
                  }}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.text,
                    fontWeight: '600',
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {g.label}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.text,
                    fontWeight: '700',
                  }}
                >
                  {Math.round(actualPct * 100)}%
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 14, gap: 6 }}>
                <Text style={{ fontSize: 10, color: theme.textTer }}>
                  target {Math.round(g.targetPct * 100)}%
                </Text>
                <Text style={{ fontSize: 10, color: deltaColor, fontWeight: '700' }}>
                  {deltaSign}
                  {deltaPct}%
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
