import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Theme, catPastel } from '../theme';
import { CATS } from '../data';

export interface PieSlice {
  cat: string;
  value: number;
}

interface PieChartProps {
  data: PieSlice[];
  theme: Theme;
  size?: number;
  selected: string | null;
  onSelect: (cat: string | null) => void;
}

const GAP_DEG = 2.5;
const POP_PX = 10;
const INNER_FRAC = 0.52;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function slicePath(
  cx: number, cy: number,
  r: number, ir: number,
  a1: number, a2: number,
): string {
  const cos1 = Math.cos(toRad(a1)), sin1 = Math.sin(toRad(a1));
  const cos2 = Math.cos(toRad(a2)), sin2 = Math.sin(toRad(a2));
  const large = a2 - a1 > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(cx + ir * cos1)} ${f(cy + ir * sin1)}`,
    `L ${f(cx + r * cos1)} ${f(cy + r * sin1)}`,
    `A ${f(r)} ${f(r)} 0 ${large} 1 ${f(cx + r * cos2)} ${f(cy + r * sin2)}`,
    `L ${f(cx + ir * cos2)} ${f(cy + ir * sin2)}`,
    `A ${f(ir)} ${f(ir)} 0 ${large} 0 ${f(cx + ir * cos1)} ${f(cy + ir * sin1)}`,
    'Z',
  ].join(' ');
}

export function PieChart({ data, theme, size = 240, selected, onSelect }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - POP_PX - 4;
  const ir = r * INNER_FRAC;
  const gapTotal = GAP_DEG * data.length;
  const availSweep = 360 - gapTotal;

  let angle = -90;
  const slices = data.map((d) => {
    const sweep = (d.value / total) * availSweep;
    const a1 = angle + GAP_DEG / 2;
    const a2 = a1 + sweep;
    const mid = (a1 + a2) / 2;
    angle = a2 + GAP_DEG / 2;
    return {
      ...d,
      a1, a2, mid,
      path: slicePath(cx, cy, r, ir, a1, a2),
      color: catPastel(d.cat, theme.dark),
    };
  });

  const sel = selected ? slices.find(s => s.cat === selected) : null;
  const centerAmt = sel
    ? `$${sel.value.toFixed(0)}`
    : `$${total.toFixed(0)}`;
  const centerSub = sel
    ? (CATS[selected!]?.label ?? selected!)
    : 'Total';

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: 'absolute' }}
        >
          {slices.map((s) => {
            const isSel = s.cat === selected;
            const dx = isSel ? (POP_PX * Math.cos(toRad(s.mid))).toFixed(2) : '0';
            const dy = isSel ? (POP_PX * Math.sin(toRad(s.mid))).toFixed(2) : '0';
            return (
              <Path
                key={s.cat}
                d={s.path}
                fill={s.color}
                opacity={selected && !isSel ? 0.35 : 1}
                transform={isSel ? `translate(${dx}, ${dy})` : undefined}
                onPress={() => onSelect(isSel ? null : s.cat)}
              />
            );
          })}
        </Svg>

        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text, letterSpacing: -1 }}>
            {centerAmt}
          </Text>
          <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 2, fontWeight: '500' }}>
            {centerSub}
          </Text>
        </View>
      </View>

      {/* Legend chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 4 }}
        style={{ marginTop: 6 }}
      >
        {slices.map((s) => {
          const isSel = s.cat === selected;
          const cat = CATS[s.cat];
          return (
            <TouchableOpacity
              key={s.cat}
              onPress={() => onSelect(isSel ? null : s.cat)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 100,
                backgroundColor: isSel ? s.color + '30' : theme.chipBg,
                borderWidth: 1,
                borderColor: isSel ? s.color : 'transparent',
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
              <Text style={{
                fontSize: 12,
                fontWeight: isSel ? '700' : '500',
                color: isSel ? theme.text : theme.textSec,
              }}>
                {cat?.label ?? s.cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
