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
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { GROUP_COLORS, OVER_DOT, type Theme } from '../../theme';
import type { GroupKey } from '../../repositories/types';
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

export interface InsightGroup {
  key: GroupKey;
  label: string;
  value: number;
  targetPct: number;
  color: string;
  catIds: string[];
  txCount: number;
}

const fmtMoney = (v: number, decimals = 0) => {
  const abs = Math.abs(v);
  if (abs >= 1000 && decimals === 0) return `$${Math.round(v).toLocaleString()}`;
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

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
      Math.abs(gesture.dx) > 7 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onMoveShouldSetPanResponder: (_evt, gesture) =>
      Math.abs(gesture.dx) > 7 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
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
  }), [activeIdx, indexForX, onInteractionChange, select]);

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
    accessibilityHint: 'Swipe up or down to change the selected value. Activate for details.',
    accessibilityValue: {
      text: `${detail.title}, ${detail.amount}. ${detail.description}`,
    },
    accessibilityActions: [
      { name: 'decrement', label: 'Previous value' },
      { name: 'increment', label: 'Next value' },
      { name: 'activate', label: 'Show details' },
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') onSelect(clampIndex(activeIdx + 1, len));
      if (event.nativeEvent.actionName === 'decrement') onSelect(clampIndex(activeIdx - 1, len));
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
  const [activeIdx, setActiveIdx] = useState(() => Math.max(0, bins.findIndex(b => b.value > 0)));
  const [armedIdx, setArmedIdx] = useState<number | null>(null);
  const pad = { t: 18, r: 8, b: 24, l: 8 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const maxV = Math.max(1, ...bins.map(b => b.value), ...bins.map(b => b.budget)) * 1.16;
  const band = plotW / Math.max(bins.length, 1);
  const barW = Math.min(34, Math.max(12, band * 0.54));
  const baseY = pad.t + plotH;
  const active = bins[clampIndex(activeIdx, bins.length)];
  const budgetY = baseY - (active?.budget ?? 0) / maxV * plotH;
  const valueColor = theme.dark ? GROUP_COLORS.needs.dark : GROUP_COLORS.needs.vibrant;

  const detailFor = (idx: number): InsightDetail => {
    const bin = bins[clampIndex(idx, bins.length)];
    const delta = bin.value - bin.budget;
    const over = delta > 0;
    return {
      title: bin.label,
      eyebrow: rangeLabel(bin.from, bin.to),
      amount: fmtMoney(bin.value, bin.value < 100 ? 2 : 0),
      color: over ? OVER_DOT : valueColor,
      description: over ? 'Above planned pace' : 'Within planned pace',
      metrics: [
        { label: 'Planned', value: fmtMoney(bin.budget) },
        { label: over ? 'Above' : 'Below', value: fmtMoney(Math.abs(delta), Math.abs(delta) < 100 ? 2 : 0) },
      ],
      filter: { dateFrom: bin.from, dateTo: bin.to },
    };
  };

  const indexForX = (x: number) => clampIndex(Math.floor((x - pad.l) / band), bins.length);
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
        <Defs>
          <LinearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={valueColor} stopOpacity="1" />
            <Stop offset="1" stopColor={valueColor} stopOpacity="0.62" />
          </LinearGradient>
        </Defs>

        <Line x1={pad.l} x2={pad.l + plotW} y1={budgetY} y2={budgetY} stroke={theme.textTer} strokeWidth={1} strokeDasharray="4 6" opacity={0.75} />

        {bins.map((b, i) => {
          const x = pad.l + i * band + (band - barW) / 2;
          const h = Math.max(3, (b.value / maxV) * plotH);
          const y = baseY - h;
          const isActive = i === activeIdx;
          const over = b.value > b.budget;
          return (
            <G key={`${b.label}-${i}`} opacity={isActive || !scrubbing ? 1 : 0.42}>
              {isActive && <Rect x={x - 5} y={pad.t - 2} width={barW + 10} height={plotH + 4} rx={10} fill={theme.dark ? 'rgba(237,233,255,0.06)' : 'rgba(14,12,24,0.045)'} />}
              <Rect x={x} y={y} width={barW} height={h} rx={5} fill={over ? OVER_DOT : 'url(#barFill)'} />
              <SvgText x={x + barW / 2} y={height - 7} textAnchor="middle" fill={isActive ? theme.text : theme.textTer} fontSize={10} fontWeight={isActive ? '700' : '500'}>
                {b.label}
              </SvgText>
            </G>
          );
        })}

        {active && (
          <G>
            <Line x1={pad.l + activeIdx * band + band / 2} x2={pad.l + activeIdx * band + band / 2} y1={pad.t} y2={baseY} stroke={theme.text} strokeWidth={1} opacity={0.18} />
            <Rect x={Math.min(width - 78, Math.max(8, pad.l + activeIdx * band + band / 2 - 35))} y={0} width={70} height={22} rx={11} fill={theme.text} />
            <SvgText x={Math.min(width - 43, Math.max(43, pad.l + activeIdx * band + band / 2))} y={15} textAnchor="middle" fill={theme.bg} fontSize={11} fontWeight="700">
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
    return bins.map(b => {
      actual += b.value;
      plan += b.budget;
      return { ...b, actual, plan };
    });
  }, [bins]);
  const maxV = Math.max(1, ...cumulative.map(p => p.actual), ...cumulative.map(p => p.plan)) * 1.1;
  const xStep = plotW / Math.max(cumulative.length - 1, 1);
  const pts = cumulative.map((p, i) => ({
    ...p,
    x: pad.l + i * xStep,
    y: pad.t + plotH - (p.actual / maxV) * plotH,
    planY: pad.t + plotH - (p.plan / maxV) * plotH,
  }));
  const actualD = smoothPath(pts);
  const planD = smoothPath(pts.map(p => ({ x: p.x, y: p.planY })));
  const active = pts[clampIndex(activeIdx, pts.length)];
  const paceColor = theme.dark ? GROUP_COLORS.savings.dark : GROUP_COLORS.savings.vibrant;

  const detailFor = (idx: number): InsightDetail => {
    const p = pts[clampIndex(idx, pts.length)];
    const delta = p.actual - p.plan;
    const over = delta > 0;
    return {
      title: `${p.label} pace`,
      eyebrow: rangeLabel(bins[0].from, p.to),
      amount: fmtMoney(p.actual),
      color: over ? OVER_DOT : paceColor,
      description: over ? 'Spending ahead of planned pace' : 'Spending behind planned pace',
      metrics: [
        { label: 'Planned', value: fmtMoney(p.plan) },
        { label: over ? 'Above' : 'Below', value: fmtMoney(Math.abs(delta)) },
      ],
      filter: { dateFrom: bins[0].from, dateTo: p.to },
    };
  };

  const indexForX = (x: number) => clampIndex(Math.round((x - pad.l) / xStep), bins.length);
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
        <Defs>
          <LinearGradient id="paceArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={paceColor} stopOpacity={theme.dark ? 0.18 : 0.13} />
            <Stop offset="1" stopColor={paceColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        <Path d={`${actualD} L ${pad.l + plotW} ${pad.t + plotH} L ${pad.l} ${pad.t + plotH} Z`} fill="url(#paceArea)" />
        <Path d={planD} fill="none" stroke={theme.textTer} strokeWidth={1.3} strokeDasharray="6 6" opacity={0.82} />
        <Path d={actualD} fill="none" stroke={paceColor} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />

        {pts.map((p, i) => (
          <G key={`${p.label}-${i}`}>
            <Circle cx={p.x} cy={p.y} r={i === activeIdx ? 5.4 : 2.8} fill={i === activeIdx ? paceColor : theme.surface} stroke={paceColor} strokeWidth={1.6} />
            <SvgText x={p.x} y={height - 7} textAnchor="middle" fill={i === activeIdx ? theme.text : theme.textTer} fontSize={10} fontWeight={i === activeIdx ? '700' : '500'}>
              {p.label}
            </SvgText>
          </G>
        ))}

        {active && (
          <G>
            <Line x1={active.x} x2={active.x} y1={pad.t} y2={pad.t + plotH} stroke={theme.text} strokeWidth={1} opacity={0.18} />
            <Rect x={Math.min(width - 82, Math.max(8, active.x - 38))} y={0} width={76} height={22} rx={11} fill={active.actual > active.plan ? OVER_DOT : theme.text} />
            <SvgText x={Math.min(width - 44, Math.max(44, active.x))} y={15} textAnchor="middle" fill={active.actual > active.plan ? '#FDF7F3' : theme.bg} fontSize={11} fontWeight="700">
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

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArc(cx: number, cy: number, outerR: number, innerR: number, start: number, end: number) {
  const gap = 2.2;
  const s = start + gap / 2;
  const e = end - gap / 2;
  const outerStart = polar(cx, cy, outerR, s);
  const outerEnd = polar(cx, cy, outerR, e);
  const innerEnd = polar(cx, cy, innerR, e);
  const innerStart = polar(cx, cy, innerR, s);
  const large = e - s > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}


export function InsightMixChart({
  groups,
  total,
  theme,
  width,
  height,
  onInspect,
  onSelectDetail,
  onInteractionChange,
}: {
  groups: InsightGroup[];
  total: number;
  theme: Theme;
  width: number;
  height: number;
  onInspect: (detail: InsightDetail) => void;
  onSelectDetail?: (detail: InsightDetail) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [armedIdx, setArmedIdx] = useState<number | null>(null);
  const size = Math.min(146, height - 22, width * 0.46);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2;
  const innerR = size * 0.37;
  const safeTotal = Math.max(total, 0.001);
  let cursor = 0;
  const arcs = groups.map((g, i) => {
    const sweep = Math.max(0.015, g.value / safeTotal) * 360;
    const arc = { ...g, i, start: cursor, end: cursor + sweep };
    cursor += sweep;
    return arc;
  });
  const active = groups[activeIdx] ?? groups[0];

  const detailFor = (idx: number): InsightDetail => {
    const g = groups[clampIndex(idx, groups.length)];
    const actualPct = total > 0 ? g.value / total : 0;
    const delta = actualPct - g.targetPct;
    const over = delta > 0.02;
    return {
      title: g.label,
      eyebrow: '50/30/20 mix',
      amount: fmtMoney(g.value, g.value < 100 ? 2 : 0),
      color: over ? OVER_DOT : g.color,
      description: `${Math.round(actualPct * 100)}% of spend`,
      metrics: [
        { label: 'Actual', value: `${Math.round(actualPct * 100)}%` },
        { label: 'Target', value: `${Math.round(g.targetPct * 100)}%` },
        { label: 'Txns', value: String(g.txCount) },
      ],
      filter: g.catIds.length ? { catIds: g.catIds } : undefined,
    };
  };

  const indexForPoint = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < innerR * 0.75 || distance > outerR * 1.28) return activeIdx;
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
    const found = arcs.findIndex(a => angle >= a.start && angle <= a.end);
    return found < 0 ? activeIdx : found;
  };

  const { interactionProps } = useScrubTap({
    activeIdx,
    len: groups.length,
    indexForX: indexForPoint,
    onSelect: setActiveIdx,
    onCommitTap: (idx, wasAlreadyActive) => {
      if (wasAlreadyActive && armedIdx === idx) onInspect(detailFor(idx));
      else setArmedIdx(idx);
    },
    onInteractionChange,
  });

  useEffect(() => {
    onSelectDetail?.(detailFor(activeIdx));
  }, [activeIdx, groups, total, onSelectDetail]);
  const activeDetail = detailFor(activeIdx);

  return (
    <View style={[styles.mixWrap, { width, height }]}> 
      <View
        style={{ width: size, height: size }}
        {...interactionProps.panHandlers}
        {...chartAccessibilityProps({
          label: '50 30 20 mix chart',
          detail: activeDetail,
          activeIdx,
          len: groups.length,
          onSelect: setActiveIdx,
          onInspect: () => onInspect(activeDetail),
        })}
      >
        <Svg width={size} height={size}>
          {arcs.map(a => {
            const isActive = a.i === activeIdx;
            return (
              <Path
                key={a.key}
                d={donutArc(cx, cy, outerR, innerR, a.start, a.end)}
                fill={a.color}
                opacity={isActive ? 1 : 0.28}
                stroke={theme.dark ? 'rgba(15,11,28,0.85)' : 'rgba(245,244,248,0.95)'}
                strokeWidth={isActive ? 2 : 1.5}
              />
            );
          })}
        </Svg>
        <View pointerEvents="none" style={styles.donutCenter}>
          <Text style={[styles.donutPct, { color: theme.text }]}>
            {Math.round((active?.value ?? 0) / safeTotal * 100)}%
          </Text>
          <Text style={[TYPE.labelLg, { color: theme.textSec, marginTop: 2 }]}>
            {(active?.label ?? 'Split').toUpperCase()}
          </Text>
          <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 3 }]}>
            {fmtMoney(active?.value ?? 0, (active?.value ?? 0) < 100 ? 2 : 0)}
          </Text>
        </View>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={interactionProps.onPress}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      <View style={styles.mixLegend}>
        {groups.map((g, i) => {
          const pct = total > 0 ? g.value / total : 0;
          const isActive = i === activeIdx;
          return (
            <TouchableOpacity
              key={g.key}
              onPress={() => {
                const wasAlreadyActive = i === activeIdx;
                setActiveIdx(i);
                if (wasAlreadyActive && armedIdx === i) onInspect(detailFor(i));
                else setArmedIdx(i);
              }}
              activeOpacity={0.65}
              delayPressIn={0}
              accessibilityRole="button"
              accessibilityLabel={`${g.label}, ${Math.round(pct * 100)}%`}
              style={styles.mixLegendRow}
            >
              <View style={[styles.mixBar, { backgroundColor: g.color, opacity: isActive ? 1 : 0.35 }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[TYPE.captionEm, { color: isActive ? theme.text : theme.textSec }]}>
                  {g.label}
                </Text>
                <Text style={[TYPE.caption, { color: theme.textTer, marginTop: 1 }]}>
                  {fmtMoney(g.value, g.value < 100 ? 2 : 0)}
                </Text>
              </View>
              <Text style={[TYPE.captionEm, { color: isActive ? theme.text : theme.textSec }]}>
                {Math.round(pct * 100)}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutPct: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -1.2,
    lineHeight: 28,
  },
  mixLegend: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  mixLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  mixBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
    flexShrink: 0,
  },
});
