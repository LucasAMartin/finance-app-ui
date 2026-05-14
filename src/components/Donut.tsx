import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Theme, catPastel } from '../theme';

interface DonutData {
  cat: string;
  value: number;
}

interface DonutProps {
  data: DonutData[];
  theme: Theme;
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerLabel?: string;
  centerSub?: string;
}

export function Donut({ data, theme, size = 168, thickness = 16, centerTop, centerLabel, centerSub }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 3;

  let offset = 0;
  const segments = data.map((d) => {
    const frac = d.value / total;
    const len = Math.max(circumference * frac - gap, 0.01);
    const dashArray = `${len} ${circumference}`;
    const dashOffset = -offset;
    offset += circumference * frac;
    return { cat: d.cat, dashArray, dashOffset };
  });

  const trackColor = theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(14,14,16,0.05)';

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={trackColor} strokeWidth={thickness} fill="none"
        />
        {/* Segments */}
        {segments.map((seg) => (
          <Circle
            key={seg.cat}
            cx={size / 2} cy={size / 2} r={r}
            stroke={catPastel(seg.cat, theme.dark)}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </Svg>
      {/* Center text overlay */}
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        {centerTop && (
          <Text style={{ fontSize: 9, color: theme.textSec, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '600' }}>
            {centerTop}
          </Text>
        )}
        {centerLabel && (
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: 2 }}>
            {centerLabel}
          </Text>
        )}
        {centerSub && (
          <Text style={{ fontSize: 11, color: theme.textSec, marginTop: 1 }}>
            {centerSub}
          </Text>
        )}
      </View>
    </View>
  );
}
