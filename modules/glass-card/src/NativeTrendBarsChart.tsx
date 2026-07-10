import React, { useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeTrendBarsChartViewProps = ViewProps & {
  valuesJson?: string;
  labelsJson?: string;
  selectedIndex?: number;
  barColor?: string;
  selectedColor?: string;
  labelColor?: string;
  selectedLabelColor?: string;
  partialIndex?: number;
  play?: boolean;
  haptics?: boolean;
  replayToken?: number;
  animationDurationMs?: number;
  scrubEnabled?: boolean;
  tapEnabled?: boolean;
  onScrub?: (event: { nativeEvent: { index: number | null } }) => void;
  onTap?: (event: { nativeEvent: { index: number } }) => void;
};

const NativeTrendBarsChartView = Platform.OS === 'ios'
  ? requireNativeView<NativeTrendBarsChartViewProps>('GlassCard', 'NativeTrendBarsChartView')
  : null;

export const SUPPORTS_NATIVE_TREND_BARS_CHART = Platform.OS === 'ios' && !!NativeTrendBarsChartView;

export function NativeTrendBarsChart({
  values,
  labels,
  selectedIdx,
  barColor,
  selectedColor,
  labelColor,
  selectedLabelColor,
  partialIdx,
  play = true,
  haptics = true,
  replayToken = 0,
  animationDurationMs,
  scrubEnabled,
  tapEnabled,
  onScrub,
  onTap,
  style,
}: {
  values: number[];
  labels: string[];
  selectedIdx: number | null;
  barColor: string;
  selectedColor: string;
  labelColor: string;
  selectedLabelColor: string;
  partialIdx?: number | null;
  play?: boolean;
  haptics?: boolean;
  replayToken?: number;
  animationDurationMs?: number;
  scrubEnabled?: boolean;
  tapEnabled?: boolean;
  onScrub?: (index: number | null) => void;
  onTap?: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const valuesJson = useMemo(() => JSON.stringify(values), [values]);
  const labelsJson = useMemo(() => JSON.stringify(labels), [labels]);

  if (!NativeTrendBarsChartView) {
    return <View style={style} />;
  }

  return (
    <Host ignoreSafeArea="all" style={[styles.host, style]}>
      <NativeTrendBarsChartView
        valuesJson={valuesJson}
        labelsJson={labelsJson}
        selectedIndex={selectedIdx ?? -1}
        barColor={barColor}
        selectedColor={selectedColor}
        labelColor={labelColor}
        selectedLabelColor={selectedLabelColor}
        partialIndex={partialIdx ?? -1}
        play={play}
        haptics={haptics}
        replayToken={replayToken}
        animationDurationMs={animationDurationMs}
        scrubEnabled={scrubEnabled ?? !!onScrub}
        tapEnabled={tapEnabled ?? !!onTap}
        onScrub={(event) => onScrub?.(event.nativeEvent.index)}
        onTap={(event) => onTap?.(event.nativeEvent.index)}
        style={styles.nativeView}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    backgroundColor: 'transparent',
  },
  nativeView: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
});
