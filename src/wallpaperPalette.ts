// Shared palette for screens that use the wallpaper + frosted-card aesthetic.
//
// "On-wallpaper" (pWallpaper = makeP(true)): header, hero, labels that sit
// directly on the wallpaper or scrim. Always white — the wallpaper is vivid
// enough in light mode and the dark scrim provides contrast in dark mode.
//
// "Card interior" (p = makeP(theme.dark)): text inside BlurView section cards.
// Flips to near-ink in light mode so dark text reads on the light frosted glass.

export const MEDIA = {
  text:           '#FBF8FF',
  textSec:        'rgba(245,238,255,0.78)',
  textTer:        'rgba(245,238,255,0.62)',
  hairline:       'rgba(235,225,255,0.20)',
  hairlineStrong: 'rgba(235,225,255,0.30)',
  trackBg:        'rgba(235,225,255,0.20)',
};

export const DARK_TEXT_SHADOW = {
  textShadowColor:  'rgba(8,6,20,0.40)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

export function makeP(dark: boolean) {
  return {
    text:           dark ? MEDIA.text           : '#0E0C18',
    textSec:        dark ? MEDIA.textSec        : 'rgba(14,12,24,0.55)',
    textTer:        dark ? MEDIA.textTer        : 'rgba(14,12,24,0.38)',
    hairline:       dark ? MEDIA.hairline       : 'rgba(14,12,24,0.09)',
    hairlineStrong: dark ? MEDIA.hairlineStrong : 'rgba(14,12,24,0.20)',
    trackBg:        dark ? MEDIA.trackBg        : 'rgba(14,12,24,0.10)',
  };
}

export type WallpaperP = ReturnType<typeof makeP>;

// Scrim colors that match the HomeScreen aesthetic.
// Light mode: subtle dark tint (wallpaper shows through vividly).
// Dark mode: heavy violet-black tint (frames the dark glass cards).
export function makeScrim(dark: boolean) {
  return {
    top:    dark ? 'rgba(8,6,20,0.55)' : 'rgba(8,6,20,0.58)',
    mid:    dark ? 'rgba(8,6,20,0.34)' : 'rgba(8,6,20,0.44)',
    lower:  dark ? 'rgba(8,6,20,0.68)' : 'rgba(8,6,20,0.24)',
    bottom: dark ? 'rgba(8,6,20,0.88)' : 'rgba(8,6,20,0.10)',
  };
}
