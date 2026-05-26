import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, View } from 'react-native';

interface Props {
  open: boolean;
  children: React.ReactNode;
  duration?: number;
}

// Measures children with an out-of-flow phantom view (absolute, opacity 0) so the
// measurement never gets clipped or re-measured when the visible clipper animates.
// The visible clipper animates between 0 and the measured height, with opacity easing.
// Easing: ease-out-quint — snappy decelerate, modern iOS feel without bounce.
const EASE_OUT_QUINT = Easing.bezier(0.22, 1, 0.36, 1);

export function Collapsible({ open, children, duration = 300 }: Props) {
  const [contentH, setContentH] = useState<number | null>(null);
  const animH = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const initialised = useRef(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    if (contentH == null || Math.abs(contentH - h) > 0.5) {
      setContentH(h);
      if (!initialised.current) {
        animH.setValue(open ? h : 0);
        initialised.current = true;
      } else if (open) {
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
        easing: EASE_OUT_QUINT,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        // Fade in slightly behind the height so content emerges as the space appears;
        // fade out faster so the content visually clears before the height collapses.
        toValue: open ? 1 : 0,
        duration: open ? duration * 0.85 : duration * 0.5,
        delay:    open ? duration * 0.15 : 0,
        easing: EASE_OUT_QUINT,
        useNativeDriver: false,
      }),
    ]).start();
  }, [open, contentH, duration]);

  return (
    <View style={{ position: 'relative' }}>
      {/* Phantom measurer: out of flow, invisible, never clipped — reports the natural height */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}
        onLayout={onLayout}
      >
        {children}
      </View>
      {/* Visible clipper: drives the actual open/close animation */}
      <Animated.View
        style={{
          height: contentH == null ? 0 : animH,
          opacity,
          overflow: 'hidden',
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
