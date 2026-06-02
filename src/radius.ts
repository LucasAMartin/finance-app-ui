// Canonical corner-radius scale. Same element type → same token everywhere.
// `getCardStyle` consumes RADIUS.card; new surfaces should pull from here rather
// than hardcoding a literal.
//
// Fully-circular elements (icon circles, avatars, the tab buttons) are NOT in
// this scale — they use `width / 2` (or RADIUS.full on a capsule) so the radius
// always tracks the diameter.
export const RADIUS = {
  none: 0,
  bar: 4,     // progress-bar tracks, sparkline / tiny indicators
  chip: 10,   // filter pills, badges, small chips
  field: 14,  // text inputs, search box, grouped form-field containers
  button: 16, // buttons (e.g. Save), square icon buttons
  modal: 18,  // dropdowns, popovers, menu / sheet-header surfaces
  card: 24,   // SectionCard / getCardStyle resting surface
  full: 100,  // pills & fully-rounded capsules
} as const;

export type RadiusToken = keyof typeof RADIUS;
