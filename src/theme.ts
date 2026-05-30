export type AccentKey =
  | 'sage'
  | 'butter'
  | 'sky'
  | 'rose'
  | 'plum'
  | 'ink'
  | 'wine';
export type CardStyle = 'flat' | 'shadow' | 'glass';

export interface Accent {
  fill: string;
  ink: string;
  dot: string;
}

// Internal accent definitions — light and dark variants resolved by makeTheme.
const ACCENT_DEFS: Record<
  AccentKey,
  {
    fill: string;
    fillDark: string;
    ink: string;
    inkDark: string;
    dot: string;
    dotDark: string;
  }
> = {
  sage: {
    fill: '#0E1116',
    fillDark: '#E7EAED',
    ink: '#F2F4F5',
    inkDark: '#080A0D',
    dot: '#0E1116',
    dotDark: '#E7EAED',
  },
  butter: {
    fill: '#0E1116',
    fillDark: '#E7EAED',
    ink: '#F2F4F5',
    inkDark: '#080A0D',
    dot: '#0E1116',
    dotDark: '#E7EAED',
  },
  sky: {
    fill: '#0E1116',
    fillDark: '#E7EAED',
    ink: '#F2F4F5',
    inkDark: '#080A0D',
    dot: '#0E1116',
    dotDark: '#E7EAED',
  },
  rose: {
    fill: '#0E1116',
    fillDark: '#E7EAED',
    ink: '#F2F4F5',
    inkDark: '#080A0D',
    dot: '#0E1116',
    dotDark: '#E7EAED',
  },
  plum: {
    fill: '#0E1116',
    fillDark: '#E7EAED',
    ink: '#F2F4F5',
    inkDark: '#080A0D',
    dot: '#0E1116',
    dotDark: '#E7EAED',
  },
  ink: {
    fill: '#0E1116',
    fillDark: '#E7EAED',
    ink: '#F2F4F5',
    inkDark: '#080A0D',
    dot: '#0E1116',
    dotDark: '#E7EAED',
  },
  wine: {
    fill: '#0E1116',
    fillDark: '#E7EAED',
    ink: '#F2F4F5',
    inkDark: '#080A0D',
    dot: '#0E1116',
    dotDark: '#E7EAED',
  },
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
  accentKey: AccentKey = 'plum',
  cardStyle: CardStyle = 'flat',
): Theme {
  const def = ACCENT_DEFS[accentKey];
  const accent: Accent = dark
    ? { fill: def.fillDark, ink: def.inkDark, dot: def.dotDark }
    : { fill: def.fill, ink: def.ink, dot: def.dot };
  return {
    dark,
    accent,
    cardStyle,
    bg: dark ? '#080A0D' : '#F4F5F6',
    surface: dark ? '#101215' : '#FAFBFC',
    surface2: dark ? '#1C1F24' : '#EEF0F2',
    text: dark ? '#F2F4F5' : '#0B0D10',
    textSec: dark ? 'rgba(242,244,245,0.66)' : 'rgba(11,13,16,0.62)',
    textTer: dark ? 'rgba(242,244,245,0.42)' : 'rgba(11,13,16,0.36)',
    sep: dark ? 'rgba(235,239,242,0.10)' : 'rgba(11,13,16,0.08)',
    hairline: dark ? 'rgba(235,239,242,0.13)' : 'rgba(11,13,16,0.10)',
    chipBg: dark ? 'rgba(235,239,242,0.08)' : 'rgba(11,13,16,0.045)',
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
    backgroundColor: theme.dark
      ? 'rgba(28,28,33,0.88)'
      : 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: theme.dark
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(255,255,255,0.7)',
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
  groceries: { light: '#79B7A8', dark: '#48B8A4' },
  dining: { light: '#D68A7F', dark: '#D76F5F' },
  transport: { light: '#79A8D8', dark: '#4E8FDB' },
  shopping: { light: '#C3877C', dark: '#D76F5F' },
  bills: { light: '#6F9CCF', dark: '#4E8FDB' },
  entertainment: { light: '#C58A82', dark: '#D76F5F' },
};

export const catPastel = (cat: string, dark: boolean) =>
  CAT_PASTEL[cat]?.[dark ? 'dark' : 'light'] ?? '#CCCCCC';

// Over-budget warning colors
export const OVER_BG = '#F4E9E5';
export const OVER_TEXT = '#8A3218';
export const OVER_DOT = '#D4522A';
export function overBg(dark: boolean) {
  return dark ? '#2A1612' : OVER_BG;
}
export function overText(dark: boolean) {
  return dark ? '#F09272' : OVER_TEXT;
}

// Caution colors (bills due soon, off-target spending)
export const CAUTION_BG = '#F1E6B7';
export const CAUTION_TEXT = '#6E5A1F';
export const CAUTION_AMBER = '#C5A946'; // chart/bar fill at "near limit" — DESIGN.md caution-amber
export function cautionBg(dark: boolean) {
  return dark ? '#201A0A' : CAUTION_BG;
}
export function cautionText(dark: boolean) {
  return dark ? '#CCA838' : CAUTION_TEXT;
}
export function flagBg(dark: boolean): string {
  return dark ? '#C8881C' : '#B87018';
}

// Hero "available" status color — teal on the dark hero/wallpaper surface.
// DESIGN.md hero-avail token.
export const HERO_AVAIL = '#5CC4BA';

// Accent colors for the three 50/30/20 spending groups.
// Import GROUP_COLORS in any component that needs to color by group.
export const GROUP_COLORS: Record<
  string,
  { light: string; dark: string; vibrant: string }
> = {
  needs: { light: '#4E8FDB', dark: '#4E8FDB', vibrant: '#4E8FDB' },
  wants: { light: '#D76F5F', dark: '#D76F5F', vibrant: '#D76F5F' },
  savings: { light: '#48B8A4', dark: '#48B8A4', vibrant: '#48B8A4' },
};

// Maps every transaction category key to its spending group.
// Add new categories here so icon colors stay consistent automatically.
export const CAT_TO_GROUP: Record<string, 'needs' | 'wants' | 'savings'> = {
  groceries: 'needs',
  transport: 'needs',
  bills: 'needs',
  housing: 'needs',
  dining: 'wants',
  shopping: 'wants',
  entertainment: 'wants',
  'emergency-fund': 'savings',
  retirement: 'savings',
};

export function catGroupColor(cat: string, dark: boolean): string {
  const group = CAT_TO_GROUP[cat] ?? 'wants';
  return dark ? GROUP_COLORS[group].dark : GROUP_COLORS[group].light;
}
