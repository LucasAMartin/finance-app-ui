import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import type { SourceRect } from './ContainerTransform';

// Attaches to the button a container transform should grow from.
//
// Call `prefetch()` on press-in to start the async measureInWindow early; by
// the time the user lifts (~80–150 ms later) the rect is already cached, so
// `measure(onReady)` fires the callback synchronously — zero perceptible
// latency between tap and morph start.
export function useMorphSource(radius = 0) {
  const ref = useRef<View>(null);
  const cached = useRef<SourceRect | null>(null);

  const prefetch = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      cached.current = { x, y, width, height, radius };
    });
  }, [radius]);

  const measure = useCallback(
    (onReady: (rect: SourceRect) => void) => {
      if (cached.current) {
        // Already measured on press-in — call immediately.
        onReady(cached.current);
        cached.current = null;
        return;
      }
      // Fallback: measure now (e.g. prefetch wasn't called).
      const node = ref.current;
      if (!node) return;
      node.measureInWindow((x, y, width, height) => {
        onReady({ x, y, width, height, radius });
      });
    },
    [radius],
  );

  return { ref, prefetch, measure };
}
