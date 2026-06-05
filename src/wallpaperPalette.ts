// Shared palette for screens that use the wallpaper + frosted-card aesthetic.
//
// "On-wallpaper" (pWallpaper = makeP(true)): header, hero, labels that sit
// directly on the wallpaper or scrim. Always white — the wallpaper is vivid
// enough in light mode and the dark scrim provides contrast in dark mode.
//
// "Card interior" (p = makeP(theme.dark)): text inside BlurView section cards.
// Flips to near-ink in light mode so dark text reads on the light frosted glass.

export const MEDIA = {
  text: '#F2F4F5',
  textSec: 'rgba(242,244,245,0.72)',
  textTer: 'rgba(242,244,245,0.52)',
  hairline: 'rgba(235,239,242,0.18)',
  hairlineStrong: 'rgba(235,239,242,0.28)',
  trackBg: 'rgba(235,239,242,0.18)',
};

export const DARK_TEXT_SHADOW = {
  textShadowColor: 'rgba(2,3,5,0.42)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

export function makeP(dark: boolean) {
  return {
    text: dark ? MEDIA.text : '#0E0C18',
    textSec: dark ? MEDIA.textSec : 'rgba(14,12,24,0.55)',
    textTer: dark ? MEDIA.textTer : 'rgba(14,12,24,0.38)',
    hairline: dark ? MEDIA.hairline : 'rgba(14,12,24,0.09)',
    hairlineStrong: dark ? MEDIA.hairlineStrong : 'rgba(14,12,24,0.20)',
    trackBg: dark ? MEDIA.trackBg : 'rgba(14,12,24,0.10)',
  };
}

export type WallpaperP = ReturnType<typeof makeP>;

// Shared on-wallpaper surface constants. Use alongside MEDIA (which covers the
// dark-mode variants) so callers never inline the same rgba string independently.

// Hairline border/overlay for on-wallpaper surfaces in light mode (8% dark tint).
// Darker than makeP(false).hairline (9%) — used for sticky card borders and
// header backdrop dividers that need a slightly crisper edge.
export const ONMEDIA_BORDER_LIGHT = 'rgba(14,12,24,0.08)';

// Scrim colors that match the HomeScreen aesthetic.
// Light mode: subtle dark tint (wallpaper shows through vividly).
// Dark mode: heavy violet-black tint (frames the dark glass cards).
export function makeScrim(dark: boolean) {
  return {
    top: dark ? 'rgba(3,5,8,0.55)' : 'rgba(3,5,8,0.58)',
    mid: dark ? 'rgba(3,5,8,0.34)' : 'rgba(3,5,8,0.44)',
    lower: dark ? 'rgba(3,5,8,0.68)' : 'rgba(3,5,8,0.24)',
    bottom: dark ? 'rgba(3,5,8,0.88)' : 'rgba(3,5,8,0.10)',
  };
}

// ── Wallpaper floor color ─────────────────────────────────────────
// The "floor" is the solid color the wallpaper fades into as the user scrolls
// away from it. We extract one representative base color from the wallpaper
// (at selection time — see wallpaperColor.ts) and store it raw. deriveFloor()
// then bends that base toward near-black (dark mode) or near-white (light mode)
// while preserving its hue, so a purple wallpaper yields dark/light purple.

// Used until extraction completes / when no wallpaper color is known.
export const DEFAULT_FLOOR_BASE = '#5B4B7A';

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

// Accepts '#RGB', '#RRGGBB', or 'rgb(r,g,b)'. Returns [r,g,b] in 0–255.
function parseColor(input: string): [number, number, number] {
  const s = input.trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const int = parseInt(hex, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const [r, g, b] = m[1].split(',').map(v => parseInt(v, 10));
    return [r || 0, g || 0, b || 0];
  }
  return [91, 75, 122]; // fallback = DEFAULT_FLOOR_BASE
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h * 360)}, ${Math.round(clamp01(s) * 100)}%, ${Math.round(clamp01(l) * 100)}%)`;
}

// Bend a base color into the floor shade for the given mode, preserving hue.
// Dark mode → very dark, lightly saturated tint. Light mode → very light tint.
export function deriveFloor(baseColor: string, dark: boolean): string {
  const [r, g, b] = parseColor(baseColor);
  const [h, s] = rgbToHsl(r, g, b);
  if (dark) {
    return hslToCss(h, clamp01(Math.min(s, 0.55) * 0.9 + 0.06), 0.08);
  }
  return hslToCss(h, clamp01(Math.min(s, 0.5)), 0.93);
}
