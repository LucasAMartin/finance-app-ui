import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { makeTheme, Theme, AccentKey, CardStyle } from './theme';

interface ThemeCtx {
  theme: Theme;
  dark: boolean;
  setDark: (v: boolean) => void;
  toggleDark: () => void;
  accentKey: AccentKey;
  setAccentKey: (k: AccentKey) => void;
  cardStyle: CardStyle;
  setCardStyle: (s: CardStyle) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  followSystem?: boolean;
  defaultDark?: boolean;
  defaultAccent?: AccentKey;
  defaultCardStyle?: CardStyle;
}

export function ThemeProvider({
  children,
  followSystem = false,
  defaultDark = false,
  defaultAccent = 'sage',
  defaultCardStyle = 'flat',
}: ProviderProps) {
  const system = useColorScheme();
  const [dark, setDark] = useState<boolean>(followSystem ? system === 'dark' : defaultDark);
  const [accentKey, setAccentKey] = useState<AccentKey>(defaultAccent);
  const [cardStyle, setCardStyle] = useState<CardStyle>(defaultCardStyle);

  const theme = useMemo(
    () => makeTheme(dark, accentKey, cardStyle),
    [dark, accentKey, cardStyle],
  );

  const toggleDark = useCallback(() => setDark(d => !d), []);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, dark, setDark, toggleDark, accentKey, setAccentKey, cardStyle, setCardStyle }),
    [theme, dark, toggleDark, accentKey, cardStyle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
