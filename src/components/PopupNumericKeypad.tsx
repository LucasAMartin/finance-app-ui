import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

export interface PopupNumericKeypadHandle {
  open: (duration?: number) => void;
  close: (duration?: number) => void;
}

interface PopupNumericKeypadProps {
  visible: boolean;
  theme: Theme;
  onKey: (key: KeypadKey) => void;
  onDone: () => void;
  borderColor?: string;
  openDuration?: number;
  closeDuration?: number;
  onHeightChange?: (height: number) => void;
  zIndex?: number;
}

export const PopupNumericKeypad = memo(forwardRef<PopupNumericKeypadHandle, PopupNumericKeypadProps>(function PopupNumericKeypad({
  visible,
  theme,
  onKey,
  onDone,
  borderColor,
  openDuration = 280,
  closeDuration = 190,
  onHeightChange,
  zIndex = 40,
}, ref) {
  const insets = useSafeAreaInsets();
  const [interactive, setInteractive] = useState(visible);
  const [keypadH, setKeypadH] = useState(300);
  const measuredHeightRef = useRef(0);
  const targetRef = useRef(0);
  const progress = useSharedValue(0);

  const handleLayout = useCallback((height: number) => {
    if (Math.abs(measuredHeightRef.current - height) < 0.5) return;
    measuredHeightRef.current = height;
    setKeypadH(height);
    onHeightChange?.(height);
  }, [onHeightChange]);

  const animateTo = useCallback((target: 0 | 1, duration: number) => {
    if (targetRef.current === target) return;
    targetRef.current = target;
    setInteractive(target === 1);
    progress.value = withTiming(target, {
      duration,
      easing: ReEasing.out(ReEasing.cubic),
    });
  }, [progress]);

  useImperativeHandle(ref, () => ({
    open: (duration = openDuration) => animateTo(1, duration),
    close: (duration = closeDuration) => animateTo(0, duration),
  }), [animateTo, closeDuration, openDuration]);

  useEffect(() => {
    animateTo(visible ? 1 : 0, visible ? openDuration : closeDuration);
  }, [animateTo, closeDuration, openDuration, visible]);

  const keypadStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [keypadH + DONE_AREA + 40, 0]) }],
  }));

  const doneStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [keypadH + DONE_AREA + 12, 0]) }],
  }));

  return (
    <>
      <TouchableWithoutFeedback onPress={onDone} accessible={false}>
        <View
          pointerEvents={interactive ? 'auto' : 'none'}
          style={[styles.backdrop, { zIndex: zIndex - 1 }]}
        />
      </TouchableWithoutFeedback>
      <Reanimated.View
        pointerEvents={interactive ? 'box-none' : 'none'}
        onLayout={event => {
          handleLayout(event.nativeEvent.layout.height);
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
        pointerEvents={interactive ? 'box-none' : 'none'}
        style={[styles.doneFloat, { bottom: keypadH + 12, zIndex: zIndex + 1 }, doneStyle]}
      >
        <View style={styles.doneWrap} pointerEvents={interactive ? 'auto' : 'none'}>
          <SheetPrimaryButton label="Done" onPress={onDone} theme={theme} />
        </View>
      </Reanimated.View>
    </>
  );
}));

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
