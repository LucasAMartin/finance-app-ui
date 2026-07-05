import { Platform, type TextStyle } from 'react-native';

// SF Pro on iOS (the system font), system sans elsewhere. iOS automatically
// switches between SF Pro Text (<20pt) and SF Pro Display (>=20pt) for the
// 'System' family, so all sizes get the right optical variant for free.
export const SYSTEM_FONT = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
}) as string;

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} satisfies Record<string, NonNullable<TextStyle['fontWeight']>>;

export type FontWeightToken = (typeof FONT_WEIGHT)[keyof typeof FONT_WEIGHT];

// Semantic typography scale. Same role, same token, every screen.
// Weights tuned to match the native SwiftUI feel: most text sits at
// Regular/Medium, with Semibold reserved for true emphasis. Hierarchy
// rests primarily on size + spacing, secondarily on weight.
// Color stays outside these tokens — apply via [TYPE.body, { color }].
export const TYPE = {
  // Display — singular figures, used once per surface
  displayXl:      { fontSize: 48, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -2.0, lineHeight: 52 },
  display:        { fontSize: 32, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -1.2, lineHeight: 36 },

  // Headline — sub-display, editable values
  headline:       { fontSize: 20, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.5, lineHeight: 26 },

  // Titles
  pageTitle:      { fontSize: 17, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.4, lineHeight: 22 },
  sectionTitle:   { fontSize: 18, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.4, lineHeight: 22 },
  subsectionTitle:{ fontSize: 15, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.3, lineHeight: 20 },
  // Spending group panel header — sits between subsectionTitle and body in the
  // collapsible groups on HomeScreen. Not uppercase; weight matches subsectionTitle.
  groupPanelLabel:{ fontSize: 16, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.3, lineHeight: 20 },

  // Body
  body:           { fontSize: 14, fontWeight: FONT_WEIGHT.medium, letterSpacing: -0.2, lineHeight: 19 },
  bodyRegular:    { fontSize: 14, fontWeight: FONT_WEIGHT.regular, letterSpacing: -0.2, lineHeight: 19 },
  bodySm:         { fontSize: 13, fontWeight: FONT_WEIGHT.regular, letterSpacing: -0.2, lineHeight: 18 },
  bodySmEm:       { fontSize: 13, fontWeight: FONT_WEIGHT.medium, letterSpacing: -0.2, lineHeight: 18 },

  // Caption
  caption:        { fontSize: 12, fontWeight: FONT_WEIGHT.regular, letterSpacing: -0.1, lineHeight: 16 },
  captionEm:      { fontSize: 12, fontWeight: FONT_WEIGHT.medium, letterSpacing: -0.1, lineHeight: 16 },
  captionXs:      { fontSize: 11, fontWeight: FONT_WEIGHT.regular, letterSpacing: -0.1, lineHeight: 15 },
  captionXsEm:    { fontSize: 11, fontWeight: FONT_WEIGHT.medium, letterSpacing: -0.1, lineHeight: 15 },

  // Labels — uppercase eyebrows
  labelLg:        { fontSize: 11, fontWeight: FONT_WEIGHT.medium, letterSpacing: 0.5,  lineHeight: 14, textTransform: 'uppercase' },
  label:          { fontSize: 10, fontWeight: FONT_WEIGHT.medium, letterSpacing: 0.6,  lineHeight: 13, textTransform: 'uppercase' },
  labelSm:        { fontSize: 9,  fontWeight: FONT_WEIGHT.semibold, letterSpacing: 0.9,  lineHeight: 12, textTransform: 'uppercase' },
  // Plain variants — same size/weight as label/labelSm but without uppercase or tracking,
  // for contexts where sentence-case label styling is needed (badges, pills, calendar headers).
  labelPlain:     { fontSize: 10, fontWeight: FONT_WEIGHT.medium, letterSpacing: 0,    lineHeight: 13 },
  labelSmPlain:   { fontSize: 9,  fontWeight: FONT_WEIGHT.semibold, letterSpacing: 0,    lineHeight: 12 },

  // Transaction date group header — "Today", "Yesterday", "Mon 12 May"
  txDateLabel:    { fontSize: 13, fontWeight: FONT_WEIGHT.medium, letterSpacing: 0,    lineHeight: 18 },

  // On-media — text sitting on the Home wallpaper / BlurView surfaces. Sized
  // to roughly match SwiftUI body controls in the same row so native and RN
  // text read at the same scale on this surface.
  onMediaStatus:      { fontSize: 15, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.2, lineHeight: 20 },
  onMediaStatusSub:   { fontSize: 15, fontWeight: FONT_WEIGHT.regular, letterSpacing: -0.2, lineHeight: 20 },
  onMediaStatusSubMd: { fontSize: 15, fontWeight: FONT_WEIGHT.medium, letterSpacing: -0.2, lineHeight: 20 },
  onMediaAmount:   { fontSize: 44, fontWeight: FONT_WEIGHT.bold, letterSpacing: -1.4, lineHeight: 48 },
  onMediaQa:       { fontSize: 12, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.1, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof TYPE;
