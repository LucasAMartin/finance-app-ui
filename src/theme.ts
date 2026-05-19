export type AccentKey = 'sage' | 'butter' | 'sky' | 'rose' | 'plum' | 'ink';
export type CardStyle = 'flat' | 'shadow' | 'glass';

export interface Accent {
  fill: string;
  ink: string;
  dot: string;
}

// Internal accent definitions — light and dark variants resolved by makeTheme.
const ACCENT_DEFS: Record<AccentKey, {
  fill: string; fillDark: string;
  ink: string;  inkDark: string;
  dot: string;  dotDark: string;
}> = {
  sage:   { fill: '#D6E4D8', fillDark: '#18281E', ink: '#3F5A48', inkDark: '#82C29A', dot: '#7A9D85', dotDark: '#7A9D85' },
  butter: { fill: '#F1E6B7', fillDark: '#1E1A0A', ink: '#6E5A1F', inkDark: '#CCA840', dot: '#C5A946', dotDark: '#C5A946' },
  sky:    { fill: '#D5E2EE', fillDark: '#131E2E', ink: '#3D5874', inkDark: '#76AAD4', dot: '#7393B3', dotDark: '#7393B3' },
  rose:   { fill: '#EDD9D4', fillDark: '#261514', ink: '#6F4940', inkDark: '#D49080', dot: '#B47A6E', dotDark: '#B47A6E' },
  plum:   { fill: '#DCD3E4', fillDark: '#1A1428', ink: '#4E3E66', inkDark: '#AA98D0', dot: '#8975A8', dotDark: '#8975A8' },
  ink:    { fill: '#D9D9DC', fillDark: '#1A1A22', ink: '#0E0E10', inkDark: '#C4C4D0', dot: '#0E0E10', dotDark: '#C4C4D0' },
};

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
  const def = ACCENT_DEFS[accentKey];
  const accent: Accent = dark
    ? { fill: def.fillDark, ink: def.inkDark, dot: def.dotDark }
    : { fill: def.fill,     ink: def.ink,     dot: def.dot };
  return {
    dark,
    accent,
    cardStyle,
    bg:       dark ? '#0B1020' : '#F7F8FA',
    surface:  dark ? '#141B2E' : '#FFFFFF',
    surface2: dark ? '#1B2438' : '#FAFBFC',
    text:     dark ? '#E8ECF5' : '#0E0E10',
    textSec:  dark ? 'rgba(232,236,245,0.60)' : 'rgba(14,14,16,0.55)',
    textTer:  dark ? 'rgba(232,236,245,0.36)' : 'rgba(14,14,16,0.32)',
    sep:      dark ? 'rgba(173,189,222,0.10)' : 'rgba(14,14,16,0.08)',
    hairline: dark ? 'rgba(173,189,222,0.14)' : 'rgba(14,14,16,0.10)',
    chipBg:   dark ? 'rgba(173,189,222,0.08)' : 'rgba(14,14,16,0.04)',
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

// Muted pastel colors for category chart segments.
// Dark variants tuned to read against the navy-blue dark background — bumped luminance
// and cooled hues slightly so they sit naturally on #0B1020.
export const CAT_PASTEL: Record<string, { light: string; dark: string }> = {
  groceries:     { light: '#A3CCA8', dark: '#7CC499' },
  dining:        { light: '#D5BA8E', dark: '#D6A57A' },
  transport:     { light: '#93B6CA', dark: '#7CB2D1' },
  shopping:      { light: '#B5A7D6', dark: '#A296D6' },
  bills:         { light: '#91C9C5', dark: '#7BC4BF' },
  entertainment: { light: '#D5A7B5', dark: '#D69BB2' },
};

export const catPastel = (cat: string, dark: boolean) =>
  CAT_PASTEL[cat]?.[dark ? 'dark' : 'light'] ?? '#CCCCCC';

// Over-budget warning colors
export const OVER_BG   = '#F4E9E5';
export const OVER_TEXT = '#8A3218';
export const OVER_DOT  = '#D4522A';
export function overBg(dark: boolean)   { return dark ? '#2A1612' : OVER_BG; }
export function overText(dark: boolean) { return dark ? '#F09272' : OVER_TEXT; }

// Caution colors (bills due soon, off-target spending)
export const CAUTION_BG   = '#F1E6B7';
export const CAUTION_TEXT = '#6E5A1F';
export function cautionBg(dark: boolean)   { return dark ? '#201A0A' : CAUTION_BG; }
export function cautionText(dark: boolean) { return dark ? '#CCA838' : CAUTION_TEXT; }

// Accent colors for the three 50/30/20 spending groups.
// Import GROUP_COLORS in any component that needs to color by group.
export const GROUP_COLORS: Record<string, { light: string; dark: string }> = {
  needs:   { light: '#5E82A8', dark: '#7CA0CB' },
  wants:   { light: '#C19A4B', dark: '#D3AE5C' },
  savings: { light: '#6E9B82', dark: '#74B394' },
};

// Maps every transaction category key to its spending group.
// Add new categories here so icon colors stay consistent automatically.
export const CAT_TO_GROUP: Record<string, 'needs' | 'wants' | 'savings'> = {
  groceries:     'needs',
  transport:     'needs',
  bills:         'needs',
  dining:        'wants',
  shopping:      'wants',
  entertainment: 'wants',
};

export function catGroupColor(cat: string, dark: boolean): string {
  const group = CAT_TO_GROUP[cat] ?? 'wants';
  return dark ? GROUP_COLORS[group].dark : GROUP_COLORS[group].light;
}
