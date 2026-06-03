import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Reanimated, {
  Easing as ReEasing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme';
import { NumericKeypad, type KeypadKey } from './NumericKeypad';
import { SheetPrimaryButton } from './shared';

const DONE_AREA = 76;

interface PopupNumericKeypadProps {
  visible: boolean;
  theme: Theme;
  onKey: (key: KeypadKey) => void;
  onDone: () => void;
  borderColor?: string;
  onHeightChange?: (height: number) => void;
  zIndex?: number;
}

export function PopupNumericKeypad({
  visible,
  theme,
  onKey,
  onDone,
  borderColor,
  onHeightChange,
  zIndex = 40,
}: PopupNumericKeypadProps) {
  const insets = useSafeAreaInsets();
  const [keypadH, setKeypadH] = useState(300);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 280 : 190,
      easing: ReEasing.out(ReEasing.cubic),
    });
  }, [progress, visible]);

  const keypadStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [keypadH + DONE_AREA + 40, 0]) }],
  }));

  const doneStyle = useAnimatedStyle(() => ({
    bottom: interpolate(progress.value, [0, 1], [-DONE_AREA, keypadH + 12]),
    opacity: progress.value,
  }));

  return (
    <>
      <TouchableWithoutFeedback onPress={onDone} accessible={false}>
        <View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[styles.backdrop, { zIndex: zIndex - 1 }]}
        />
      </TouchableWithoutFeedback>
      <Reanimated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          setKeypadH(height);
          onHeightChange?.(height);
        }}
        style={[styles.keypadOverlay, { zIndex }, keypadStyle]}
      >
        <BlurView
          intensity={theme.dark ? 80 : 100}
          tint={theme.dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={[styles.keypadSurface, { borderTopColor: borderColor ?? theme.hairline }]}
        >
          <View style={{ paddingBottom: insets.bottom + 6, paddingTop: 8 }}>
            <NumericKeypad onKey={onKey} theme={theme} />
          </View>
        </BlurView>
      </Reanimated.View>

      <Reanimated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={[styles.doneFloat, { zIndex: zIndex + 1 }, doneStyle]}
      >
        <View style={styles.doneWrap} pointerEvents={visible ? 'auto' : 'none'}>
          <SheetPrimaryButton label="Done" onPress={onDone} theme={theme} />
        </View>
      </Reanimated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  keypadOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  keypadSurface: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  doneFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  doneWrap: {
    paddingHorizontal: 16,
  },
});
