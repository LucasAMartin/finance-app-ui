import React, { useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

type NativeSpendLineChartViewProps = ViewProps & {
  valuesJson?: string;
  color?: string;
  fillColor?: string;
  ringColor?: string;
  strokeWidth?: number;
  verticalInset?: number;
  bottomInset?: number;
  selectedIndex?: number;
  play?: boolean;
  haptics?: boolean;
  replayToken?: number;
  animationDurationMs?: number;
  scrubEnabled?: boolean;
  tapEnabled?: boolean;
  onScrub?: (event: { nativeEvent: { index: number | null } }) => void;
  onTap?: (event: { nativeEvent: { index: number } }) => void;
};

const NativeSpendLineChartView = Platform.OS === 'ios'
  ? requireNativeView<NativeSpendLineChartViewProps>('GlassCard', 'NativeSpendLineChartView')
  : null;

export const SUPPORTS_NATIVE_SPEND_LINE_CHART = Platform.OS === 'ios' && !!NativeSpendLineChartView;

export function NativeSpendLineChart({
  data,
  color,
  fillColor,
  ringColor = '#FFFFFF',
  strokeWidth = 2.5,
  verticalInset = 0,
  bottomInset = 0,
  selectedIdx,
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
  data: number[];
  color: string;
  fillColor?: string;
  ringColor?: string;
  strokeWidth?: number;
  verticalInset?: number;
  bottomInset?: number;
  selectedIdx?: number | null;
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
  const valuesJson = useMemo(() => JSON.stringify(data), [data]);

  if (!NativeSpendLineChartView) {
    return <View style={style} />;
  }

  return (
    <Host ignoreSafeArea="all" style={[styles.host, style]}>
      <NativeSpendLineChartView
        valuesJson={valuesJson}
        color={color}
        fillColor={fillColor}
        ringColor={ringColor}
        strokeWidth={strokeWidth}
        verticalInset={verticalInset}
        bottomInset={bottomInset}
        selectedIndex={selectedIdx ?? -1}
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
