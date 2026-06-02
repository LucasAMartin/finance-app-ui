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
  index: number;
  /** New identity whenever the series changes → replays the grow. */
  playKey: object;
}

// One bar, owning its own grow animation so the stagger can offset each by
// index without violating hook rules (a shared per-index loop can't). Animates
// the rect's height/y (which react-native-svg drives on the UI thread) rather
// than a scaleY transform, which animatedProps doesn't propagate for SVG.
function Bar({ x, width, fullHeight, rx, baseY, fill, index, playKey }: BarProps) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = 0;
    grow.value = withDelay(
      index * STAGGER_MS,
      withTiming(1, { duration: GROW_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [playKey, index, grow]);

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
  /** Fires with the active bar index while scrubbing, `null` on release. */
  onScrub?: (index: number | null) => void;
}

// Compact bar chart for the Insights "Spending trends" half-tile. Carries the
// hero's staggered grow-in on load into the bar idiom; bars use a flat fill
// (faint by default, the stronger `selectedColor` for the scrubbed bar so it
// reads as highlighted). Neutral only — no chart accent. Long-press drag
// scrubs; the parent surfaces the selected bar's total, like the hero line.
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
  onScrub,
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

  // New identity per data change → bars replay; selection/scrub re-renders keep
  // the same `values` reference, so scrubbing never retriggers the grow.
  const playKey = useMemo(() => ({}), [values]);

  const tick = () => Haptics.selectionAsync();
  const emit = (idx: number | null) => onScrub?.(idx);

  const { band } = geo;
  const lastIdx = useSharedValue(-1);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(140)
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

  if (n === 0 || width <= 0 || height <= 0) {
    return <Svg width={Math.max(0, width)} height={Math.max(0, height)} />;
  }

  const rx = Math.min(4, geo.barW / 2);

  return (
    <GestureDetector gesture={pan}>
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
            index={i}
            playKey={playKey}
          />
        ))}

        {labels.map((label, i) => (
          <SvgText
            key={i}
            x={i * geo.band + geo.band / 2}
            y={height - 3}
            textAnchor="middle"
            fontSize={9}
            fontWeight={i === selectedIdx ? '700' : '500'}
            fill={i === selectedIdx ? selectedLabelColor : labelColor}
          >
            {label}
          </SvgText>
        ))}
      </Svg>
    </GestureDetector>
  );
}
