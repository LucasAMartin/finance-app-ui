import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { ContainerTransform, type SourceRect } from './ContainerTransform';
import { ExpenseFlow, type SavedExpenseInfo } from './ExpenseFlow';
import { Icon } from './Icon';

export interface ExpenseMorphHandle {
  open: (mode: 'voice' | 'manual', source: SourceRect, iconName: string) => void;
}

interface Props {
  onSaved?: (info: SavedExpenseInfo) => void;
}

export const ExpenseMorphMount = forwardRef<ExpenseMorphHandle, Props>(function ExpenseMorphMount(
  { onSaved },
  ref,
) {
  const { theme, dark } = useTheme();
  const [source, setSource] = useState<SourceRect | null>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');
  const [iconName, setIconName] = useState('mic');

  useImperativeHandle(ref, () => ({
    open: (m, s, icon) => {
      setMode(m);
      setIconName(icon);
      setSource(s);
      setVisible(true);
    },
  }), []);

  const circle = (
    <View style={[S.circle, { backgroundColor: dark ? 'rgba(20,20,24,0.55)' : 'rgba(255,255,255,0.92)' }]} />
  );
  const glyph = <Icon name={iconName} size={20} color={dark ? theme.text : '#0E0C18'} stroke={1.7} />;

  return (
    <ContainerTransform
      visible={visible}
      source={source}
      cardColor={theme.bg}
      sourceIcon={circle}
      sourceGlyph={glyph}
      onClosed={() => setSource(null)}
    >
      <ExpenseFlow
        theme={theme}
        initialMode={mode}
        onClose={() => setVisible(false)}
        onSaved={onSaved}
      />
    </ContainerTransform>
  );
});

const S = StyleSheet.create({
  circle: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
