import React from 'react';
import { View } from 'react-native';
import { Theme } from '../theme';

interface SparklineProps {
  data: number[];
  theme: Theme;
  height?: number;
  highlightLast?: boolean;
}

// View-based sparkline — no SVG dependency.
// Each datapoint is a thin bar; height proportional to value.
export function Sparkline({ data, theme, height = 32, highlightLast = true }: SparklineProps) {
  const max = Math.max(...data, 1);
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {data.map((v, i) => {
        const isLast = i === data.length - 1;
        const h = Math.max((v / max) * height, 3);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: h,
              borderRadius: 2,
              backgroundColor:
                isLast && highlightLast ? theme.accent.dot : theme.hairline,
              opacity: isLast && highlightLast ? 1 : 0.9,
            }}
          />
        );
      })}
    </View>
  );
}
