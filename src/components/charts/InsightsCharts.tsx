import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { GROUP_COLORS, OVER_DOT, type Theme } from '../../theme';
import { TYPE } from '../../typography';
import type { ActivityInitialFilter } from '../../selectors/spending';

export interface InsightMetric {
  label: string;
  value: string;
}

export interface InsightDetail {
  title: string;
  eyebrow: string;
  amount: string;
  color: string;
  description: string;
  metrics: InsightMetric[];
  filter?: ActivityInitialFilter;
}

export interface InsightBin {
  label: string;
  value: number;
  budget: number;
  from: Date;
  to: Date;
}

const fmtMoney = (v: number, decimals = 0) => {
  const abs = Math.abs(v);
  if (abs >= 1000 && decimals === 0)
    return `$${Math.round(v).toLocaleString()}`;
  return `$${v.toFixed(decimals)}`;
};

const shortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const rangeLabel = (from: Date, to: Date) => {
  if (from.toDateString() === to.toDateString()) return shortDate(from);
  return `${shortDate(from)} to ${shortDate(to)}`;
};

function clampIndex(i: number, len: number) {
  return Math.max(0, Math.min(len - 1, i));
}

function useScrubTap({
  activeIdx,
  len,
  indexForX,
  onSelect,
  onCommitTap,
  onInteractionChange,
}: {
  activeIdx: number;
  len: number;
  indexForX: (x: number, y: number) => number;
  onSelect: (idx: number) => void;
  onCommitTap: (idx: number, wasAlreadyActive: boolean) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const lastIdx = useRef(activeIdx);
  const [scrubbing, setScrubbing] = useState(false);

  const select = (idx: number, haptic = false) => {
    const next = clampIndex(idx, len);
    if (next !== lastIdx.current) {
      lastIdx.current = next;
      if (haptic) Haptics.selectionAsync().catch(() => {});
    }
    onSelect(next);
  };

  const handlePress = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const idx = indexForX(locationX, locationY);
    const wasAlreadyActive = idx === activeIdx;
    select(idx, false);
    onCommitTap(idx, wasAlreadyActive);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
          Math.abs(gesture.dx) > 7 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 7 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          onInteractionChange?.(true);
          setScrubbing(true);
          lastIdx.current = indexForX(locationX, locationY);
          select(lastIdx.current, false);
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          select(indexForX(locationX, locationY), true);
        },
        onPanResponderRelease: () => {
          onInteractionChange?.(false);
          setScrubbing(false);
        },
        onPanResponderTerminate: () => {
          onInteractionChange?.(false);
          setScrubbing(false);
        },
      }),
    [activeIdx, indexForX, onInteractionChange, select],
  );

  return {
    scrubbing,
    interactionProps: {
      onPress: handlePress,
      panHandlers: panResponder.panHandlers,
    },
  };
}

function chartAccessibilityProps({
  label,
  detail,
  activeIdx,
  len,
  onSelect,
  onInspect,
}: {
  label: string;
  detail: InsightDetail;
  activeIdx: number;
  len: number;
  onSelect: (idx: number) => void;
  onInspect: () => void;
}) {
  return {
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: label,
    accessibilityHint:
      'Swipe up or down to change the selected value. Activate for details.',
    accessibilityValue: {
      text: `${detail.title}, ${detail.amount}. ${detail.description}`,
    },
    accessibilityActions: [
      { name: 'decrement', label: 'Previous value' },
      { name: 'increment', label: 'Next value' },
      { name: 'activate', label: 'Show details' },
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment')
        onSelect(clampIndex(activeIdx + 1, len));
      if (event.nativeEvent.actionName === 'decrement')
        onSelect(clampIndex(activeIdx - 1, len));
      if (event.nativeEvent.actionName === 'activate') onInspect();
    },
  };
}

export function InsightBarChart({
  bins,
  theme,
  width,
  height,
  onInspect,
  onSelectDetail,
  onInteractionChange,
}: {
  bins: InsightBin[];
  theme: Theme;
  width: number;
  height: number;
  onInspect: (detail: InsightDetail) => void;
  onSelectDetail?: (detail: InsightDetail) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(
      0,
      bins.findIndex((b) => b.value > 0),
    ),
  );
  const [armedIdx, setArmedIdx] = useState<number | null>(null);
  const pad = { t: 18, r: 8, b: 24, l: 8 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const maxV =
    Math.max(1, ...bins.map((b) => b.value), ...bins.map((b) => b.budget)) *
    1.16;
  const band = plotW / Math.max(bins.length, 1);
  const barW = Math.min(34, Math.max(12, band * 0.54));
  const baseY = pad.t + plotH;
  const active = bins[clampIndex(activeIdx, bins.length)];
  const budgetY = baseY - ((active?.budget ?? 0) / maxV) * plotH;
  const barColor = theme.dark
    ? 'rgba(174,184,194,0.46)'
    : 'rgba(28,34,42,0.34)';
  const activeBarColor = theme.dark ? '#F2F4F5' : '#080A0D';
  const maxBinValue = Math.max(0, ...bins.map((b) => b.value));

  const detailFor = (idx: number): InsightDetail => {
    const bin = bins[clampIndex(idx, bins.length)];
    const delta = bin.value - bin.budget;
    return {
      title:
        bin.value === maxBinValue
          ? `Highest day: ${bin.label}`
          : `Selected day: ${bin.label}`,
      eyebrow: rangeLabel(bin.from, bin.to),
      amount: fmtMoney(bin.value, bin.value < 100 ? 2 : 0),
      color: activeBarColor,
      description: rangeLabel(bin.from, bin.to),
      metrics: [
        { label: 'Planned', value: fmtMoney(bin.budget) },
        {
          label: delta > 0 ? 'Above' : 'Below',
          value: fmtMoney(Math.abs(delta), Math.abs(delta) < 100 ? 2 : 0),
        },
      ],
      filter: { dateFrom: bin.from, dateTo: bin.to },
    };
  };

  const indexForX = (x: number) =>
    clampIndex(Math.floor((x - pad.l) / band), bins.length);
  useEffect(() => {
    onSelectDetail?.(detailFor(activeIdx));
  }, [activeIdx, bins, onSelectDetail]);

  const { scrubbing, interactionProps } = useScrubTap({
    activeIdx,
    len: bins.length,
    indexForX: (x) => indexForX(x),
    onSelect: (idx) => {
      setActiveIdx(idx);
    },
    onCommitTap: (idx, wasAlreadyActive) => {
      if (wasAlreadyActive && armedIdx === idx) onInspect(detailFor(idx));
      else setArmedIdx(idx);
    },
    onInteractionChange,
  });
  const activeDetail = detailFor(activeIdx);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Line
          x1={pad.l}
          x2={pad.l + plotW}
          y1={budgetY}
          y2={budgetY}
          stroke={theme.textTer}
          strokeWidth={1}
          strokeDasharray="4 6"
          opacity={0.75}
        />
        {bins.map((b, i) => {
          const x = pad.l + i * band + (band - barW) / 2;
          const h = Math.max(3, (b.value / maxV) * plotH);
          const y = baseY - h;
          const isActive = i === activeIdx;
          return (
            <G
              key={`${b.label}-${i}`}
              opacity={isActive || !scrubbing ? 1 : 0.42}
            >
              {isActive && (
                <Rect
                  x={x - 5}
                  y={pad.t - 2}
                  width={barW + 10}
                  height={plotH + 4}
                  rx={10}
                  fill={
                    theme.dark
                      ? 'rgba(242,244,245,0.06)'
                      : 'rgba(14,12,24,0.045)'
                  }
                />
              )}
              <Rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={5}
                fill={isActive ? activeBarColor : barColor}
              />
              <SvgText
                x={x + barW / 2}
                y={height - 7}
                textAnchor="middle"
                fill={isActive ? theme.text : theme.textTer}
                fontSize={10}
                fontWeight={isActive ? '700' : '500'}
              >
                {b.label}
              </SvgText>
            </G>
          );
        })}

        {active && (
          <G>
            <Line
              x1={pad.l + activeIdx * band + band / 2}
              x2={pad.l + activeIdx * band + band / 2}
              y1={pad.t}
              y2={baseY}
              stroke={theme.text}
              strokeWidth={1}
              opacity={0.18}
            />
            <Rect
              x={Math.min(
                width - 78,
                Math.max(8, pad.l + activeIdx * band + band / 2 - 35),
              )}
              y={0}
              width={70}
              height={22}
              rx={11}
              fill={theme.text}
            />
            <SvgText
              x={Math.min(
                width - 43,
                Math.max(43, pad.l + activeIdx * band + band / 2),
              )}
              y={15}
              textAnchor="middle"
              fill={theme.bg}
              fontSize={11}
              fontWeight="700"
            >
              {fmtMoney(active.value, active.value < 100 ? 2 : 0)}
            </SvgText>
          </G>
        )}
      </Svg>
      <View
        style={StyleSheet.absoluteFillObject}
        {...interactionProps.panHandlers}
        {...chartAccessibilityProps({
          label: 'Spend rhythm chart',
          detail: activeDetail,
          activeIdx,
          len: bins.length,
          onSelect: setActiveIdx,
          onInspect: () => onInspect(activeDetail),
        })}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={interactionProps.onPress}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
    </View>
  );
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  return points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const dx = (p.x - prev.x) * 0.42;
    return `${acc} C ${prev.x + dx} ${prev.y}, ${p.x - dx} ${p.y}, ${p.x} ${p.y}`;
  }, '');
}

export function InsightPaceChart({
  bins,
  theme,
  width,
  height,
  onInspect,
  onSelectDetail,
  onInteractionChange,
}: {
  bins: InsightBin[];
  theme: Theme;
  width: number;
  height: number;
  onInspect: (detail: InsightDetail) => void;
  onSelectDetail?: (detail: InsightDetail) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(Math.max(0, bins.length - 1));
  const [armedIdx, setArmedIdx] = useState<number | null>(null);
  const pad = { t: 16, r: 12, b: 24, l: 12 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const cumulative = useMemo(() => {
    let actual = 0;
    let plan = 0;
    return bins.map((b) => {
      actual += b.value;
      plan += b.budget;
      return { ...b, actual, plan };
    });
  }, [bins]);
  const maxV =
    Math.max(
      1,
      ...cumulative.map((p) => p.actual),
      ...cumulative.map((p) => p.plan),
    ) * 1.1;
  const xStep = plotW / Math.max(cumulative.length - 1, 1);
  const pts = cumulative.map((p, i) => ({
    ...p,
    x: pad.l + i * xStep,
    y: pad.t + plotH - (p.actual / maxV) * plotH,
    planY: pad.t + plotH - (p.plan / maxV) * plotH,
  }));
  const actualD = smoothPath(pts);
  const planD = smoothPath(pts.map((p) => ({ x: p.x, y: p.planY })));
  const active = pts[clampIndex(activeIdx, pts.length)];
  const paceColor = theme.dark
    ? GROUP_COLORS.savings.dark
    : GROUP_COLORS.savings.vibrant;

  const detailFor = (idx: number): InsightDetail => {
    const p = pts[clampIndex(idx, pts.length)];
    const delta = p.actual - p.plan;
    const over = delta > 0;
    return {
      title: `${p.label} pace`,
      eyebrow: rangeLabel(bins[0].from, p.to),
      amount: fmtMoney(p.actual),
      color: over ? OVER_DOT : paceColor,
      description: over
        ? 'Spending ahead of planned pace'
        : 'Spending behind planned pace',
      metrics: [
        { label: 'Planned', value: fmtMoney(p.plan) },
        { label: over ? 'Above' : 'Below', value: fmtMoney(Math.abs(delta)) },
      ],
      filter: { dateFrom: bins[0].from, dateTo: p.to },
    };
  };

  const indexForX = (x: number) =>
    clampIndex(Math.round((x - pad.l) / xStep), bins.length);
  useEffect(() => {
    onSelectDetail?.(detailFor(activeIdx));
  }, [activeIdx, bins, onSelectDetail]);

  const { interactionProps } = useScrubTap({
    activeIdx,
    len: bins.length,
    indexForX: (x) => indexForX(x),
    onSelect: setActiveIdx,
    onCommitTap: (idx, wasAlreadyActive) => {
      if (wasAlreadyActive && armedIdx === idx) onInspect(detailFor(idx));
      else setArmedIdx(idx);
    },
    onInteractionChange,
  });
  const activeDetail = detailFor(activeIdx);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path
          d={planD}
          fill="none"
          stroke={theme.textTer}
          strokeWidth={1.3}
          strokeDasharray="6 6"
          opacity={0.82}
        />
        <Path
          d={actualD}
          fill="none"
          stroke={paceColor}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pts.map((p, i) => (
          <G key={`${p.label}-${i}`}>
            <Circle
              cx={p.x}
              cy={p.y}
              r={i === activeIdx ? 5.4 : 2.8}
              fill={i === activeIdx ? paceColor : theme.surface}
              stroke={paceColor}
              strokeWidth={1.6}
            />
            <SvgText
              x={p.x}
              y={height - 7}
              textAnchor="middle"
              fill={i === activeIdx ? theme.text : theme.textTer}
              fontSize={10}
              fontWeight={i === activeIdx ? '700' : '500'}
            >
              {p.label}
            </SvgText>
          </G>
        ))}

        {active && (
          <G>
            <Line
              x1={active.x}
              x2={active.x}
              y1={pad.t}
              y2={pad.t + plotH}
              stroke={theme.text}
              strokeWidth={1}
              opacity={0.18}
            />
            <Rect
              x={Math.min(width - 82, Math.max(8, active.x - 38))}
              y={0}
              width={76}
              height={22}
              rx={11}
              fill={active.actual > active.plan ? OVER_DOT : theme.text}
            />
            <SvgText
              x={Math.min(width - 44, Math.max(44, active.x))}
              y={15}
              textAnchor="middle"
              fill={active.actual > active.plan ? '#FDF7F3' : theme.bg}
              fontSize={11}
              fontWeight="700"
            >
              {fmtMoney(active.actual)}
            </SvgText>
          </G>
        )}
      </Svg>
      <View
        style={StyleSheet.absoluteFillObject}
        {...interactionProps.panHandlers}
        {...chartAccessibilityProps({
          label: 'Budget pace chart',
          detail: activeDetail,
          activeIdx,
          len: bins.length,
          onSelect: setActiveIdx,
          onInspect: () => onInspect(activeDetail),
        })}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={interactionProps.onPress}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
    </View>
  );
}
