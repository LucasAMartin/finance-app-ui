import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Theme } from '../../theme';
import { TYPE } from '../../typography';

// A snapshot's detail sheet shows exactly one of these small visualizations
// beneath the hero. Four primitives cover every snapshot type — reuse over
// uniqueness, so the same bar always means the same thing.
export type SnapshotVizSpec =
  | {
      // A single track measured against an optional threshold (budget / pace /
      // share). Flips to `over` styling once the fill passes the threshold.
      kind: 'meter';
      value: number;
      max: number;
      threshold?: number;
      color: string;
      leftLabel: string;
      rightLabel: string;
    }
  | {
      // Previous vs now, as two stacked horizontal bars with the delta called out.
      kind: 'compare';
      prev: number;
      now: number;
      color: string;
      caption: string;
    }
  | {
      // The 50/30/20 mix as one stacked bar of group shares.
      kind: 'segments';
      parts: { value: number; color: string }[];
      leftLabel: string;
      rightLabel: string;
    }
  | {
      // A row of period bars with one highlighted (peak), some dimmed (no-spend),
      // and an optional average line.
      kind: 'bins';
      bars: { value: number; label: string; highlight?: boolean; muted?: boolean }[];
      avg?: number;
      caption: string;
    };

const BAR_H = 58;

function trackBg(dark: boolean) {
  return dark ? 'rgba(242,244,245,0.10)' : 'rgba(14,12,24,0.07)';
}
function mutedFill(dark: boolean) {
  return dark ? 'rgba(242,244,245,0.20)' : 'rgba(14,12,24,0.14)';
}

function CaptionRow({
  left,
  right,
  theme,
}: {
  left: string;
  right: string;
  theme: Theme;
}) {
  return (
    <View style={styles.captionRow}>
      <Text style={[TYPE.caption, { color: theme.textSec }]} numberOfLines={1}>
        {left}
      </Text>
      <Text style={[TYPE.caption, { color: theme.textTer }]} numberOfLines={1}>
        {right}
      </Text>
    </View>
  );
}

function Caption({ text, theme }: { text: string; theme: Theme }) {
  return (
    <Text
      style={[TYPE.caption, { color: theme.textSec, textAlign: 'center', marginTop: 10 }]}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

export function SnapshotViz({
  viz,
  theme,
}: {
  viz: SnapshotVizSpec;
  theme: Theme;
}) {
  if (viz.kind === 'meter') {
    const pct = Math.max(0, Math.min(1, viz.max > 0 ? viz.value / viz.max : 0));
    const thresholdPct =
      viz.threshold != null && viz.max > 0
        ? Math.max(0, Math.min(1, viz.threshold / viz.max))
        : null;
    return (
      <View>
        <View style={[styles.meterTrack, { backgroundColor: trackBg(theme.dark) }]}>
          <View
            style={[
              styles.meterFill,
              { width: `${pct * 100}%`, backgroundColor: viz.color },
            ]}
          />
          {thresholdPct != null && (
            <View
              style={[
                styles.meterTick,
                { left: `${thresholdPct * 100}%`, backgroundColor: theme.textTer },
              ]}
            />
          )}
        </View>
        <CaptionRow left={viz.leftLabel} right={viz.rightLabel} theme={theme} />
      </View>
    );
  }

  if (viz.kind === 'compare') {
    const maxV = Math.max(viz.prev, viz.now, 1);
    const rows: { key: string; label: string; val: number; color: string }[] = [
      { key: 'prev', label: 'was', val: viz.prev, color: mutedFill(theme.dark) },
      { key: 'now', label: 'now', val: viz.now, color: viz.color },
    ];
    return (
      <View>
        {rows.map((r) => (
          <View key={r.key} style={styles.compareRow}>
            <Text style={[TYPE.labelSm, { color: theme.textTer, width: 30 }]}>
              {r.label}
            </Text>
            <View style={[styles.compareTrack, { backgroundColor: trackBg(theme.dark) }]}>
              <View
                style={[
                  styles.compareFill,
                  { width: `${(r.val / maxV) * 100}%`, backgroundColor: r.color },
                ]}
              />
            </View>
          </View>
        ))}
        <Caption text={viz.caption} theme={theme} />
      </View>
    );
  }

  if (viz.kind === 'segments') {
    const sum = viz.parts.reduce((s, p) => s + p.value, 0) || 1;
    return (
      <View>
        <View style={[styles.segTrack, { backgroundColor: trackBg(theme.dark) }]}>
          {viz.parts.map((p, i) => (
            <View
              key={i}
              style={{ flex: Math.max(p.value / sum, 0.0001), backgroundColor: p.color }}
            />
          ))}
        </View>
        <CaptionRow left={viz.leftLabel} right={viz.rightLabel} theme={theme} />
      </View>
    );
  }

  // bins
  const maxV = Math.max(...viz.bars.map((b) => b.value), 1);
  const avgY = viz.avg != null ? BAR_H - (Math.min(viz.avg, maxV) / maxV) * BAR_H : null;
  return (
    <View>
      <View style={[styles.binsRow, { height: BAR_H }]}>
        {avgY != null && (
          <View
            style={[styles.avgLine, { top: avgY, borderColor: theme.textTer }]}
          />
        )}
        {viz.bars.map((b, i) => {
          const h = Math.max(3, (b.value / maxV) * BAR_H);
          const color = b.highlight
            ? theme.text
            : b.muted || b.value === 0
              ? mutedFill(theme.dark)
              : theme.dark
                ? 'rgba(242,244,245,0.42)'
                : 'rgba(14,12,24,0.30)';
          return (
            <View key={i} style={styles.binCol}>
              <View
                style={{
                  width: '58%',
                  height: h,
                  borderRadius: 3,
                  backgroundColor: color,
                  opacity: b.value === 0 ? 0.5 : 1,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.binLabels}>
        {viz.bars.map((b, i) => (
          <Text
            key={i}
            style={[
              TYPE.labelSm,
              { flex: 1, textAlign: 'center', color: b.highlight ? theme.text : theme.textTer },
            ]}
            numberOfLines={1}
          >
            {b.label}
          </Text>
        ))}
      </View>
      <Caption text={viz.caption} theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  meterTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  meterFill: {
    height: 10,
    borderRadius: 5,
  },
  meterTick: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 10,
    opacity: 0.9,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  compareTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  compareFill: {
    height: 8,
    borderRadius: 4,
  },
  segTrack: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  binsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  binCol: {
    flex: 1,
    alignItems: 'center',
  },
  binLabels: {
    flexDirection: 'row',
    marginTop: 6,
  },
  avgLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.6,
  },
});
