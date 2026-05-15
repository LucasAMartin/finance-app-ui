import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, View } from 'react-native';

interface Props {
  open: boolean;
  children: React.ReactNode;
  duration?: number;
}

// Measures children once on mount, then animates a clipping wrapper between 0 and that height.
// Opacity fades alongside the height for a softer reveal/hide. JS-driven (height can't run native)
// but the content blocks here are small, so the JS-driven path stays smooth.
export function Collapsible({ open, children, duration = 260 }: Props) {
  const [contentH, setContentH] = useState<number | null>(null);
  const animH = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const initialised = useRef(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    if (contentH == null || Math.abs(contentH - h) > 0.5) {
      setContentH(h);
      // First measurement: snap to current open/closed state without animating
      if (!initialised.current) {
        animH.setValue(open ? h : 0);
        initialised.current = true;
      } else if (open) {
        // Content grew/shrank while open — track new height immediately
        animH.setValue(h);
      }
    }
  };

  useEffect(() => {
    if (!initialised.current || contentH == null) return;
    Animated.parallel([
      Animated.timing(animH, {
        toValue: open ? contentH : 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: open ? 1 : 0,
        duration: open ? duration : duration * 0.6,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [open, contentH, duration]);

  return (
    <Animated.View
      style={{
        height: contentH == null ? undefined : animH,
        opacity,
        overflow: 'hidden',
      }}
    >
      <View onLayout={onLayout}>{children}</View>
    </Animated.View>
  );
}
