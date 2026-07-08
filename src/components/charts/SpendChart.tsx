import React, { useEffect, useMemo, useRef } from 'react';
import Svg, {
  Path,
  Circle,
  Line,
  Defs,
  LinearGradient,
  Stop,
  G,
} from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedG = Animated.createAnimatedComponent(G);

interface Props {
  /** Values to plot left→right. For a cumulative spend series the last point
   *  equals the period total, so the line "charts its course" up to it. */
  data: number[];
  width: number;
  height: number;
  /** Stroke + accent color (hex). */
  color: string;
  /** Base color for the area gradient under the line (defaults to `color`). */
  fillColor?: string;
  /** Background color behind the scrub dot, for a clean punch-out ring. */
  ringColor?: string;
  strokeWidth?: number;
  /** Extra top/bottom breathing room so high/low points and the scrub dot do not clip. */
  verticalInset?: number;
  bottomInset?: number;
  /** Starts the draw animation only when true; false holds the chart hidden. */
  play?: boolean;
  /** Fires with the active point index while scrubbing, `null` on release. */
  onScrub?: (index: number | null) => void;
  /** Currently locked point (from a tap). Cursor stays visible at this index. */
  selectedIdx?: number | null;
  /** Fires on a discrete tap; parent handles toggle (same index → deselect). */
  onTap?: (index: number) => void;
  /** Whether scrub/tap should fire selection haptics. Default true. */
  haptics?: boolean;
}

// Catmull-Rom → cubic bezier: a smooth curve through every point, no axes.
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

export function SpendChart({
  data,
  width,
  height,
  color,
  fillColor,
  ringColor = '#FFFFFF',
  strokeWidth = 2.5,
  verticalInset,
  bottomInset,
  play = true,
  onScrub,
  selectedIdx,
  onTap,
  haptics = true,
}: Props) {
  const padX = strokeWidth + 1;
  const padTop = Math.max(strokeWidth + 1, verticalInset ?? strokeWidth + 1);
  const padBottom = Math.max(strokeWidth + 1, bottomInset ?? verticalInset ?? strokeWidth + 1);
  const n = data.length;

  const geo = useMemo(() => {
    const max = Math.max(...data, 0);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const innerH = height - padTop - padBottom;
    const stepX = n > 1 ? (width - padX * 2) / (n - 1) : 0;
    const xs: number[] = [];
    const ys: number[] = [];
    const pts: [number, number][] = data.map((v, i) => {
      const x = padX + i * stepX;
      const y = padTop + (1 - (v - min) / range) * innerH;
      xs.push(x);
      ys.push(y);
      return [x, y];
    });
    const lineD = smoothPath(pts);
    const firstX = xs[0] ?? padX;
    const lastX = xs[n - 1] ?? width - padX;
    const areaD =
      n === 0
        ? ''
        : `${lineD} L ${lastX},${height - padBottom} L ${firstX},${height - padBottom} Z`;
    // Polyline length, over-estimated so the dash fully reveals the curve.
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    const dashLen = Math.max(1, len * 1.25);
    return { lineD, areaD, xs, ys, stepX, dashLen };
  }, [data, width, height, n, padX, padTop, padBottom]);

  const drawn = useSharedValue(geo.dashLen);
  const fillIn = useSharedValue(0);
  const cursorX = useSharedValue(0);
  const cursorY = useSharedValue(0);
  const cursorOn = useSharedValue(0);
  const lastIdx = useSharedValue(-1);

  // Hold inactive charts at the hidden start state. The Insights screen stays
  // mounted off-screen, so this prevents a completed chart from flashing before
  // the next replay begins.
  useEffect(() => {
    if (!play) {
      drawn.value = geo.dashLen;
      fillIn.value = 0;
      cursorOn.value = 0;
      lastIdx.value = -1;
      return;
    }
    drawn.value = geo.dashLen;
    fillIn.value = 0;
    drawn.value = withTiming(0, { duration: 950, easing: Easing.out(Easing.cubic) });
    fillIn.value = withDelay(260, withTiming(1, { duration: 650 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, geo.dashLen]);

  const tick = () => { if (haptics) Haptics.selectionAsync(); };
  const emit = (idx: number | null) => onScrub?.(idx);
  const emitTap = (idx: number) => onTap?.(idx);

  // Track whether a pan is in progress on the JS side so the selectedIdx effect
  // knows not to fight the worklet-driven cursor position.
  const { xs, ys, stepX } = geo;

  const panActiveRef = useRef(false);
  const setPanActive = (v: boolean) => { panActiveRef.current = v; };

  // When the parent's locked selection changes (tap toggle), show the cursor at
  // that point. Skipped while panning so the worklet-driven cursor stays smooth.
  useEffect(() => {
    if (panActiveRef.current) return;
    if (selectedIdx != null && xs[selectedIdx] !== undefined) {
      cursorX.value = xs[selectedIdx];
      cursorY.value = ys[selectedIdx];
      cursorOn.value = withTiming(1, { duration: 130 });
    } else {
      cursorOn.value = withTiming(0, { duration: 180 });
    }
  }, [selectedIdx, xs, ys, cursorX, cursorY, cursorOn]);

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        'worklet';
        const i =
          n <= 1
            ? 0
            : Math.max(0, Math.min(n - 1, Math.round((e.x - padX) / stepX)));
        runOnJS(tick)();
        runOnJS(emitTap)(i);
      }),
    [n, padX, stepX],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(140)
        .onStart((e) => {
          'worklet';
          const i =
            n <= 1
              ? 0
              : Math.max(0, Math.min(n - 1, Math.round((e.x - padX) / stepX)));
          cursorX.value = xs[i];
          cursorY.value = ys[i];
          cursorOn.value = withTiming(1, { duration: 130 });
          lastIdx.value = i;
          runOnJS(setPanActive)(true);
          runOnJS(tick)();
          runOnJS(emit)(i);
        })
        .onUpdate((e) => {
          'worklet';
          const i =
            n <= 1
              ? 0
              : Math.max(0, Math.min(n - 1, Math.round((e.x - padX) / stepX)));
          cursorX.value = xs[i];
          cursorY.value = ys[i];
          if (i !== lastIdx.value) {
            lastIdx.value = i;
            runOnJS(tick)();
            runOnJS(emit)(i);
          }
        })
        .onFinalize(() => {
          'worklet';
          if (lastIdx.value !== -1) {
            lastIdx.value = -1;
            runOnJS(setPanActive)(false);
            runOnJS(emit)(null);
            // The selectedIdx effect re-fires after emit(null) clears scrubIdx;
            // if a locked selection exists it will restore the cursor there.
          }
        }),
    [xs, ys, stepX, n, padX, cursorX, cursorY, cursorOn, lastIdx],
  );

  const gesture = useMemo(() => Gesture.Race(tap, pan), [tap, pan]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: drawn.value }));
  const areaProps = useAnimatedProps(() => ({ opacity: fillIn.value }));
  const cursorProps = useAnimatedProps(() => ({ opacity: cursorOn.value }));
  const vLineProps = useAnimatedProps(() => ({
    x1: cursorX.value,
    x2: cursorX.value,
  }));
  const dotProps = useAnimatedProps(() => ({
    cx: cursorX.value,
    cy: cursorY.value,
  }));

  if (n === 0 || width <= 0 || height <= 0) {
    return <Svg width={Math.max(0, width)} height={Math.max(0, height)} />;
  }

  const gradId = 'spendFill';
  const base = fillColor ?? color;

  return (
    <GestureDetector gesture={gesture}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={base} stopOpacity={0.22} />
            <Stop offset="0.55" stopColor={base} stopOpacity={0.06} />
            <Stop offset="1" stopColor={base} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        <AnimatedPath
          d={geo.areaD}
          fill={`url(#${gradId})`}
          animatedProps={areaProps}
        />

        <AnimatedPath
          d={geo.lineD}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={geo.dashLen}
          animatedProps={lineProps}
        />

        {/* Scrub cursor: hairline + haloed dot, fades in on grab. */}
        <AnimatedG animatedProps={cursorProps}>
          <AnimatedLine
            y1={padTop}
            y2={height - padBottom}
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={0.35}
            animatedProps={vLineProps}
          />
          <AnimatedCircle
            r={11}
            fill={color}
            fillOpacity={0.16}
            animatedProps={dotProps}
          />
          <AnimatedCircle
            r={6}
            fill={color}
            stroke={ringColor}
            strokeWidth={2.5}
            animatedProps={dotProps}
          />
        </AnimatedG>
      </Svg>
    </GestureDetector>
  );
}
