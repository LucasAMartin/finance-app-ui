import { Platform, type TextStyle } from 'react-native';

// SF Pro on iOS (the system font), system sans elsewhere. iOS automatically
// switches between SF Pro Text (<20pt) and SF Pro Display (>=20pt) for the
// 'System' family, so all sizes get the right optical variant for free.
export const SYSTEM_FONT = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
}) as string;

// Semantic typography scale. Same role, same token, every screen.
// Weights tuned to match the native SwiftUI feel: most text sits at
// Regular/Medium, with Semibold reserved for true emphasis. Hierarchy
// rests primarily on size + spacing, secondarily on weight.
// Color stays outside these tokens — apply via [TYPE.body, { color }].
export const TYPE = {
  // Display — singular figures, used once per surface
  displayXl:      { fontSize: 48, fontWeight: '600', letterSpacing: -2.0, lineHeight: 52 },
  display:        { fontSize: 32, fontWeight: '600', letterSpacing: -1.2, lineHeight: 36 },

  // Headline — sub-display, editable values
  headline:       { fontSize: 20, fontWeight: '600', letterSpacing: -0.5, lineHeight: 26 },

  // Titles
  pageTitle:      { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, lineHeight: 22 },
  sectionTitle:   { fontSize: 18, fontWeight: '600', letterSpacing: -0.4, lineHeight: 22 },
  subsectionTitle:{ fontSize: 15, fontWeight: '600', letterSpacing: -0.3, lineHeight: 20 },

  // Body
  body:           { fontSize: 14, fontWeight: '500', letterSpacing: -0.2, lineHeight: 19 },
  bodyRegular:    { fontSize: 14, fontWeight: '400', letterSpacing: -0.2, lineHeight: 19 },
  bodySm:         { fontSize: 13, fontWeight: '400', letterSpacing: -0.2, lineHeight: 18 },
  bodySmEm:       { fontSize: 13, fontWeight: '500', letterSpacing: -0.2, lineHeight: 18 },

  // Caption
  caption:        { fontSize: 12, fontWeight: '400', letterSpacing: -0.1, lineHeight: 16 },
  captionEm:      { fontSize: 12, fontWeight: '500', letterSpacing: -0.1, lineHeight: 16 },

  // Labels — uppercase eyebrows
  labelLg:        { fontSize: 11, fontWeight: '500', letterSpacing: 0.5,  lineHeight: 14, textTransform: 'uppercase' },
  label:          { fontSize: 10, fontWeight: '500', letterSpacing: 0.6,  lineHeight: 13, textTransform: 'uppercase' },
  labelSm:        { fontSize: 9,  fontWeight: '600', letterSpacing: 0.9,  lineHeight: 12, textTransform: 'uppercase' },

  // Transaction date group header — "Today", "Yesterday", "Mon 12 May"
  txDateLabel:    { fontSize: 13, fontWeight: '500', letterSpacing: 0,    lineHeight: 18 },

  // On-media — text sitting on the Home wallpaper / BlurView surfaces. Sized
  // to roughly match SwiftUI body controls in the same row so native and RN
  // text read at the same scale on this surface.
  onMediaStatus:   { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, lineHeight: 20 },
  onMediaStatusSub:{ fontSize: 15, fontWeight: '400', letterSpacing: -0.2, lineHeight: 20 },
  onMediaAmount:   { fontSize: 44, fontWeight: '700', letterSpacing: -1.4, lineHeight: 48 },
  onMediaQa:       { fontSize: 12, fontWeight: '600', letterSpacing: -0.1, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof TYPE;
