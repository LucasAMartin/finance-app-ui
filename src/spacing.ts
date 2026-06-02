// Canonical spacing scale. Same as `TYPE` for typography and the theme tokens
// for color: one source of truth, referenced everywhere, so spacing reads the
// same on every screen.
//
// Strict 4pt grid. The only sub-grid value is `px2` (2), reserved for 1–2px
// optical nudges (hairline alignment, centering) — never for layout padding or
// gaps. Everything structural is a multiple of 4.
export const SPACE = {
  none: 0,
  px2: 2,   // optical nudges only — not layout
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Semantic layout roles — what a spacing decision MEANS, not just its size.
// Reference these for structural padding/gaps so the same role resolves to the
// same value app-wide; reach for a raw SPACE step only for one-off adjustments.
export const LAYOUT = {
  screenGutter: 16,  // outer L/R padding of screen content
  cardPadX: 20,      // SectionCard inner horizontal padding
  cardPadTop: 20,    // SectionCard inner top padding
  cardPadBottom: 12, // SectionCard inner bottom padding
  sectionGap: 24,    // vertical gap between stacked cards / sections
  rowPadY: 12,       // vertical padding of list / transaction rows
  iconLabelGap: 8,   // gap between a leading icon and its label
  pillGap: 8,        // gap between inline chips / pills
} as const;

export type SpaceToken = keyof typeof SPACE;
export type LayoutToken = keyof typeof LAYOUT;
