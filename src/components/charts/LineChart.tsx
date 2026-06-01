import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  data: number[];
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
}

// Catmull-Rom spline → cubic bezier, for a smooth curve through every point
// (the soft, hand-drawn line in the reference). No axes, no fill — just the
// stroke, like a sparkline scaled up.
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function LineChart({
  data,
  width,
  height,
  color,
  strokeWidth = 2.5,
}: Props) {
  if (data.length === 0 || width <= 0 || height <= 0) {
    return <Svg width={Math.max(0, width)} height={Math.max(0, height)} />;
  }
  const pad = strokeWidth + 1; // keep the stroke from clipping at the edges
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const n = data.length;
  const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;
  const pts = data.map((v, i): [number, number] => [
    pad + i * stepX,
    pad + (1 - (v - min) / range) * (height - pad * 2),
  ]);

  return (
    <Svg width={width} height={height}>
      <Path
        d={smoothPath(pts)}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
