// ─────────────────────────────────────────────────────────────
// Font setup.
//
// The app uses the OS system font: SF Pro on iOS, sans-serif (Roboto)
// on Android. iOS resolves SF Pro Text/Display automatically based on
// size, and fontWeight works natively across the full 100–900 range,
// so no Google Font bundle or runtime patch is needed.
//
// To use a different font (e.g. a bundled Inter or DM Sans), reintroduce
// expo-font loading here and inject `fontFamily` into Text via a render
// patch like the one this file used to carry.
// ─────────────────────────────────────────────────────────────

// Kept as a no-op so call sites in App.tsx remain stable.
export function useAppFonts(): [boolean, Error | null] {
  return [true, null];
}

// Historical name kept so App.tsx doesn't need to change; system font
// requires no patching.
export function patchTextWithInter() {
  // intentionally empty — the OS handles SF Pro / weight selection
}
