import React from 'react';
import Svg, { Path, Circle, Line, Text as SvgText, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Theme, OVER_DOT } from '../theme';
import type { TrendPoint } from '../selectors/types';

interface TrendChartProps {
  data: TrendPoint[];
  theme: Theme;
  width: number;
  height?: number;
  budget: number;
}

const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

export function TrendChart({ data, theme, width, height = 180, budget }: TrendChartProps) {
  const yMax = Math.max(...data.map(d => d.v), budget) * 1.18;
  const pad = { t: 18, r: 58, b: 26, l: 8 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const xStep = W / Math.max(data.length - 1, 1);

  const pts = data.map((d, i) => ({
    x: pad.l + i * xStep,
    y: pad.t + H - (d.v / yMax) * H,
    ...d,
  }));

  const budgetY = pad.t + H - (budget / yMax) * H;

  // Smooth cubic bezier path
  const pathD = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    return `${acc} C ${prev.x + xStep * 0.4} ${prev.y}, ${p.x - xStep * 0.4} ${p.y}, ${p.x} ${p.y}`;
  }, '');
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${pad.t + H} L ${pts[0].x} ${pad.t + H} Z`;

  const lineCol = theme.dark ? 'rgba(244,242,236,0.85)' : 'rgba(14,14,16,0.85)';
  const last = pts[pts.length - 1];
  const lastOver = last.v > budget;
  const lastColor = lastOver ? OVER_DOT : theme.accent.dot;

  const gradId = 'trendAreaGrad';

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={lineCol} stopOpacity={theme.dark ? 0.18 : 0.10} />
          <Stop offset="100%" stopColor={lineCol} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* Budget reference line */}
      <Line
        x1={pad.l} y1={budgetY} x2={pad.l + W} y2={budgetY}
        stroke={theme.accent.dot} strokeWidth={1.2} strokeDasharray="5 5" opacity={0.85}
      />
      <SvgText x={pad.l + W + 6} y={budgetY + 3} fontSize={9.5} fontWeight="700" fill={theme.accent.dot} letterSpacing={0.4}>
        BUDGET
      </SvgText>
      <SvgText x={pad.l + W + 6} y={budgetY + 16} fontSize={10} fontWeight="600" fill={theme.text}>
        {fmt(budget)}
      </SvgText>

      {/* Area fill */}
      <Path d={areaD} fill={`url(#${gradId})`} />
      {/* Line */}
      <Path d={pathD} fill="none" stroke={lineCol} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {pts.map((p, i) => {
        const isLast = i === pts.length - 1;
        const over = p.v > budget;
        const dotFill = isLast ? (over ? OVER_DOT : theme.accent.dot) : (over ? OVER_DOT : theme.surface);
        const dotStroke = isLast ? dotFill : lineCol;
        return (
          <Circle key={i} cx={p.x} cy={p.y} r={isLast ? 4.5 : 2.8}
            fill={dotFill} stroke={dotStroke} strokeWidth={1.5} />
        );
      })}

      {/* Tooltip on last point */}
      <Rect x={last.x - 26} y={last.y - 28} width={52} height={18} rx={9}
        fill={lastOver ? OVER_DOT : theme.text} />
      <SvgText x={last.x} y={last.y - 15} textAnchor="middle" fontSize={10} fontWeight="700"
        fill={lastOver ? '#fff' : theme.bg}>
        {fmt(last.v)}
      </SvgText>

      {/* X-axis labels */}
      {pts.map((p, i) => {
        const isLast = i === pts.length - 1;
        return (
          <SvgText key={i} x={p.x} y={height - 4} textAnchor="middle"
            fontSize={10} fontWeight={isLast ? '700' : '500'}
            fill={isLast ? theme.text : theme.textSec}>
            {p.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}
