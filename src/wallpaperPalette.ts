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
