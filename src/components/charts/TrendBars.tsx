import React, { useEffect, useMemo } from 'react';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
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

import { FONT_WEIGHT } from '../../typography';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Per-bar stagger: each bar starts its grow a beat after the one to its left,
// so the row reveals in a left→right cascade rather than all at once.
const STAGGER_MS = 58;
const GROW_MS = 600;

interface BarProps {
  x: number;
  width: number;
  /** Resting (final) bar height; the grow animates up to this. */
  fullHeight: number;
  rx: number;
  baseY: number;
  fill: string;
  /** <1 dims an in-progress (partial) period so its short bar doesn't misread. */
  fillOpacity: number;
  index: number;
  play: boolean;
}

// One bar, owning its own grow animation so the stagger can offset each by
// index without violating hook rules (a shared per-index loop can't). Animates
// the rect's height/y (which react-native-svg drives on the UI thread) rather
// than a scaleY transform, which animatedProps doesn't propagate for SVG.
// The parent remounts this component (via React key) to replay the animation.
function Bar({ x, width, fullHeight, rx, baseY, fill, fillOpacity, index, play }: BarProps) {
  const grow = useSharedValue(0);
  useEffect(() => {
    if (!play) {
      grow.value = 0;
      return;
    }
    grow.value = 0;
    grow.value = withDelay(
      index * STAGGER_MS,
      withTiming(1, { duration: GROW_MS, easing: Easing.out(Easing.cubic) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, index]);

  // Grow up out of the baseline: height climbs, top edge (y) follows it up.
  const animatedProps = useAnimatedProps(() => {
    const h = Math.max(0.01, fullHeight * grow.value);
    return { height: h, y: baseY - h };
  });

  return (
    <AnimatedRect
      x={x}
      y={baseY - fullHeight}
      width={width}
      height={fullHeight}
      rx={rx}
      fill={fill}
      fillOpacity={fillOpacity}
      animatedProps={animatedProps}
    />
  );
}

interface Props {
  values: number[];
  labels: string[];
  width: number;
  height: number;
  /** Index of the scrubbed bar (owned by the parent, like the hero chart). */
  selectedIdx: number | null;
  barColor: string;
  /** Tint for the scrubbed bar + its label. */
  selectedColor: string;
  labelColor: string;
  selectedLabelColor: string;
  /** Index of an in-progress (partial) period, dimmed so its short bar reads as
   *  "not done yet" rather than a real dip. */
  partialIdx?: number | null;
  /** Starts the grow animation only when true; false holds bars at the baseline. */
  play?: boolean;
  /** Fires with the active bar index while scrubbing, `null` on release. */
  onScrub?: (index: number | null) => void;
  /** Fires on a discrete tap; parent handles toggle (same index → deselect). */
  onTap?: (index: number) => void;
  tapEnabled?: boolean;
  /** Whether scrub/tap should fire selection haptics. Default true. */
  haptics?: boolean;
}

// Compact bar chart for the Insights "Spending trends" half-tile. Carries the
// hero's staggered grow-in on load into the bar idiom; bars use a flat fill
// (faint by default, the stronger `selectedColor` for the scrubbed bar so it
// reads as highlighted). Neutral only — no chart accent. Long-press drag
// scrubs; the parent surfaces the selected bar's total, like the hero line.
// The parent remounts this component (via React key) to replay bar animations.
export function TrendBars({
  values,
  labels,
  width,
  height,
  selectedIdx,
  barColor,
  selectedColor,
  labelColor,
  selectedLabelColor,
  partialIdx,
  play = true,
  onScrub,
  onTap,
  tapEnabled = !!onTap,
  haptics = true,
}: Props) {
  const padT = 6;
  const padB = 16;
  const n = values.length;

  const geo = useMemo(() => {
    const plotH = height - padT - padB;
    const max = Math.max(1, ...values);
    const band = width / Math.max(n, 1);
    const barW = Math.min(22, Math.max(7, band * 0.5));
    const baseY = padT + plotH;
    const bars = values.map((v, i) => {
      const h = Math.max(2, (v / max) * plotH);
      return { x: i * band + (band - barW) / 2, h };
    });
    return { bars, band, baseY, barW };
  }, [values, width, height, n]);


  const tick = () => { if (haptics) Haptics.selectionAsync(); };
  const emit = (idx: number | null) => onScrub?.(idx);
  const emitTap = (idx: number) => onTap?.(idx);

  const { band } = geo;
  const lastIdx = useSharedValue(-1);

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .onEnd((e) => {
          'worklet';
          const i = Math.max(0, Math.min(n - 1, Math.floor(e.x / band)));
          runOnJS(tick)();
          runOnJS(emitTap)(i);
        }),
    [band, n],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(140)
        .failOffsetY([-10, 10])
        .onStart((e) => {
          'worklet';
          const i = Math.max(0, Math.min(n - 1, Math.floor(e.x / band)));
          lastIdx.value = i;
          runOnJS(tick)();
          runOnJS(emit)(i);
        })
        .onUpdate((e) => {
          'worklet';
          const i = Math.max(0, Math.min(n - 1, Math.floor(e.x / band)));
          if (i !== lastIdx.value) {
            lastIdx.value = i;
            runOnJS(tick)();
            runOnJS(emit)(i);
          }
        })
        .onFinalize(() => {
          'worklet';
          // Only reset if a scrub actually started (skip plain taps).
          if (lastIdx.value !== -1) {
            lastIdx.value = -1;
            runOnJS(emit)(null);
          }
        }),
    [band, n, lastIdx],
  );

  // Tap wins on quick touch; pan takes over after the long-press threshold.
  const gesture = useMemo(() => tapEnabled ? Gesture.Race(tap, pan) : pan, [tap, pan, tapEnabled]);

  if (n === 0 || width <= 0 || height <= 0) {
    return <Svg width={Math.max(0, width)} height={Math.max(0, height)} />;
  }

  const rx = Math.min(4, geo.barW / 2);

  return (
    <GestureDetector gesture={gesture}>
      <Svg width={width} height={height}>
        {geo.bars.map((b, i) => (
          <Bar
            key={i}
            x={b.x}
            width={geo.barW}
            fullHeight={b.h}
            rx={rx}
            baseY={geo.baseY}
            fill={i === selectedIdx ? selectedColor : barColor}
            fillOpacity={i === partialIdx && i !== selectedIdx ? 0.5 : 1}
            index={i}
            play={play}
          />
        ))}

        {labels.map((label, i) => (
          <SvgText
            key={i}
            x={i * geo.band + geo.band / 2}
            y={height - 3}
            textAnchor="middle"
            fontSize={9}
            fontWeight={i === selectedIdx ? FONT_WEIGHT.bold : FONT_WEIGHT.medium}
            fill={i === selectedIdx ? selectedLabelColor : labelColor}
          >
            {label}
          </SvgText>
        ))}
      </Svg>
    </GestureDetector>
  );
}
