import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { useTheme } from '../ThemeProvider';
import { ContainerTransform, type SourceRect } from './ContainerTransform';
import { IncomeFlow, type SavedIncomeInfo } from './IncomeFlow';
import { Icon } from './Icon';

export interface IncomeMorphHandle {
  open: (source: SourceRect) => void;
}

interface Props {
  onSaved?: (info: SavedIncomeInfo) => void;
  onCloseStart?: () => void;
}

// Owns the income morph's open/close state so triggering it re-renders ONLY this
// leaf — not App and its four always-mounted screens. That whole-tree re-render
// was the press-to-animation latency; the morph now starts on the next frame.
export const IncomeMorphMount = forwardRef<IncomeMorphHandle, Props>(function IncomeMorphMount(
  { onSaved, onCloseStart },
  ref,
) {
  const { theme, dark } = useTheme();
  const [source, setSource] = useState<SourceRect | null>(null);
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    open: (s: SourceRect) => {
      setSource(s);
      setVisible(true);
    },
  }), []);

  const sourceColor = dark ? 'rgba(20,20,24,0.55)' : 'rgba(255,255,255,0.92)';
  const glyph = <Icon name="plus" size={20} color={dark ? theme.text : '#0E0C18'} stroke={1.7} />;
  const close = () => {
    onCloseStart?.();
    setVisible(false);
  };

  return (
    <ContainerTransform
      visible={visible}
      source={source}
      cardColor={theme.bg}
      sourceColor={sourceColor}
      sourceGlyph={glyph}
      onClosed={() => setSource(null)}
    >
      <IncomeFlow theme={theme} onClose={close} onSaved={onSaved} />
    </ContainerTransform>
  );
});
