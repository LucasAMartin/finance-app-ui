export type AccentKey = 'sage' | 'butter' | 'sky' | 'rose' | 'plum' | 'ink';
export type CardStyle = 'flat' | 'shadow' | 'glass';

export const ACCENTS = {
  sage:   { fill: '#D6E4D8', ink: '#3F5A48', dot: '#7A9D85' },
  butter: { fill: '#F1E6B7', ink: '#6E5A1F', dot: '#C5A946' },
  sky:    { fill: '#D5E2EE', ink: '#3D5874', dot: '#7393B3' },
  rose:   { fill: '#EDD9D4', ink: '#6F4940', dot: '#B47A6E' },
  plum:   { fill: '#DCD3E4', ink: '#4E3E66', dot: '#8975A8' },
  ink:    { fill: '#D9D9DC', ink: '#0E0E10', dot: '#0E0E10' },
} as const;

export type Accent = typeof ACCENTS[AccentKey];

export interface Theme {
  dark: boolean;
  accent: Accent;
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  textSec: string;
  textTer: string;
  sep: string;
  hairline: string;
  chipBg: string;
  cardStyle: CardStyle;
}

export function makeTheme(
  dark: boolean,
  accentKey: AccentKey = 'sage',
  cardStyle: CardStyle = 'flat'
): Theme {
  return {
    dark,
    accent: ACCENTS[accentKey],
    cardStyle,
    bg:       dark ? '#0D0D10' : '#F4F2EC',
    surface:  dark ? '#16161A' : '#FFFFFF',
    surface2: dark ? '#1D1D22' : '#FBFAF6',
    text:     dark ? '#F4F2EC' : '#0E0E10',
    textSec:  dark ? 'rgba(244,242,236,0.55)' : 'rgba(14,14,16,0.55)',
    textTer:  dark ? 'rgba(244,242,236,0.32)' : 'rgba(14,14,16,0.32)',
    sep:      dark ? 'rgba(255,255,255,0.08)' : 'rgba(14,14,16,0.08)',
    hairline: dark ? 'rgba(255,255,255,0.10)' : 'rgba(14,14,16,0.10)',
    chipBg:   dark ? 'rgba(255,255,255,0.06)' : 'rgba(14,14,16,0.04)',
  };
}

export function getCardStyle(theme: Theme) {
  const base = { backgroundColor: theme.surface, borderRadius: 24 as number };
  if (theme.cardStyle === 'flat') {
    return { ...base, borderWidth: 1, borderColor: theme.hairline };
  }
  if (theme.cardStyle === 'shadow') {
    return {
      ...base,
      shadowColor: '#0E0E10',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.dark ? 0.5 : 0.07,
      shadowRadius: 14,
      elevation: 6,
    };
  }
  // glass
  return {
    ...base,
    backgroundColor: theme.dark ? 'rgba(28,28,33,0.88)' : 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  };
}

// Muted pastel colors for category chart segments
export const CAT_PASTEL: Record<string, { light: string; dark: string }> = {
  groceries:     { light: '#A3CCA8', dark: '#5C9A6E' },
  dining:        { light: '#D5BA8E', dark: '#B8895A' },
  transport:     { light: '#93B6CA', dark: '#5A8CA6' },
  shopping:      { light: '#B5A7D6', dark: '#8171B5' },
  coffee:        { light: '#C9C58C', dark: '#9E9B5A' },
  bills:         { light: '#91C9C5', dark: '#5A9E9A' },
  entertainment: { light: '#D5A7B5', dark: '#B5708A' },
};

export const catPastel = (cat: string, dark: boolean) =>
  CAT_PASTEL[cat]?.[dark ? 'dark' : 'light'] ?? '#CCCCCC';

// Over-budget warning colors
export const OVER_BG   = '#F4E9E5';
export const OVER_TEXT = '#8A3218';
export const OVER_DOT  = '#D4522A';
