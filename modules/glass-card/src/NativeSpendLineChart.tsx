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
  play?: boolean;
  haptics?: boolean;
  onScrub?: (event: { nativeEvent: { index: number | null } }) => void;
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
  play = true,
  haptics = true,
  onScrub,
  style,
}: {
  data: number[];
  color: string;
  fillColor?: string;
  ringColor?: string;
  strokeWidth?: number;
  verticalInset?: number;
  bottomInset?: number;
  play?: boolean;
  haptics?: boolean;
  onScrub?: (index: number | null) => void;
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
        play={play}
        haptics={haptics}
        onScrub={(event) => onScrub?.(event.nativeEvent.index)}
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
